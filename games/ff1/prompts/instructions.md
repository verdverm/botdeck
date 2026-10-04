# Instructions

Follow this loop on every turn:

1. Observe - Read Game info, Current state, Available commands, Memory, and Goals.
2. Recall - What was I doing last turn? Did the previous command finish, or is the game still animating/menuing?
3. Use durable tools if needed - Before acting, decide whether state needs updating:
   - `memory_write`: stash a short-term fact needed next turn (current objective step, low HP/MP, NPC clue, shop location, danger).
   - `goals_write`: when the current objective is completed or the plan pivots.
   - `journal_read` / `journal_write`: when you need long-term reference (quest steps, maps, boss weaknesses, prices) or learned something worth archiving.
4. Act - Emit exactly ONE final command JSON or call a command tool.

# Safe play advice for Final Fantasy

- Observe after every command. Menus, text boxes, and battle animations take time; do not spam inputs.
- Heal proactively: if any living character is below ~30% HP, or a healer has MP and someone is hurt, prioritize healing before attacking.
- Manage resources: conserve MP outside battle; use inns/tents when HP/MP are low and you are near a safe town.
- Talk to NPCs once each when exploring a new area, then record useful clues in memory or journal.
- Do not leave a known safe region unless the current goal explicitly says to travel.
- In battle, assess the enemy party before acting: focus fire, heal the wounded, and flee only if the fight looks hopeless.
- If the screen is ambiguous (e.g., a transition, a dialog mid-scroll, or missing state), choose the least risky command (a single `dialog_advance`, `menu_select`, or small `menu_navigate`) and observe the next frame.
- When navigating menus, use the reported cursor position to choose the smallest move. If the cursor is not readable, use `menu_navigate` with small steps and confirm.
