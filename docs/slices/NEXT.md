---
slice: P7
stateFile: docs/STATE.md
donotCount: 3
seededFrom: 3a65afa
reads:
  - main.js
  - package.json
  - .github/workflows/release.yml
  - src-tauri/src/backend.rs
  - src-tauri/tauri.conf.json
allowanceTokens: 135000
---

## The next action — verbatim

P7 — Port app update and release behavior. Replace Electron app-version/update/install behavior with Tauri-compatible release discovery and platform/architecture artifacts. Integrate signed Tauri updater artifacts where configured, with a clear manual-release fallback for package-managed installs.

## What is settled — do not re-derive

- P1–P6 are complete; P6 packaging files are committed in `3a65afa`.
- P6 configured Tauri product packaging; Electron remains available for legacy helper scripts, while product packaging uses Tauri.
- Actual ARM64 package artifacts and workflow execution remain unverified and belong to later validation/release work.

## Withdrawn — proven wrong, do not use

None.

## Code to touch

- `main.js`
- `package.json`
- `.github/workflows/release.yml`
- `src-tauri/src/backend.rs`
- `src-tauri/tauri.conf.json`

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — section `Desktop Runtime Direction`.
- `.babysteps/tauri-migration.plan.md` — sections `Tauri v2 migration slices` and `Budget rows` (P7).
- `.babysteps/tauri-migration.tasks.json` — task `S06`.

## Do-Not entries that apply here

None.

Total Do-Not entries: 3.

## The gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- Run command (separate from `gateCommands`): `npm start`

## When this slice closes

Closes when S06's stated contract is complete: Electron app-version/update/install behavior is replaced with Tauri-compatible release discovery and platform/architecture artifacts, signed Tauri updater artifacts are integrated where configured, and package-managed installs have a clear manual-release fallback.
