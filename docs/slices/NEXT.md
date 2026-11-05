---
slice: P2
stateFile: docs/STATE.md
donotCount: 0
seededFrom: b9ce85e
reads:
  - main.js
  - emulators.json
  - src-tauri/src/config.rs
  - src-tauri/src/backend.rs
  - renderer/app.js
allowanceTokens: 150000
---

## The next action — verbatim

P2 — Port settings and ROM library service. Complete settings load/migration/atomic save, preserve existing PyroCade data locations, scan configured ROM roots, parse gamelist.xml, select duplicate ROM copies, index local artwork/manuals, and return the existing game payload shape.

## What is settled — do not re-derive

- P1 / S01 is complete and its source is committed as `b9ce85e`.
- P1's Rust format, test (3 tests), and check gates passed; the check retains an existing dead-code warning for `merge_object`. `npm start` ran without startup panic through a 90-second smoke window. The mock bridge test passed F11 and repeat-key behavior; interactive dialogs and visual WebView inspection were not verified.
- Updater-plugin initialization remains out until its plugin config is added in the later updater slice; current manual release commands remain.
- `package.json:24` intentionally retains an `electron .` route resolving to `main.js` via `package.json:6` for the later Electron-removal slice. This is not a Do-Not fault.
- P2's file reading set and 150,000-token working allowance are priced in `.babysteps/tauri-migration.plan.md`.

## Withdrawn — proven wrong, do not use

None so far.

## Code to touch

- `main.js`
- `emulators.json`
- `src-tauri/src/config.rs`
- `src-tauri/src/backend.rs`
- `renderer/app.js`

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — section `Desktop Runtime Direction`.
- `.babysteps/tauri-migration.plan.md` — sections `Tauri v2 migration slices` and `Budget rows` (P2).
- `.babysteps/tauri-migration.tasks.json` — task `S02`.

## Do-Not entries that apply here

None. Total Do-Not entries: 0.

## The gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `npm start`

## When this slice closes

Closes when S02's stated contract is complete: settings load/migration/atomic save; existing PyroCade data locations are preserved; configured ROM roots are scanned; `gamelist.xml` is parsed; duplicate ROM copies are selected; local artwork/manuals are indexed; and the existing game payload shape is returned.
