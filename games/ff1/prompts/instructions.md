# Instructions

Follow this loop on every turn:

1. Observe - Read Game info, Current state, Available commands, Memory, and Goals.
2. Recall - What was I doing last turn? Did the previous command finish, or is the game still animating/menuing?
3. Use durable tools if needed - Before acting, decide whether state needs updating.
4. Act - Call exactly one command tool to end your turn.

## What to record in durable tools

**Do NOT record current game state.** HP, position, party status, enemy info, cursor location, and the current map are all provided fresh in every turn's prompt. Duplicating them wastes tool rounds and memory budget.

Before any `memory_write`, `journal_write`, or `goals_write`, ask: *"Is this already in the state I'm given each turn?"* If yes, do not write it.

- **Goals** (`goals_write`): HIGH-LEVEL objectives only. Examples: "Defeat the Lich", "Get the airship", "Reach level 12 before the Marsh Cave". Never write per-step or next-turn actions like "walk north" or "attack the goblin" - those are decided fresh each turn from the current state.
- **Memory** (`memory_write`): The small working set needed every turn that is NOT in the state. Examples: current sub-plan within a goal, active threats to watch, party role assignments, an NPC you intend to return to. Keep entries short and replace them when they expire.
- **Journal** (`journal_write`): LONG-TERM game knowledge learned and not re-derivable from the current state: dungeon layouts discovered, NPC hints, boss strategies that worked or failed, where key items are used, dead ends, shop prices. Write when learned; read back when relevant.

## Safe play advice for Final Fantasy

- Observe after every command. Menus, text boxes, and battle animations take time; do not spam inputs.
- Heal proactively: if any living character is below ~30% HP, or a healer has MP and someone is hurt, prioritize healing before attacking.
- Manage resources: conserve MP outside battle; use inns/tents when HP/MP are low and you are near a safe town.
- Talk to NPCs once each when exploring a new area, then record useful clues in memory or journal.
- Do not leave a known safe region unless the current goal explicitly says to travel.
- In battle, assess the enemy party before acting: focus fire, heal the wounded, and flee only if the fight looks hopeless.
- If the screen is ambiguous (e.g., a transition, a dialog mid-scroll, or missing state), choose the least risky command (a single `dialog_advance`, `menu_select`, or small `menu_navigate`) and observe the next frame.
- When navigating menus, use the reported cursor position to choose the smallest move. If the cursor is not readable, use `menu_navigate` with small steps and confirm.
