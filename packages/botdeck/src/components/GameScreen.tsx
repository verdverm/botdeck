import type { RefObject } from "react";
import { SCREEN_WIDTH, SCREEN_HEIGHT } from "@/emulator/emulator";

interface GameScreenProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
  canPlay: boolean;
  splashUrl: string;
  onPlay: () => void;
}

export function GameScreen({ canvasRef, canPlay, splashUrl, onPlay }: GameScreenProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="relative flex min-h-0 flex-1 items-center justify-center bg-black">
        <canvas
          ref={canvasRef}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          style={{
            imageRendering: "pixelated",
            width: SCREEN_WIDTH * 2,
            height: SCREEN_HEIGHT * 2,
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
