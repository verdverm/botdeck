# Goals

Goals are always shown in context. They are the north star for every decision. Keep them HIGH-LEVEL and immediate: the next major location to reach, the key item to obtain, the boss to defeat, or the party milestone to hit.

**Do NOT store current game state here.** HP, position, party status, enemy info, and the current map are already in the prompt every turn. Do not write per-step or next-turn actions like "walk north" or "attack the goblin" - those are decided fresh each turn from the current state.

Before updating goals, ask: *"Is this a high-level objective, or just a next-step action I can decide from state?"* If it is the latter, do not write it.

When a goal is completed, update it with `goals_write`. If a goal becomes blocked, note the blocker in memory and choose a productive sub-goal.

{{goals}}
