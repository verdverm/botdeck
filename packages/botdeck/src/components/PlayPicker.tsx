import { useCallback, useEffect, useRef, useState } from "react";
import {
  createPlay,
  deletePlay,
  listPlays,
  parsePlayId,
  renamePlay,
  type PlaySummary,
} from "@/play";

interface PlayPickerProps {
  game: string;
  /** Active play id like "ff1/0001". */
  playId: string;
  /** Switch to a play by id ("game/id"). */
  onSelect: (playId: string) => void;
}

/**
 * Play selector: a dropdown listing the game's plays, with create, rename, and
 * delete. Mirrors the snapshot `Load ▼` menu (SaveControls + LoadMenu): click a
 * row to switch, the per-row `⋮` menu renames (config label) or deletes.
 * "New play" creates one with the next server-assigned numeric id and switches
 * to it. No prompts beyond the rename label; creation takes no id or name.
 */
export function PlayPicker({ game, playId, onSelect }: PlayPickerProps) {
  const [open, setOpen] = useState(false);
  const [plays, setPlays] = useState<PlaySummary[]>([]);
  const [labels, setLabels] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const refresh = useCallback(async () => {
    try {
      const list = await listPlays(game);
      setPlays(list);
      // Load each play's config label so rows show the human name when set.
      const next: Record<string, string> = {};
      await Promise.all(
        list.map(async (p) => {
          try {
            const res = await fetch(`/api/plays/${encodeURIComponent(p.game)}/${encodeURIComponent(p.id)}/config`);
            if (res.ok) {
              const config = (await res.json()) as { label?: string };
              if (config.label) next[p.id] = config.label;
            }
          } catch {
            // Ignore per-play label fetch failures; the row falls back to id.
          }
        }),
      );
      setLabels(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [game]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const currentId = (() => {
    try {
      return parsePlayId(playId).id;
    } catch {
      return playId;
    }
  })();

  const handleNew = async () => {
    setError(null);
    try {
      const config = await createPlay(game);
      const id = typeof config.id === "string" ? config.id : "";
      await refresh();
      if (id) onSelect(`${game}/${id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleSelect = (id: string) => {
    setOpen(false);
    onSelect(`${game}/${id}`);
  };

  const handleRename = async (id: string) => {
    const next = window.prompt("Rename play", labels[id] ?? id);
    if (next === null) return;
    setError(null);
    try {
      await renamePlay(`${game}/${id}`, next);
      setLabels((prev) => ({ ...prev, [id]: next }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm(`Delete "${labels[id] ?? id}"? This removes the play directory.`)) {
      return;
    }
    setError(null);
    try {
      await deletePlay(`${game}/${id}`);
      await refresh();
      // Deleting the active play falls back to the newest remaining, if any.
      if (id === currentId) {
        const remaining = plays.filter((p) => p.id !== id);
        if (remaining.length > 0) onSelect(`${game}/${remaining[remaining.length - 1]!.id}`);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div ref={containerRef} className="relative flex flex-col">
      <div className="flex items-center gap-1">
        <button
          onClick={() => setOpen((v) => !v)}
          className="rounded bg-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-600"
        >
          Play: {labels[currentId] ?? currentId} ▼
        </button>
      </div>
      {error && <span className="text-xs text-rose-400">{error}</span>}
      {open && (
        <div className="absolute z-10 mt-1 w-72 rounded border border-neutral-700 bg-neutral-800 p-1 shadow-lg">
          <button
            onClick={handleNew}
            className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-700"
          >
            + New play
          </button>
          <div className="my-1 border-t border-neutral-700" />
          {plays.length === 0 ? (
            <p className="px-2 py-1.5 text-xs text-neutral-500">no plays</p>
          ) : (
            <div className="max-h-56 overflow-auto">
              {plays.map((p) => {
                const active = p.id === currentId;
                return (
                  <div
                    key={p.id}
                    className={`group flex items-center gap-0.5 rounded ${
                      active ? "bg-neutral-700" : "hover:bg-neutral-700"
                    }`}
                  >
                    <button
                      onClick={() => handleSelect(p.id)}
                      className="flex min-w-0 flex-1 flex-col px-2 py-1.5 text-left text-sm"
                    >
                      <span className="truncate">{labels[p.id] ?? p.id}</span>
                      <span className="truncate text-xs text-neutral-500">{p.id}</span>
                    </button>
                    <PlayRowMenu
                      onRename={() => void handleRename(p.id)}
                      onDelete={() => void handleDelete(p.id)}
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PlayRowMenu({
  onRename,
  onDelete,
}: {
  onRename: () => void;
  onDelete: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="px-2 py-1.5 text-sm text-neutral-400 hover:text-neutral-100"
        aria-label="options"
      >
        ⋮
      </button>
      {open && (
        <div className="fixed z-50 w-28 rounded border border-neutral-700 bg-neutral-800 py-1 shadow-lg">
          <button
            onClick={() => {
              setOpen(false);
              onRename();
            }}
            className="w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
          >
            Rename
          </button>
          <button
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="w-full px-3 py-1.5 text-left text-sm text-rose-400 hover:bg-neutral-700"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );
}
