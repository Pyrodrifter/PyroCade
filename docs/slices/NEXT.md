---
slice: P10
stateFile: docs/STATE.md
donotCount: 3
seededFrom: c5525fc
reads:
  - package.json
  - .github/workflows/release.yml
  - src-tauri/Cargo.toml
  - src-tauri/tauri.conf.json
  - src-tauri/src/lib.rs
  - src-tauri/src/backend.rs
  - src-tauri/src/config.rs
  - src-tauri/src/emulators.rs
  - renderer/tauri-bridge.js
  - README.md
---

# P10 — Add Android ARM64 target

## Next action

P10 — Add Android ARM64 target. Add Android ARM64 as an additional supported Tauri target without regressing macOS/Linux ARM64. Configure Android project/build metadata and a reproducible ARM64 CI build using the Android SDK and JDK; verify the renderer bridge, app permissions, storage/import, emulator-linking and launch behavior, controller/audio/rendering paths, and artifact installation on Android. Document the Android support and validation matrix. Use the Android SDK and tools already installed in the local environment for device or emulator validation when available.

Closes when Android ARM64 build and installation, bridge, permissions, storage/import, emulator-linking and launch, controller/audio/rendering, and the documented support matrix are validated without regressing macOS/Linux ARM64.

## Settled

- P9 removed the Electron app entrypoint, preload bridge, and app launcher; Electron remains dev-only for existing tooling.
- The macOS ARM64 Tauri app and DMG build successfully and the `.app` contains no Electron runtime, `app.asar`, or `node_modules`.
- Do-Not count is 3; entry #1 remains applicable to manual filesystem paths.

## Withdrawn numbers

- None.

## Code to touch

| Path | P10 scope |
|---|---|
| `package.json` | Android build and validation commands |
| `.github/workflows/release.yml` | Reproducible Android ARM64 CI build |
| `src-tauri/Cargo.toml` | Android target/build configuration |
| `src-tauri/tauri.conf.json` | Android application metadata and permissions |
| `src-tauri/src/lib.rs` | Android host registration |
| `src-tauri/src/backend.rs` | Android runtime behavior |
| `src-tauri/src/config.rs` | Android storage/settings behavior |
| `src-tauri/src/emulators.rs` | Android emulator-linking and launch behavior |
| `renderer/tauri-bridge.js` | Android renderer bridge behavior |
| `README.md` | Android support and validation matrix |

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — `Desktop Runtime Direction`
- `.operator/specs/artwork-service.md` — `Contract`
- `.babysteps/tauri-migration.plan.md` — `Tauri v2 migration slices`, `Budget rows` (P10)
- `.babysteps/tauri-migration.tasks.json` — task `S10`

## Gate commands

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- Android ARM64 build/install and device or emulator validation when available

## Applicable Do-Not entries

- #1
