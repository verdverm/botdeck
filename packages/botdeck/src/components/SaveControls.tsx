import { useRef, useState, type ChangeEvent } from "react";
import { statesUrl } from "@/play";

interface PlayStateEntry {
  stateUrl: string;
  extractedUrl?: string;
  name: string;
}

interface SaveControlsProps {
  disabled: boolean;
  playId: string;
  onSnapshot: () => Promise<void>;
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

  const handleSnapshot = async () => {
    setError(null);
    try {
      await onSnapshot();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(`save failed: ${message}`);
      console.error(e);
    }
  };

  const openLoadMenu = async () => {
    const next = !showLoad;
    setShowLoad(next);
    if (!next) return;
    setError(null);
    if (states === null && !loadingStates) {
      setLoadingStates(true);
      try {
        const res = await fetch(statesUrl(playId));
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
    }
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
            <div className="absolute z-10 mt-1 w-64 rounded border border-neutral-700 bg-neutral-800 p-1 shadow-lg">
              <button
                onClick={handleLoadFile}
                className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-700"
              >
                Load from file...
              </button>
              <div className="my-1 border-t border-neutral-700" />
              {states && states.length === 0 ? (
                <p className="px-2 py-1.5 text-xs text-neutral-500">
                  no saved states
                </p>
              ) : states ? (
                <div className="max-h-48 overflow-auto">
                  {states.map((s) => (
                    <button
                      key={s.stateUrl}
                      onClick={() => handleLoadSaved(s)}
                      className="w-full rounded px-2 py-1.5 text-left text-sm hover:bg-neutral-700"
                      title={s.extractedUrl ? "has extracted view" : undefined}
                    >
                      {s.name}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
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
