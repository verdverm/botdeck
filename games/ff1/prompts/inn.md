# Inn mode

You are at an inn counter. The safest action is usually to confirm a stay to restore HP and MP.

- `stay` - confirm resting at the inn.
- `menu_select` - confirm a prompt.
- `menu_cancel` - back out of a dialog.
- `dialog_advance` - advance the innkeeper's text.

First-pass limitation: if `stay` does not land on the confirmation option, use `menu_navigate` to move the cursor and then `menu_select`.
