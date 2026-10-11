import { describe, expect, it, vi } from "vitest";
import { Emulator } from "./emulator";

type StubNes = {
  loadROM: ReturnType<typeof vi.fn>;
  frame: ReturnType<typeof vi.fn>;
  buttonDown: ReturnType<typeof vi.fn>;
  buttonUp: ReturnType<typeof vi.fn>;
  getFPS: ReturnType<typeof vi.fn>;
};

function makeEmulator(): { emulator: Emulator; nes: StubNes } {
  const emulator = new Emulator();
  const nes = {
    loadROM: vi.fn(),
    frame: vi.fn(),
    buttonDown: vi.fn(),
    buttonUp: vi.fn(),
    getFPS: vi.fn(() => 60),
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (emulator as any).nes = nes;
  return { emulator, nes };
}

describe("Emulator macro playback", () => {
  const RIGHT = 7; // NES_BUTTONS.RIGHT

  it("plays a single step with configured hold timing", async () => {
    const { emulator, nes } = makeEmulator();
    const promise = emulator.runMacro([{ button: 0, holdFrames: 2, gapFrames: 3 }]);

    expect(emulator.isPlayingMacro()).toBe(true);
    expect(nes.buttonDown).toHaveBeenCalledWith(1, 0);
    expect(nes.buttonUp).not.toHaveBeenCalled();

    // holdFrames = 2 -> release after two frames, then macro ends
    emulator.stepFrame();
    expect(nes.buttonUp).not.toHaveBeenCalled();
    emulator.stepFrame();
    expect(nes.buttonUp).toHaveBeenCalledWith(1, 0);

    await expect(promise).resolves.toBeUndefined();
    expect(emulator.isPlayingMacro()).toBe(false);
  });

  it("plays multiple sequential steps with gaps between them", async () => {
    const { emulator, nes } = makeEmulator();
    const promise = emulator.runMacro([
      { button: 0, holdFrames: 1, gapFrames: 1 },
      { button: 1, holdFrames: 1, gapFrames: 1 },
    ]);

    // Step 1: press A, hold 1 -> release A, gap 1
    emulator.stepFrame(); // hold end -> release A
    emulator.stepFrame(); // gap end -> press B
    expect(nes.buttonDown).toHaveBeenLastCalledWith(1, 1);
    emulator.stepFrame(); // hold end -> release B, no next step -> macro done

    await expect(promise).resolves.toBeUndefined();
    expect(nes.buttonDown).toHaveBeenCalledTimes(2);
    expect(nes.buttonUp).toHaveBeenCalledTimes(2);
  });

  it("resolves immediately for an empty macro", async () => {
    const { emulator } = makeEmulator();
    await expect(emulator.runMacro([])).resolves.toBeUndefined();
    expect(emulator.isPlayingMacro()).toBe(false);
  });

  it("aborts on the interrupt predicate and reports it", async () => {
    const { emulator, nes } = makeEmulator();
    let frames = 0;
    const promise = emulator.runMacro(
      [{ button: RIGHT, holdFrames: 100, gapFrames: 4 }],
      () => ++frames > 3,
    );

    // Predicate is checked before each frame of the macro; it stops the hold
    // early and releases the held button.
    emulator.stepFrame();
    emulator.stepFrame();
    expect(emulator.isPlayingMacro()).toBe(true);
    emulator.stepFrame();
    emulator.stepFrame();

    await promise;
    expect(emulator.isPlayingMacro()).toBe(false);
    expect(emulator.wasMacroInterrupted()).toBe(true);
    expect(nes.buttonUp).toHaveBeenCalledWith(1, RIGHT);
    // 4 frames consumed of a 100-frame hold: the rest of the macro is gone.
    expect(frames).toBe(4);
  });

  it("clears the interrupt flag for a clean macro", async () => {
    const { emulator } = makeEmulator();
    const promise = emulator.runMacro([{ button: 0, holdFrames: 1, gapFrames: 1 }]);
    emulator.stepFrame();
    emulator.stepFrame();
    await promise;
    expect(emulator.wasMacroInterrupted()).toBe(false);
  });

  it("cancels a running macro and resolves early", async () => {
    const { emulator, nes } = makeEmulator();
    const promise = emulator.runMacro([{ button: 2, holdFrames: 10, gapFrames: 10 }]);
    emulator.stepFrame();
    emulator.cancelMacro();

    await expect(promise).resolves.toBeUndefined();
    expect(nes.buttonUp).toHaveBeenCalledWith(1, 2);
    expect(emulator.isPlayingMacro()).toBe(false);
  });

  it("survives a throwing interrupt predicate without killing the frame loop", async () => {
    const { emulator, nes } = makeEmulator();
    const promise = emulator.runMacro(
      [{ button: RIGHT, holdFrames: 100, gapFrames: 4 }],
      () => {
        throw new Error("state read failed");
      },
    );

    // The predicate throwing must not escape stepFrame (an escaping throw would
    // stop requestAnimationFrame from re-arming and strand the macro).
    expect(() => emulator.stepFrame()).not.toThrow();

    await expect(promise).resolves.toBeUndefined();
    expect(emulator.isPlayingMacro()).toBe(false);
    expect(emulator.wasMacroInterrupted()).toBe(true);
    expect(nes.buttonUp).toHaveBeenCalledWith(1, RIGHT);
  });

  it("a throwing predicate does not strand the macro across further frames", async () => {
    const { emulator } = makeEmulator();
    let calls = 0;
    const promise = emulator.runMacro(
      [{ button: 0, holdFrames: 100, gapFrames: 4 }],
      () => {
        calls += 1;
        throw new Error("boom");
      },
    );

    emulator.stepFrame();
    emulator.stepFrame();
    emulator.stepFrame();

    // Cancelled on the first throwing frame; the predicate is not re-run after
    // the macro has been torn down.
    expect(calls).toBe(1);
    await expect(promise).resolves.toBeUndefined();
    expect(emulator.isPlayingMacro()).toBe(false);
  });
});
