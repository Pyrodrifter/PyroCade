---
slice: P8
stateFile: docs/STATE.md
donotCount: 3
seededFrom: c555b43
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

- P8 implementation is committed as `c555b43` (`P8: Add native validation and release smoke checks`); P8 remains active, not complete.
- Passed: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`; `cargo test --manifest-path src-tauri/Cargo.toml` (18 passed, 0 failed); `cargo check --manifest-path src-tauri/Cargo.toml`; `actionlint .github/workflows/release.yml`. Test/check retain the existing `merge_object` unused warning.
- `npm start` built and launched Tauri; the shell timed out after 120 seconds waiting for the GUI app, and no process remained afterward.
- `npm run dist:macos:arm64` built the macOS ARM64 `.app` and DMG. `hdiutil verify` validated the DMG checksum. DMG mounting in `localTmp/` was denied; the identical `.app` was copied into `localTmp/Applications`, launched for 10 seconds, and captured. The capture confirmed the native Tauri renderer loaded the demo library.
- The Linux ARM64 release workflow was updated to install and smoke-launch its DEB on the native runner; the workflow has not been executed. Native controller/audio checks and non-macOS target WebView checks remain unverified.
- `docs/SUPPORT.md` documents artifacts, update routes, and validation limits; update the support matrix only with verified evidence.
- Do not use Electron as Tauri validation. The selected legacy Electron scripts were not run; their scratch/session/capture paths were moved under `localTmp/`, and library fixtures were made deterministic.
- P9 and P10 remain queued. Do-Not entries 1, 2, and 3 still apply; no new Do-Not faults were found.

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
