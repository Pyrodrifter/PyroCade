---
slice: P3
stateFile: docs/STATE.md
donotCount: 1
seededFrom: bd4eb4f
reads:
  - emulators.json
  - main.js
  - src-tauri/src/emulators.rs
  - src-tauri/src/backend.rs
  - renderer/app.js
allowanceTokens: 140000
---

## The next action — verbatim

P3 — Make the emulator catalog platform and architecture aware. Replace the Windows-versus-Linux assumption with explicit OS/CPU selection, prevent x86_64 assets from being offered to ARM64, preserve custom/manual linking, and return accurate managed/installed status for macOS ARM64 and Linux ARM64.

## What is settled — do not re-derive

- P1 / S01 is complete at `b9ce85e`; its Rust format, test, and check gates passed. The existing `merge_object` dead-code warning remains. `npm start` ran without startup panic through a 90-second smoke window; interactive dialogs and visual WebView inspection were not verified.
- P2 / S02 is complete at `bd4eb4f`; its Rust format, 7 tests, and check gates passed with the existing `merge_object` warning. The manual media payload stays a filesystem path; artwork media uses file URLs.
- P2's `npm start` run command was not run; it is separate from configured `gateCommands`.
- Updater-plugin initialization remains out until its plugin config is added in the later updater slice; current manual release commands remain.
- `package.json:24` intentionally retains an `electron .` route resolving to `main.js` via `package.json:6` for the later Electron-removal slice. This is not a Do-Not fault.
- P3's file reading set and 140,000-token allowance are priced in `.babysteps/tauri-migration.plan.md`.

## Withdrawn — proven wrong, do not use

None so far.

## Code to touch

- `emulators.json`
- `main.js`
- `src-tauri/src/emulators.rs`
- `src-tauri/src/backend.rs`
- `renderer/app.js`

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — section `Desktop Runtime Direction`.
- `.babysteps/tauri-migration.plan.md` — sections `Tauri v2 migration slices` and `Budget rows` (P3).
- `.babysteps/tauri-migration.tasks.json` — task `S03`.

## Do-Not entries that apply here

None. Total Do-Not entries: 1.

## The gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- Run command (separate from `gateCommands`): `npm start`

## When this slice closes

Closes when S03's stated contract is complete: OS/CPU selection is explicit; x86_64 assets are never offered to ARM64; custom/manual emulator linking is preserved; and managed/installed status is accurate for macOS ARM64 and Linux ARM64.
