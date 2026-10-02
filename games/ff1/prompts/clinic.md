# Clinic mode

You are at a clinic counter. The clinic can revive dead party members, cure poison, or cure stone for a fee.

- `heal` - confirm healing at the clinic (revive/cure poison/stone).
- `interact` - talk to the clinic staff or confirm a prompt.
- `cancel` - back out of a dialog.
- `wait` - let the healing animation and dialog finish.

First-pass limitation: cursor navigation is not implemented. Only use `heal` when the dialog is already asking for confirmation.
