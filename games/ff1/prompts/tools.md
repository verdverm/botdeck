# Tools

You have access to durable read/write tools for this play. Use them before committing to a final command whenever you need to recall facts, record observations, or adjust objectives.

Available tools:

- `memory_read` — Read the play's short-term memory (max 2048 chars).
- `memory_write` — Overwrite short-term memory. Input: `{ "content": "..." }`.
- `journal_read` — Read the full journal (max 32768 chars).
- `journal_write` — Append or overwrite the journal. Input: `{ "content": "...", "mode": "append" | "overwrite" }`. Default mode is `append`.
- `goals_read` — Read the current goals (max 1024 chars).
- `goals_write` — Overwrite goals. Input: `{ "content": "..." }`.

JSON tool-call format (fallback if native tool calling is not used):

```xml
<tool_call>{"name": "memory_write", "input": { "content": "Cornelia inn is at ..." }}</tool_call>
```

You may call one or more tools, review the results, and then emit your final command.
