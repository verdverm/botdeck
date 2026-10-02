import type { CollectedState } from "@/emulator/collectState";
import type { UseBotLoopResult } from "@/hooks/useBotLoop";

export type Tab = "overview" | "party" | "location" | "battle" | "agent" | "snippets" | "markdown";
export type PartySubTab = "main" | number;

export interface GameInfoPanelProps {
  data: CollectedState | null;
  saved?: { statePath?: string; extractedPath?: string } | null;
  disabled?: boolean;
  onRefresh?: () => void;
  agent?: UseBotLoopResult;
  playId?: string;
  onRunSnippet?: (snippet: import("@/types").PlaySnippet) => void;
  /** Called when the user manually runs a single command (e.g., from the gamepad in step mode). */
  onManualCommand?: (command: import("@/types").GameCommand) => void;
  snippetPaused?: boolean;
  onPauseSnippet?: () => void;
  onStopSnippet?: () => void;
}
