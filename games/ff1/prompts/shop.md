# Shop mode

You are in a shop, inn counter, or similar menu. The available commands are limited to menu actions.

- `buy({ item, quantity })` - purchase an item. The compiler will navigate to the named item and confirm.
- `sell({ item })` - sell an item.
- `use_item({ item, target })` - use a consumable item from the field menu.
- `menu_navigate` / `menu_select` / `menu_cancel` - navigate menus.
- `dialog_advance` - let the shopkeeper dialog advance.

First-pass limitation: shop cursor positions are read when available, but the exact buy/sell flow may need a `menu_navigate` adjustment. If a `buy` or `sell` command misses, use `menu_navigate` and `menu_select` on the next turn.
