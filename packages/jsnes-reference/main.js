import NES from "../../.extern/jsnes/src/nes.js";
import Screen from "../../.extern/jsnes/src/browser/screen.js";
import KeyboardController from "../../.extern/jsnes/src/browser/keyboard.js";

const NES_FPS = 60.0988;
const AUDIO_BUFFER_CAPACITY = 8192;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 2048;

class NesAudio {
  constructor() {
    this.ctx = null;
    this.node = null;
    this.bufferL = new Float32Array(AUDIO_BUFFER_CAPACITY);
    this.bufferR = new Float32Array(AUDIO_BUFFER_CAPACITY);
    this.readPos = 0;
    this.writePos = 0;
    this.count = 0;
    this.resumeHandler = null;
  }

  getSampleRate() {
    if (typeof window === "undefined" || !window.AudioContext) {
      return 48000;
    }
    if (!this.ctx) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.ctx = new Ctx();
    }
    return this.ctx.sampleRate;
  }

  start() {
    if (typeof window === "undefined" || !window.AudioContext) return;

    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = this.ctx ?? new Ctx();
    this.ctx = ctx;

    this.node = ctx.createScriptProcessor(SCRIPT_PROCESSOR_BUFFER_SIZE, 0, 2);
    this.node.onaudioprocess = (e) => {
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      const size = outL.length;

      if (this.count < size) {
        for (let i = 0; i < this.count; i++) {
          outL[i] = this.bufferL[this.readPos];
          outR[i] = this.bufferR[this.readPos];
          this.readPos = (this.readPos + 1) % AUDIO_BUFFER_CAPACITY;
        }
        for (let i = this.count; i < size; i++) {
          outL[i] = 0;
          outR[i] = 0;
        }
        this.count = 0;
      } else {
        for (let i = 0; i < size; i++) {
          outL[i] = this.bufferL[this.readPos];
          outR[i] = this.bufferR[this.readPos];
          this.readPos = (this.readPos + 1) % AUDIO_BUFFER_CAPACITY;
        }
        this.count -= size;
      }
    };

    this.node.connect(ctx.destination);

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
      this.resumeHandler = () => {
        ctx.resume().catch(() => {});
        this.removeResumeListeners();
      };
      document.addEventListener("keydown", this.resumeHandler);
      document.addEventListener("mousedown", this.resumeHandler);
      document.addEventListener("touchstart", this.resumeHandler);
    }
  }

  removeResumeListeners() {
    if (!this.resumeHandler) return;
    document.removeEventListener("keydown", this.resumeHandler);
    document.removeEventListener("mousedown", this.resumeHandler);
    document.removeEventListener("touchstart", this.resumeHandler);
    this.resumeHandler = null;
  }

  stop() {
    this.removeResumeListeners();
    if (this.node) {
      this.node.disconnect();
      this.node.onaudioprocess = null;
      this.node = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.readPos = 0;
    this.writePos = 0;
    this.count = 0;
  }

  writeSample = (left, right) => {
    if (!this.node) return;

    if (this.count >= AUDIO_BUFFER_CAPACITY) {
      this.readPos = (this.readPos + 1) % AUDIO_BUFFER_CAPACITY;
      this.count -= 1;
    }

    this.bufferL[this.writePos] = left;
    this.bufferR[this.writePos] = right;
    this.writePos = (this.writePos + 1) % AUDIO_BUFFER_CAPACITY;
    this.count++;
  };

  flush() {}
}

const container = document.getElementById("nes");
const romInput = document.getElementById("rom-path");
const loadBtn = document.getElementById("load");
const offBtn = document.getElementById("power-off");

const screen = new Screen(container, {
  onMouseDown: (x, y) => {
    nes.zapperMove(x, y);
    nes.zapperFireDown();
  },
  onMouseUp: () => {
    nes.zapperFireUp();
  },
});
screen.fitInParent();

const audio = new NesAudio();

const nes = new NES({
  emulateSound: true,
  sampleRate: audio.getSampleRate(),
  onFrame: screen.setBuffer,
  onAudioSample: audio.writeSample,
  onBatteryRamWrite: () => {},
});

const keyboard = new KeyboardController({
  onButtonDown: nes.buttonDown,
  onButtonUp: nes.buttonUp,
});
keyboard.loadKeys();

document.addEventListener("keydown", keyboard.handleKeyDown);
document.addEventListener("keyup", keyboard.handleKeyUp);
document.addEventListener("keypress", keyboard.handleKeyPress);

let raf = 0;
let running = false;
let accumulator = 0;
let lastTime = 0;

function startLoop() {
  if (running) return;
  running = true;
  lastTime = performance.now();
  accumulator = 0;
  audio.start();

  const loop = (now) => {
    if (!running) return;
    accumulator += now - lastTime;
    lastTime = now;
    const frameMs = 1000 / NES_FPS;

    let frames = 0;
    while (accumulator >= frameMs && frames < 3) {
      nes.frame();
      screen.writeBuffer();
      accumulator -= frameMs;
      frames++;
    }
    if (accumulator > frameMs * 3) {
      accumulator = 0;
    }

    raf = requestAnimationFrame(loop);
  };

  raf = requestAnimationFrame(loop);
}

function stopLoop() {
  running = false;
  cancelAnimationFrame(raf);
  audio.stop();
}

async function loadROM(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error(`${res.status} ${res.statusText}`);
    }
    const data = await res.arrayBuffer();
    stopLoop();
    nes.loadROM(data);
    startLoop();
  } catch (e) {
    console.error(e);
    alert("Failed to load ROM: " + e.message);
  }
}

loadBtn.addEventListener("click", () => {
  loadROM(romInput.value.trim());
});

offBtn.addEventListener("click", () => {
  stopLoop();
});

window.addEventListener("resize", () => screen.fitInParent());
