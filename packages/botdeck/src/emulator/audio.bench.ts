import { describe, test, vi } from "vitest";
import { NesAudio } from "./audio";

vi.spyOn(console, "log").mockImplementation(() => {});

// jsNES produces roughly one stereo sample every ~40 CPU cycles. A frame has
// ~30k samples, so this stream is representative of a full NES frame's audio.
const SAMPLES_PER_FRAME = 30000;

describe("audio ring buffer", () => {
  test("writeSample() throughput", async ({ bench }) => {
    await bench("writeSample()", () => {
      const audio = new NesAudio();
      audio.enableTestBuffer();
      for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
        audio.writeSample((i % 256) / 256, ((i + 128) % 256) / 256);
      }
    }).run();
  });

  test("writeSample() near buffer capacity", async ({ bench }) => {
    await bench("writeSample() near capacity", () => {
      const audio = new NesAudio();
      audio.enableTestBuffer();
      // Pre-fill to force the drop-path on every write.
      for (let i = 0; i < 8192; i++) {
        audio.writeSample(0.1, 0.1);
      }
      for (let i = 0; i < SAMPLES_PER_FRAME; i++) {
        audio.writeSample((i % 256) / 256, ((i + 128) % 256) / 256);
      }
    }).run();
  });
});
