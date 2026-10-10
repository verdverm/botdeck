import { useRef, useState, type ChangeEvent } from "react";
import { statesUrl, updateStateMetadata, deleteState } from "@/play";
import type { PlayStateEntry, PlayStateSort } from "@/types";
import { LoadMenu } from "@/components/LoadMenu";

interface SaveControlsProps {
  disabled: boolean;
  playId: string;
  onSnapshot: (name?: string) => Promise<void>;
  onLoadFile: (file: File) => Promise<void>;
  onLoadSaved: (stateUrl: string) => Promise<void>;
}

export function SaveControls({
  disabled,
  playId,
  onSnapshot,
  onLoadFile,
  onLoadSaved,
}: SaveControlsProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showLoad, setShowLoad] = useState(false);
  const [states, setStates] = useState<PlayStateEntry[] | null>(null);
  const [loadingStates, setLoadingStates] = useState(false);
  const [sort, setSort] = useState<PlayStateSort>("newest");

  const handleSnapshot = async () => {
    setError(null);
    const name = window.prompt("Snapshot name (optional)");
    if (name === null) return;
    try {
      await onSnapshot(name);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`save failed: ${message}`);
      console.error(e);
    }
  };

  const fetchStates = async (nextSort: PlayStateSort) => {
    setError(null);
    setLoadingStates(true);
    try {
      const res = await fetch(statesUrl(playId, nextSort));
      if (!res.ok) throw new Error(`list failed (${res.status})`);
      const list = (await res.json()) as PlayStateEntry[];
      setStates(list);
    } catch (e) {
      setError(
        `load list failed: ${e instanceof Error ? e.message : String(e)}`,
      );
    } finally {
      setLoadingStates(false);
    }
  };

  const openLoadMenu = async () => {
    const next = !showLoad;
    setShowLoad(next);
    if (!next) return;
    if (!loadingStates) {
      await fetchStates(sort);
    }
  };

  const closeLoadMenu = () => {
    setShowLoad(false);
    handleLoadFile();
  };

  const handleSortChange = async (next: PlayStateSort) => {
    setSort(next);
    await fetchStates(next);
  };

  const handleLoadSaved = async (entry: PlayStateEntry) => {
    setError(null);
    setShowLoad(false);
    try {
      await onLoadSaved(entry.stateUrl);
    } catch (e) {
      setError(`load failed: ${e instanceof Error ? e.message : String(e)}`);
      console.error(e);
    }
  };

  const handleRename = async (entry: PlayStateEntry, name: string) => {
    setError(null);
    try {
      await updateStateMetadata(playId, entry.filename, { name });
      await fetchStates(sort);
    } catch (e) {
      setError(`rename failed: ${e instanceof Error ? e.message : String(e)}`);
      console.error(e);
    }
  };

  const handleBookmark = async (entry: PlayStateEntry) => {
    setError(null);
    const next = !entry.bookmarked;
    setStates((prev) =>
      prev
        ? prev.map((s) =>
            s.filename === entry.filename ? { ...s, bookmarked: next } : s,
          )
        : prev,
    );
    try {
      await updateStateMetadata(playId, entry.filename, { bookmarked: next });
    } catch (e) {
      setStates((prev) =>
        prev
          ? prev.map((s) =>
              s.filename === entry.filename ? { ...s, bookmarked: entry.bookmarked } : s,
            )
          : prev,
      );
      setError(`bookmark failed: ${e instanceof Error ? e.message : String(e)}`);
      console.error(e);
    }
  };

  const handleDelete = async (entry: PlayStateEntry) => {
    setError(null);
    try {
      await deleteState(playId, entry.filename);
      await fetchStates(sort);
    } catch (e) {
      setError(`delete failed: ${e instanceof Error ? e.message : String(e)}`);
      console.error(e);
    }
  };

  const handleLoadFile = () => {
    setError(null);
    setShowLoad(false);
    inputRef.current?.click();
  };

  const handleFileChange = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setError(null);
    try {
      await onLoadFile(file);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`load failed: ${message}`);
      console.error(e);
    }
  };

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <button
          disabled={disabled}
          onClick={handleSnapshot}
          className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
        >
          Snapshot
        </button>
        <div className="relative">
          <button
            onClick={openLoadMenu}
            className="rounded bg-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-600"
          >
            Load ▼
          </button>
          {showLoad && (
            <LoadMenu
              states={states}
              loading={loadingStates}
              playId={playId}
              onLoad={handleLoadSaved}
              onRename={handleRename}
              onDelete={handleDelete}
              onBookmark={handleBookmark}
              sort={sort}
              onSortChange={handleSortChange}
              onClose={closeLoadMenu}
            />
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept=".json"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>
      {error && <span className="text-xs text-rose-400">{error}</span>}
    </div>
  );
}
