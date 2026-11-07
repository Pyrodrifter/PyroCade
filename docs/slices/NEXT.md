---
slice: P2
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
  - renderer/library-ui.js
  - renderer/tauri-bridge.js
  - src-tauri/src/backend.rs
  - src-tauri/src/config.rs
  - scripts/check-library-ui.cjs
allowanceTokens: 135000
---

**P2 / M02 — Library state and play-history workflows.** Depends on M01. M01 is committed as `b1b29ac`.

Baseline: `tauri-port` at `b1b29ac`; compare against `main` at `96fd68ce93c67299b2354db26d6eebe8aed4f6be`.

The 177,773-token estimate fits the 225,000-token work budget but exceeds the local host's 153,354-token usable window; use the configured model context for this slice.

## Action

Add and persist favorites, recently played and play time, sorting and filtering, multidisc handling, and screenshots where missing. Preserve the renderer game payload and backend-owned state contracts with migration-safe config handling and focused renderer/Rust tests.

## Scope and exclusions

- Keep the existing renderer payload and backend-owned state behavior intact; make Tauri bridge/backend changes only if necessary to honor that existing behavior contract.
- Keep Tauri v2 as the product runtime. Do not port all of `main` or reintroduce Electron `main.js`/`preload.js`, the separate Capacitor Android project, or the Windows launcher from `main`.
- Preserve existing desktop/Android target and release constraints. Existing docs/specs remain authoritative, especially Android support limitations and `docs/donot.md`.
- Do not change the approved task list's scope, estimates, or priority order.

## Code to touch

M02 renderer, bridge, and Rust state/config work, plus the library check. Keep new persistence behind the Tauri bridge and migration-safe config handling.

## Read these first

- `docs/STATE.md`
- `.operator/specs/desktop-runtime.md`
- `docs/donot.md`
- `renderer/app.js`
- `renderer/library-ui.js`
- `renderer/tauri-bridge.js`
- `src-tauri/src/backend.rs`
- `src-tauri/src/config.rs`
- `scripts/check-library-ui.cjs`

## Do-Not entries that apply here

Total Do-Not count: 4. Consult `docs/donot.md` before changing paths or state payloads; entry #1 applies if manual paths are touched.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node scripts/check-carousel.cjs`
- `node scripts/check-library-ui.cjs`

## When this seed closes

Close M02 when favorites, recently played/play time, sorting/filtering, multidisc handling, and screenshots are implemented or verified present with migration-safe persistence and focused checks; record the result in `docs/STATE.md` and seed P3/M03 or P4/M04 according to `.babysteps/tauri-migration.plan.md` and `.babysteps/main-to-tauri.tasks.json`.
