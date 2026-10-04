import { useEffect, useState } from "react";
import {
  agentSnippetsUrl,
  agentSnippetUrl,
  deleteAgentSnippet,
  parsePlayId,
  saveAgentSnippet,
} from "@/play";
import { SectionTitle } from "./shared";

interface AgentSnippetEntry {
  name: string;
  path: string;
  url: string;
}

interface AgentSnippetsTabProps {
  playId: string;
  disabled?: boolean;
}

const NEW_KEY = "__new__";

export function AgentSnippetsTab({ playId, disabled }: AgentSnippetsTabProps) {
  const [snippets, setSnippets] = useState<AgentSnippetEntry[]>([]);
  const [contents, setContents] = useState<Record<string, string>>({});
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Set<string>>(new Set());
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState<Record<string, boolean>>({});
  const [newName, setNewName] = useState("");

  const { game, id } = parsePlayId(playId);

  useEffect(() => {
    let cancelled = false;
    fetch(agentSnippetsUrl(playId))
      .then(async (r) => {
        if (!r.ok) throw new Error(`list agent snippets failed: ${r.status}`);
        return (await r.json()) as AgentSnippetEntry[];
      })
      .then((list) => {
        if (cancelled) return;
        setSnippets(list);
        setLoading(false);
      })
      .catch((e) => {
        if (cancelled) return;
        setErrors((prev) => ({ ...prev, _list: String(e) }));
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [playId]);

  const loadContent = (name: string) => {
    if (contents[name] !== undefined) return;
    fetch(agentSnippetUrl(playId, name))
      .then(async (r) => {
        if (!r.ok) throw new Error(`read agent snippet failed: ${r.status}`);
        return (await r.json()) as { name: string; content: string };
      })
      .then(({ content }) => {
        setContents((prev) => ({ ...prev, [name]: content }));
        setDrafts((prev) => ({ ...prev, [name]: content }));
      })
      .catch((e) => {
        setErrors((prev) => ({ ...prev, [name]: String(e) }));
      });
  };

  const toggle = (name: string) => {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
        if (name !== NEW_KEY) loadContent(name);
      }
      return next;
    });
  };

  const startEdit = (name: string) => {
    setEditing((prev) => new Set(prev).add(name));
  };

  const cancelEdit = (name: string) => {
    setEditing((prev) => {
      const next = new Set(prev);
      next.delete(name);
      return next;
    });
    setDrafts((prev) => ({ ...prev, [name]: contents[name] ?? "" }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const handleSave = async (name: string) => {
    const content = drafts[name] ?? "";
    setSaving((prev) => ({ ...prev, [name]: true }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
    try {
      const saved = await saveAgentSnippet(playId, name, content);
      setContents((prev) => ({ ...prev, [saved.name]: saved.content }));
      setDrafts((prev) => ({ ...prev, [saved.name]: saved.content }));
      setEditing((prev) => {
        const next = new Set(prev);
        next.delete(name);
        next.delete(saved.name);
        return next;
      });
      if (name === NEW_KEY) {
        const entry: AgentSnippetEntry = {
          name: saved.name,
          path: `plays/${game}/${id}/snippets/agent/${saved.name}.md`,
          url: agentSnippetUrl(playId, saved.name),
        };
        setSnippets((prev) =>
          [...prev.filter((s) => s.name !== saved.name), entry].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        );
        setOpen((prev) => {
          const next = new Set(prev);
          next.delete(NEW_KEY);
          next.add(saved.name);
          return next;
        });
        setNewName("");
      }
    } catch (e) {
      setErrors((prev) => ({ ...prev, [name]: String(e) }));
    } finally {
      setSaving((prev) => ({ ...prev, [name]: false }));
    }
  };

  const handleDelete = async (name: string) => {
    if (!confirm(`Delete agent snippet "${name}"?`)) return;
    try {
      await deleteAgentSnippet(playId, name);
      setSnippets((prev) => prev.filter((s) => s.name !== name));
      setContents((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[name];
        return next;
      });
      setEditing((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
      setOpen((prev) => {
        const next = new Set(prev);
        next.delete(name);
        return next;
      });
    } catch (e) {
      setErrors((prev) => ({ ...prev, [name]: String(e) }));
    }
  };

  const addNew = () => {
    setNewName("");
    setDrafts((prev) => ({ ...prev, [NEW_KEY]: "" }));
    setEditing((prev) => new Set(prev).add(NEW_KEY));
    setOpen((prev) => {
      const next = new Set(prev);
      next.add(NEW_KEY);
      return next;
    });
  };

  const updateDraft = (name: string, value: string) => {
    setDrafts((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: undefined }));
  };

  const updateNewName = (value: string) => {
    const clean = value.trim().replace(/\s+/g, "-").toLowerCase();
    setNewName(clean);
  };

  return (
    <div className="flex h-full flex-col gap-3 text-sm">
      <div className="flex items-center justify-between">
        <SectionTitle>Agent Snippets</SectionTitle>
        <button
          onClick={addNew}
          disabled={disabled}
          className="rounded bg-emerald-600 px-2 py-1 text-xs font-medium text-white hover:bg-emerald-500 disabled:opacity-50"
        >
          New snippet
        </button>
      </div>
      <p className="text-xs text-neutral-400">
        Markdown notes the agent can write and read. They are appended to the assembled prompt as a
        separate section and never replace user/system snippets.
      </p>

      {errors._list && <p className="text-xs text-rose-400">{errors._list}</p>}

      {loading ? (
        <p className="text-xs text-neutral-500">Loading agent snippets...</p>
      ) : snippets.length === 0 && !open.has(NEW_KEY) ? (
        <p className="text-xs text-neutral-500">No agent snippets found for this play.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {snippets.map((s) => {
            const isEditing = editing.has(s.name);
            const content = drafts[s.name] ?? contents[s.name] ?? "";
            return (
              <li key={s.name} className="rounded border border-neutral-700 bg-neutral-800">
                <button
                  onClick={() => toggle(s.name)}
                  className="flex w-full items-center justify-between px-2 py-1 text-left"
                >
                  <span className="text-xs font-medium text-neutral-200">{s.name}</span>
                  <span className="text-xs text-neutral-500">{open.has(s.name) ? "▾" : "▸"}</span>
                </button>
                {open.has(s.name) && (
                  <div className="border-t border-neutral-700 p-2">
                    <div className="mb-2 flex items-center justify-end gap-2">
                      {isEditing ? (
                        <button
                          onClick={() => handleSave(s.name)}
                          disabled={disabled || saving[s.name]}
                          className="rounded bg-blue-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
                        >
                          {saving[s.name] ? "Saving..." : "Save"}
                        </button>
                      ) : (
                        <button
                          onClick={() => startEdit(s.name)}
                          disabled={disabled}
                          className="rounded bg-neutral-600 px-2 py-0.5 text-xs font-medium text-white hover:bg-neutral-500 disabled:opacity-50"
                        >
                          Edit
                        </button>
                      )}
                      {isEditing && (
                        <button
                          onClick={() => cancelEdit(s.name)}
                          disabled={disabled}
                          className="rounded bg-neutral-700 px-2 py-0.5 text-xs font-medium text-neutral-200 hover:bg-neutral-600 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      )}
                      <button
                        onClick={() => handleDelete(s.name)}
                        disabled={disabled}
                        className="rounded bg-rose-700 px-2 py-0.5 text-xs font-medium text-white hover:bg-rose-600 disabled:opacity-50"
                      >
                        Delete
                      </button>
                    </div>
                    {errors[s.name] && (
                      <p className="mb-2 text-xs text-rose-400">{errors[s.name]}</p>
                    )}
                    {isEditing ? (
                      <textarea
                        value={content}
                        onChange={(e) => updateDraft(s.name, e.target.value)}
                        className="h-40 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 focus:border-neutral-500 focus:outline-none"
                      />
                    ) : (
                      <pre className="max-h-60 overflow-auto whitespace-pre-wrap rounded bg-neutral-950 p-2 text-xs text-neutral-300">
                        {content || "Loading snippet..."}
                      </pre>
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
                <span className="text-xs font-medium text-emerald-200">New agent snippet</span>
                <span className="text-xs text-neutral-500">▾</span>
              </button>
              <div className="border-t border-emerald-500/20 p-2">
                <div className="mb-2 flex items-center gap-2">
                  <label className="text-xs text-neutral-400">name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => updateNewName(e.target.value)}
                    placeholder="snippet-name"
                    className="flex-1 rounded border border-neutral-700 bg-neutral-800 px-2 py-0.5 text-xs text-neutral-200 focus:border-neutral-500 focus:outline-none"
                  />
                </div>
                {errors[NEW_KEY] && (
                  <p className="mb-2 text-xs text-rose-400">{errors[NEW_KEY]}</p>
                )}
                <textarea
                  value={drafts[NEW_KEY] ?? ""}
                  onChange={(e) => updateDraft(NEW_KEY, e.target.value)}
                  className="h-40 w-full rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-xs text-neutral-200 focus:border-neutral-500 focus:outline-none"
                />
                <div className="mt-2 flex items-center justify-end gap-2">
                  <button
                    onClick={() => {
                      setOpen((prev) => {
                        const next = new Set(prev);
                        next.delete(NEW_KEY);
                        return next;
                      });
                      setEditing((prev) => {
                        const next = new Set(prev);
                        next.delete(NEW_KEY);
                        return next;
                      });
                    }}
                    className="rounded bg-neutral-700 px-2 py-0.5 text-xs font-medium text-neutral-200 hover:bg-neutral-600"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => handleSave(NEW_KEY)}
                    disabled={disabled || saving[NEW_KEY] || !newName}
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
