# Current state

{{gameInfo}}

Compare this state to the previous turn. Look for:
- Party HP/MP changes or status effects.
- Location/screen changes.
- Menu/dialog open or closed.
- New enemies, NPCs, or items.

If the state is mid-transition or unclear, choose the least risky command (usually `dialog_advance` if a text box is open, `menu_select` if a menu is waiting, or a small `menu_navigate`) and observe the next state.
