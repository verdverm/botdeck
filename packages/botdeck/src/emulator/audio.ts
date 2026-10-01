const DEFAULT_SAMPLE_RATE = 48000;
const BUFFER_CAPACITY = 8192;
const SCRIPT_PROCESSOR_BUFFER_SIZE = 2048;
const DEBUG_AUDIO = true;

export class NesAudio {
  private ctx: AudioContext | null = null;
  private scriptNode: ScriptProcessorNode | null = null;
  private bufferL = new Float32Array(BUFFER_CAPACITY);
  private bufferR = new Float32Array(BUFFER_CAPACITY);
  private readPos = 0;
  private writePos = 0;
  private count = 0;
  private samplesThisFrame = 0;
  private totalWritten = 0;
  private processCount = 0;
  private totalConsumed = 0;
  private lastLogTime = 0;
  private resumeHandler: (() => void) | null = null;

  private getOrCreateContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new window.AudioContext();
    }
    return this.ctx;
  }

  getSampleRate(): number {
    if (typeof window === "undefined" || !window.AudioContext) {
      return DEFAULT_SAMPLE_RATE;
    }
    return this.getOrCreateContext().sampleRate;
  }

  start(): void {
    if (typeof window === "undefined" || !window.AudioContext) return;

    const ctx = this.getOrCreateContext();

    this.scriptNode = ctx.createScriptProcessor(
      SCRIPT_PROCESSOR_BUFFER_SIZE,
      0,
      2,
    );

    if (DEBUG_AUDIO) {
      console.log(
        `[NesAudio] start sampleRate=${ctx.sampleRate} bufferSize=${SCRIPT_PROCESSOR_BUFFER_SIZE}`,
      );
    }

    this.scriptNode.onaudioprocess = (e) => {
      const outL = e.outputBuffer.getChannelData(0);
      const outR = e.outputBuffer.getChannelData(1);
      const size = outL.length;

      this.processCount++;
      this.totalConsumed += size;
      this.logStats();

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

    this.scriptNode.connect(ctx.destination);

    if (ctx.state === "suspended") {
      ctx.resume().catch(() => {});
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

  private logStats(): void {
    if (!DEBUG_AUDIO) return;
    const now = performance.now();
    if (now - this.lastLogTime < 1000) return;
    const avg = this.processCount
      ? (this.totalConsumed / this.processCount).toFixed(1)
      : "0";
    console.log(
      `[NesAudio] fill=${this.count}/${BUFFER_CAPACITY} ` +
        `writtenThisFrame=${this.samplesThisFrame} ` +
        `processes=${this.processCount} avgConsumed=${avg} ` +
        `totalConsumed=${this.totalConsumed}`,
    );
    this.processCount = 0;
    this.totalConsumed = 0;
    this.lastLogTime = now;
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
    if (DEBUG_AUDIO) {
      console.log(`[NesAudio] stop totalWritten=${this.totalWritten}`);
    }
    this.readPos = 0;
    this.writePos = 0;
    this.count = 0;
    this.samplesThisFrame = 0;
    this.totalWritten = 0;
    this.processCount = 0;
    this.totalConsumed = 0;
    this.lastLogTime = 0;
  }

  /**
   * Test helper: allow `writeSample` to populate the ring buffer without an
   * AudioContext. Does nothing if audio has already started normally.
   */
  enableTestBuffer(): void {
    if (!this.scriptNode) {
      this.scriptNode = {} as ScriptProcessorNode;
    }
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
    this.samplesThisFrame++;
    this.totalWritten++;
  };

  flush(): void {
    // Samples are written directly to the circular buffer, so no explicit
    // flush is required for ScriptProcessorNode playback.
    if (DEBUG_AUDIO) {
      console.log(
        `[NesAudio] flush frameSamples=${this.samplesThisFrame} fill=${this.count}/${BUFFER_CAPACITY}`,
      );
      this.samplesThisFrame = 0;
    }
  }
}
