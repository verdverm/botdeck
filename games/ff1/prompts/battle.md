# Battle mode

You are in a turn-based fight. Each party member takes an action in order. The current actor is named in the state; every battle command must include an `actor` matching one of the conscious party members.

Available battle actions per actor:
- `fight({ actor, target })` - physical attack an enemy.
- `magic({ actor, spell, target })` - cast a learned spell if the actor has charges.
- `use_item({ actor, item, target })` - drink/use a consumable item.
- `equip({ actor })` - open the EQUIP menu for the actor.
- `run({ actor })` - attempt to flee.
- `wait` - wait for animations or the enemy turn.

Tactics:
- Focus fire when enemies are weak to physical damage.
- Heal allies below ~30% HP before attacking.
- Conserve MP outside of obvious threats.
- Flee only when the fight looks hopeless.

Battle state now reads the live enemy roster from RAM. Enemy names, slots, and HP are shown in the state. The active party index and battle cursor positions are also exposed.

When choosing targets, prefer the enemy name or slot label from the state (e.g., `Goblin`, `Goblin Guard`). If no name is available, use the slot label `Enemy N`.

STUB: Menu cursor navigation for actor/target/spell is not yet implemented, so commands compile to a generic confirm sequence. Cursor positions are reported so future iterations can navigate menus precisely.
