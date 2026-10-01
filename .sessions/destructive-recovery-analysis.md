# Destructive Recovery Analysis

## The destructive action

- **Destructive session:** `ses_f0b37be1dffeVxLob5DCn4JsfH`
- **Command executed:**
  ```
  git checkout -- packages/botdeck/src/emulator/audio.ts \
                 packages/botdeck/src/emulator/emulator.ts \
                 packages/botdeck/src/hooks/useEmulator.ts
  ```
- **Effect:** This reverted the three files to the last committed state, discarding all uncommitted constructive edits. The subagent then reconstructed only a minimal `saveStateToPlay` helper in `useEmulator.ts` to satisfy `App.tsx`, but did not restore the audio async/sample-rate fixes, the robust state-load helpers, or the typed `SavedStateResponse` interface.

---

## File 1: `packages/botdeck/src/emulator/audio.ts`

### Constructive changes that were lost

| Session | What changed |
|---|---|
| `ses_f0b808ef5ffen0oIbVAXBiJPWN` | Changed `getSampleRate()` to return a fixed `DEFAULT_SAMPLE_RATE` instead of creating an `AudioContext` during React render / `Emulator` construction. |
| `ses_f0b555623ffe12ZbbGcEVYkt27` | Made `start()` async, replaced fire-and-forget `resume()` + global event listeners with `await this.ctx.resume()`, and removed the `resumeHandler` plumbing. |
| `ses_f0b4ecf3dffep1lXHyVJXLa9Ta` | Created the lazily-built `AudioContext` with `{ sampleRate: DEFAULT_SAMPLE_RATE }` and added a post-resume warning when the context does not enter the `"running"` state. |

### Code that was lost

The final uncommitted `audio.ts` before the destructive checkout looked like this:

```ts
// packages/botdeck/src/emulator/audio.ts
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

  getSampleRate(): number {
    // Avoid creating an AudioContext during component render / Emulator
    // construction. jsNES generates samples at this rate and the browser's
    // AudioContext resamples if necessary. The real AudioContext is created
    // lazily inside start(), within a user gesture, so it starts in the
    // "running" state instead of being suspended by autoplay policy.
    return DEFAULT_SAMPLE_RATE;
  }

  async start(): Promise<void> {
    if (typeof window === "undefined" || !window.AudioContext) return;

    if (!this.ctx) {
      this.ctx = new window.AudioContext({ sampleRate: DEFAULT_SAMPLE_RATE });
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

    if (this.ctx.state !== "running") {
      await this.ctx.resume();
    }

    if (this.ctx.state !== "running") {
      console.warn(
        "AudioContext did not enter running state after resume; audio may be suspended.",
        this.ctx.state,
      );
    }
  }

  // ... stop(), writeSample(), flush() unchanged
}
```

### What was kept after the destructive session

The destructive checkout restored the committed version of `audio.ts`, which:
- Creates an `AudioContext` inside `getSampleRate()` during `Emulator` construction (a side effect during React render).
- Uses a synchronous `start()` with fire-and-forget `this.ctx.resume().catch(() => {})`.
- Adds global `keydown`/`mousedown`/`touchstart` resume listeners.
- Does **not** match jsNES sample rate to the `AudioContext` sample rate.

---

## File 2: `packages/botdeck/src/emulator/emulator.ts`

### Constructive change that was lost

| Session | What changed |
|---|---|
| `ses_f0b555623ffe12ZbbGcEVYkt27` | Made `Emulator.start()` async, awaited `this.audio.start()`, set `this.running = false` and reported an error if audio startup failed, and only started the RAF loop after audio resolved. |

### Code that was lost

```ts
// packages/botdeck/src/emulator/emulator.ts
async start(): Promise<void> {
  if (this.running) return;
  this.running = true;
  this.lastTime = performance.now();
  this.accumulator = 0;
  try {
    await this.audio.start();
  } catch (e) {
    this.running = false;
    const msg = e instanceof Error ? e.message : String(e);
    for (const listener of this.errorListeners)
      listener(`audio start failed: ${msg}`);
    return;
  }
  const loop = (now: number) => {
    if (!this.running) return;
    this.accumulator += now - this.lastTime;
    this.lastTime = now;
    const frameMs = 1000 / NES_FPS;
    let frames = 0;
    while (this.accumulator >= frameMs && frames < 3) {
      this.stepFrame();
      this.accumulator -= frameMs;
      frames += 1;
    }
    if (this.accumulator > frameMs * 3) this.accumulator = 0;
    this.raf = requestAnimationFrame(loop);
  };
  this.raf = requestAnimationFrame(loop);
}
```

### What was kept after the destructive session

The committed version of `emulator.ts` has a synchronous `start()` that calls `this.audio.start()` without awaiting it. If audio startup fails or remains suspended, the RAF loop starts anyway and errors are swallowed.

---

## File 3: `packages/botdeck/src/hooks/useEmulator.ts`

### Constructive changes that were lost

| Session | What changed |
|---|---|
| `ses_f0b870f8affek9hOyP0lKmWqJi` | Added `isPlainObject`, `looksLikeJsNesState`, and `extractSaveState` helpers, then rewrote `loadStateFromFile` to accept raw jsNES state, `{ romName, state }`, and `{ capturedAt, rom, saveRam, saveState, ff1 }` wrappers. |
| `ses_f0b555623ffe12ZbbGcEVYkt27` | Made `loadRom` and `powerOn` async, awaited `emulator.start()`, guarded `setPower(true)` with `emulator.isRunning()`, and typed `saveStateToPlay` with a `SavedStateResponse` interface. |

### Code that was lost

#### Robust state-loading helpers

```ts
// packages/botdeck/src/hooks/useEmulator.ts
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function looksLikeJsNesState(value: unknown): value is { cpu: { mem: unknown } } {
  return (
    isPlainObject(value) &&
    isPlainObject(value.cpu) &&
    (Array.isArray(value.cpu.mem) || value.cpu.mem instanceof Uint8Array)
  );
}

function extractSaveState(parsed: unknown): object {
  if (!isPlainObject(parsed)) {
    throw new Error("state file must contain a JSON object");
  }

  if (looksLikeJsNesState(parsed)) {
    return parsed as object;
  }

  if (parsed.saveState !== undefined && looksLikeJsNesState(parsed.saveState)) {
    return parsed.saveState as object;
  }

  if (parsed.state !== undefined && looksLikeJsNesState(parsed.state)) {
    return parsed.state as object;
  }

  throw new Error(
    "state file does not contain a valid jsNES save state (expected cpu.mem)",
  );
}
```

#### Robust `loadStateFromFile`

```ts
const loadStateFromFile = useCallback(
  (file: File) => {
    if (!hasRom) return;
    file
      .text()
      .then((text) => {
        const parsed = JSON.parse(text) as unknown;
        const state = extractSaveState(parsed);
        emulator.fromJSON(state);
      })
      .catch((e) => setError(`state load failed: ${String(e)}`));
  },
  [emulator, hasRom],
);
```

#### Async `powerOn` / `loadRom`

```ts
const loadRom = useCallback(
  async (data: ArrayBuffer, name?: string) => {
    emulator.loadROM(data, name);
    setRomName(emulator.getRomName());
    setHasRom(true);
    setError(undefined);
    if (!emulator.isRunning()) {
      await emulator.start();
      if (emulator.isRunning()) setPower(true);
    }
  },
  [emulator],
);

const powerOn = useCallback(async () => {
  setError(undefined);
  await emulator.start();
  if (emulator.isRunning()) setPower(true);
}, [emulator]);
```

#### Typed `saveStateToPlay`

```ts
export interface SavedStateResponse {
  statePath: string;
  extractedPath: string;
  ff1: unknown;
}

const saveStateToPlay = useCallback(
  async (playId: string): Promise<SavedStateResponse> => {
    if (!hasRom) throw new Error("no ROM loaded");
    const snapshot = collectState(emulator);
    if (!snapshot) throw new Error("failed to collect state");

    const res = await fetch(statesUrl(playId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(snapshot),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`server returned ${res.status}: ${text}`);
    }
    return (await res.json()) as SavedStateResponse;
  },
  [emulator, hasRom],
);
```

### What the destructive session restored

The subagent re-added only a weaker, inline-typed `saveStateToPlay`:

```ts
// packages/botdeck/src/hooks/useEmulator.ts (post-destructive reconstruction)
import { loadRomBytes, splashUrl, statesUrl } from "@/play";

export interface UseEmulatorResult {
  // ...
  saveStateToPlay: (targetPlayId: string) => Promise<{
    statePath?: string;
    extractedPath?: string;
    ff1?: unknown;
  }>;
  // ...
}

const saveStateToPlay = useCallback(
  async (targetPlayId: string) => {
    const collected = collectState(emulator);
    if (!collected) {
      throw new Error("no ROM loaded");
    }
    const res = await fetch(statesUrl(targetPlayId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(collected),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`save failed (${res.status}): ${body}`);
    }
    return (await res.json()) as {
      statePath?: string;
      extractedPath?: string;
      ff1?: unknown;
    };
  },
  [emulator],
);
```

Differences from the constructive version:
- No `SavedStateResponse` interface.
- No `hasRom` guard before collecting state.
- Weaker return typing (`statePath?` / `extractedPath?` instead of required strings).
- `loadStateFromFile` was restored to the committed, fragile implementation that only accepts `{ state: ... }`.
- `loadRom` and `powerOn` were restored to synchronous versions that do not await `emulator.start()`.

---

## Summary of what was lost vs. restored

| File | Lost | Restored by `ses_f0b37be1dffeVxLob5DCn4JsfH` |
|---|---|---|
| `audio.ts` | Fixed `getSampleRate()` (no render-time AudioContext), async `start()`, awaited resume, matched `AudioContext` sample rate to jsNES, removed resume listeners. | Nothing; file reset to committed state. |
| `emulator.ts` | Async `start()` that awaits `audio.start()` and halts the RAF loop on audio failure. | Nothing; file reset to committed state. |
| `useEmulator.ts` | Robust `extractSaveState` / `loadStateFromFile`, async `loadRom`/`powerOn` with `isRunning()` guards, typed `SavedStateResponse`, `saveStateToPlay` with `hasRom` guard. | Only a minimal `saveStateToPlay` with weaker typing and no `hasRom` guard. |

---

## Recommended next steps for recovery

1. Re-apply the audio fixes from `ses_f0b808ef5ffen0oIbVAXBiJPWN`, `ses_f0b555623ffe12ZbbGcEVYkt27`, and `ses_f0b4ecf3dffep1lXHyVJXLa9Ta` to `audio.ts`.
2. Re-apply the async `Emulator.start()` change from `ses_f0b555623ffe12ZbbGcEVYkt27` to `emulator.ts`.
3. In `useEmulator.ts`, restore the `extractSaveState` helpers and robust `loadStateFromFile` from `ses_f0b870f8affek9hOyP0lKmWqJi`, the async `loadRom`/`powerOn` guards from `ses_f0b555623ffe12ZbbGcEVYkt27`, and the typed `SavedStateResponse` / `saveStateToPlay` implementation.
4. Run `pnpm --filter botdeck typecheck` to verify the combined restoration.
