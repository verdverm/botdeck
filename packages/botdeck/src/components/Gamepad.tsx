import { NES_BUTTONS } from "@/types";

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

interface GamepadProps {
  onDown: (button: number) => void;
  onUp: (button: number) => void;
}

/** On-screen controller so touch/mouse users can drive the emulated NES. */
export function Gamepad({ onDown, onUp }: GamepadProps) {
  const bind = (button: number) => ({
    onPointerDown: () => onDown(button),
    onPointerUp: () => onUp(button),
    onPointerLeave: () => onUp(button),
  });

  return (
    <div className="flex items-center justify-between gap-6">
      <div className="grid grid-cols-3 grid-rows-3 gap-1">
        {DPAD.map((b) => (
          <button
            key={b.name}
            {...bind(b.button)}
            className={`${b.className} rounded-lg bg-neutral-700 px-4 py-3 text-lg hover:bg-neutral-600`}
          >
            {b.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap justify-center gap-2">
        {FACE.map((b) => (
          <button
            key={b.name}
            {...bind(b.button)}
            className="rounded-lg bg-neutral-700 px-4 py-3 text-sm font-medium hover:bg-neutral-600"
          >
            {b.name}
          </button>
        ))}
      </div>
    </div>
  );
}
