import { createRoot } from "react-dom/client";
import { Emulator, SCREEN_WIDTH, SCREEN_HEIGHT } from "@/emulator/emulator";
import "@/index.css";

const ROM_URL = "/roms/croom.nes";
const FRAME_COUNT = 120;

interface BenchResult {
  name: string;
  averageMs: number;
  medianMs: number;
  minMs: number;
  maxMs: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0
    ? sorted[mid]!
    : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function summarize(name: string, samples: number[]): BenchResult {
  const sum = samples.reduce((a, b) => a + b, 0);
  return {
    name,
    averageMs: sum / samples.length,
    medianMs: median(samples),
    minMs: Math.min(...samples),
    maxMs: Math.max(...samples),
  };
}

export function BenchPage() {
  const runBenchmark = async () => {
    const status = document.getElementById("status");
    const resultsEl = document.getElementById("results");
    if (status) status.textContent = "Loading ROM...";

    const romRes = await fetch(ROM_URL);
    const romBuf = await romRes.arrayBuffer();

    const em = new Emulator();
    em.loadROM(romBuf, "croom.nes");

    const canvas = document.getElementById("screen") as HTMLCanvasElement;
    canvas.width = SCREEN_WIDTH;
    canvas.height = SCREEN_HEIGHT;
    const ctx = canvas.getContext("2d")!;
    const image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    const view = new DataView(image.data.buffer);

    const frameTimes: number[] = [];
    const uploadTimes: number[] = [];

    const unsubscribe = em.onFrame((buffer) => {
      const uploadStart = performance.now();
      for (let i = 0; i < buffer.length; i++) {
        const px = buffer[i] ?? 0;
        view.setUint8(i * 4, px & 0xff);
        view.setUint8(i * 4 + 1, (px >> 8) & 0xff);
        view.setUint8(i * 4 + 2, (px >> 16) & 0xff);
        view.setUint8(i * 4 + 3, 0xff);
      }
      ctx.putImageData(image, 0, 0);
      uploadTimes.push(performance.now() - uploadStart);
    });

    if (status) status.textContent = `Running ${FRAME_COUNT} frames...`;

    // Warm up.
    for (let i = 0; i < 10; i++) {
      em.stepFrame();
    }

    performance.mark("bench-start");
    for (let i = 0; i < FRAME_COUNT; i++) {
      const start = performance.now();
      em.stepFrame();
      frameTimes.push(performance.now() - start);
    }
    performance.mark("bench-end");
    performance.measure("bench-total", "bench-start", "bench-end");

    unsubscribe();
    em.stop();

    const frameResult = summarize("Full emulator frame", frameTimes);
    const uploadResult = summarize("Pixel conversion + putImageData", uploadTimes);
    const totalResult = summarize("Combined (frame + upload)", frameTimes.map((t, i) => t + (uploadTimes[i] ?? 0)));

    const results = [frameResult, uploadResult, totalResult];
    console.table(results);

    if (resultsEl) {
      resultsEl.innerHTML = results
        .map(
          (r) => `
          <div class="rounded bg-neutral-800 p-4">
            <h3 class="font-semibold text-emerald-300">${r.name}</h3>
            <p class="text-sm text-neutral-300">Average: <span class="font-mono">${r.averageMs.toFixed(3)} ms</span></p>
            <p class="text-sm text-neutral-300">Median: <span class="font-mono">${r.medianMs.toFixed(3)} ms</span></p>
            <p class="text-sm text-neutral-300">Min / Max: <span class="font-mono">${r.minMs.toFixed(3)} / ${r.maxMs.toFixed(3)} ms</span></p>
          </div>
        `,
        )
        .join("");
    }
    if (status) {
      const avg = totalResult.averageMs;
      const fps = avg > 0 ? 1000 / avg : 0;
      status.textContent = `Done. Effective FPS: ${fps.toFixed(1)}`;
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center gap-6 bg-neutral-950 p-6 text-neutral-100">
      <h1 className="text-xl font-semibold">botdeck browser benchmark</h1>
      <div className="flex gap-3">
        <button
          type="button"
          onClick={runBenchmark}
          className="rounded bg-emerald-600 px-4 py-2 font-medium hover:bg-emerald-500"
        >
          Run benchmark
        </button>
      </div>
      <p id="status" className="text-sm text-neutral-400">
        Press Run benchmark to start.
      </p>
      <canvas
        id="screen"
        className="border border-neutral-700"
        width={SCREEN_WIDTH}
        height={SCREEN_HEIGHT}
        style={{ imageRendering: "pixelated", width: 512, height: 480 }}
      />
      <div
        id="results"
        className="grid w-full max-w-3xl grid-cols-1 gap-4 md:grid-cols-3"
      />
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<BenchPage />);
