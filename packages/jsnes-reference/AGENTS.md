# AGENTS

Bare-bones browser reference player for the vendored jsnes package.

Key files:
- `main.js` - minimal jsNES boot/render loop.
- `index.html` - reference UI.

Commands:
- `pnpm --filter jsnes-reference dev`

Rules:
- Keep this package independent of botdeck and vermbot; it exists to sanity-check the vendored jsnes build.
- Do not add agent or file-API logic here.
