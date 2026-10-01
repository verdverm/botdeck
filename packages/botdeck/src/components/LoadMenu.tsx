import { useState, useRef, useEffect, useMemo } from "react";
import type { PlayStateEntry, PlayStateSort } from "@/types";

interface LoadMenuProps {
  states: PlayStateEntry[] | null;
  loading: boolean;
  onLoad: (entry: PlayStateEntry) => void;
  onRename: (entry: PlayStateEntry, name: string) => Promise<void>;
  onDelete: (entry: PlayStateEntry) => Promise<void>;
  onBookmark: (entry: PlayStateEntry) => Promise<void>;
  sort: PlayStateSort;
  onSortChange: (sort: PlayStateSort) => void;
  onClose: () => void;
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function StarIcon({ filled, className }: { filled: boolean; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={`leading-none ${className ?? ""}`}
      style={{ fontFamily: "sans-serif" }}
    >
      {filled ? "★" : "☆"}
    </span>
  );
}

function LoadMenuItem({
  entry,
  onLoad,
  onRename,
  onDelete,
  onBookmark,
}: {
  entry: PlayStateEntry;
  onLoad: (entry: PlayStateEntry) => void;
  onRename: (entry: PlayStateEntry, name: string) => Promise<void>;
  onDelete: (entry: PlayStateEntry) => Promise<void>;
  onBookmark: (entry: PlayStateEntry) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null);

  const computePosition = () => {
    const triggerRect = triggerRef.current?.getBoundingClientRect();
    const menuRect = menuRef.current?.getBoundingClientRect();
    if (!triggerRect || !menuRect) return null;
    const pad = 8;
    let left = triggerRect.right - menuRect.width;
    let top = triggerRect.bottom + 4;
    if (left < pad) left = pad;
    if (left + menuRect.width > window.innerWidth - pad) {
      left = window.innerWidth - menuRect.width - pad;
    }
    if (top + menuRect.height > window.innerHeight - pad) {
      top = triggerRect.top - menuRect.height - 4;
    }
    return { top, left };
  };

  const handleToggle = () => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        requestAnimationFrame(() => {
          const pos = computePosition();
          if (pos) setMenuPos(pos);
        });
      } else {
        setMenuPos(null);
      }
      return next;
    });
  };

  useEffect(() => {
    if (!open) return;
    const handleResize = () => {
      const pos = computePosition();
      if (pos) setMenuPos(pos);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (
        !menuRef.current?.contains(e.target as Node) &&
        !triggerRef.current?.contains(e.target as Node)
      ) {
        setOpen(false);
        setMenuPos(null);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const handleRename = () => {
    setOpen(false);
    setMenuPos(null);
    const next = window.prompt("Rename snapshot", entry.name);
    if (next === null) return;
    void onRename(entry, next);
  };

  const handleDelete = () => {
    setOpen(false);
    setMenuPos(null);
    if (!window.confirm(`Delete "${entry.name || entry.filename}"?`)) return;
    void onDelete(entry);
  };

  const handleBookmarkClick = () => {
    void onBookmark(entry);
  };

  return (
    <div className="group flex items-center gap-0.5 rounded hover:bg-neutral-700">
      <button
        onClick={() => onLoad(entry)}
        className="flex min-w-0 flex-1 flex-col px-2 py-1.5 text-left text-sm"
        title={entry.extractedUrl ? "has extracted view" : undefined}
      >
        <span className="truncate">{entry.name || entry.filename}</span>
        <span className="text-xs text-neutral-500">{formatDate(entry.createdAt)}</span>
      </button>
      <button
        onClick={handleBookmarkClick}
        className={`px-1 py-1.5 text-sm ${
          entry.bookmarked
            ? "text-amber-400"
            : "text-neutral-500 hover:text-amber-400"
        }`}
        aria-label={entry.bookmarked ? "Remove bookmark" : "Add bookmark"}
        title={entry.bookmarked ? "Bookmarked" : "Bookmark"}
      >
        <StarIcon filled={entry.bookmarked} />
      </button>
      <div className="relative">
        <button
          ref={triggerRef}
          onClick={handleToggle}
          className="px-2 py-1.5 text-sm text-neutral-400 hover:text-neutral-100"
          aria-label="options"
        >
          ⋮
        </button>
        {open && (
          <div
            ref={menuRef}
            style={menuPos ? { top: menuPos.top, left: menuPos.left } : undefined}
            className="fixed z-50 w-28 rounded border border-neutral-700 bg-neutral-800 py-1 shadow-lg"
          >
            <button
              onClick={handleRename}
              className="w-full px-3 py-1.5 text-left text-sm hover:bg-neutral-700"
            >
              Rename
            </button>
            <button
              onClick={handleDelete}
              className="w-full px-3 py-1.5 text-left text-sm text-rose-400 hover:bg-neutral-700"
            >
              Delete
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

export function LoadMenu({
  states,
  loading,
  onLoad,
  onRename,
  onDelete,
  onBookmark,
  sort,
  onSortChange,
  onClose,
}: LoadMenuProps) {
  const [bookmarkedOnly, setBookmarkedOnly] = useState(false);

  const displayedStates = useMemo(() => {
    if (!states) return null;
    if (!bookmarkedOnly) return states;
    return states.filter((s) => s.bookmarked);
  }, [states, bookmarkedOnly]);

  return (
    <div className="absolute z-10 mt-1 w-72 rounded border border-neutral-700 bg-neutral-800 p-1 shadow-lg">
      <button
        onClick={() => {
          onClose();
        }}
        className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-700"
      >
        Load from file...
      </button>
      <div className="my-1 border-t border-neutral-700" />
      <div className="flex items-center justify-between px-2 py-1">
        <span className="text-xs text-neutral-500">sort</span>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setBookmarkedOnly((prev) => !prev)}
            className={`rounded px-1.5 py-0.5 text-sm ${
              bookmarkedOnly
                ? "bg-amber-500/20 text-amber-400"
                : "bg-neutral-700 text-neutral-400 hover:text-neutral-200"
            }`}
            aria-label={bookmarkedOnly ? "Show all snapshots" : "Show only bookmarks"}
            title={bookmarkedOnly ? "Showing only bookmarks" : "Show only bookmarks"}
          >
            <StarIcon filled={bookmarkedOnly} />
          </button>
          <div className="relative">
            <select
              value={sort}
              onChange={(e) => onSortChange(e.target.value as PlayStateSort)}
              className="appearance-none rounded bg-neutral-700 pl-2 pr-6 py-0.5 text-xs text-neutral-100 outline-none"
            >
              <option value="newest">newest</option>
              <option value="oldest">oldest</option>
              <option value="name (a-z)">name (a-z)</option>
              <option value="name (z-a)">name (z-a)</option>
            </select>
            <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-1.5 text-neutral-400">
              <svg
                viewBox="0 0 20 20"
                fill="currentColor"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <path
                  fillRule="evenodd"
                  d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.24a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
          </div>
        </div>
      </div>
      {loading ? (
        <p className="px-2 py-1.5 text-xs text-neutral-500">loading...</p>
      ) : displayedStates && displayedStates.length === 0 ? (
        <p className="px-2 py-1.5 text-xs text-neutral-500">
          {bookmarkedOnly ? "no bookmarks" : "no saved states"}
        </p>
      ) : displayedStates ? (
        <div className="max-h-56 overflow-auto">
          {displayedStates.map((s) => (
            <LoadMenuItem
              key={s.stateUrl}
              entry={s}
              onLoad={onLoad}
              onRename={onRename}
              onDelete={onDelete}
              onBookmark={onBookmark}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
