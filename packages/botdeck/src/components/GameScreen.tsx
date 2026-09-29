import type { RefObject } from "react";
import { SCREEN_WIDTH, SCREEN_HEIGHT } from "@/emulator/emulator";

interface GameScreenProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function GameScreen({ canvasRef }: GameScreenProps) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
        Game
      </h2>
      <div className="flex flex-1 items-center justify-center bg-black">
        <canvas
          ref={canvasRef}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          className="h-auto max-h-full w-full"
          style={{ imageRendering: "pixelated" }}
        />
      </div>
    </section>
  );
}
