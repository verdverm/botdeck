# Tools

You have durable write tools for this play, plus command tools that mirror the available commands. Memory, goals, journal entries, and agent-authored prompt snippets persist across turns.

## Durable tools

Use them intentionally:

- `memory_write` - Short-term, always-in-context notes. Use for facts you will need within the next few turns: "need to buy 5 potions in Cornelia", "Black Mage is at 12 HP", "talked to king already". Max {{memoryLimit}} characters per entry; only the {{memoryCount}} most recently modified entries are kept.
- `goals_write` - Overwrite the current goals. Use when an objective is complete, blocked, or should change. Keep the goals file short and focused on the next 1-3 concrete objectives. Max {{goalsLimit}} characters.
- `journal_list` / `journal_read` / `journal_write` - Long-term knowledge base. Use for reference material that is too large for memory or needed rarely: area maps, shop inventories/prices, enemy weaknesses, puzzle solutions, quest chronology. Read before re-writing to avoid duplicates. Max {{journalLimit}} characters per entry.
- `snippet_list` / `snippet_read` / `snippet_write` / `snippet_delete` - Manage your own prompt snippets for this play. Agent snippets are stored separately from the game's built-in snippets and any user overrides; they never replace or shadow those snippets by name. Instead, every agent snippet is appended to the assembled prompt as a clearly-delimited section. Use them to refine instructions, add mode-specific guidance, or correct recurring mistakes. Max {{snippetLimit}} characters per snippet; only the {{snippetCount}} most recent agent snippets are kept.
- `press_button` - Press a single NES button directly. Use only when no high-level command applies.

## Command tools

Every command in "Available commands" is also callable as a tool. Calling a command tool is equivalent to emitting the final `{"command": {...}}` JSON: it is your chosen action for the turn. Prefer command tools when the model supports native tool calling.

## When to call tools

- Call durable tools **before** emitting your final command.
- Call a command tool (or emit the final JSON) as the very last action.
- Only call durable tools when the current turn reveals new information worth recording or when the goal needs updating.
- Do not call durable tools every turn; many turns only need the final command.

If native tool calling is not available, use the XML fallback:

```xml
<tool_call>{"name": "memory_write", "input": { "slug": "cornelia-inn", "content": "Cornelia inn is at ..." }}</tool_call>
```

After any durable tool calls, emit exactly one final command JSON or call a command tool.
