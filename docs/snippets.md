# Snippets

Snippets are reproducible button/command sequences stored under
`plays/<game>/<id>/snippets/user/`. They are useful for:

- Recording a precise interaction so it can be replayed later.
- Simulating the agent one command at a time to find reproducible bugs.
- Building small regression tests that compare before/after snapshots.

## Running snippets

In the botdeck UI, open the **User Snippets** tab on the right panel. Each
snippet can be run, edited, or deleted.

A snippet may declare a `startState`. When `startState` is provided, the
emulator loads that saved state before running the snippet steps. When
`startState` is omitted, the snippet runs against the currently loaded emulator
state, so you can iterate on whatever is on screen right now.

## File schema

Snippets are stored as JSON files named `<id>.snippet.json`.

```json
{
  "id": "open-main-menu",
  "name": "Open main menu",
  "description": "Press START to open the FF1 main menu.",
  "game": "ff1",
  "play": "0000_dev",
  "startState": "000001-start",
  "steps": [
    { "kind": "command", "command": { "name": "menu" } }
  ],
  "expectedEndState": "",
  "tags": ["ui", "menu"]
}
```

### Top-level fields

| Field | Required | Description |
| ----- | -------- | ----------- |
| `id` | yes | URL-safe identifier; becomes the filename. |
| `name` | yes | Human-readable label shown in the list. |
| `description` | yes | Short summary of what the snippet does. |
| `game` | yes | Game segment, e.g. `ff1`. |
| `play` | yes | Play segment, e.g. `0000_dev`. |
| `startState` | no | Saved-state base name to load before running. Omit to use the current emulator state. |
| `steps` | yes | Array of snippet steps (see below). |
| `expectedEndState` | no | Optional saved-state base name the snippet is expected to produce. |
| `tags` | no | Array of string tags for grouping/filtering. |

## Step kinds

Each step is one of three kinds.

### command

Compile a high-level `GameCommand` through the active game plugin and play the
resulting button macro. This is the same path the agent uses, so it respects
current state, target resolution, A* pathfinding, and so on.

```json
{
  "kind": "command",
  "command": {
    "name": "goto",
    "args": { "location": "Coneria" }
  }
}
```

### macro

Play a raw list of `ButtonStep`s without going through the plugin compiler.
Use this when you need exact frame-level control.

```json
{
  "kind": "macro",
  "buttonSteps": [
    { "button": 0, "holdFrames": 4, "gapFrames": 4 },
    { "button": 0, "holdFrames": 4, "gapFrames": 4 }
  ]
}
```

Button indices match the NES controller: A=0, B=1, SELECT=2, START=3, UP=4,
DOWN=5, LEFT=6, RIGHT=7.

### wait

Pause for a number of emulated frames before continuing.

```json
{
  "kind": "wait",
  "frames": 60
}
```

## Commands

The commands available in a snippet depend on the active `GamePlugin`. The
fallback `GenericGamePlugin` exposes raw button presses; the FF1 plugin exposes
the full command set below.

### Generic plugin commands

Used when no game-specific plugin is loaded.

| Command | Description |
| ------- | ----------- |
| `a` | Press the A button. |
| `b` | Press the B button. |
| `start` | Press the Start button. |
| `select` | Press the Select button. |
| `up` | Press Up on the d-pad. |
| `down` | Press Down on the d-pad. |
| `left` | Press Left on the d-pad. |
| `right` | Press Right on the d-pad. |

### FF1 plugin - universal commands

These are offered in most contexts.

#### `interact`
Press A to talk, search, or confirm the current selection.

```json
{ "kind": "command", "command": { "name": "interact" } }
```

#### `cancel`
Press B to cancel or go back.

```json
{ "kind": "command", "command": { "name": "cancel" } }
```

#### `menu`
Press START to open or close the main menu.

```json
{ "kind": "command", "command": { "name": "menu" } }
```

#### `select`
Press SELECT to toggle cursor/target mode in menus.

```json
{ "kind": "command", "command": { "name": "select" } }
```

### FF1 plugin - field commands

Offered when the party is walking around (overworld, town, castle, dungeon,
not in a menu/dialog).

#### `goto`
Walk the party to a known location using A*.

Args:
- `location` (string): destination name or slug from the available locations list.

```json
{
  "kind": "command",
  "command": { "name": "goto", "args": { "location": "Coneria" } }
}
```

Works on the overworld and inside town/castle/dungeon maps for doors and exits.
The macro aborts if a battle or map transition occurs mid-route.

#### `grind`
Walk to a tile coordinate, then randomly walk within a Manhattan distance until
a battle starts.

Args:
- `x` (number): target tile x coordinate (overworld 0-255, standard maps 0-63).
- `y` (number): target tile y coordinate.
- `distance` (number): max distance from the center tile for the random walk.

```json
{
  "kind": "command",
  "command": { "name": "grind", "args": { "x": 154, "y": 162, "distance": 3 } }
}
```

#### `talk_to`
Walk to the named NPC if needed, face them, and press A to talk.

Args:
- `target` (string): NPC name, `"object N"`, `"npc N"`, `"slot N"`, or bare index. Omit to target the first visible object.

```json
{
  "kind": "command",
  "command": { "name": "talk_to", "args": { "target": "King of Coneria" } }
}
```

On the overworld, where no object data is tracked, this falls back to a single
A press.

#### `use_item` (field)
Open the ITEM menu and use a consumable on a party member.

Args:
- `item` (string): consumable item name or 0-based inventory index.
- `target` (string): party member name or 0-based index.

```json
{
  "kind": "command",
  "command": { "name": "use_item", "args": { "item": "Potion", "target": "Stu" } }
}
```

Only advertised when the party has at least one consumable item.

### FF1 plugin - menu commands

Offered when a menu, dialog, shop, inn, or clinic is open.

#### `menu_navigate`
Move the menu cursor.

Args:
- `direction` (string): `up`, `down`, `left`, or `right`.
- `steps` (number): how many times to press that direction.

```json
{
  "kind": "command",
  "command": { "name": "menu_navigate", "args": { "direction": "down", "steps": 2 } }
}
```

#### `menu_select`
Confirm the current menu selection (press A).

```json
{ "kind": "command", "command": { "name": "menu_select" } }
```

#### `menu_cancel`
Cancel or close the current menu layer (press B).

```json
{ "kind": "command", "command": { "name": "menu_cancel" } }
```

#### `dialog_advance`
Press A repeatedly to advance dialogue text.

Args:
- `presses` (number): how many A presses to emit. Defaults to 3.

```json
{
  "kind": "command",
  "command": { "name": "dialog_advance", "args": { "presses": 3 } }
}
```

#### `buy` (shop only)
Buy an item from the current shop.

Args:
- `item` (string): item name or 0-based shop index.
- `quantity` (number): how many to buy.

```json
{
  "kind": "command",
  "command": { "name": "buy", "args": { "item": "Potion", "quantity": 5 } }
}
```

#### `sell` (shop only)
Sell an item to the current shop.

Args:
- `item` (string): item name or 0-based inventory index.

```json
{
  "kind": "command",
  "command": { "name": "sell", "args": { "item": "Tent" } }
}
```

### FF1 plugin - battle commands

Offered when in battle. Every battle action except `menu_navigate`,
`menu_select`, and `menu_cancel` requires an `actor` argument naming the party
member whose turn it is.

#### `fight`
Attack the targeted enemy with a physical blow.

Args:
- `actor` (string): party member name.
- `target` (string): enemy name or slot.

```json
{
  "kind": "command",
  "command": { "name": "fight", "args": { "actor": "Stu", "target": "Imp (slot 0)" } }
}
```

#### `magic`
Cast a learned spell.

Args:
- `actor` (string): party member name.
- `spell` (string): spell name, e.g. `CURE` or `FIRE`.
- `target` (string): enemy name/slot or ally name/slot.

```json
{
  "kind": "command",
  "command": { "name": "magic", "args": { "actor": "Rias", "spell": "CURE", "target": "Stu" } }
}
```

#### `use_item` (battle)
Drink/use a consumable item in battle via the DRINK menu.

Args:
- `actor` (string): party member name.
- `item` (string): consumable item name or 0-based index.
- `target` (string): target party member or enemy name/slot.

```json
{
  "kind": "command",
  "command": { "name": "use_item", "args": { "actor": "Stu", "item": "Potion", "target": "Stu" } }
}
```

#### `equip`
Open the EQUIP menu for the actor in battle.

Args:
- `actor` (string): party member name.

```json
{
  "kind": "command",
  "command": { "name": "equip", "args": { "actor": "Fighter" } }
}
```

#### `run`
Attempt to flee the battle.

Args:
- `actor` (string): party member name.

```json
{
  "kind": "command",
  "command": { "name": "run", "args": { "actor": "Stu" } }
}
```

### Escape hatch - `press_button`

If a high-level command does not exist for what you need, `press_button` emits
a single raw button press.

Args:
- `button` (string): `a`, `b`, `start`, `select`, `up`, `down`, `left`, or `right`.
- `frames` (number): how many frames to hold the button. Defaults to 4.

```json
{
  "kind": "command",
  "command": { "name": "press_button", "args": { "button": "a", "frames": 6 } }
}
```

## Examples

### Advance a dialog box

```json
{
  "id": "advance-dialog",
  "name": "Advance dialog",
  "description": "Press A three times to advance a text box.",
  "game": "ff1",
  "play": "0000_dev",
  "steps": [
    { "kind": "command", "command": { "name": "dialog_advance", "args": { "presses": 3 } } }
  ]
}
```

### Walk to the inn and open the door

```json
{
  "id": "enter-coneria-inn",
  "name": "Enter Coneria Inn",
  "description": "Walk to the Coneria Inn door from the town entrance.",
  "game": "ff1",
  "play": "0000_dev",
  "startState": "000001-coneria-entrance",
  "steps": [
    { "kind": "command", "command": { "name": "goto", "args": { "location": "Coneria Inn" } } }
  ]
}
```

### Fight an imp

```json
{
  "id": "fight-imp",
  "name": "Fight Imp",
  "description": "Have Stu attack the first enemy slot.",
  "game": "ff1",
  "play": "0000_dev",
  "steps": [
    { "kind": "command", "command": { "name": "fight", "args": { "actor": "Stu", "target": "slot 0" } } }
  ]
}
```

### Raw button sequence

```json
{
  "id": "raw-a-b-start",
  "name": "Raw A B Start",
  "description": "Play A, B, then Start as raw button steps.",
  "game": "ff1",
  "play": "0000_dev",
  "steps": [
    { "kind": "macro", "buttonSteps": [
      { "button": 0, "holdFrames": 4, "gapFrames": 4 },
      { "button": 1, "holdFrames": 4, "gapFrames": 4 },
      { "button": 3, "holdFrames": 4, "gapFrames": 4 }
    ]}
  ]
}
```

### Mixed sequence: open menu, navigate, confirm

```json
{
  "id": "use-item-from-menu",
  "name": "Use Item From Menu",
  "description": "Open main menu, select ITEM, use a Potion on Stu.",
  "game": "ff1",
  "play": "0000_dev",
  "steps": [
    { "kind": "command", "command": { "name": "menu" } },
    { "kind": "wait", "frames": 10 },
    { "kind": "command", "command": { "name": "menu_select" } },
    { "kind": "command", "command": { "name": "menu_navigate", "args": { "direction": "down", "steps": 0 } } },
    { "kind": "command", "command": { "name": "menu_select" } },
    { "kind": "command", "command": { "name": "menu_navigate", "args": { "direction": "down", "steps": 0 } } },
    { "kind": "command", "command": { "name": "menu_select" } },
    { "kind": "command", "command": { "name": "use_item", "args": { "item": "Potion", "target": "Stu" } } }
  ]
}
```

## Notes

- The UI always executes the current saved content of a snippet, so you can edit
  and rerun without leaving the tab.
- Before/after snapshots are saved for every run, and a diff is computed when
  both snapshots are available.
- `startState` is optional. Omitting it makes snippets convenient for ad-hoc
  experimentation against whatever state is currently loaded.
