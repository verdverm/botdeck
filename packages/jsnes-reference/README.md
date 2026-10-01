# jsnes reference player

A bare-bones browser player for the vendored jsnes package.

## How to run

Serve the project root over HTTP so relative ROM paths resolve correctly:

```bash
python3 -m http.server 8000
```

Then open:

```
http://localhost:8000/packages/jsnes-reference/
```

Click **Load / Power on** to fetch the default ROM and start emulation.

## How it works

- `index.html` loads `main.js` as an ES module.
- `main.js` wires up `jsnes.NES`, the browser `Screen`, and a minimal `ScriptProcessorNode`-based audio path that mirrors `packages/botdeck/src/emulator/audio.ts`.
- The `AudioContext` is created before the NES so the emulator's `sampleRate` matches the host's real output rate.
- A requestAnimationFrame loop drives frames at the same 60.0988 Hz used by botdeck.
- Keyboard input uses `jsnes.Browser`'s `KeyboardController` from the vendored source.
- ROM data is fetched with `fetch()` and passed to `nes.loadROM()`.

## Changing the ROM

Edit the ROM path input or change the default in `index.html`. Paths are relative to `packages/jsnes-reference/index.html`.

## Controls

- D-Pad: Arrow keys
- A: X
- B: Z
- Start: Enter
- Select: Right Ctrl
