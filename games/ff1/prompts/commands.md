# Available commands

{{commands}}

Choose exactly one command from the list above. The `name` and `args` must match the spec exactly. Prefer commands that make safe, meaningful progress toward the current goals.

## How commands work this turn

The command set changes based on the current **context** reported in the game state:

- **Field mode** (walking on the overworld or in a town): movement and interaction commands.
- **Menu mode** (shop, inn, main menu): menu actions like `buy`, `sell`, or `stay`.
- **Battle mode**: one action per party member per turn.

## Field commands

- `goto({ "location": "string" })` - Travel to a known location. The `location` value must be one of the IDs listed in "Available Locations" in the state. First pass: use `goto` when the party is already standing in front of the door, exit, or NPC that leads to the location; real pathfinding is future work.
- `talk_to({ "target": "string" })` - Talk to the NPC the party is currently facing. The target argument is informational.
- `interact` - Press A to talk, search, confirm, or interact with whatever is in front of the party.
- `cancel` - Press B to cancel or go back.
- `menu` - Press START to open or close the main menu.
- `select` - Press SELECT to toggle cursor/target mode in menus.
- `wait` - Do nothing this turn. Useful when waiting for an animation or dialogue.

## Menu commands (only advertised when in a menu)

- `buy({ "item": "string", "quantity": number })` - Buy an item from the current shop. First pass: the cursor must already be on the desired item.
- `sell({ "item": "string" })` - Sell an item to the current shop.
- `stay` - Confirm a stay at the inn to restore the party.
- `use_item({ "item": "string", "target": "string" })` - Use a consumable item on the named target. Only advertised when the party has a usable consumable.

## Battle commands (only advertised while in battle)

In battle, each command names an `actor` (the party member taking the action) and, when needed, a `target`.

- `fight({ "actor": "string", "target": "enemy_1 | enemy_2 | ..." })` - Attack an enemy.
- `magic({ "actor": "string", "spell": "string", "target": "enemy_1 | enemy_2 | ... | ally_name" })` - Cast a learned spell.
- `use_item({ "actor": "string", "item": "string", "target": "string" })` - Use a consumable item in battle.
- `run({ "actor": "string" })` - Attempt to flee.
- `wait` - Wait for animations or the enemy turn to resolve.

## Choosing commands

When moving toward a goal, prefer `goto(location)` with a location from the available list. When the party is in front of a shop, inn, or NPC, prefer `goto` or `talk_to` over raw `interact`. When in battle, choose one action for one party member and wait when the game is animating.

If no safe command is obvious, use `wait` and observe the next state.
