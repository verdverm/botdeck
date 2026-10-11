import { useEffect, useState } from "react";
import { MarkdownView } from "./MarkdownView";
import { Accordion } from "./Accordion";
import { CharChip, type ViewMode } from "./GoalsSection";

export interface ResourceItem {
  key: string;
  mtime: number;
  preview: string;
}

interface ResourceSectionProps {
  title: string;
  subtitle: string;
  /** Label for the create field (e.g. "slug" or "name"). */
  keyLabel: string;
  entries: ResourceItem[];
  limit: string;
  /** Global view mode from the parent. */
  mode: ViewMode;
  disabled?: boolean;
  onLoad: (key: string) => Promise<string>;
  onSave: (key: string, content: string) => Promise<void>;
  onDelete: (key: string) => Promise<void>;
  onChanged: () => void;
}

const NEW_KEY = "__new__";

/**
 * A multi-accordion view over a set of per-play markdown entries (memory,
 * journal). Content is lazy-loaded when an entry opens, so we do not fetch
 * every file up front.
 */
export function ResourceSection({
  title,
  subtitle,
  keyLabel,
  entries,
  limit,
  mode,
  disabled,
  onLoad,
  onSave,
  onDelete,
  onChanged,
}: ResourceSectionProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">{title}</h3>
        <span className="text-[11px] text-neutral-500">{subtitle}</span>
      </div>
      {entries.map((e) => (
        <ResourceEntry
          key={e.key}
          itemKey={e.key}
          preview={e.preview}
          limit={limit}
          mode={mode}
          disabled={disabled}
          onLoad={onLoad}
          onSave={async (content) => {
            await onSave(e.key, content);
            onChanged();
          }}
          onDelete={async () => {
            await onDelete(e.key);
            onChanged();
          }}
        />
      ))}
      <NewEntry
        keyLabel={keyLabel}
        disabled={disabled}
        onCreate={async (key, content) => {
          await onSave(key, content);
          onChanged();
        }}
      />
    </div>
  );
}

function ResourceEntry({
  itemKey,
  preview,
  limit,
  mode,
  disabled,
  onLoad,
  onSave,
  onDelete,
}: {
  itemKey: string;
  preview: string;
  limit: string;
  mode: ViewMode;
  disabled?: boolean;
  onLoad: (key: string) => Promise<string>;
  onSave: (content: string) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const [content, setContent] = useState<string | undefined>();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const ensureLoaded = () => {
    if (loaded) return;
    onLoad(itemKey)
      .then((c) => {
        setContent(c);
        setDraft(c);
        setLoaded(true);
      })
      .catch((e) => setError(String(e)));
  };

  const save = async () => {
    setSaving(true);
    setError(undefined);
    try {
      await onSave(draft);
      setContent(draft);
      setEditing(false);
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Accordion
      title={itemKey}
      subtitle={loaded ? undefined : preview}
      badge={<CharChip value={content ?? ""} limit={limit} />}
    >
      {/* Lazy load on first render inside an open accordion. */}
      <LazyLoad onLoad={ensureLoaded} />
      {error && <p className="mb-1 text-xs text-rose-400">{error}</p>}
      {!loaded && !error && <p className="text-xs text-neutral-500">Loading...</p>}
      {loaded && (
        <>
          <div className="mb-2 flex items-center justify-end gap-2">
            {editing ? (
              <>
                <button
                  onClick={() => {
                    setEditing(false);
                    setDraft(content ?? "");
                  }}
                  className="rounded bg-neutral-700 px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-600"
                >
                  Cancel
                </button>
                <button
                  onClick={save}
                  disabled={disabled || saving}
                  className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  disabled={disabled}
                  className="rounded bg-neutral-600 px-2 py-0.5 text-xs text-white hover:bg-neutral-500 disabled:opacity-50"
                >
                  Edit
                </button>
                <button
                  onClick={() => {
                    if (confirm(`Delete "${itemKey}"?`)) void onDelete();
                  }}
                  disabled={disabled}
                  className="rounded bg-rose-700 px-2 py-0.5 text-xs text-white hover:bg-rose-600 disabled:opacity-50"
                >
                  Delete
                </button>
              </>
            )}
          </div>
          {editing ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              className="h-48 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 focus:border-neutral-500 focus:outline-none"
            />
          ) : mode === "rendered" ? (
            content && content.trim() ? (
              <MarkdownView content={content} />
            ) : (
              <p className="text-xs text-neutral-500">(empty)</p>
            )
          ) : (
            <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-2 text-xs text-neutral-300">
              {content || "(empty)"}
            </pre>
          )}
        </>
      )}
    </Accordion>
  );
}

/** Runs the parent-supplied loader once when it first mounts. */
function LazyLoad({ onLoad }: { onLoad: () => void }) {
  useEffect(() => {
    onLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}

function NewEntry({
  keyLabel,
  disabled,
  onCreate,
}: {
  keyLabel: string;
  disabled?: boolean;
  onCreate: (key: string, content: string) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState("");
  const [content, setContent] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const create = async () => {
    if (!key.trim()) {
      setError(`${keyLabel} is required`);
      return;
    }
    setSaving(true);
    setError(undefined);
    try {
      await onCreate(key.trim(), content);
      setOpen(false);
      setKey("");
      setContent("");
    } catch (e) {
      setError(String(e));
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        disabled={disabled}
        className="self-start rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
      >
        New entry
      </button>
    );
  }

  return (
    <div className="rounded border border-emerald-500/30 bg-emerald-500/5 p-2">
      <div className="mb-2 flex items-center gap-2">
        <label className="text-xs text-neutral-400">{keyLabel}</label>
        <input
          type="text"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder={keyLabel}
          className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 focus:border-neutral-500 focus:outline-none"
        />
      </div>
      {error && <p className="mb-1 text-xs text-rose-400">{error}</p>}
      <textarea
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder="markdown content"
        className="h-32 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 focus:border-neutral-500 focus:outline-none"
      />
      <div className="mt-2 flex justify-end gap-2">
        <button
          onClick={() => {
            setOpen(false);
            setError(undefined);
          }}
          className="rounded bg-neutral-700 px-2 py-0.5 text-xs text-neutral-200 hover:bg-neutral-600"
        >
          Cancel
        </button>
        <button
          onClick={create}
          disabled={disabled || saving}
          className="rounded bg-emerald-600 px-2 py-0.5 text-xs text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          {saving ? "Creating..." : "Create"}
        </button>
      </div>
    </div>
  );
}
