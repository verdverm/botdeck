import { describe, expect, it } from "vitest";
import type { PromptTemplateBundle } from "@/types";
import {
  assemblePrompt,
  buildRenderContext,
  renderTemplate,
  resolveMode,
  type LivePromptInput,
} from "./promptRender";

// A bundle with two layers: `commands`/`state`/`goals` templates plus the
// "system" snippet, and play-override shadowing on "system". `context` and
// `limits` carry the disk-derived values renderPrompt would interpolate.
function makeBundle(overrides: Partial<PromptTemplateBundle> = {}): PromptTemplateBundle {
  return {
    game: "ff1",
    id: "0000_test",
    prompt: {
      modes: [
        {
          id: "field",
          label: "Field",
          systemSnippets: ["system"],
          userSnippets: ["commands", "goals"],
        },
        {
          id: "battle",
          label: "Battle",
          systemSnippets: ["system"],
          userSnippets: ["commands"],
        },
      ],
    },
    limits: {
      memoryLimit: "2048",
      memoryCount: "10",
      goalsLimit: "1024",
      journalLimit: "32768",
      snippetLimit: "4096",
      snippetCount: "50",
      recentHistoryLimit: 10,
    },
    context: { memory: "", goals: "walk to coneria", agentSnippets: "", recentHistory: "" },
    templates: [
      { name: "system", content: "play {{playId}} mem {{memoryLimit}}", source: "game", gameContent: "play {{playId}} mem {{memoryLimit}}", playContent: null },
      { name: "commands", content: "CMDS:\n{{commands}}", source: "game", gameContent: "CMDS:\n{{commands}}", playContent: null },
      { name: "goals", content: "## Goals\n{{goals}}", source: "game", gameContent: "## Goals\n{{goals}}", playContent: null },
    ],
    ...overrides,
  };
}

const live: LivePromptInput = {
  gameId: "ff1",
  playId: "ff1/0000_test",
  mode: "field",
  state: { romName: "ff1", ff1: { party: [] } },
  options: [
    { name: "goto", description: "walk somewhere", args: '{ "location": "string" }' },
    { name: "menu", description: "press start" },
  ],
  userMessage: "",
};

describe("renderTemplate", () => {
  it("substitutes known keys and blanks unknown ones", () => {
    const ctx = buildRenderContext(live, makeBundle());
    expect(renderTemplate("a {{gameId}} b {{playId}} c {{nope}}", ctx)).toBe(
      "a ff1 b ff1/0000_test c ",
    );
  });
});

describe("resolveMode", () => {
  it("returns the mode entry with both arrays, or undefined when the mode is unknown", () => {
    const bundle = makeBundle();
    expect(resolveMode(bundle, "battle")).toMatchObject({
      systemSnippets: ["system"],
      userSnippets: ["commands"],
    });
    expect(resolveMode(bundle, "field")).toMatchObject({
      systemSnippets: ["system"],
      userSnippets: ["commands", "goals"],
    });
    expect(resolveMode(bundle, "nope")).toBeUndefined();
  });
});

describe("assemblePrompt", () => {
  it("splits system and user by array (no filename convention)", () => {
    const { system, user } = assemblePrompt(live, makeBundle());
    expect(system).toBe("play ff1/0000_test mem 2048");
    expect(user).toContain("CMDS:");
    expect(user).toContain("- goto { \"location\": \"string\" }: walk somewhere");
    expect(user).toContain("- menu: press start");
    expect(user).toContain("## Goals\nwalk to coneria");
    expect(user.indexOf("CMDS:")).toBeLessThan(user.indexOf("## Goals"));
    expect(user).not.toContain("play ff1/0000_test");
  });

  it("appends fixed sections only when their context is non-empty", () => {
    const bundle = makeBundle({
      context: { memory: "", goals: "g", agentSnippets: "### note\nhi", recentHistory: "- goto -> ok" },
    });
    const { user } = assemblePrompt(live, bundle);
    expect(user).toContain("## Agent-authored snippets\n\n### note\nhi");
    expect(user).toContain("## Recent actions\n\n- goto -> ok");
    expect(user).not.toContain("## Message from the user");

    const withMsg: LivePromptInput = { ...live, userMessage: "go north" };
    expect(assemblePrompt(withMsg, bundle).user).toContain("## Message from the user\n\ngo north");
  });

  it("honors play-override template content (shadowing already resolved by source)", () => {
    const bundle = makeBundle({
      templates: makeBundle().templates.map((t) =>
        t.name === "system"
          ? { ...t, content: "OVERRIDE {{gameId}}", source: "play", playContent: "OVERRIDE {{gameId}}" }
          : t,
      ),
    });
    expect(assemblePrompt(live, bundle).system).toBe("OVERRIDE ff1");
  });

  it("returns empty parts when the mode has no matching entry", () => {
    const bundle = makeBundle({ prompt: { modes: [] } });
    expect(assemblePrompt(live, bundle)).toEqual({ system: "", user: "" });
  });
});
