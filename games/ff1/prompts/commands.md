# Available commands

{{commands}}

Choose exactly one command from the list above. The `name` and `args` must match the spec exactly. Prefer commands that make safe, meaningful progress toward the current goals.

## How commands work this turn

The command set changes based on the current **context** reported in the game state:

- **Field mode** (walking on the overworld or in a town): movement and interaction commands.
- **Menu mode** (main menu, shop, inn, clinic): menu navigation and selection commands.
- **Battle mode**: one action per party member per turn.

## Field commands

- `goto({ "location": "string" })` - Travel to a known location. The `location` value must be one of the IDs listed in "Available Locations" in the state. First pass: use `goto` when the party is already standing in front of the door, exit, or NPC that leads to the location; real pathfinding is future work.
- `talk_to({ "target": "string" })` - Talk to the NPC the party is currently facing. The target argument is informational.
- `interact` - Press A to talk, search, confirm, or interact with whatever is in front of the party.
- `cancel` - Press B to cancel or go back.
- `menu` - Press START to open or close the main menu.
- `select` - Press SELECT to toggle cursor/target mode in menus.

## Menu commands (advertised when a menu is open)

- `menu_navigate({ "direction": "up|down|left|right", "steps": number })` - Move the menu cursor. Use when you need to reposition the cursor before selecting.
- `menu_select` - Confirm the current menu selection (A).
- `menu_cancel` - Cancel or close the current menu layer (B).
- `buy({ "item": "string", "quantity": number })` - Buy an item from the current shop. The item name or index can be used; the compiler will navigate to it.
- `sell({ "item": "string" })` - Sell an item to the current shop.
- `stay` - Confirm a stay at the inn to restore the party.
- `heal` - Confirm healing at the clinic (revive/cure poison/stone).
- `use_item({ "item": "string", "target": "string" })` - Use a consumable item on the named target. Works in the field menu and in battle.
- `dialog_advance({ "presses": number })` - Press A repeatedly to advance dialogue. Default 3 presses.

## Battle commands (advertised while in battle)

In battle, each command names an `actor` (the party member taking the action) and, when needed, a `target`.

- `fight({ "actor": "string", "target": "string" })` - Attack an enemy. Use the enemy name or slot label from the battle state.
- `magic({ "actor": "string", "spell": "string", "target": "string" })` - Cast a learned spell if the actor has charges.
- `use_item({ "actor": "string", "item": "string", "target": "string" })` - Drink/use a consumable item in battle.
- `equip({ "actor": "string" })` - Open the EQUIP menu for the actor.
- `run({ "actor": "string" })` - Attempt to flee.

## Choosing commands

When moving toward a goal, prefer `goto(location)` with a location from the available list. When the party is in front of a shop, inn, or NPC, prefer `goto` or `talk_to` over raw `interact`. When in battle, choose one action for one party member; the turn loop will call you again after the game animation resolves.

If no safe command is obvious, use `dialog_advance` or `menu_select` only when a text box or menu is clearly waiting for input; otherwise choose the least risky navigation command and observe the next state.
