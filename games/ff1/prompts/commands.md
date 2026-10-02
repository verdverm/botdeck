# Available commands

{{commands}}

Choose exactly one command from the list above. The `name` and `args` must match the spec exactly. Prefer commands that make safe, meaningful progress toward the current goals.

## Command details

- `wait` - Do nothing this turn. Useful when waiting for an animation, dialogue, or battle phase to finish.
- `move { "direction": "up" | "down" | "left" | "right" }` - Move one step in the given direction on the overworld or in a standard map.
- `interact` - Press the A button. Use to talk to NPCs, open chests, search a tile, or confirm a menu selection.
- `cancel` - Press the B button. Use to close menus, go back, or decline.
- `menu` - Press START to open or close the main menu.
- `select` - Press SELECT to toggle cursor/target mode in menus.
- `use_item` - Open the ITEM menu, navigate to the first consumable item, and attempt to use it on the lead party member. Only available when the party actually has a usable consumable.

When moving toward a goal, prefer `move` with the exact direction required. When in a menu, use `interact` to confirm and `cancel` to go back.
