# Clinic mode

You are at a clinic counter. The clinic can revive dead party members, cure poison, or cure stone for a fee.

- `heal` - confirm healing at the clinic (revive/cure poison/stone).
- `menu_select` - confirm a prompt.
- `menu_cancel` - back out of a dialog.
- `dialog_advance` - advance the staff text.

First-pass limitation: if `heal` does not land on the correct option, use `menu_navigate` to move the cursor and then `menu_select`.
