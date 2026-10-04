# Journal

The journal is a long-term, tool-managed knowledge base. It is not shown inline, so read entries when you need them.

Use the journal for knowledge learned that is NOT re-derivable from the current state:
- Area maps and navigation notes discovered by exploration.
- NPC hints, quest clues, and story chronology.
- Boss/enemy weaknesses and strategies that worked or failed.
- Where key items are used or which doors they open.
- Shop inventories, prices, and locations.
- Dead ends, traps, and one-way paths.

**Do NOT store current game state here.** HP, position, party status, enemy info, and the current map are already in the prompt every turn. Before writing, ask: *"Is this already in the state I'm given each turn?"* If yes, do not write it.

Before writing, list or read existing entries to avoid duplicates. Give entries descriptive names like `cornelia-map`, `garland-strategy`, or `shop-prices`.

Use `journal_list` to see what is stored, then `journal_read` to retrieve a specific entry when you need it.
