import { useCallback, useEffect, useState } from "react";
import type {
  GamePlugin,
  JournalEntry,
  MemoryEntry,
  PromptTemplateBundle,
} from "@/types";
import {
  deleteGamePrompt,
  deleteJournal,
  deleteMemory,
  deletePlayPrompt,
  listJournal,
  listMemory,
  loadGoals,
  loadPromptContext,
  readJournal,
  readMemory,
  saveGoals,
  writeGamePrompt,
  writeJournal,
  writeMemory,
  writePlayPrompt,
} from "@/play";
import {
  assemblePrompt,
  buildRenderContext,
  type LivePromptInput,
  type RenderContext,
} from "./promptRender";
import { MarkdownView } from "./markdown/MarkdownView";
import { ViewToggle, type ViewMode } from "./markdown/GoalsSection";
import { GoalsSection } from "./markdown/GoalsSection";
import { ResourceSection, type ResourceItem } from "./markdown/ResourceSection";
import { PromptTemplatesSection } from "./markdown/PromptTemplatesSection";
import { PromptGroupsSection } from "./markdown/PromptGroupsSection";

interface MarkdownTabProps {
  playId: string;
  game: string;
  plugin: GamePlugin;
  pendingMessage?: string;
  disabled?: boolean;
}

/**
 * The markdown tab: accordions over every markdown the agent and prompts are
 * built from (goals, memory, journal, prompt templates, prompt groups), with
 * full CRUD and a live template/rendered toggle. Rendering is done here in the
 * browser using the current emulator state so it updates on the panel refresh
 * cadence without running a turn, and matches vermbot's `renderPrompt` output.
 */
export function MarkdownTab({ playId, game, plugin, pendingMessage, disabled }: MarkdownTabProps) {
  const [bundle, setBundle] = useState<PromptTemplateBundle | null>(null);
  const [goals, setGoals] = useState("");
  const [memory, setMemory] = useState<MemoryEntry[]>([]);
  const [journal, setJournal] = useState<JournalEntry[]>([]);
  const [error, setError] = useState<string | undefined>();
  // One global rendered/raw choice for the whole tab, so the user sets it once.
  const [viewMode, setViewMode] = useState<ViewMode>("rendered");

  const reload = useCallback(async () => {
    setError(undefined);
    try {
      const [b, g, m, j] = await Promise.all([
        loadPromptContext(playId),
        loadGoals(playId),
        listMemory(playId),
        listJournal(playId),
      ]);
      setBundle(b);
      setGoals(g);
      setMemory(m);
      setJournal(j);
    } catch (e) {
      setError(String(e));
    }
  }, [playId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  // Live render context, recomputed on EVERY render. MarkdownTab is a child of
  // the panel, which re-renders on the ~0.2s refresh (the snapshot prop
  // changes), so this re-reads RAM each tick and keeps the assembled prompt and
  // every rendered template current without running a turn. Not memoized on
  // purpose: the live state must not be frozen to stable prop identities.
  const liveInput: LivePromptInput = (() => {
    const state = plugin.readState();
    return {
      gameId: game,
      playId,
      mode: plugin.getMode(state),
      state,
      options: plugin.availableCommands(state),
      userMessage: (pendingMessage ?? "").trim(),
    };
  })();

  const ctx: RenderContext | null = bundle ? buildRenderContext(liveInput, bundle) : null;
  const parts = bundle ? assemblePrompt(liveInput, bundle) : null;
  const availableNames = bundle ? bundle.templates.map((t) => t.name) : [];

  return (
    <div className="flex h-full flex-col gap-4 text-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-300">
            Markdown
          </h2>
          <p className="text-[11px] text-neutral-500">
            Live from {liveInput.mode} state · mode={liveInput.mode} · no turn required
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewToggle mode={viewMode} onMode={setViewMode} />
          <button
            onClick={() => void reload()}
            className="rounded bg-neutral-700 px-2 py-1 text-xs text-neutral-200 hover:bg-neutral-600"
          >
            Reload context
          </button>
        </div>
      </div>

      {error && <p className="text-xs text-rose-400">{error}</p>}
      {!bundle && !error && <p className="text-xs text-neutral-500">Loading prompt context...</p>}

      {bundle && ctx && (
        <>
          <AssembledSection parts={parts} mode={viewMode} />

          <GoalsSection
            goals={goals}
            limit={bundle.limits.goalsLimit}
            mode={viewMode}
            disabled={disabled}
            onSave={async (content) => {
              await saveGoals(playId, content);
              await reload();
            }}
          />

          <ResourceSection
            title="Memory"
            subtitle={`plays/<game>/<id>/memory/*.md · limit ${bundle.limits.memoryLimit} chars`}
            keyLabel="slug"
            entries={memory.map<ResourceItem>((m) => ({ key: m.slug, mtime: m.mtime, preview: m.preview }))}
            limit={bundle.limits.memoryLimit}
            mode={viewMode}
            disabled={disabled}
            onLoad={(slug) => readMemory(playId, slug)}
            onSave={async (slug, content) => {
              await writeMemory(playId, slug, content);
            }}
            onDelete={async (slug) => {
              await deleteMemory(playId, slug);
            }}
            onChanged={() => void reload()}
          />

          <ResourceSection
            title="Journal"
            subtitle={`plays/<game>/<id>/journal/*.md · limit ${bundle.limits.journalLimit} chars`}
            keyLabel="name"
            entries={journal.map<ResourceItem>((j) => ({ key: j.name, mtime: j.mtime, preview: j.preview }))}
            limit={bundle.limits.journalLimit}
            mode={viewMode}
            disabled={disabled}
            onLoad={(name) => readJournal(playId, name)}
            onSave={async (name, content) => {
              await writeJournal(playId, name, content);
            }}
            onDelete={async (name) => {
              await deleteJournal(playId, name);
            }}
            onChanged={() => void reload()}
          />

          <PromptTemplatesSection
            bundle={bundle}
            ctx={ctx}
            mode={viewMode}
            disabled={disabled}
            crud={{
              saveGame: (name, content) => writeGamePrompt(game, name, content),
              deleteGame: (name) => deleteGamePrompt(game, name),
              savePlay: (name, content) => writePlayPrompt(playId, name, content),
              deletePlay: (name) => deletePlayPrompt(playId, name),
            }}
            onChanged={() => void reload()}
          />

          <PromptGroupsSection
            playId={playId}
            game={game}
            resolved={bundle.prompt}
            availableNames={availableNames}
            disabled={disabled}
            onChanged={() => void reload()}
          />
        </>
      )}
    </div>
  );
}

function AssembledSection({
  parts,
  mode,
}: {
  parts: { system: string; user: string } | null;
  mode: ViewMode;
}) {
  if (!parts) return null;
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Assembled prompt (live)
        </h3>
        <span className="text-[11px] text-neutral-500">{mode}</span>
      </div>
      <PromptPart label="System" content={parts.system} mode={mode} />
      <PromptPart label="User" content={parts.user} mode={mode} />
    </div>
  );
}

function PromptPart({ label, content, mode }: { label: string; content: string; mode: ViewMode }) {
  return (
    <div className="rounded border border-neutral-700 bg-neutral-800">
      <div className="flex items-center justify-between border-b border-neutral-700 px-2 py-1">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-neutral-400">
          {label}
        </span>
        <span className="text-[10px] text-neutral-500">{content.length} chars</span>
      </div>
      <div className="max-h-72 overflow-auto p-2">
        {content.trim() ? (
          mode === "rendered" ? (
            <MarkdownView content={content} />
          ) : (
            <pre className="whitespace-pre-wrap text-xs text-neutral-300">{content}</pre>
          )
        ) : (
          <p className="text-xs text-neutral-500">(empty)</p>
        )}
      </div>
    </div>
  );
}
