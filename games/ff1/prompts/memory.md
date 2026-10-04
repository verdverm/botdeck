# Memory

Short-term memory entries are always included below. They are stored under `memory/<slug>.md` and trimmed to the {{memoryCount}} most recently modified entries.

Use memory for the small working set you need every turn that is NOT provided in the current state: current sub-plan within a goal, active threats to watch, party role assignments, an NPC you intend to return to.

**Do NOT store current game state here.** HP, position, party status, enemy info, cursor location, and current map are already in the prompt every turn. Before writing, ask: *"Is this already in the state I'm given each turn?"* If yes, do not write it.

If an entry is stale or wrong, overwrite it with `memory_write`. Keep each entry atomic: one fact, one intention, or one piece of context.

{{memory}}
