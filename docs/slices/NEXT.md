---
slice: P4
stateFile: docs/STATE.md
donotCount: 1
seededFrom: d96b133
reads:
  - main.js
  - preload.js
  - emulators.json
  - src-tauri/src/emulators.rs
  - src-tauri/src/backend.rs
  - renderer/app.js
allowanceTokens: 155000
---

## The next action — verbatim

P4 — Port emulator install and game launch workflows. Port GitHub release checks, downloads, safe archive extraction, manifests, updates, uninstall/open-folder/file-pick/custom-emulator flows, argument parsing, process launch, and hide/restore behavior; retain progress/error contracts.

## What is settled — do not re-derive

- P1 / S01 is complete at `b9ce85e`; its Rust format, test, and check gates passed. The existing `merge_object` dead-code warning remains. `npm start` ran without startup panic through a 90-second smoke window; interactive dialogs and visual WebView inspection were not verified.
- P2 / S02 is complete at `bd4eb4f`; its Rust format, 7 tests, and check gates passed with the existing `merge_object` warning. The manual media payload stays a filesystem path; artwork media uses file URLs.
- P2's `npm start` run command launched `tauri dev` without startup error through a 90-second smoke window; the tool timeout stopped the persistent process. No visual inspection was performed.
- P3 / S03 is complete at `d96b133`: OS/CPU-specific assets now include macOS ARM64 app bundles/binaries and Linux ARM64 AppImages from upstream releases; custom/manual linking and target-aware installed status remain supported.
- P3's Rust format check, 12 tests, and cargo check passed; the existing `merge_object` warning remains. Node syntax and JSON parsing passed. `npm start` and macOS runtime behavior were not exercised.
- The private runtime spec requires managed macOS ARM64 and Linux ARM64 assets when upstream publishes compatible builds, preserving `.app` bundles through install and launch.
- Updater-plugin initialization remains out until its plugin config is added in the later updater slice; current manual release commands remain.
- `package.json:24` intentionally retains an `electron .` route resolving to `main.js` via `package.json:6` for the later Electron-removal slice. This is not a Do-Not fault.

## Withdrawn — proven wrong, do not use

None so far.

## Code to touch

- `main.js`
- `preload.js`
- `emulators.json`
- `src-tauri/src/emulators.rs`
- `src-tauri/src/backend.rs`
- `renderer/app.js`

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — section `Desktop Runtime Direction`.
- `.babysteps/tauri-migration.plan.md` — sections `Tauri v2 migration slices` and `Budget rows` (P4).
- `.babysteps/tauri-migration.tasks.json` — task `S04`.

## Do-Not entries that apply here

None. Total Do-Not entries: 1.

## The gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- Run command (separate from `gateCommands`): `npm start`

## When this slice closes

Closes when S04's stated contract is complete: GitHub release checks, downloads, safe archive extraction, manifests, updates, uninstall/open-folder/file-pick/custom-emulator flows, argument parsing, process launch, hide/restore behavior, and progress/error contracts are ported to Tauri.
