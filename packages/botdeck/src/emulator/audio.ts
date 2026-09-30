const DEFAULT_SAMPLE_RATE = 48000;
const BUFFER_CAPACITY = 8192;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 2048;

export class NesAudio {
  private ctx: AudioContext | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private bufferL = new Float32Array(BUFFER_CAPACITY);
  private bufferR = new Float32Array(BUFFER_CAPACITY);
  private readPos = 0;
  private writePos = 0;
  private count = 0;
  private resumeHandler: (() => void) | null = null;

  getSampleRate(): number {
    if (typeof window === "undefined" || !window.AudioContext) {
      return DEFAULT_SAMPLE_RATE;
    }
    if (!this.ctx) {
      this.ctx = new window.AudioContext();
    }
    return this.ctx.sampleRate;
  }

  start(): void {
    if (typeof window === "undefined" || !window.AudioContext) return;

    if (!this.ctx) {
      this.ctx = new window.AudioContext();
    }

    this.scriptNode = this.ctx.createScriptProcessor(
      SCRIPT_PROCESSOR_BUFFER_SIZE,
      0,
      2,
    );

    this.scriptNode.onaudioprocess = (e) => {
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      const size = outL.length;

      if (this.count < size) {
        for (let i = 0; i < this.count; i++) {
          outL[i] = this.bufferL[this.readPos] ?? 0;
          outR[i] = this.bufferR[this.readPos] ?? 0;
          this.readPos = (this.readPos + 1) % BUFFER_CAPACITY;
        }
        for (let i = this.count; i < size; i++) {
          outL[i] = 0;
          outR[i] = 0;
        }
        this.count = 0;
      } else {
        for (let i = 0; i < size; i++) {
          outL[i] = this.bufferL[this.readPos] ?? 0;
          outR[i] = this.bufferR[this.readPos] ?? 0;
          this.readPos = (this.readPos + 1) % BUFFER_CAPACITY;
        }
        this.count -= size;
      }
    };

    this.scriptNode.connect(this.ctx.destination);

    if (this.ctx.state === "suspended") {
      this.ctx.resume().catch(() => {});
      this.resumeHandler = () => {
        if (this.ctx) {
          this.ctx.resume().catch(() => {});
        }
        this.removeResumeListeners();
      };
      document.addEventListener("keydown", this.resumeHandler);
      document.addEventListener("mousedown", this.resumeHandler);
      document.addEventListener("touchstart", this.resumeHandler);
    }
  }

  private removeResumeListeners(): void {
    if (!this.resumeHandler) return;
    document.removeEventListener("keydown", this.resumeHandler);
    document.removeEventListener("mousedown", this.resumeHandler);
    document.removeEventListener("touchstart", this.resumeHandler);
    this.resumeHandler = null;
  }

  stop(): void {
    this.removeResumeListeners();
    if (this.scriptNode) {
      this.scriptNode.disconnect();
      this.scriptNode.onaudioprocess = null;
      this.scriptNode = null;
    }
    if (this.ctx) {
      this.ctx.close().catch(() => {});
      this.ctx = null;
    }
    this.readPos = 0;
    this.writePos = 0;
    this.count = 0;
  }

  writeSample = (left: number, right: number): void => {
    if (!this.scriptNode) return;

    if (this.count >= BUFFER_CAPACITY) {
      const drop = 1;
      this.readPos = (this.readPos + drop) % BUFFER_CAPACITY;
      this.count -= drop;
    }

    this.bufferL[this.writePos] = left;
    this.bufferR[this.writePos] = right;
    this.writePos = (this.writePos + 1) % BUFFER_CAPACITY;
    this.count++;
  };

  flush(): void {
    // Samples are written directly to the circular buffer, so no explicit
    // flush is required for ScriptProcessorNode playback.
  }
}
