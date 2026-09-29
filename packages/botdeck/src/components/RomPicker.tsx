import { useRef } from "react";

interface RomPickerProps {
  onLoad: (data: ArrayBuffer, name?: string) => void;
  disabled?: boolean;
}

const PRESET_ROMS = [
  { label: "nestest", url: "/roms/nestest.nes" },
  { label: "croom", url: "/roms/croom.nes" },
];

/** Load a ROM from disk or from one of the bundled presets. */
export function RomPicker({ onLoad, disabled }: RomPickerProps) {
  const inputRef = useRef<HTMLInputElement | null>(null);

  const onFile = async (file: File) => {
    const buf = await file.arrayBuffer();
    onLoad(buf, file.name);
  };

  const onPreset = async (url: string) => {
    try {
      const res = await fetch(url);
      if (!res.ok) return;
      const buf = await res.arrayBuffer();
      onLoad(buf, url.split("/").pop());
    } catch {
      // ignore unreachable preset
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="rounded bg-sky-600 px-3 py-1.5 text-sm font-medium hover:bg-sky-500 disabled:opacity-50"
      >
        Load .nes
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".nes"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) void onFile(file);
        }}
      />
      {PRESET_ROMS.map((rom) => (
        <button
          key={rom.url}
          disabled={disabled}
          onClick={() => void onPreset(rom.url)}
          className="rounded bg-neutral-700 px-3 py-1.5 text-sm hover:bg-neutral-600 disabled:opacity-50"
        >
          {rom.label}
        </button>
      ))}
    </div>
  );
}
