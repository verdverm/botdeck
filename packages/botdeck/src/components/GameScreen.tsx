import type { RefObject } from "react";
import { SCREEN_WIDTH, SCREEN_HEIGHT } from "@/emulator/emulator";

interface GameScreenProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canPlay: boolean;
  splashUrl: string;
  onPlay: () => void;
  focused?: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function GameScreen({ canvasRef, canPlay, splashUrl, onPlay, focused, onFocus, onBlur }: GameScreenProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
        {focused && (
          <span className="pointer-events-none absolute right-2 top-2 z-10 rounded bg-emerald-600/80 px-1.5 py-0.5 text-[10px] font-medium text-white">
            game focused
          </span>
        )}
        <canvas
          ref={canvasRef}
          tabIndex={0}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          onFocus={onFocus}
          onBlur={onBlur}
          className="rounded focus:ring-2 focus:ring-emerald-500"
          style={{
            imageRendering: "pixelated",
            width: SCREEN_WIDTH * 2,
            height: SCREEN_HEIGHT * 2,
            outline: "none",
          }}
        />
        {canPlay && (
          <button
            onClick={onPlay}
            className="absolute inset-0 flex items-center justify-center bg-black/30 p-4 transition-all duration-200 hover:bg-black/10"
          >
            <img
              src={splashUrl}
              alt="Play"
              className="max-h-full max-w-full cursor-pointer rounded-lg object-contain shadow-lg transition-all duration-200 hover:-translate-y-1 hover:shadow-2xl hover:shadow-emerald-400/60 focus:outline-none"
            />
          </button>
        )}
      </div>
    </section>
  );
}
