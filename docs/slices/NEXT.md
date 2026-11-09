---
slice: P11
stateFile: docs/STATE.md
donotCount: 4
seededFrom: f94d879
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-to-tauri.tasks.json
  - artwork.js
  - renderer/art.js
  - renderer/artwork-ui.js
  - src-tauri/src/artwork.rs
  - src-tauri/src/backend.rs
  - scripts/check-artwork.cjs
  - scripts/check-artwork-ui.cjs
  - .operator/specs/artwork-service.md
allowanceTokens: 122706
---

**P11 / M04 — Artwork and manual workflows.** Second slice of the
M03-M06 queue after M03. Baseline `tauri-port` at `f94d879`
(P10 `f94d879` closing M03). P10 closed: hide/group/rename, user-added
systems/games, per-game emulator selection, details editor, hidden list
and drag order implemented behind the bridge with migration-safe
persistence; Rust gates passed (47 tests), `node --check` passed,
`check-library-ui` recorded `spawn tauri-driver ENOENT` (see
`docs/STATE.md`). Main originals for M04 are the `96fd68c` baseline
per plan; cover providers were moved to D07.

## Action

Compare main's LaunchBox and ScreenScraper artwork/data sources and
manual discovery/download/viewing against current Rust Libretro/GameTDB
support. Port only compatible provider behavior through the Rust
artwork service, preserving safe writes, import replacement,
cancellation, progress, backend-library synchronization, and the
filesystem-path payload contract.

## Scope and exclusions

- Implement M04 artwork/manual behavior behind the Tauri bridge.
- Preserve safe writes, import replacement, cancellation, progress.
- Preserve the filesystem-path payload contract (Do-Not #1).
- Do not port Electron/Capacitor paths, Leia SR, or Windows-only flows.
- Do not restore main's Electron release.yml or checks.yml.

## Code to touch

`artwork.js`, `renderer/art.js`, `renderer/artwork-ui.js`,
`src-tauri/src/artwork.rs`, `src-tauri/src/backend.rs`,
`scripts/check-artwork.cjs`, `scripts/check-artwork-ui.cjs`,
`docs/STATE.md`, `docs/SUPPORT.md`, `README.md` where behaviour changes.

## Read these first

- `.operator/specs/artwork-service.md`
- `.operator/specs/desktop-runtime.md`
- `docs/donot.md`
- `.babysteps/main-to-tauri.tasks.json` (M04 row)
- `artwork.js`, `renderer/art.js`, `renderer/artwork-ui.js`,
  `src-tauri/src/artwork.rs`, `src-tauri/src/backend.rs`,
  `scripts/check-artwork.cjs`, `scripts/check-artwork-ui.cjs`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 applies (manual paths stay filesystem paths).
Entry #4 governs Android SAF paths and is unaffected; preserve it.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check scripts/check-artwork.cjs`
- `node --check scripts/check-artwork-ui.cjs`
- `node scripts/check-artwork.cjs` if host can run it; otherwise record
  why it cannot run and do not claim a pass.
- `npm start` smoke where runnable; no visual inspection claimed.

## When this seed closes

Close M04 when compatible LaunchBox/ScreenScraper behavior and manual
discovery/download/viewing are implemented behind the bridge with safe
writes, import replacement, cancellation, progress, backend sync, and
the filesystem-path contract, artwork checks assert the new behaviour
(or record why they cannot run), and verification is recorded in
`docs/STATE.md` and seeded for P12/M05 from
`.babysteps/main-to-tauri.tasks.json`.
