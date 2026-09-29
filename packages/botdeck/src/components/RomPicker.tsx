import { useEffect, useState } from "react";
import { gamesUrl, readGameId, type GameSummary } from "@/play";

/**
 * Displays the active game id (from ?game=), validated against the file API
 * (/api/games). It is a passive label, not a control: the ROM is auto-loaded
 * on boot via /api/games/:game/rom, so there is nothing to click.
 */
export function RomPicker() {
  const active = readGameId();
  const [games, setGames] = useState<GameSummary[]>([]);

  useEffect(() => {
    fetch(gamesUrl())
      .then((res) => {
        if (!res.ok) throw new Error(`games list (${res.status})`);
        return res.json() as Promise<GameSummary[]>;
      })
      .then(setGames)
      .catch(() => setGames([]));
  }, []);

  const entry = games.find((g) => g.game === active);
  const hasRom = entry?.hasRom ?? true;

  return (
    <span
      className={`rounded px-3 py-1.5 text-sm font-medium ${
        hasRom
          ? "bg-emerald-600 text-white"
          : "bg-neutral-700 text-rose-400"
      }`}
    >
      {active}
      {hasRom ? "" : " (no ROM)"}
    </span>
  );
}
