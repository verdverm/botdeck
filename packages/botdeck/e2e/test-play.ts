import { existsSync, mkdirSync, rmSync, copyFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Page } from "playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, "../../..");

export function tempPlayId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function playDir(game: string, id: string): string {
  return join(REPO_ROOT, "plays", game, id);
}

export async function createTestPlay(
  page: Page,
  game: string,
  id: string,
  label?: string,
): Promise<void> {
  const ok = await page.evaluate(
    ({ game, id, label }) =>
      fetch("/api/plays", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ game, id, label }),
      }).then((r) => r.ok),
    { game, id, label },
  );
  if (!ok) throw new Error(`failed to create play ${game}/${id}`);
}

export function deleteTestPlay(game: string, id: string | undefined): void {
  if (!id) return;
  const dir = playDir(game, id);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function copyPlayStateFiles(
  game: string,
  sourceId: string,
  targetId: string,
  baseName: string,
): void {
  const sourceDir = join(playDir(game, sourceId), "states");
  const targetDir = join(playDir(game, targetId), "states");
  mkdirSync(targetDir, { recursive: true });
  for (const suffix of [".state.json", ".ff1.json", ".metadata.json"]) {
    const src = join(sourceDir, `${baseName}${suffix}`);
    const dst = join(targetDir, `${baseName}${suffix}`);
    if (existsSync(src)) {
      copyFileSync(src, dst);
    }
  }
}

export function copyPlaySnippet(
  game: string,
  sourceId: string,
  targetId: string,
  snippetId: string,
): void {
  const sourceDir = join(playDir(game, sourceId), "snippets", "user");
  const targetDir = join(playDir(game, targetId), "snippets", "user");
  mkdirSync(targetDir, { recursive: true });
  const src = join(sourceDir, `${snippetId}.snippet.json`);
  const dst = join(targetDir, `${snippetId}.snippet.json`);
  if (!existsSync(src)) {
    throw new Error(`snippet not found: ${src}`);
  }
  copyFileSync(src, dst);
}
