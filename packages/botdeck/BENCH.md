# Benchmarking

This package has both headless unit benchmarks (Vitest) and a browser-based benchmark page for the real canvas rendering path.

## Running benchmarks

### Unit benchmarks

```bash
pnpm bench
```

This runs all `*.bench.ts` files under `src/` with Vitest. Results report ops/sec and median time.

### Browser benchmark

```bash
pnpm bench:browser
```

This starts the Vite dev server on port 5174 and opens `/bench/index.html`. The page loads a small test ROM, runs the emulator frame loop, and measures:

- Full emulator frame time (`Emulator.stepFrame()`)
- Pixel conversion (BGR→RGBA) + `putImageData` time
- Combined time and effective FPS

Results are rendered on the page and logged to the console as a table.

## What each benchmark measures

| Benchmark file | Focus |
|---|---|
| `src/emulator/emulator.bench.ts` | `Emulator.stepFrame()` / `nes.frame()` throughput with a real test ROM. |
| `src/emulator/audio.bench.ts` | `NesAudio.writeSample()` ring-buffer throughput for a synthetic frame's worth of samples. |
| `src/emulator/collectState.bench.ts` | `collectState()` end-to-end, plus split timings for save-RAM copy and `readFF1StateFromSaveState()`. |
| `src/emulator/stateSerialization.bench.ts` | `JSON.stringify(emulator.toJSON())` and `emulator.fromJSON(JSON.parse(...))` round-trip. |

## Interpreting results

- **ops/sec**: higher is better. The emulator benchmark creates a fresh emulator per iteration, so it measures cold-frame cost.
- **median ms**: the middle sample time. Useful for spotting outliers caused by GC or timer overhead.
- **Browser average frame time**: must stay comfortably below 16.67 ms for 60 FPS. The Playwright performance test asserts `< 25 ms` to leave headroom on slower machines.

## Suggested thresholds

| Metric | Target | Notes |
|---|---|---|
| Average frame time (browser) | < 16 ms | 60 FPS budget. |
| Pixel conversion + putImageData | < 5 ms | Leaves most of the frame budget for emulation. |
| `collectState()` end-to-end | < 5 ms | Called infrequently but should not hitch gameplay. |
| `JSON.stringify(state)` | < 10 ms | Save-state serialization should be cheap. |

## Caveats

- The unit benchmarks use small homebrew/test ROM fixtures already in `public/roms/`. No copyrighted ROM data is committed.
- `NesAudio.writeSample()` is benchmarked with a test helper (`enableTestBuffer()`) that bypasses `AudioContext` so the ring buffer can be exercised in Node/jsdom.
- `Emulator.stepFrame()` is now public so benchmarks can drive the frame loop directly without starting `requestAnimationFrame`.
- Vitest 5 exposes `bench` via the test context rather than as a top-level export, so the benchmark files use `test('...', ({ bench }) => { ... })`.
