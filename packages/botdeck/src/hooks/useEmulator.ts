import { useCallback, useEffect, useRef, useState } from "react";
import { Emulator, SCREEN_WIDTH, SCREEN_HEIGHT } from "@/emulator/emulator";
import { collectState, type CollectedState } from "@/emulator/collectState";
import { loadRomBytes, splashUrl } from "@/play";

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

export interface UseEmulatorResult {
  canvasRef: React.RefObject<HTMLCanvasElement | null>;
  fps: number;
  power: boolean;
  romName: string | null;
  hasRom: boolean;
  splashUrl: string;
  error?: string;
  buttonDown: (button: number) => void;
  buttonUp: (button: number) => void;
  loadRom: (data: ArrayBuffer, name?: string) => void;
  reset: () => void;
  powerOn: () => void;
  powerOff: () => void;
  collect: () => CollectedState | null;
  saveStateToFile: () => void;
  loadStateFromFile: (file: File) => void;
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
        // NES emits BGR in low 24 bits; canvas wants RGBA.
        view.setUint8(i * 4, (px >> 16) & 0xff); // R
        view.setUint8(i * 4 + 1, (px >> 8) & 0xff); // G
        view.setUint8(i * 4 + 2, px & 0xff); // B
        view.setUint8(i * 4 + 3, 0xff); // A
      }
      ctx.putImageData(image, 0, 0);
    });

    const unsubscribeError = emulator.onError((message) => {
      setError(message);
      setPower(false);
    });

    const fpsTimer = window.setInterval(() => setFps(emulator.getFps()), 1000);

    loadRomBytes(game)
      .then((buf) => {
        emulator.loadROM(buf, `${game}.nes`);
        setRomName(emulator.getRomName());
        setHasRom(true);
        setError(undefined);
      })
      .catch((e) => setError(String(e)));

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

  const collect = useCallback((): CollectedState | null => {
    return collectState(emulator);
  }, [emulator]);

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

  const loadStateFromFile = useCallback(
    (file: File) => {
      if (!hasRom) return;
      file
        .text()
        .then((text) => {
          const parsed = JSON.parse(text) as { state: unknown };
          if (!parsed.state) throw new Error("no state in file");
          emulator.fromJSON(parsed.state as object);
        })
        .catch((e) => setError(`state load failed: ${String(e)}`));
    },
    [emulator, hasRom],
  );

  return {
    canvasRef,
    fps,
    power,
    romName,
    hasRom,
    splashUrl: splashUrl(game),
    error,
    buttonDown,
    buttonUp,
    loadRom,
    reset,
    powerOn,
    powerOff,
    collect,
    saveStateToFile,
    loadStateFromFile,
  };
}
