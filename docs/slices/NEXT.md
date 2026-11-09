---
slice: P10
stateFile: docs/STATE.md
donotCount: 4
seededFrom: 3b775c9
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-to-tauri.tasks.json
  - renderer/app.js
  - renderer/tauri-bridge.js
  - src-tauri/src/backend.rs
  - src-tauri/src/config.rs
  - src-tauri/src/emulators.rs
  - scripts/check-library-ui.cjs
allowanceTokens: 104888
---

**P10 / M03 — Collection administration and per-game controls.** First
slice of the M03-M06 queue after the 2026-11-06..08 delta queue. Baseline
`tauri-port` at `3b775c9` (D09 `3b775c9` closing D01-D09, source `96fd68c..0310657`).
D09 closed: demo timelines ported, Tauri capture harnesses adapted,
README/CHANGELOG/screenshots updated, exclusions and unported stylesheets
recorded; Rust gates and runnable renderer checks passed, Electron UI
checks and capture not run on host (recorded in `docs/STATE.md`).
Main originals for M03-M06 are the `96fd68c` baseline per plan; M03 scope
absorbs the details editor, hidden list, drag order and Recomp menus added
in `64a5ba6`.

## Action

Add hide/group/rename actions, user-added systems/games, and per-game
emulator selection where missing. Keep UI calls behind the Tauri bridge
and preserve backend-owned emulator state and safe config migrations.
Absorb the details editor, hidden list, drag order and Recomp menus from
`64a5ba6` where they fit Tauri.

## Scope and exclusions

- Implement M03 collection administration behind the Tauri bridge.
- Preserve backend-owned emulator state and safe config migrations.
- Do not port Electron/Capacitor paths, Leia SR, or Windows-only flows.
- Do not restore main's Electron release.yml or checks.yml.

## Code to touch

`renderer/app.js`, `renderer/tauri-bridge.js`, `src-tauri/src/backend.rs`,
`src-tauri/src/config.rs`, `src-tauri/src/emulators.rs`,
`scripts/check-library-ui.cjs`, `docs/STATE.md`, `docs/SUPPORT.md`,
`README.md` where behaviour changes.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `docs/donot.md`
- `.babysteps/main-to-tauri.tasks.json` (M03 row)
- `renderer/app.js`, `renderer/tauri-bridge.js`, `src-tauri/src/backend.rs`,
  `src-tauri/src/config.rs`, `src-tauri/src/emulators.rs`,
  `scripts/check-library-ui.cjs`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 applies (manual paths stay filesystem paths).
Entry #4 governs Android SAF paths and is unaffected; preserve it.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check renderer/app.js`
- `node --check renderer/tauri-bridge.js`
- `node scripts/check-library-ui.cjs` if host can run it; otherwise
  record `spawn tauri-driver ENOENT` and do not claim a pass.
- `npm start` smoke where runnable; no visual inspection claimed.

## When this seed closes

Close M03 when hide/group/rename, user-added systems/games, and per-game
emulator selection are implemented behind the bridge with migration-safe
persistence, library checks assert the new behaviour (or record why they
cannot run), and verification is recorded in `docs/STATE.md` and seeded
for P11/M04 from `.babysteps/main-to-tauri.tasks.json`.
