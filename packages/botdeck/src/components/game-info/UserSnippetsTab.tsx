import { useEffect, useMemo, useState } from "react";
import { JsonEditor, githubDarkTheme } from "json-edit-react";
import { deleteSnippet, parsePlayId, saveSnippet, snippetUrl, snippetsUrl } from "@/play";
import type { PlaySnippet, SnippetRunResult } from "@/types";
import { SectionTitle } from "./shared";

interface SnippetDescriptor {
  id: string;
  name: string;
}

type EditableSnippet = Omit<PlaySnippet, "id" | "game" | "play">;

interface UserSnippetsTabProps {
  playId: string;
  disabled?: boolean;
  onRun: (snippet: PlaySnippet) => Promise<SnippetRunResult | void> | void;
}

const NEW_KEY = "__new__";

function toEditable(snippet: PlaySnippet): EditableSnippet {
  return Object.fromEntries(
    Object.entries(snippet).filter(([key]) => key !== "id" && key !== "game" && key !== "play"),
  ) as EditableSnippet;
}

function fromEditable(
  editable: EditableSnippet,
  id: string,
  game: string,
  play: string,
): PlaySnippet {
  return { ...editable, id, game, play };
}

function defaultSnippet(game: string, play: string, id: string): PlaySnippet {
  return {
    id,
    name: id ? id.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : "New Snippet",
    description: "",
    game,
    play,
    startState: "",
    steps: [{ kind: "command", command: { name: "wait" } }],
    expectedEndState: "",
    tags: [],
  };
}

function stepCount(snippet: PlaySnippet | undefined): number {
  return snippet?.steps?.length ?? 0;
}

function SummaryView({ snippet }: { snippet: PlaySnippet }) {
  return (
    <div className="space-y-1 text-neutral-300">
      {snippet.description && <p className="text-xs">{snippet.description}</p>}
      <p className="text-xs text-neutral-500">
        {stepCount(snippet)} step{stepCount(snippet) === 1 ? "" : "s"}
        {snippet.startState ? ` · start: ${snippet.startState}` : ""}
        {snippet.expectedEndState ? ` · end: ${snippet.expectedEndState}` : ""}
      </p>
      {snippet.tags && snippet.tags.length > 0 && (
        <p className="text-xs text-neutral-500">Tags: {snippet.tags.join(", ")}</p>
      )}
    </div>
  );
}

export function UserSnippetsTab({ playId, disabled, onRun }: UserSnippetsTabProps) {
  const [snippets, setSnippets] = useState<SnippetDescriptor[]>([]);
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [details, setDetails] = useState<Record<string, PlaySnippet>>({});
  const [drafts, setDrafts] = useState<Record<string, PlaySnippet>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState<string | undefined>();
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [runResults, setRunResults] = useState<Record<string, SnippetRunResult | undefined>>({});

  const { game, id: play } = useMemo(() => parsePlayId(playId), [playId]);

  useEffect(() => {
    let cancelled = false;
    fetch(snippetsUrl(playId))
      .then(async (r) => {
        if (!r.ok) throw new Error(`list snippets failed: ${r.status}`);
        return (await r.json()) as SnippetDescriptor[];
      })
      .then((list) => {
        if (cancelled) return;
        setSnippets(list);
        setListError(undefined);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setListError(String(e));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playId]);

  const loadDetail = (snippetId: string) => {
    if (details[snippetId]) return;
    fetch(snippetUrl(playId, snippetId))
      .then(async (r) => {
        if (!r.ok) throw new Error(`read snippet failed: ${r.status}`);
        return (await r.json()) as PlaySnippet;
      })
      .then((snippet) => {
        setDetails((prev) => ({ ...prev, [snippetId]: snippet }));
        setDrafts((prev) => ({ ...prev, [snippetId]: snippet }));
      })
      .catch((e) => {
        setErrors((prev) => ({ ...prev, [snippetId]: String(e) }));
      });
  };

  const toggle = (snippetId: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(snippetId)) {
        next.delete(snippetId);
      } else {
        next.add(snippetId);
        if (snippetId !== NEW_KEY) {
          loadDetail(snippetId);
        }
      }
      return next;
    });
  };

  const close = (snippetId: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      next.delete(snippetId);
      return next;
    });
  };

  const startEdit = (snippetId: string) => {
    setEditing((prev) => new Set(prev).add(snippetId));
  };

  const cancelEdit = (snippetId: string) => {
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(snippetId);
      return next;
    });
    setDrafts((prev) => {
      const saved = details[snippetId];
      if (!saved) return prev;
      return { ...prev, [snippetId]: saved };
    });
  };

  const updateDraft = (snippetId: string, editable: EditableSnippet) => {
    setDrafts((prev) => {
      const current = prev[snippetId] ?? details[snippetId];
      if (!current) return prev;
      return { ...prev, [snippetId]: fromEditable(editable, current.id, current.game, current.play) };
    });
    setErrors((prev) => ({ ...prev, [snippetId]: undefined }));
  };

  const updateNewId = (value: string) => {
    setDrafts((prev) => {
      const current = prev[NEW_KEY];
      if (!current) return prev;
      const clean = value.trim().replace(/\s+/g, "-").toLowerCase();
      return {
        ...prev,
        [NEW_KEY]: {
          ...current,
          id: clean,
          name: clean ? clean.replace(/[_-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()) : current.name,
        },
      };
    });
  };

  const handleSave = async (snippetId: string) => {
    const draft = drafts[snippetId];
    if (!draft) return;
    const targetId = snippetId === NEW_KEY ? draft.id : snippetId;
    if (!targetId) {
      setErrors((prev) => ({ ...prev, [snippetId]: "Snippet id is required" }));
      return;
    }
    setSaving((prev) => ({ ...prev, [snippetId]: true }));
    setErrors((prev) => ({ ...prev, [snippetId]: undefined }));
    try {
      const saved = await saveSnippet(playId, targetId, draft);
      setDetails((prev) => ({ ...prev, [targetId]: saved }));
      setDrafts((prev) => {
        const next = { ...prev, [targetId]: saved };
        if (snippetId === NEW_KEY) delete next[NEW_KEY];
        return next;
      });
      setEditing((prev) => {
        const next = new Set(prev);
        next.delete(snippetId);
        next.delete(targetId);
        return next;
      });
      setSnippets((prev) => {
        const existing = prev.find((s) => s.id === targetId);
        let next;
        if (existing) {
          next = prev.map((s) => (s.id === targetId ? { id: targetId, name: saved.name } : s));
        } else {
          next = [...prev, { id: targetId, name: saved.name }].sort((a, b) => a.id.localeCompare(b.id));
        }
        return next;
      });
      if (snippetId === NEW_KEY) {
        setOpen((prev) => {
          const next = new Set(prev);
          next.delete(NEW_KEY);
          next.add(targetId);
          return next;
        });
      }
    } catch (e) {
      setErrors((prev) => ({ ...prev, [snippetId]: String(e) }));
    } finally {
      setSaving((prev) => ({ ...prev, [snippetId]: false }));
    }
  };

  const handleDelete = async (snippetId: string) => {
    if (!confirm(`Delete snippet "${snippetId}"?`)) return;
    try {
      await deleteSnippet(playId, snippetId);
      setSnippets((prev) => prev.filter((s) => s.id !== snippetId));
      setDetails((prev) => {
        const next = { ...prev };
        delete next[snippetId];
        return next;
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[snippetId];
        return next;
      });
      setEditing((prev) => {
        const next = new Set(prev);
        next.delete(snippetId);
        return next;
      });
      close(snippetId);
    } catch (e) {
      setErrors((prev) => ({ ...prev, [snippetId]: String(e) }));
    }
  };

  const handleRun = async (snippetId: string) => {
    const draft = drafts[snippetId] ?? details[snippetId];
    if (!draft) return;
    setErrors((prev) => ({ ...prev, [snippetId]: undefined }));
    try {
      const result = await onRun(draft);
      if (result) {
        setRunResults((prev) => ({ ...prev, [snippetId]: result }));
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setErrors((prev) => ({ ...prev, [snippetId]: msg }));
    }
  };

  const addNew = () => {
    setDrafts((prev) => ({
      ...prev,
      [NEW_KEY]: defaultSnippet(game, play, ""),
    }));
    setEditing((prev) => new Set(prev).add(NEW_KEY));
    setOpen((prev) => {
      const next = new Set(prev);
      next.add(NEW_KEY);
      return next;
    });
  };

  const editorData = (snippetId: string): EditableSnippet | undefined => {
    const draft = drafts[snippetId] ?? details[snippetId];
    if (!draft) return undefined;
    return toEditable(draft);
  };

  return (
    <div className="flex h-full flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <SectionTitle>User Snippets</SectionTitle>
        <button
          onClick={addNew}
          disabled={disabled}
          className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          New snippet
        </button>
      </div>
      <p className="text-xs text-neutral-400">
        Reproducible button sequences. Provide startState to load a saved snapshot before running;
        omit it to run against the currently loaded emulator state. Expand a snippet to view its
        summary; click Edit to change it with the JSON editor. Run always executes the current
        content.
      </p>

      {listError && <p className="text-xs text-rose-400">{listError}</p>}

      {loading ? (
        <p className="text-xs text-neutral-500">Loading snippets...</p>
      ) : snippets.length === 0 && !open.has(NEW_KEY) ? (
        <p className="text-xs text-neutral-500">No snippets found for this play.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {snippets.map((s) => {
            const isEditing = editing.has(s.id);
            const draft = drafts[s.id];
            return (
              <li key={s.id} className="rounded border border-neutral-700 bg-neutral-800">
                <button
                  onClick={() => toggle(s.id)}
                  className="flex w-full items-center justify-between px-2 py-1 text-left"
                >
                  <span className="text-xs font-medium text-neutral-200">{s.name}</span>
                  <span className="text-xs text-neutral-500">{open.has(s.id) ? "▾" : "▸"}</span>
                </button>
                {open.has(s.id) && (
                  <div className="border-t border-neutral-700 p-2">
                    <div className="mb-2 flex items-center justify-between">
                      <span className="text-xs text-neutral-500">id: {s.id}</span>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleRun(s.id)}
                          disabled={disabled || !draft}
                          className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                        >
                          Run
                        </button>
                        {isEditing ? (
                          <button
                            onClick={() => handleSave(s.id)}
                            disabled={disabled || saving[s.id]}
                            className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                          >
                            {saving[s.id] ? "Saving..." : "Save"}
                          </button>
                        ) : (
                          <button
                            onClick={() => startEdit(s.id)}
                            disabled={disabled}
                            className="rounded bg-neutral-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-neutral-500 disabled:opacity-50"
                          >
                            Edit
                          </button>
                        )}
                        {isEditing && (
                          <button
                            onClick={() => cancelEdit(s.id)}
                            disabled={disabled}
                            className="rounded bg-neutral-700 px-2 py-0.5 text-xs font-medium text-neutral-200 hover:bg-neutral-600 disabled:opacity-50"
                          >
                            Cancel
                          </button>
                        )}
                        <button
                          onClick={() => handleDelete(s.id)}
                          disabled={disabled}
                          className="rounded bg-rose-700 px-2 py-0.5 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-50"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                    {errors[s.id] && <p className="mb-2 text-xs text-rose-400">{errors[s.id]}</p>}
                    {runResults[s.id] && (
                      <div className="mb-2 rounded border border-neutral-700 bg-neutral-900 p-1.5 text-xs text-neutral-400">
                        {runResults[s.id]!.beforePath && (
                          <p>before: {runResults[s.id]!.beforePath}</p>
                        )}
                        {runResults[s.id]!.afterPath && (
                          <p>after: {runResults[s.id]!.afterPath}</p>
                        )}
                        {runResults[s.id]!.diff && (
                          <p className="text-neutral-300">
                            diff: {String((runResults[s.id]!.diff as { summary?: string }).summary ?? "n/a")}
                          </p>
                        )}
                      </div>
                    )}
                    {!draft ? (
                      <p className="text-xs text-neutral-500">Loading snippet...</p>
                    ) : isEditing ? (
                      <div className="rounded border border-neutral-800 bg-neutral-950">
                        <JsonEditor
                          data={editorData(s.id)!}
                          setData={(d) => updateDraft(s.id, d as EditableSnippet)}
                          collapse={false}
                          rootName="snippet"
                          theme={[githubDarkTheme, {}]}
                          showCollectionCount="when-closed"
                          maxWidth="100%"
                        />
                      </div>
                    ) : (
                      <SummaryView snippet={draft} />
                    )}
                  </div>
                )}
              </li>
            );
          })}
          {open.has(NEW_KEY) && (
            <li className="rounded border border-emerald-500/30 bg-emerald-500/5">
              <button
                onClick={() => toggle(NEW_KEY)}
                className="flex w-full items-center justify-between px-2 py-1 text-left"
              >
                <span className="text-xs font-medium text-emerald-200">New snippet</span>
                <span className="text-xs text-neutral-500">{open.has(NEW_KEY) ? "▾" : "▸"}</span>
              </button>
              <div className="border-t border-emerald-500/20 p-2">
                <div className="mb-2 flex items-center gap-2">
                  <label className="text-xs text-neutral-400">id</label>
                  <input
                    type="text"
                    value={drafts[NEW_KEY]?.id ?? ""}
                    onChange={(e) => updateNewId(e.target.value)}
                    placeholder="snippet-id"
                    className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 focus:border-neutral-500 focus:outline-none"
                  />
                </div>
                {errors[NEW_KEY] && <p className="mb-2 text-xs text-rose-400">{errors[NEW_KEY]}</p>}
                {editorData(NEW_KEY) ? (
                  <div className="rounded border border-neutral-800 bg-neutral-950">
                    <JsonEditor
                      data={editorData(NEW_KEY)!}
                      setData={(d) => updateDraft(NEW_KEY, d as EditableSnippet)}
                      collapse={false}
                      rootName="snippet"
                      theme={[githubDarkTheme, {}]}
                      showCollectionCount="when-closed"
                      maxWidth="100%"
                    />
                  </div>
                ) : null}
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => handleRun(NEW_KEY)}
                    disabled={disabled || !drafts[NEW_KEY] || !drafts[NEW_KEY].id}
                    className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    Run
                  </button>
                  <button
                    onClick={() => close(NEW_KEY)}
                    className="rounded bg-neutral-700 px-2 py-0.5 text-xs font-medium text-neutral-200 hover:bg-neutral-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSave(NEW_KEY)}
                    disabled={disabled || saving[NEW_KEY]}
                    className="rounded bg-emerald-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {saving[NEW_KEY] ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
