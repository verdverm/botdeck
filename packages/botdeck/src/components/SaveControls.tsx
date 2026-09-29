import { useRef } from "react";

interface SaveControlsProps {
  disabled: boolean;
  onSaveFile: () => void;
  onLoadFile: (file: File) => void;
}

export function SaveControls({ disabled, onSaveFile, onLoadFile }: SaveControlsProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  return (
    <div className="flex flex-wrap gap-2">
      <button
        disabled={disabled}
        onClick={onSaveFile}
        className="rounded bg-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-600 disabled:opacity-50"
      >
        Save state (download)
      </button>
      <button
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="rounded bg-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-600 disabled:opacity-50"
      >
        Load state
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) onLoadFile(file);
        }}
      />
    </div>
  );
}
