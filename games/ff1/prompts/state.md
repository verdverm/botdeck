# Current state

{{gameInfo}}

Compare this state to the previous turn. Look for:
- Party HP/MP changes or status effects.
- Location/screen changes.
- Menu/dialog open or closed.
- New enemies, NPCs, or items.

The `Menu:` section is decoded from the actual on-screen menu boxes and is the ground truth for whether a menu is open, which menu it is, its text contents, and its cursor position. Do not assume a menu is open or closed from context - check the `Menu:` section. If it contradicts what you expected, trust it and re-orient before issuing navigation commands.

If the state is mid-transition or unclear, choose the least risky command (usually `dialog_advance` if a text box is open, `menu_select` if a menu is waiting, or a small `menu_navigate`) and observe the next state.
