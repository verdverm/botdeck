import { useState } from "react";
import type { PromptTemplateBundle } from "@/types";
import type { RenderContext } from "../promptRender";
import { renderSnippet } from "../promptRender";
import { MarkdownView } from "./MarkdownView";
import { Accordion } from "./Accordion";
import { type ViewMode } from "./GoalsSection";

export interface TemplateCrud {
  saveGame: (name: string, content: string) => Promise<void>;
  deleteGame: (name: string) => Promise<void>;
  savePlay: (name: string, content: string) => Promise<void>;
  deletePlay: (name: string) => Promise<void>;
}

interface PromptTemplatesSectionProps {
  bundle: PromptTemplateBundle;
  ctx: RenderContext;
  mode: ViewMode;
  crud: TemplateCrud;
  disabled?: boolean;
  onChanged: () => void;
}

/** Every template the config references or that exists on disk, one accordion. */
export function PromptTemplatesSection({
  bundle,
  ctx,
  mode,
  crud,
  disabled,
  onChanged,
}: PromptTemplatesSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
          Prompt templates
        </h3>
        <span className="text-[11px] text-neutral-500">
          game defaults shadowed by play overrides
        </span>
      </div>
      {bundle.templates.map((t) => (
        <TemplateItem
          key={t.name}
          name={t.name}
          source={t.source}
          gameContent={t.gameContent}
          playContent={t.playContent}
          bundle={bundle}
          ctx={ctx}
          mode={mode}
          crud={crud}
          disabled={disabled}
          onChanged={onChanged}
        />
      ))}
      {bundle.templates.length === 0 && (
        <p className="text-xs text-neutral-500">No prompt templates found.</p>
      )}
    </div>
  );
}

type Layer = "game" | "play";

function SourceBadge({ source }: { source: "play" | "game" | "none" }) {
  const cls =
    source === "play"
      ? "bg-amber-500/20 text-amber-300"
      : source === "game"
        ? "bg-sky-500/20 text-sky-300"
        : "bg-neutral-700 text-neutral-400";
  return (
    <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${cls}`}>{source}</span>
  );
}

function TemplateItem({
  name,
  source,
  gameContent,
  playContent,
  bundle,
  ctx,
  mode,
  crud,
  disabled,
  onChanged,
}: {
  name: string;
  source: "play" | "game" | "none";
  gameContent: string | null;
  playContent: string | null;
  bundle: PromptTemplateBundle;
  ctx: RenderContext;
  mode: ViewMode;
  crud: TemplateCrud;
  disabled?: boolean;
  onChanged: () => void;
}) {
  const [layer, setLayer] = useState<Layer>(source === "play" ? "play" : "game");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const layerContent = layer === "game" ? gameContent : playContent;
  const rendered = renderSnippet(name, bundle, ctx);

  const startEdit = () => {
    // Edit whatever the selected layer currently holds (or blank to create it).
    setDraft(layerContent ?? "");
    setError(undefined);
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      if (layer === "game") await crud.saveGame(name, draft);
      else await crud.savePlay(name, draft);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm(`Delete ${layer} prompt "${name}"?`)) return;
    setError(undefined);
    try {
      if (layer === "game") await crud.deleteGame(name);
      else await crud.deletePlay(name);
      setEditing(false);
      onChanged();
    } catch (e) {
      setError(String(e));
    }
  };

  const fileFor = (l: Layer) =>
    l === "game" ? `games/${bundle.game}/prompts/${name}.md` : `plays/${bundle.game}/${bundle.id}/snippets/user/${name}.md`;

  return (
    <Accordion title={name} subtitle={fileFor(layer)} badge={<SourceBadge source={source} />}>
      <div className="mb-2 flex items-center justify-end gap-1">
        {(["game", "play"] as Layer[]).map((l) => (
          <button
            key={l}
            onClick={() => {
              setLayer(l);
              if (!editing) setDraft(l === "game" ? gameContent ?? "" : playContent ?? "");
            }}
            disabled={disabled}
            className={`rounded px-2 py-0.5 text-[11px] font-medium ${
              layer === l
                ? "bg-neutral-700 text-neutral-100"
                : "text-neutral-400 hover:bg-neutral-700/50"
            }`}
          >
            {l}
          </button>
        ))}
      </div>

      {error && <p className="mb-1 text-xs text-rose-400">{error}</p>}

      <div className="mb-2 flex justify-end gap-2">
        {editing ? (
          <>
            <button
              onClick={() => setEditing(false)}
              className="rounded bg-neutral-700 px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-600"
            >
              Cancel
            </button>
            <button
              onClick={save}
              disabled={disabled || saving}
              className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
            >
              {saving ? "Saving..." : `Save ${layer}`}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={startEdit}
              disabled={disabled}
              className="rounded bg-neutral-600 px-2 py-0.5 text-xs text-white hover:bg-neutral-500 disabled:opacity-50"
            >
              {layerContent === null ? `Create ${layer}` : `Edit ${layer}`}
            </button>
            {layerContent !== null && (
              <button
                onClick={remove}
                disabled={disabled}
                className="rounded bg-rose-700 px-2 py-0.5 text-xs text-white hover:bg-rose-600 disabled:opacity-50"
              >
                Delete {layer}
              </button>
            )}
          </>
        )}
      </div>

      {editing ? (
        <>
          <p className="mb-1 text-[11px] text-neutral-500">
            Editing the <span className="text-neutral-300">{layer}</span> layer. {"{{key}}"}
            placeholders stay as-written; use the rendered toggle (when not editing) to see them
            interpolated.
          </p>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="h-56 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 focus:border-neutral-500 focus:outline-none"
          />
        </>
      ) : mode === "rendered" ? (
        rendered.trim() ? (
          <MarkdownView content={rendered} />
        ) : (
          <p className="text-xs text-neutral-500">(renders empty)</p>
        )
      ) : layerContent === null ? (
        <p className="text-xs text-neutral-500">
          No {layer}-layer file exists. Use "Create {layer}" to add one.
        </p>
      ) : (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-2 text-xs text-neutral-300">
          {layerContent}
        </pre>
      )}
    </Accordion>
  );
}
