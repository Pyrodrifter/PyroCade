# PyroCade button prompts

283 original icons with flat graphite keycaps, clear symbols and controller-specific face colours. All files have a transparent background and a consistent 64 × 64 coordinate space.

| Family | Icons |
| --- | ---: |
| Xbox | 50 |
| PlayStation | 50 |
| Nintendo | 50 |
| Generic gamepad | 50 |
| Keyboard | 74 |
| Mouse | 9 |

## Files

- `<family>/<id>.svg`: scalable source artwork.
- `png/64/<family>/<id>.png`: transparent 64 × 64 PNGs.
- `png/128/<family>/<id>.png`: transparent 128 × 128 PNGs.
- `manifest.json`: complete inventory, labels and paths. PNG paths use the same family and filename with a `.png` extension.
- `manifest.js`: browser-ready inventory used by the frontend.
- `preview.html`: offline contact sheet of every icon.

Each controller family includes four face buttons, four shoulders/triggers, four menu/system buttons, 11 D-pad variants, 13 variants for each analog stick, and a disconnected indicator. Stick variants include neutral, press, rotate, horizontal, vertical, and all eight directions. Keyboard includes A–Z, 0–9, F1–F12, modifiers, navigation, punctuation and arrows. Mouse includes buttons, scrolling, movement and dragging.

## Button positions

Face filenames describe physical positions, independent of the game being emulated:

| File | Xbox | PlayStation | Nintendo | Generic |
| --- | --- | --- | --- | --- |
| `south` | A | Cross | B | 1 |
| `east` | B | Circle | A | 2 |
| `west` | X | Square | Y | 3 |
| `north` | Y | Triangle | X | 4 |

`lb/rb/lt/rt` identify shoulder and trigger positions; the art shows the family-specific label, such as L1/R1/L2/R2 or L/R/ZL/ZR. Menu icons use `select/start/home/share` as semantic filenames. PlayStation uses Share/Options/PS/Touch, so its `share` file depicts the touchpad control. The set uses modern family conventions; older device-specific labels such as DualShock Select/Start are not separate variants.

## Frontend behavior

Automatic mode shows the most recently used keyboard/mouse or gamepad family. An idle controller does not change the prompts. Device names and common vendor IDs identify Xbox, PlayStation and Nintendo controllers; other devices use the generic set. Multiple controllers are supported. After a disconnect, held-button state is cleared.

Settings → Button prompts offers automatic mode or a fixed family. The preview updates immediately; Save & rescan persists the choice. It changes labels only, not your emulator's button mapping. Controller input uses the frontend's existing browser Gamepad button order; unusual adapters may report a different order.

Library: left stick/D-pad browses, LB/RB or D-pad up/down changes system, south plays, west opens the manual, north opens the case, LT/RT jumps ten games. Case viewer: left/right rotates, LT/RT zooms, north opens/closes the lid, east returns to the library. Keyboard Space returns from the case viewer; Escape also returns.

## Rebuild

From the project root:

```powershell
npm run prompts:build
npm run prompts:export
npm run prompts:check
```

The builder uses Node and the exporter/check use the project's existing Electron dependency. No downloads or external image service are needed. Export validates all 566 PNGs for nonempty pixels and transparent corners. The isolated UI check uses mock library/config data and never writes your real settings or launches an emulator.

Standalone usage:

```html
<img src="xbox/south.svg" width="32" height="32" alt="A" />
<img src="png/128/playstation/north.png" width="32" height="32" alt="Triangle" />
```

Use SVG for flexible sizing, or 128 px PNGs for sharp display at 32–64 px. Preserve the square canvas to keep icons aligned. UI labels remain text beside the icon for accessibility. The drawings are project-created assets; controller family names describe compatibility.
