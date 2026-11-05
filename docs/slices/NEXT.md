---
slice: P5
stateFile: docs/STATE.md
donotCount: 3
seededFrom: ff2ff8f
reads:
  - artwork.js
  - renderer/artwork-ui.js
  - renderer/art.js
  - src-tauri/src/artwork.rs
  - src-tauri/src/backend.rs
allowanceTokens: 150000
---

## The next action — verbatim

P5 — Port artwork download and import service. Port Libretro and Switch artwork lookup, cached indexes, image validation/conversion, safe non-overwriting downloads, import replacement, library media updates, cancellation, status snapshots, and progress events.

## What is settled — do not re-derive

- P1 / S01 through P4 / S04 are complete at `b9ce85e`, `bd4eb4f`, `d96b133`, and `ff2ff8f`.
- The Rust format, test, and check gates passed for P4 (14 tests); the existing `merge_object` dead-code warning remains.
- P4's `npm start` built and launched `target/debug/pyrocade`, then reached the 90-second tool timeout; no process remained afterward. Interactive workflows and visual WebView behavior were not verified.
- User data contracts distinguish filesystem paths for manuals from file URLs for artwork; preserve that distinction.
- The private runtime spec requires managed macOS ARM64 and Linux ARM64 assets when upstream publishes compatible builds, preserving `.app` bundles through install and launch.
- Updater-plugin initialization remains out until its plugin config is added in the later updater slice; current manual release commands remain.
- `package.json:24` intentionally retains an `electron .` route resolving to `main.js` via `package.json:6` for the later Electron-removal slice. This is not a Do-Not fault.

## Withdrawn — proven wrong, do not use

None.

## Code to touch

- `artwork.js`
- `renderer/artwork-ui.js`
- `renderer/art.js`
- `src-tauri/src/artwork.rs`
- `src-tauri/src/backend.rs`

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — section `Desktop Runtime Direction`.
- `.babysteps/tauri-migration.plan.md` — sections `Tauri v2 migration slices` and `Budget rows` (P5).
- `.babysteps/tauri-migration.tasks.json` — task `S05`.

## Do-Not entries that apply here

- #1

Total Do-Not entries: 3.

## The gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- Run command (separate from `gateCommands`): `npm start`

## When this slice closes

Closes when S05's stated contract is complete: Libretro and Switch artwork lookup, cached indexes, image validation/conversion, safe non-overwriting downloads, import replacement, library media updates, cancellation, status snapshots, and progress events are ported to Tauri.
