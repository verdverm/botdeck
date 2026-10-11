import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import type { GamePlugin } from "@/types";
import type { PromptTemplateBundle } from "@/types";
import { MarkdownTab } from "./MarkdownTab";

const PLAY_ID = "ff1/0001_dev";

const bundle: PromptTemplateBundle = {
  game: "ff1",
  id: "0001_dev",
  prompt: { modes: [{ id: "field", label: "Field", promptSnippets: ["system"] }] },
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
    {
      name: "system",
      content: "## Title {{gameId}}",
      source: "game",
      gameContent: "## Title {{gameId}}",
      playContent: null,
    },
  ],
};

function fakePlugin(): GamePlugin {
  return {
    id: "ff1",
    title: "FF1",
    readState: () => ({ ff1: { party: [] } }) as Record<string, unknown>,
    getMode: () => "field",
    availableCommands: () => [{ name: "goto", description: "walk" }],
    compile: () => [],
  };
}

function mockFetch(): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      const json = (body: unknown) =>
        new Response(JSON.stringify(body), {
          headers: { "content-type": "application/json" },
        });
      if (url.includes("/prompt-context")) return json(bundle);
      if (url.endsWith("/goals")) return json({ content: "walk to coneria" });
      if (url.endsWith("/memory")) return json([]);
      if (url.endsWith("/journal")) return json([]);
      if (url.endsWith("/config")) return json({});
      return json({});
    }),
  );
}

describe("MarkdownTab", () => {
  beforeEach(() => mockFetch());
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
  });

  it("renders the assembled prompt and every markdown section", async () => {
    render(
      <MarkdownTab playId={PLAY_ID} game="ff1" plugin={fakePlugin()} />,
    );

    // Assembled system prompt interpolates {{gameId}} -> ff1 and renders the
    // markdown heading in rendered mode (text is "Title ff1", no "##").
    await waitFor(() => expect(screen.getByText("Title ff1")).toBeInTheDocument());

    expect(screen.getByText("Goals")).toBeInTheDocument();
    expect(screen.getByText("Memory")).toBeInTheDocument();
    expect(screen.getByText("Journal")).toBeInTheDocument();
    expect(screen.getByText("Prompt templates")).toBeInTheDocument();
    expect(screen.getByText("Prompt groups")).toBeInTheDocument();
  });

  it("has a single global rendered/raw toggle that switches all views at once", async () => {
    render(<MarkdownTab playId={PLAY_ID} game="ff1" plugin={fakePlugin()} />);
    await waitFor(() => expect(screen.getByText("Title ff1")).toBeInTheDocument());

    // Exactly one "raw" toggle button exists for the whole tab.
    const rawButtons = screen.getAllByRole("button", { name: "raw" });
    expect(rawButtons).toHaveLength(1);

    fireEvent.click(rawButtons[0]!);

    // Raw mode shows the pre-interpolation markdown source (with "## ") in a
    // <pre>; the rendered heading element is gone.
    await waitFor(() => expect(screen.getByText("## Title ff1")).toBeInTheDocument());
    expect(screen.queryByText("Title ff1")).not.toBeInTheDocument();
  });
});
