/** NES controller button indices (matches jsnes Controller constants). */
export const NES_BUTTONS = {
  A: 0,
  B: 1,
  SELECT: 2,
  START: 3,
  UP: 4,
  DOWN: 5,
  LEFT: 6,
  RIGHT: 7,
} as const;

export type NesButtonName = keyof typeof NES_BUTTONS;

export interface PlayStateMetadata {
  name: string;
  createdAt: string;
  bookmarked: boolean;
}

export interface PlayStateEntry {
  filename: string;
  statePath: string;
  extractedPath?: string;
  metadataPath?: string;
  stateUrl: string;
  extractedUrl?: string;
  metadataUrl?: string;
  name: string;
  createdAt: string;
  bookmarked: boolean;
}

export type PlayStateSort = "newest" | "oldest" | "name (a-z)" | "name (z-a)";
