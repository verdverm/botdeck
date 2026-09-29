import type { RefObject } from "react";
import { SCREEN_WIDTH, SCREEN_HEIGHT } from "@/emulator/emulator";

interface GameScreenProps {
  canvasRef: RefObject<HTMLCanvasElement | null>;
}

export function GameScreen({ canvasRef }: GameScreenProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col rounded-lg border border-neutral-800 bg-neutral-900 p-3">
      <div className="flex min-h-0 flex-1 items-center justify-center bg-black">
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
      </div>
    </section>
  );
}
