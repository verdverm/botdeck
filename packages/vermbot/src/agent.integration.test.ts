import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const RUN_LLM_INTEGRATION = process.env.RUN_LLM_INTEGRATION === "1";

const PROJECT_CONFIG = JSON.parse(
  readFileSync(fileURLToPath(new URL("../config.json", import.meta.url)), "utf8"),
) as { baseUrl: string };

async function chatCompletion(model: string): Promise<unknown> {
  const res = await fetch(`${PROJECT_CONFIG.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "X-GoModel-User-Path": `/proj/vermbot-test/${model}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: "Reply with only the word ping." }],
      max_tokens: 16,
    }),
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

function responseText(body: unknown): string {
  const choice = (body as { choices?: Array<{ message?: { content?: string; reasoning?: string } }> }).choices?.[0]?.message;
  return String(choice?.content ?? choice?.reasoning ?? "");
}

describe.skipIf(!RUN_LLM_INTEGRATION)("LLM connectivity", () => {
  it("primary responds to a minimal chat completion", async () => {
    const body = await chatCompletion("primary");
    expect(responseText(body).length).toBeGreaterThan(0);
  }, 60_000);

  it("small responds to a minimal chat completion", async () => {
    const body = await chatCompletion("small");
    expect(responseText(body).length).toBeGreaterThan(0);
  }, 60_000);

  it("small can follow a simple instruction", async () => {
    const body = await chatCompletion("small");
    expect(responseText(body).toLowerCase()).toContain("ping");
  }, 60_000);
});
