# Tools

You have durable write tools for this play, plus command tools that mirror the available commands. Memory, goals, journal entries, and agent-authored prompt snippets persist across turns.

**Do NOT use durable tools to store current game state.** HP, position, party status, enemies, cursor location, and current map are provided fresh in every turn's prompt. Before writing anything, ask: *"Is this already in the state I'm given each turn?"* If yes, do not write it.

## Durable tools

Use them intentionally:

- `memory_write` - Short-term, always-in-context notes for things needed every turn that are NOT in the state. Good: current sub-plan, active threats, party role assignments. Bad: "Black Mage is at 12 HP" or "the party is at 12,34" - that is in the state. Max {{memoryLimit}} characters per entry; only the {{memoryCount}} most recently modified entries are kept.
- `goals_write` - Overwrite the current goals. Use when an objective is completed, blocked, or should change. Keep goals HIGH-LEVEL and focused on the next 1-3 major objectives. Bad: per-step or next-turn actions like "walk north" or "attack the goblin". Max {{goalsLimit}} characters.
- `journal_list` / `journal_read` / `journal_write` - Long-term knowledge base for things learned that are not re-derivable from current state: dungeon layouts, NPC hints, boss strategies that worked/failed, where key items are used, dead ends, shop prices. Read before re-writing to avoid duplicates. Max {{journalLimit}} characters per entry.
- `snippet_list` / `snippet_read` / `snippet_write` / `snippet_delete` - Manage your own prompt snippets for this play. Agent snippets are stored separately from the game's built-in snippets and any user overrides; they never replace or shadow those snippets by name. Instead, every agent snippet is appended to the assembled prompt as a clearly-delimited section. Use them to refine instructions, add mode-specific guidance, or correct recurring mistakes. Max {{snippetLimit}} characters per snippet; only the {{snippetCount}} most recent agent snippets are kept.
- `press_button` - Press a single NES button directly. Use only when no high-level command applies.

## Command tools

Every command in "Available commands" is also callable as a tool. Calling a command tool is your chosen action for the turn and ends the turn.

## When to call tools

- Call durable tools before ending your turn.
- Call exactly one command tool as the very last action.
- Only call durable tools when the current turn reveals new information worth recording or when the goal needs updating.
- Do not call durable tools every turn; many turns only need the final command.

If the model's tool-calling channel is unavailable, the adapter recognizes either of these fallback forms for durable tools:

```xml
<tool_call>{"name": "memory_write", "input": { "slug": "cornelia-inn", "content": "Cornelia inn is at ..." }}</tool_call>
```

or

```xml
<tool_call><function=memory_write><parameter=slug>cornelia-inn</parameter><parameter=content>Cornelia inn is at ...</parameter></function></tool_call>
```

After any durable tool calls, end your turn by calling exactly one command tool.
