---
slice: P3
stateFile: docs/STATE.md
donotCount: 4
seededFrom: feature-parity-plan
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - .babysteps/main-to-tauri.tasks.json
  - .operator/specs/desktop-runtime.md
  - docs/donot.md
  - renderer/app.js
  - renderer/tauri-bridge.js
  - src-tauri/src/backend.rs
  - src-tauri/src/config.rs
  - src-tauri/src/emulators.rs
  - scripts/check-library-ui.cjs
allowanceTokens: 130000
---

**P3 / M03 — Collection administration and per-game controls.** Depends on M02. M02 is committed as `3e1432c`.

Baseline: `tauri-port` at `3e1432c`; compare against `main` as needed.

The 184,286-token estimate fits the 225,000-token work budget but exceeds the local host's 153,354-token usable window; use the configured model context for this slice.

## Action

Add hide/group/rename actions, user-added systems/games, and per-game emulator selection where missing. Keep UI calls behind the Tauri bridge and preserve backend-owned emulator state and safe config migrations.

## Scope and exclusions

- Keep the existing renderer payload and backend-owned state behavior intact; make Tauri bridge/backend changes only if necessary to honor that existing behavior contract.
- Keep Tauri v2 as the product runtime. Do not port all of `main` or reintroduce Electron `main.js`/`preload.js`, the separate Capacitor Android project, or the Windows launcher from `main`.
- Preserve existing desktop/Android target and release constraints. Existing docs/specs remain authoritative, especially Android support limitations and `docs/donot.md`.
- Do not change the approved task list's scope, estimates, or priority order.

## Code to touch

M03 renderer, bridge, and Rust state/config/emulators work, plus the library check. Keep new persistence behind the Tauri bridge and migration-safe config handling.

## Read these first

- `docs/STATE.md`
- `.operator/specs/desktop-runtime.md`
- `docs/donot.md`
- `renderer/app.js`
- `renderer/tauri-bridge.js`
- `src-tauri/src/backend.rs`
- `src-tauri/src/config.rs`
- `src-tauri/src/emulators.rs`
- `scripts/check-library-ui.cjs`

## Do-Not entries that apply here

Total Do-Not count: 4. Consult `docs/donot.md` before changing paths or state payloads; entry #1 applies if manual paths are touched; entry #4 applies to Android SAF handling.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node scripts/check-carousel.cjs`
- `node scripts/check-library-ui.cjs`

## When this seed closes

Close M03 when hide/group/rename, user-added systems/games, and per-game emulator selection are implemented or verified present with migration-safe persistence and focused checks; record the result in `docs/STATE.md` and seed P4/M04 according to `.babysteps/tauri-migration.plan.md` and `.babysteps/main-to-tauri.tasks.json`.
