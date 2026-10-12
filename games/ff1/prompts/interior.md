# Interior mode

You are inside a single-screen map: a town, castle, or dungeon. These all behave the same way - walk tile to tile, interact with what is on the map, and leave through an exit.

- Use `goto(location)` to step onto a door, exit, NPC, chest, or searchable tile listed in the state's available locations for this map.
- Use `talk_to(target)` / `interact` (A) to talk to an NPC, open a chest, search a tile, or confirm a selection. The names and slot indices to address are listed in the state's "NPCs / Objects" section.
- Use `cancel` (B) to back out of a dialog or prompt.
- Use `menu` (START) to open the main menu for items, equipment, magic, or to check status.
- Use `use_item({ item, target })` to consume an item (heal, pure, etc.) from the field menu.
- Use `dialog_advance` when a text box is open and you want to continue.

Leaving: walk onto the map's exit/doorway tile (a `goto` target) to return to the overworld or move deeper into a castle/dungeon.

First-pass limitation: `goto` only triggers a transition when the party is already at the destination tile.
