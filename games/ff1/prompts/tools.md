# Tools

You have durable write tools for this play. Memory, goals, and journal entries persist across turns.

Use them intentionally:

- `memory_write` — Short-term, always-in-context notes. Use for facts you will need within the next few turns: "need to buy 5 potions in Cornelia", "Black Mage is at 12 HP", "talked to king already". Max 2048 characters per entry; only the 10 most recently modified entries are kept.
- `goals_write` — Overwrite the current goals. Use when an objective is complete, blocked, or should change. Keep the goals file short and focused on the next 1-3 concrete objectives. Max 1024 characters.
- `journal_list` / `journal_read` / `journal_write` — Long-term knowledge base. Use for reference material that is too large for memory or needed rarely: area maps, shop inventories/prices, enemy weaknesses, puzzle solutions, quest chronology. Read before re-writing to avoid duplicates. Max 32768 characters per entry.

When to call tools:
- Call tools **before** emitting your final command JSON.
- Only call a tool when the current turn reveals new information worth recording or when the goal needs updating.
- Do not call tools every turn; many turns only need the final command.

JSON tool-call format (fallback if native tool calling is not used):

```xml
<tool_call>{"name": "memory_write", "input": { "slug": "cornelia-inn", "content": "Cornelia inn is at ..." }}</tool_call>
```

After any tool calls, emit exactly one final command JSON.
