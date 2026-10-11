# Overworld mode

You are on the world map (the overworld). Move the party between towns, dungeons, and points of interest, and manage travel.

- Use `goto(location)` to travel toward a known location listed in the state. It only triggers the entrance transition when the party is already at the destination tile; real pathfinding is future work.
- Use `grind({ x, y, distance })` to walk to a tile and wander nearby until a random battle starts.
- Use `talk_to` / `interact` when the party is facing an NPC, event tile, or entrance.
- Use `menu` to open the main menu for items, equipment, or magic.
- Use `dialog_advance` when a text box is open.

On the overworld, locations are cities, caves, castles, and landmarks. Entering one switches the game into an interior map.
