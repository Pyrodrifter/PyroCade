---
slice: P8
stateFile: docs/STATE.md
donotCount: 3
seededFrom: 4692cb5
reads:
  - package.json
  - scripts/check-library-ui.cjs
  - scripts/check-carousel.cjs
  - scripts/check-artwork-ui.cjs
  - .github/workflows/release.yml
  - src-tauri/src/lib.rs
  - src-tauri/src/backend.rs
  - src-tauri/src/emulators.rs
  - src-tauri/src/artwork.rs
allowanceTokens: 155000
---

## The next action — verbatim

P8 — Port validation and release automation. Replace or adapt Electron-bound checks, add observable tests for migrated public behavior, configure native ARM64 Linux and macOS release jobs, smoke-test installed artifacts and controller/audio/rendering paths, and document the fork's support matrix.

## What is settled — do not re-derive

- P1–P7 are complete; P7 source commits are `39b7d24` and `4692cb5`.
- Signed Tauri updater artifacts and the GitHub updater manifest are conditional on `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_UPDATER_PUBLIC_KEY`; the password secret is needed only for an encrypted key. Package-managed Linux installs use the release package/manual path.
- Actual ARM64 builds, published signed artifacts, and release workflow execution remain unverified.
- Legacy Electron sources remain for P9 removal.

## Withdrawn — proven wrong, do not use

None.

## Code to touch

- `package.json`
- `scripts/check-library-ui.cjs`
- `scripts/check-carousel.cjs`
- `scripts/check-artwork-ui.cjs`
- `.github/workflows/release.yml`
- `src-tauri/src/lib.rs`
- `src-tauri/src/backend.rs`
- `src-tauri/src/emulators.rs`
- `src-tauri/src/artwork.rs`

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — section `Desktop Runtime Direction`.
- `.operator/specs/artwork-service.md` — section `Contract`.
- `.babysteps/tauri-migration.plan.md` — sections `Tauri v2 migration slices` and `Budget rows` (P8).
- `.babysteps/tauri-migration.tasks.json` — task `S08`.

## Do-Not entries that apply here

1, 2, and 3.

Total Do-Not entries: 3.

## The gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `actionlint .github/workflows/release.yml`
- Run command (separate from `gateCommands`): `npm start`

## When this slice closes

Closes when Electron-bound checks are replaced or adapted, observable tests cover migrated public behavior, native ARM64 Linux and macOS release jobs are configured, installed artifacts and controller/audio/rendering paths are smoke-tested, and the support matrix is documented.
