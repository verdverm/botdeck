import type { CollectedState } from "@/emulator/collectState";
import type { UseBotLoopResult } from "@/hooks/useBotLoop";
import type { GameCommand, GamePlugin, PlaySnippet, SnippetRunResult } from "@/types";

export type Tab = "overview" | "party" | "location" | "battle" | "menu" | "snippets" | "agent" | "markdown";
export type PartySubTab = "main" | number;

export interface GameInfoPanelProps {
  data: CollectedState | null;
  saved?: { statePath?: string; extractedPath?: string } | null;
  disabled?: boolean;
  onRefresh?: () => void;
  agent?: UseBotLoopResult;
  playId?: string;
  /** Active game id (from ?game=), used for game-level prompt/config paths. */
  game?: string;
  /** The active game plugin, used to render prompts live from current state. */
  plugin?: GamePlugin;
  onRunSnippet?: (snippet: import("@/types").PlaySnippet) => void | Promise<SnippetRunResult>;
  /** Called when the user manually runs a single command (e.g., from the gamepad in step mode). */
  onManualCommand?: (command: import("@/types").GameCommand) => void;
  snippetRunning?: boolean;
  onStopSnippet?: () => void;
}
