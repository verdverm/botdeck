import type { CollectedState } from "@/emulator/collectState";

export type Tab = "overview" | "party" | "location" | "battle" | "agent" | "markdown";
export type PartySubTab = "main" | number;

export interface GameInfoPanelProps {
  data: CollectedState | null;
  saved?: { statePath?: string; extractedPath?: string } | null;
  disabled?: boolean;
  onRefresh?: () => void;
}
