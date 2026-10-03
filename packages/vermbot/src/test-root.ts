import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeEach, afterEach } from "vitest";
import { setRepoRoot } from "./files.ts";

export function useTempRepoRoot(): void {
  let tempRoot: string;
  beforeEach(() => {
    tempRoot = mkdtempSync(join(tmpdir(), "vermbot-"));
    setRepoRoot(tempRoot);
  });
  afterEach(() => {
    setRepoRoot();
    rmSync(tempRoot, { recursive: true, force: true });
  });
}
