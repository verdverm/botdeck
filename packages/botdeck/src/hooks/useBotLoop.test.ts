import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBotLoop } from "./useBotLoop";
import type { Emulator } from "@/emulator/emulator";
import type { CollectedState } from "@/emulator/collectState";
import type { GamePlugin } from "@/types";

function makeState(overrides: { inBattle?: boolean; stuCanAct?: boolean; allQueued?: boolean } = {}): Record<string, unknown> {
  const allQueued = overrides.allQueued ?? false;
  const stuCanAct = allQueued ? false : (overrides.stuCanAct ?? true);
  return {
    ff1: {
      battle: {
        inBattle: overrides.inBattle !== false,
        activePartyIndex: 0,
        party: [
          {
            index: 0,
            name: "Stu",
            canAct: stuCanAct,
            alive: true,
            hp: 20,
            pendingAction: allQueued ? { command: "attack" } : undefined,
          },
          {
            index: 1,
            name: "Rias",
            canAct: false,
            alive: true,
            hp: 20,
            pendingAction: allQueued ? { command: "attack" } : undefined,
          },
        ],
        enemies: [{ slot: 0, name: "Goblin", alive: true, hp: 10 }],
      },
    },
  };
}

describe("useBotLoop step mode", () => {
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
  let emulator: Emulator;
  let plugin: GamePlugin;
  let currentState: Record<string, unknown>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    currentState = makeState({ inBattle: true, stuCanAct: true });

    emulator = {
      hasRomLoaded: vi.fn().mockReturnValue(true),
      isRunning: vi.fn().mockReturnValue(true),
      runMacro: vi.fn().mockResolvedValue(undefined),
      wasMacroInterrupted: vi.fn(() => false),
      onFrameProbe: vi.fn().mockReturnValue(() => {}),
      isPlayingMacro: vi.fn().mockReturnValue(false),
    } as unknown as Emulator;

    plugin = {
      id: "ff1",
      title: "FF1",
      readState: () => currentState,
      getMode: (state: Record<string, unknown>) =>
        (state as { ff1?: { battle?: { inBattle?: boolean } } }).ff1?.battle?.inBattle ? "battle" : "field",
      availableCommands: () => [
        { name: "fight", description: "Attack", args: '{ "actor": "string", "target": "string" }' },
      ],
      compile: () => [{ button: 0 }],
    } as unknown as GamePlugin;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stops after executePending without calling the agent again", async () => {
    fetchSpy
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ command: { name: "fight", args: { actor: "Stu", target: "Goblin" } } }),
      } as Response)
      .mockResolvedValue({ ok: true, json: async () => ({}) } as Response);

    const collect = () => ({}) as unknown as CollectedState;

    const { result } = renderHook(() =>
      useBotLoop({
        playId: "ff1/0000_dev",
        game: "ff1",
        emulator,
        plugin,
        collect,
        collectStates: false,
        settleDelayMs: 10,
      }),
    );

    act(() => result.current.setRunMode("step"));

    await act(async () => {
      await result.current.step();
    });

    expect(result.current.pendingDecision).toBeDefined();
    expect(result.current.pendingDecision?.command).toEqual({
      name: "fight",
      args: { actor: "Stu", target: "Goblin" },
    });
    const turnCallsBefore = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/api/turn")).length;
    expect(turnCallsBefore).toBe(1);

    await act(async () => {
      await result.current.executePending();
    });

    await waitFor(() => expect(result.current.pendingDecision).toBeUndefined());
    expect(result.current.isThinking).toBe(false);
    const turnCallsAfter = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/api/turn")).length;
    expect(turnCallsAfter).toBe(1);
  });

  it("sends the pending user message in the turn request and clears it after the turn", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ command: { name: "fight", args: { actor: "Stu", target: "Goblin" } } }),
    } as Response);

    const { result } = renderHook(() =>
      useBotLoop({
        playId: "ff1/0000_dev",
        game: "ff1",
        emulator,
        plugin,
        collectStates: false,
        settleDelayMs: 10,
      }),
    );

    act(() => result.current.setPendingMessage("Stop spamming interact"));

    await act(async () => {
      await result.current.step();
    });

    const turnCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/api/turn"));
    expect(turnCalls.length).toBe(1);
    const init = turnCalls[0]![1] as RequestInit;
    expect(init.body).toBeDefined();
    const body = JSON.parse(String(init.body));
    expect(body.userMessage).toBe("Stop spamming interact");
    expect(body.state.userMessage).toBeUndefined();

    await waitFor(() => expect(result.current.pendingMessage).toBe(""));
  });
});

describe("useBotLoop battle round execution", () => {
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
  let emulator: Emulator;

  function battleState(allQueued: boolean): Record<string, unknown> {
    const pending = allQueued ? { command: "attack" } : undefined;
    return {
      ff1: {
        battle: {
          inBattle: true,
          activePartyIndex: allQueued ? 2 : 0,
          party: [
            { name: "Stu", canAct: !allQueued, alive: true, hp: 20, pendingAction: pending },
            { name: "Rias", canAct: false, alive: true, hp: 20, pendingAction: { command: "attack" } },
            { name: "Zing", canAct: false, alive: true, hp: 20, pendingAction: { command: "attack" } },
          ],
          enemies: [{ slot: 0, name: "Goblin", alive: true, hp: 10 }],
        },
      },
    };
  }

  beforeEach(() => {
    fetchSpy = vi.fn(async (_url: unknown, _init?: RequestInit) => {
      return { ok: true, json: async () => ({ command: { name: "fight", args: {} } }) } as unknown as Response;
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emulator = {
      hasRomLoaded: vi.fn().mockReturnValue(true),
      isRunning: vi.fn().mockReturnValue(true),
      runMacro: vi.fn().mockResolvedValue(undefined),
      wasMacroInterrupted: vi.fn(() => false),
      onFrameProbe: vi.fn().mockReturnValue(() => {}),
      isPlayingMacro: vi.fn().mockReturnValue(false),
    } as unknown as Emulator;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("does not ask the agent while the battle round is still executing", async () => {
    // Regression: a turn that begins while every living party member already
    // has a queued action (the game is mid-round, playing animations) must
    // wait for the round to finish and only then call the agent, against the
    // fresh state where command entry is available again.
    let readCount = 0;
    const plugin = {
      id: "ff1",
      title: "FF1",
      // The first 4 reads report the stale mid-round state (everyone queued);
      // after that the round has executed and Stu can act again.
      readState: () => {
        readCount += 1;
        return battleState(readCount <= 4);
      },
      getMode: () => "battle",
      availableCommands: () => [
        { name: "fight", description: "Attack", args: '{ "actor": "string", "target": "string" }' },
      ],
      compile: () => [{ button: 0 }],
    } as unknown as GamePlugin;

    const { result } = renderHook(() =>
      useBotLoop({
        playId: "ff1/0000_dev",
        game: "ff1",
        emulator,
        plugin,
        collectStates: false,
        settleDelayMs: 5,
      }),
    );

    await act(async () => {
      await result.current.step();
    });

    await waitFor(() => expect(result.current.isThinking).toBe(false));

    const turnCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/api/turn"));
    expect(turnCalls.length).toBe(1);

    const body = JSON.parse(String((turnCalls[0]![1] as RequestInit).body)) as {
      actor?: string;
      state: Record<string, unknown>;
    };

    // The agent must be asked for the member entering commands in the FRESH
    // state (Stu, index 0), not the stale mid-round actor (Zing, index 2).
    expect(body.actor).toBe("Stu");
    const party = (body.state as { ff1: { battle: { party: { name: string; canAct: boolean }[] } } })
      .ff1.battle.party;
    expect(party.some((m) => m.canAct)).toBe(true);
  }, 30_000);
});

describe("useBotLoop step persistence", () => {
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
  let emulator: Emulator;

  function battleMember(i: number, name: string, canAct: boolean) {
    return {
      index: i,
      name,
      canAct,
      alive: true,
      hp: 20,
      pendingAction: canAct ? undefined : { command: "attack" },
    };
  }

  function commandEntryState(): Record<string, unknown> {
    return {
      ff1: {
        battle: {
          inBattle: true,
          phase: "commandEntry",
          commandEntryAvailable: true,
          roundExecuting: false,
          battleOver: false,
          nextCommandableIndex: 0,
          activePartyIndex: 0,
          party: [
            battleMember(0, "Stu", true),
            battleMember(1, "Rias", false),
            battleMember(2, "Zing", false),
            battleMember(3, "Jaki", false),
          ],
          enemies: [{ slot: 0, name: "Goblin", alive: true, hp: 10 }],
        },
      },
    };
  }

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emulator = {
      hasRomLoaded: vi.fn().mockReturnValue(true),
      isRunning: vi.fn().mockReturnValue(true),
      runMacro: vi.fn().mockResolvedValue(undefined),
      wasMacroInterrupted: vi.fn(() => false),
      onFrameProbe: vi.fn().mockReturnValue(() => {}),
      isPlayingMacro: vi.fn().mockReturnValue(false),
    } as unknown as Emulator;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("persists a step with the error when the agent call fails", async () => {
    // Regression (Problem C): a turn whose /api/turn request fails used to
    // throw without persisting anything, so plays never accumulated steps
    // and the agent's "Recent actions" section was never populated.
    fetchSpy.mockImplementation(async (url: unknown, init?: RequestInit) => {
      if (String(url).endsWith("/api/turn")) {
        return { ok: false, status: 500, text: async () => "boom" } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });

    const plugin = {
      id: "ff1",
      title: "FF1",
      readState: () => commandEntryState(),
      getMode: () => "battle",
      availableCommands: () => [{ name: "fight", description: "Attack", args: "{}" }],
      compile: () => [{ button: 0 }],
    } as unknown as GamePlugin;

    const { result } = renderHook(() =>
      useBotLoop({
        playId: "ff1/0000_dev",
        game: "ff1",
        emulator,
        plugin,
        collectStates: false,
        settleDelayMs: 5,
      }),
    );

    await act(async () => {
      await result.current.step();
    });

    expect(result.current.error).toContain("turn failed (500)");
    const stepPosts = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/steps"));
    expect(stepPosts.length).toBe(1);
    const body = JSON.parse(String((stepPosts[0]![1] as RequestInit).body)) as {
      error?: string;
      command: { name: string };
      actor?: string;
    };
    expect(body.error).toContain("turn failed (500)");
    expect(body.command.name).toBe("");
  }, 30_000);

  it("persists a step with the error when the agent returns an error response", async () => {
    fetchSpy.mockImplementation(async (url: unknown) => {
      if (String(url).endsWith("/api/turn")) {
        return {
          ok: true,
          json: async () => ({ command: { name: "" }, error: "max tool rounds reached" }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });

    const plugin = {
      id: "ff1",
      title: "FF1",
      readState: () => commandEntryState(),
      getMode: () => "battle",
      availableCommands: () => [{ name: "fight", description: "Attack", args: "{}" }],
      compile: () => [{ button: 0 }],
    } as unknown as GamePlugin;

    const { result } = renderHook(() =>
      useBotLoop({
        playId: "ff1/0000_dev",
        game: "ff1",
        emulator,
        plugin,
        collectStates: false,
        settleDelayMs: 5,
      }),
    );

    await act(async () => {
      await result.current.step();
    });

    expect(result.current.error).toContain("max tool rounds reached");
    const stepPosts = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/steps"));
    expect(stepPosts.length).toBe(1);
    const body = JSON.parse(String((stepPosts[0]![1] as RequestInit).body)) as { error?: string };
    expect(body.error).toContain("max tool rounds reached");
  }, 30_000);

  it("records a compile error and feeds it back to the agent on the next turn", async () => {
    fetchSpy.mockImplementation(async (url: unknown) => {
      if (String(url).endsWith("/api/turn")) {
        return {
          ok: true,
          json: async () => ({ command: { name: "goto", args: { location: "Bogus" } }, reason: "travel" }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });

    const plugin = {
      id: "ff1",
      title: "FF1",
      readState: () => commandEntryState(),
      getMode: () => "battle",
      availableCommands: () => [{ name: "goto", description: "Travel", args: '{ "location": "string" }' }],
      compile: () => {
        throw new Error('goto: unknown location "Bogus".');
      },
    } as unknown as GamePlugin;

    const { result } = renderHook(() =>
      useBotLoop({
        playId: "ff1/0000_dev",
        game: "ff1",
        emulator,
        plugin,
        collectStates: false,
        settleDelayMs: 5,
      }),
    );

    await act(async () => {
      await result.current.step();
    });

    // The step is recorded as a failure with an empty macro...
    const stepPosts = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/steps"));
    expect(stepPosts.length).toBe(1);
    const body = JSON.parse(String((stepPosts[0]![1] as RequestInit).body)) as {
      error?: string;
      macro: unknown[];
      command: { name: string };
    };
    expect(body.error).toContain('goto: unknown location "Bogus"');
    expect(body.macro).toEqual([]);
    expect(body.command.name).toBe("goto");
    // ...and the pending one-shot user message carries the correction for the
    // agent's next turn.
    expect(result.current.pendingMessage).toContain("goto: unknown location \"Bogus\"");
    expect(result.current.pendingMessage).toContain("Do not repeat it");
  }, 30_000);

  it("does not ask the agent twice for the same actor when the command does not latch", async () => {
    // The command buffer never advances (stub macro), so the game still shows
    // command entry for Stu; the loop must stop instead of re-asking forever.
    fetchSpy.mockImplementation(async (url: unknown) => {
      if (String(url).endsWith("/api/turn")) {
        return {
          ok: true,
          json: async () => ({ command: { name: "fight", args: { actor: "Stu" } }, reason: "attack" }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });

    const plugin = {
      id: "ff1",
      title: "FF1",
      readState: () => commandEntryState(),
      getMode: () => "battle",
      availableCommands: () => [{ name: "fight", description: "Attack", args: "{}" }],
      compile: () => [{ button: 0 }],
    } as unknown as GamePlugin;

    const { result } = renderHook(() =>
      useBotLoop({
        playId: "ff1/0000_dev",
        game: "ff1",
        emulator,
        plugin,
        collectStates: false,
        settleDelayMs: 5,
      }),
    );

    await act(async () => {
      await result.current.step();
    });

    const turnCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/api/turn"));
    expect(turnCalls.length).toBe(1);
    // The failed-to-latch turn was still persisted.
    const stepPosts = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/steps"));
    expect(stepPosts.length).toBeGreaterThanOrEqual(1);
  }, 30_000);
});

describe("useBotLoop derived-phase command entry (B1 shape)", () => {
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
  let emulator: Emulator;

  function member(i: number, name: string, opts: { canAct?: boolean; queued?: boolean } = {}) {
    const canAct = opts.canAct ?? false;
    return {
      index: i,
      name,
      canAct,
      alive: true,
      hp: 20,
      pendingAction: canAct ? undefined : opts.queued ? { command: "attack" } : undefined,
    };
  }

  // The post-B1 shape: Stu has queued an attack and the game has opened Rias's
  // menu (btlcmd_curchar points at Rias). The reader now emits commandEntry
  // with nextCommandableIndex=1, which previously read as roundExecuting.
  function nextMemberMenuState(): Record<string, unknown> {
    return {
      ff1: {
        battle: {
          inBattle: true,
          phase: "commandEntry",
          commandEntryAvailable: true,
          roundExecuting: false,
          battleOver: false,
          nextCommandableIndex: 1,
          activePartyIndex: 1,
          party: [
            member(0, "Stu", { queued: true }),
            member(1, "Rias", { canAct: true }),
            member(2, "Zing"),
            member(3, "Jaki"),
          ],
          enemies: [{ slot: 0, name: "Goblin", alive: true, hp: 10 }],
        },
      },
    };
  }

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    emulator = {
      hasRomLoaded: vi.fn().mockReturnValue(true),
      isRunning: vi.fn().mockReturnValue(true),
      runMacro: vi.fn().mockResolvedValue(undefined),
      wasMacroInterrupted: vi.fn(() => false),
      onFrameProbe: vi.fn().mockReturnValue(() => {}),
      isPlayingMacro: vi.fn().mockReturnValue(false),
    } as unknown as Emulator;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("asks the agent for the next member while earlier members are queued", async () => {
    fetchSpy.mockImplementation(async (url: unknown) => {
      if (String(url).endsWith("/api/turn")) {
        return {
          ok: true,
          json: async () => ({ command: { name: "fight", args: { actor: "Rias" } }, reason: "attack" }),
        } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });

    const plugin = {
      id: "ff1",
      title: "FF1",
      readState: () => nextMemberMenuState(),
      getMode: () => "battle",
      availableCommands: () => [{ name: "fight", description: "Attack", args: "{}" }],
      compile: () => [{ button: 0 }],
    } as unknown as GamePlugin;

    const { result } = renderHook(() =>
      useBotLoop({
        playId: "ff1/0000_dev",
        game: "ff1",
        emulator,
        plugin,
        collectStates: false,
        settleDelayMs: 5,
      }),
    );

    await act(async () => {
      await result.current.step();
    });

    const turnCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/api/turn"));
    expect(turnCalls.length).toBe(1);
    const body = JSON.parse(String((turnCalls[0]![1] as RequestInit).body)) as { actor?: string };
    expect(body.actor).toBe("Rias");
  }, 30_000);

  it("surfaces a distinct stall error when no member is commandable and the battle is not over", async () => {
    fetchSpy.mockImplementation(async (url: unknown) => ({ ok: true, json: async () => ({}) } as unknown as Response));

    // Command entry is advertised but nextCommandableIndex points at a dead
    // member and no living member has canAct - a shape the loop must stop on.
    const staleEntryState: Record<string, unknown> = {
      ff1: {
        battle: {
          inBattle: true,
          phase: "commandEntry",
          commandEntryAvailable: true,
          roundExecuting: false,
          battleOver: false,
          nextCommandableIndex: 9,
          activePartyIndex: 0,
          party: [
            { index: 0, name: "Stu", canAct: false, alive: false, hp: 0, pendingAction: undefined },
            { index: 1, name: "Rias", canAct: false, alive: false, hp: 0, pendingAction: undefined },
          ],
          enemies: [{ slot: 0, name: "Goblin", alive: true, hp: 10 }],
        },
      },
    };

    const plugin = {
      id: "ff1",
      title: "FF1",
      readState: () => staleEntryState,
      getMode: () => "battle",
      availableCommands: () => [{ name: "fight", description: "Attack", args: "{}" }],
      compile: () => [{ button: 0 }],
    } as unknown as GamePlugin;

    const { result } = renderHook(() =>
      useBotLoop({
        playId: "ff1/0000_dev",
        game: "ff1",
        emulator,
        plugin,
        collectStates: false,
        settleDelayMs: 5,
      }),
    );

    await act(async () => {
      await result.current.step();
    });

    expect(result.current.error).toContain("no commandable member");
    const turnCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/api/turn"));
    expect(turnCalls.length).toBe(0);
  }, 30_000);
});

describe("useBotLoop frame-probe path (S2/S3)", () => {
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
  let probe: (() => void) | undefined;
  let phase: "roundExecuting" | "commandEntry";

  function roundExecutingState(): Record<string, unknown> {
    return {
      ff1: {
        battle: {
          inBattle: true,
          phase: "roundExecuting",
          commandEntryAvailable: false,
          roundExecuting: true,
          battleOver: false,
          activePartyIndex: 3,
          party: [
            { index: 0, name: "Stu", canAct: false, alive: true, hp: 20, pendingAction: { command: "attack" } },
            { index: 1, name: "Rias", canAct: false, alive: true, hp: 20, pendingAction: { command: "attack" } },
          ],
          enemies: [{ slot: 0, name: "Goblin", alive: true, hp: 10 }],
        },
      },
    };
  }

  function commandEntryState(): Record<string, unknown> {
    return {
      ff1: {
        battle: {
          inBattle: true,
          phase: "commandEntry",
          commandEntryAvailable: true,
          roundExecuting: false,
          battleOver: false,
          nextCommandableIndex: 0,
          activePartyIndex: 0,
          party: [
            { index: 0, name: "Stu", canAct: true, alive: true, hp: 20, pendingAction: undefined },
            { index: 1, name: "Rias", canAct: false, alive: true, hp: 20, pendingAction: undefined },
          ],
          enemies: [{ slot: 0, name: "Goblin", alive: true, hp: 10 }],
        },
      },
    };
  }

  beforeEach(() => {
    fetchSpy = vi.fn(async (url: unknown) => {
      if (String(url).endsWith("/api/turn")) {
        return { ok: true, json: async () => ({ command: { name: "fight", args: {} }, reason: "x" }) } as unknown as Response;
      }
      return { ok: true, json: async () => ({}) } as unknown as Response;
    });
    globalThis.fetch = fetchSpy as unknown as typeof fetch;
    probe = undefined;
    phase = "roundExecuting";
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("resolves only on consecutive frame-boundary confirmations from the probe", async () => {
    const emulator = {
      hasRomLoaded: vi.fn().mockReturnValue(true),
      isRunning: vi.fn().mockReturnValue(true),
      runMacro: vi.fn().mockResolvedValue(undefined),
      wasMacroInterrupted: vi.fn(() => false),
      onFrameProbe: vi.fn((cb: () => void) => {
        probe = cb;
        return () => {
          probe = undefined;
        };
      }),
      isPlayingMacro: vi.fn().mockReturnValue(false),
    } as unknown as Emulator;

    const plugin = {
      id: "ff1",
      title: "FF1",
      readState: () => (phase === "roundExecuting" ? roundExecutingState() : commandEntryState()),
      getMode: () => "battle",
      availableCommands: () => [{ name: "fight", description: "Attack", args: "{}" }],
      compile: () => [{ button: 0 }],
    } as unknown as GamePlugin;

    const { result } = renderHook(() =>
      useBotLoop({
        playId: "ff1/0000_dev",
        game: "ff1",
        emulator,
        plugin,
        collectStates: false,
        settleDelayMs: 5,
      }),
    );

    let done = false;
    let turn: Promise<void> = Promise.resolve();
    act(() => {
      turn = result.current.step().then(() => {
        done = true;
      });
    });

    // Let the loop start and register its frame probe (mid-round state).
    await new Promise((r) => setTimeout(r, 20));
    expect(probe).toBeDefined();

    // One confirmed command-entry frame: below confirmFrames (2), not enough.
    phase = "commandEntry";
    probe!();
    await new Promise((r) => setTimeout(r, 10));
    expect(done).toBe(false);

    // A second consecutive frame satisfies confirmFrames; the wait resolves true.
    probe!();
    await act(async () => {
      await turn;
    });

    expect(done).toBe(true);
    const turnCalls = fetchSpy.mock.calls.filter((call) => String(call[0]).endsWith("/api/turn"));
    expect(turnCalls.length).toBe(1);
    expect(probe).toBeUndefined();
  }, 30_000);
});

describe("useBotLoop dialog drive", () => {
  let fetchSpy: ReturnType<typeof vi.fn<typeof fetch>>;
  let emulator: Emulator;
  let currentState: Record<string, unknown>;
  let macroCalls: number;

  const fieldState = (dialog?: { open: boolean; current: string; pages: string[] }) => ({
    ff1: {
      battle: { inBattle: false },
      world: { mapId: 1, location: {}, playerTile: "0,0" },
      menu: { enteringShop: false, open: false },
      dialog: dialog ?? { open: false, current: "", pages: [] },
    },
  });

  beforeEach(() => {
    fetchSpy = vi.fn();
    globalThis.fetch = fetchSpy;
    macroCalls = 0;
    currentState = fieldState();

    emulator = {
      hasRomLoaded: vi.fn().mockReturnValue(true),
      isRunning: vi.fn().mockReturnValue(true),
      wasMacroInterrupted: vi.fn(() => false),
      onFrameProbe: vi.fn().mockReturnValue(() => {}),
      isPlayingMacro: vi.fn().mockReturnValue(false),
      setLastRoute: vi.fn(),
      runMacro: vi.fn().mockImplementation(async () => {
        macroCalls += 1;
        // 1: the talk_to macro opens the dialog. 2/3: the dialog driver's A
        // presses advance page 1 -> page 2 -> closed.
        if (macroCalls === 1) {
          currentState = fieldState({ open: true, current: "Page one", pages: ["Page one"] });
        } else if (macroCalls === 2) {
          currentState = fieldState({ open: true, current: "Page two", pages: ["Page one", "Page two"] });
        } else {
          currentState = fieldState({ open: false, current: "", pages: ["Page one", "Page two"] });
        }
      }),
    } as unknown as Emulator;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("pages an NPC dialog to completion and feeds the transcript to the next turn", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      json: async () => ({ command: { name: "talk_to", args: { npc: "Old Man" } } }),
    } as Response);

    const plugin = {
      id: "ff1",
      title: "FF1",
      readState: () => currentState,
      getMode: () => "field",
      availableCommands: () => [
        { name: "talk_to", description: "Talk", args: '{ "npc": "string" }' },
      ],
      compile: () => [{ button: 0 }],
      resetDialogCapture: () => {},
      captureDialogFrame: () => {},
    } as unknown as GamePlugin;

    const { result } = renderHook(() =>
      useBotLoop({
        playId: "ff1/0000_dev",
        game: "ff1",
        emulator,
        plugin,
        collect: () => ({}) as unknown as CollectedState,
        collectStates: false,
        settleDelayMs: 5,
      }),
    );

    // First turn: talk_to opens a two-page dialog; the driver pages through it.
    act(() => result.current.setRunMode("step"));
    await act(async () => {
      await result.current.step();
    });
    expect(result.current.pendingDecision).toBeDefined();
    await act(async () => {
      await result.current.executePending();
    });
    await waitFor(() => expect(result.current.pendingDecision).toBeUndefined());

    // talk_to macro + two interact A presses to reach the closed state.
    expect(macroCalls).toBe(3);

    // Second turn: the transcript rides along as the one-shot user message.
    await act(async () => {
      await result.current.step();
    });
    const turnBodies = fetchSpy.mock.calls
      .filter((call) => String(call[0]).endsWith("/api/turn"))
      .map((call) => JSON.parse(String((call[1] as RequestInit).body)) as { userMessage?: string });
    expect(turnBodies.length).toBe(2);
    expect(turnBodies[1]!.userMessage).toContain('"talk_to" (npc: Old Man)');
    expect(turnBodies[1]!.userMessage).toContain("Page one / Page two");
  }, 30_000);
});
