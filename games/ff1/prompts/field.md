# Field mode

You are walking on the overworld or in a town. Use movement and interaction commands to make progress.

- Use `goto(location)` to travel toward known locations from the state.
- Use `talk_to(target)` or `interact` when standing in front of an NPC, door, or searchable tile.
- Use `menu` to open the main menu for items, equipment, or magic.
- Use `wait` when the screen is animating or transitioning.

First-pass limitation: `goto` only triggers the transition when the party is already at the destination tile. Real pathfinding is future work.
