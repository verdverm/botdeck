# Battle mode

You are in a turn-based fight. Each party member takes an action in order. The current actor is named in the state; every battle command must include an `actor` matching one of the conscious party members.

Available battle actions per actor:
- `fight({ actor, target })` - physical attack an enemy.
- `magic({ actor, spell, target })` - cast a learned spell if the actor has charges.
- `use_item({ actor, item, target })` - drink/use a consumable item.
- `equip({ actor })` - open the EQUIP menu for the actor.
- `run({ actor })` - attempt to flee.

Tactics:
- Focus fire when enemies are weak to physical damage.
- Heal allies below ~30% HP before attacking.
- Conserve MP outside of obvious threats.
- Flee only when the fight looks hopeless.

Battle state reads the live enemy roster, active party index, and cursor positions from RAM. Use those to choose targets precisely. Enemy slots are arranged in a 3x3 grid (top-left is slot 0, left-to-right, top-to-bottom).

When choosing targets, prefer the enemy name or slot label from the state (e.g., `Goblin`, `Goblin Guard`). If no name is available, use the slot label `Enemy N` where N is 1-9.

The state includes a `Menu:` line decoded from the actual on-screen menu box. It tells you which battle menu is open (command / magic / item / drink), its text contents, and the cursor position. The command menu is a 2-column grid: FIGHT/MAGIC/DRINK/ITEM down the left column, RUN at the top-right. The magic menu has 4 rows (spell levels) x 3 columns over 2 pages (L1-4, L5-8). Trust the `Menu:` line over assumptions - if it says no menu is visible, the game is in target selection, a transition, or round execution, and you should wait or pick the least risky command.
