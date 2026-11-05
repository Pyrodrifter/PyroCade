---
slice: P6
stateFile: docs/STATE.md
donotCount: 3
seededFrom: 74bdbae
reads:
  - package.json
  - package-lock.json
  - .github/workflows/release.yml
  - src-tauri/tauri.conf.json
  - src-tauri/Cargo.toml
allowanceTokens: 140000
---

## The next action — verbatim

P6 — Package macOS and Linux ARM64 builds. Configure Tauri bundles, icons, runtime dependencies, artifact names, app metadata, npm scripts, and target-specific build commands for macOS ARM64 and ARM64 Linux; keep the product build free of Electron runtime packaging.

## What is settled — do not re-derive

- P1 / S01 through P5 / S05 are complete at `b9ce85e`, `bd4eb4f`, `d96b133`, `ff2ff8f`, and `74bdbae`.
- The Rust format, test, and check gates passed for P5 (17 tests); the existing `merge_object` dead-code warning remains.
- P5's `npm start` was not run; runtime behavior was not exercised.
- User data contracts distinguish filesystem paths for manuals from file URLs for artwork; preserve that distinction.
- The private runtime spec requires macOS ARM64 and Linux ARM64 support on modern Snapdragon hardware; package the full Tauri app rather than a prototype.
- Keep the product build free of Electron runtime packaging, but leave the `electron .` route in `package.json` for P9's runtime removal.
- Updater-plugin initialization remains out until its plugin config is added in the later updater slice; current manual release commands remain.
- P5 added provider-specific artwork retry/cache behavior, safe exclusive downloads, image conversion limits, and synchronized renderer/backend import replacement.

## Withdrawn — proven wrong, do not use

None.

## Code to touch

- `package.json`
- `package-lock.json`
- `.github/workflows/release.yml`
- `src-tauri/tauri.conf.json`
- `src-tauri/Cargo.toml`

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — section `Desktop Runtime Direction`.
- `.babysteps/tauri-migration.plan.md` — sections `Tauri v2 migration slices` and `Budget rows` (P6).
- `.babysteps/tauri-migration.tasks.json` — task `S07`.

## Do-Not entries that apply here

None.

Total Do-Not entries: 3.

## The gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- Run command (separate from `gateCommands`): `npm start`

## When this slice closes

Closes when S07's stated contract is complete: Tauri bundles, icons, runtime dependencies, artifact names, app metadata, npm scripts, and target-specific build commands for macOS ARM64 and ARM64 Linux are configured, and the product build is free of Electron runtime packaging.
