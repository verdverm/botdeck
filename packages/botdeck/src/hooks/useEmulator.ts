import { useCallback, useEffect, useRef, useState } from "react";
import { Emulator, SCREEN_WIDTH, SCREEN_HEIGHT } from "@/emulator/emulator";
import { collectState, type CollectedState } from "@/emulator/collectState";
import { loadRomBytes, splashUrl, statesUrl } from "@/play";

// NES buttons keyed by KeyboardEvent.code; jsnes indices (see types.ts).
const KEY_BUTTONS: Record<string, number> = {
  ArrowUp: 4,
  ArrowDown: 5,
  ArrowLeft: 6,
  ArrowRight: 7,
  KeyZ: 1, // B
  KeyX: 0, // A
  Enter: 3, // Start
  Backslash: 2, // Select
};

const KEY_DEBOUNCE_MS = 50;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export interface UseEmulatorResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  fps: number;
  power: boolean;
  romName: string | null;
  hasRom: boolean;
  splashUrl: string;
  error?: string;
  muted: boolean;
  buttonDown: (button: number) => void;
  buttonUp: (button: number) => void;
  loadRom: (data: ArrayBuffer, name?: string) => void;
  reset: () => void;
  powerOn: () => void;
  powerOff: () => void;
  collect: () => CollectedState | null;
  refreshState: () => CollectedState | null;
  saveStateToFile: () => void;
  saveStateToPlay: (targetPlayId: string, name?: string) => Promise<{
    statePath?: string;
    extractedPath?: string;
    metadataPath?: string;
    ff1?: unknown;
  }>;
  loadStateFromFile: (file: File) => Promise<CollectedState>;
  loadState: (state: object) => Promise<CollectedState>;
  setMuted: (muted: boolean) => void;
}

/**
 * Mounts the Emulator core, renders its frames onto the returned canvas, and
 * exposes the human controls: power, loadRom, reset, on-screen pad + debounced
 * keyboard, save/load state, and collect snapshot.
 *
 * `game` drives a dev-time boot over the file API (§4): the ROM bytes are
 * fetched from /api/games/:game/rom and loaded. The ROM is game-scoped, not
 * play-scoped, so no play config is read here. No client-side repo paths.
 */
export function useEmulator(game: string): UseEmulatorResult {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [emulator] = useState(() => new Emulator());
  const [fps, setFps] = useState(0);
  const [power, setPower] = useState(false);
  const [romName, setRomName] = useState<string | null>(null);
  const [hasRom, setHasRom] = useState(false);
  const [error, setError] = useState<string | undefined>();
  const [muted, setMutedState] = useState(false);
  const bootPromiseRef = useRef<Promise<void> | null>(null);

  // Render loop: draw each emulated frame onto the canvas.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const image = ctx.createImageData(SCREEN_WIDTH, SCREEN_HEIGHT);
    const view = new DataView(image.data.buffer);

    const unsubscribe = emulator.onFrame((buffer) => {
      for (let i = 0; i < buffer.length; i++) {
        const px = buffer[i] ?? 0;
        // jsnes emits BGR in low 24 bits; canvas wants RGBA.
        view.setUint8(i * 4, px & 0xff); // R
        view.setUint8(i * 4 + 1, (px >> 8) & 0xff); // G
        view.setUint8(i * 4 + 2, (px >> 16) & 0xff); // B
        view.setUint8(i * 4 + 3, 0xff); // A
      }
      ctx.putImageData(image, 0, 0);
    });

    const unsubscribeError = emulator.onError((message) => {
      setError(message);
      setPower(false);
    });

    const fpsTimer = window.setInterval(() => setFps(emulator.getFps()), 1000);

    bootPromiseRef.current = loadRomBytes(game)
      .then((buf) => {
        emulator.loadROM(buf, `${game}.nes`);
        setRomName(emulator.getRomName());
        setHasRom(true);
        setError(undefined);
      })
      .catch((e) => {
        setError(String(e));
        throw e;
      });

    return () => {
      window.clearInterval(fpsTimer);
      unsubscribe();
      unsubscribeError();
      emulator.stop();
    };
  }, [emulator, game]);

  // Debounced keyboard: a held key stays a single press (no key-repeat spam).
  useEffect(() => {
    if (!hasRom) return;
    const pressed = new Map<number, number>();
    const down = (e: KeyboardEvent) => {
      const button = KEY_BUTTONS[e.code];
      if (button === undefined) return;
      e.preventDefault();
      const now = performance.now();
      const last = pressed.get(button);
      if (last !== undefined && now - last < KEY_DEBOUNCE_MS) return;
      pressed.set(button, now);
      emulator.buttonDown(button);
    };
    const up = (e: KeyboardEvent) => {
      const button = KEY_BUTTONS[e.code];
      if (button === undefined) return;
      e.preventDefault();
      pressed.delete(button);
      emulator.buttonUp(button);
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, [emulator, hasRom]);

  const buttonDown = useCallback(
    (button: number) => emulator.buttonDown(button),
    [emulator],
  );

  const buttonUp = useCallback(
    (button: number) => emulator.buttonUp(button),
    [emulator],
  );

  const loadRom = useCallback(
    (data: ArrayBuffer, name?: string) => {
      emulator.loadROM(data, name);
      setRomName(emulator.getRomName());
      setHasRom(true);
      setError(undefined);
      if (!emulator.isRunning()) {
        emulator.start();
        setPower(true);
      }
    },
    [emulator],
  );

  const reset = useCallback(() => emulator.reset(), [emulator]);

  const powerOn = useCallback(() => {
    setError(undefined);
    emulator.start();
    setPower(true);
  }, [emulator]);

  const powerOff = useCallback(() => {
    setError(undefined);
    emulator.stop();
    setPower(false);
  }, [emulator]);

  const ensureRomAndPower = useCallback(async () => {
    if (!emulator.hasRomLoaded()) {
      if (bootPromiseRef.current) {
        await bootPromiseRef.current;
      } else {
        const buf = await loadRomBytes(game);
        emulator.loadROM(buf, `${game}.nes`);
        setRomName(emulator.getRomName());
        setHasRom(true);
        setError(undefined);
      }
    }
    if (!emulator.isRunning()) {
      emulator.start();
      setPower(true);
    }
  }, [emulator, game]);

  const collect = useCallback((): CollectedState | null => {
    return collectState(emulator);
  }, [emulator]);

  const refreshState = useCallback((): CollectedState | null => {
    return collectState(emulator);
  }, [emulator]);

  const setMuted = useCallback(
    (value: boolean) => {
      emulator.setMuted(value);
      setMutedState(value);
    },
    [emulator],
  );

  const saveStateToPlay = useCallback(
    async (targetPlayId: string, name?: string) => {
      const collected = collectState(emulator);
      if (!collected) {
        throw new Error("no ROM loaded");
      }
      const res = await fetch(statesUrl(targetPlayId), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state: collected, name }),
      });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`save failed (${res.status}): ${body}`);
      }
      return (await res.json()) as {
        statePath?: string;
        extractedPath?: string;
        metadataPath?: string;
        ff1?: unknown;
      };
    },
    [emulator],
  );

  const saveStateToFile = useCallback(() => {
    if (!hasRom) return;
    const json = JSON.stringify({ romName, state: emulator.toJSON() });
    const base = (romName ?? "state").replace(/\.nes$/i, "");
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${base}.state.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [emulator, hasRom, romName]);

  const doLoadState = useCallback(
    (parsed: unknown) => {
      if (!isPlainObject(parsed)) {
        throw new Error("state file is not an object");
      }
      let state: unknown;
      if (isPlainObject(parsed.saveState)) {
        state = parsed.saveState;
      } else if ("romName" in parsed && isPlainObject(parsed.state)) {
        state = parsed.state;
      } else {
        state = parsed;
      }
      emulator.fromJSON(state as object);
    },
    [emulator],
  );

  const loadStateFromFile = useCallback(
    async (file: File): Promise<CollectedState> => {
      const text = await file.text();
      const parsed = JSON.parse(text) as unknown;
      await ensureRomAndPower();
      doLoadState(parsed);
      const collected = collectState(emulator);
      if (!collected) throw new Error("state collection failed");
      return collected;
    },
    [emulator, ensureRomAndPower, doLoadState],
  );

  const loadState = useCallback(
    async (state: object): Promise<CollectedState> => {
      await ensureRomAndPower();
      doLoadState(state);
      const collected = collectState(emulator);
      if (!collected) throw new Error("state collection failed");
      return collected;
    },
    [emulator, ensureRomAndPower, doLoadState],
  );

  return {
    canvasRef,
    fps,
    power,
    romName,
    hasRom,
    splashUrl: splashUrl(game),
    error,
    muted,
    buttonDown,
    buttonUp,
    loadRom,
    reset,
    powerOn,
    powerOff,
    collect,
    refreshState,
    saveStateToFile,
    saveStateToPlay,
    loadStateFromFile,
    loadState,
    setMuted,
  };
}
