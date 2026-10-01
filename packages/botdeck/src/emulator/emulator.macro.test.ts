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

  it("cancels a running macro and resolves early", async () => {
    const { emulator, nes } = makeEmulator();
    const promise = emulator.runMacro([{ button: 2, holdFrames: 10, gapFrames: 10 }]);
    emulator.stepFrame();
    emulator.cancelMacro();

    await expect(promise).resolves.toBeUndefined();
    expect(nes.buttonUp).toHaveBeenCalledWith(1, 2);
    expect(emulator.isPlayingMacro()).toBe(false);
  });
});
