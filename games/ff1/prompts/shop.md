# Shop mode

You are in a shop, inn counter, or similar menu. The available commands are limited to menu actions.

- `buy({ item, quantity })` - purchase an item. The cursor must already be on the desired item.
- `sell({ item })` - sell an item.
- `use_item({ item, target })` - use a consumable item from the field menu.
- `interact` / `cancel` / `menu` - navigate menus.
- `wait` - let the shopkeeper dialog advance.

First-pass limitation: menu cursor navigation is not implemented. Use these commands only when the cursor is already on the correct option.
