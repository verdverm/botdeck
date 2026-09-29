import { NES_BUTTONS, type ButtonStep } from "@/types";

interface ControlBarProps {
  running: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  /** Manual single-tap for isolated emulator testing (not part of the bot loop). */
  onManualTap: (step: ButtonStep) => void;
  onInspect: () => void;
}

const DPAD: { name: string; button: number; label: string; className: string }[] =
  [
    { name: "UP", button: NES_BUTTONS.UP, label: "\u25B2", className: "col-start-2 row-start-1" },
    { name: "LEFT", button: NES_BUTTONS.LEFT, label: "\u25C0", className: "col-start-1 row-start-2" },
    { name: "RIGHT", button: NES_BUTTONS.RIGHT, label: "\u25B6", className: "col-start-3 row-start-2" },
    { name: "DOWN", button: NES_BUTTONS.DOWN, label: "\u25BC", className: "col-start-2 row-start-3" },
  ];

const FACE: { name: string; button: number }[] = [
  { name: "B", button: NES_BUTTONS.B },
  { name: "A", button: NES_BUTTONS.A },
  { name: "SELECT", button: NES_BUTTONS.SELECT },
  { name: "START", button: NES_BUTTONS.START },
];

export function ControlBar({
  running,
  onStart,
  onStop,
  onReset,
  onManualTap,
  onInspect,
}: ControlBarProps) {
  return (
    <section className="flex items-center justify-between gap-4 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex gap-2">
        {running ? (
          <button
            onClick={onStop}
            className="rounded bg-rose-600 px-3 py-1.5 text-sm font-medium hover:bg-rose-500"
          >
            Stop bot
          </button>
        ) : (
          <button
            onClick={onStart}
            className="rounded bg-emerald-600 px-3 py-1.5 text-sm font-medium hover:bg-emerald-500"
          >
            Start bot
          </button>
        )}
        <button
          onClick={onReset}
          className="rounded bg-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-600"
        >
          Reset
        </button>
        <button
          onClick={onInspect}
          className="rounded bg-neutral-700 px-3 py-1.5 text-sm font-medium hover:bg-neutral-600"
        >
          Inspect state
        </button>
      </div>

      <div className="flex items-center gap-4">
        <div className="grid grid-cols-3 grid-rows-3 gap-1">
          {DPAD.map((b) => (
            <button
              key={b.name}
              onClick={() => onManualTap({ button: b.button })}
              className={`${b.className} rounded bg-neutral-700 px-2 py-1 text-sm hover:bg-neutral-600`}
            >
              {b.label}
            </button>
          ))}
        </div>
        <div className="flex gap-1">
          {FACE.map((b) => (
            <button
              key={b.name}
              onClick={() => onManualTap({ button: b.button })}
              className="rounded bg-neutral-700 px-2 py-1 text-xs hover:bg-neutral-600"
            >
              {b.name}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
