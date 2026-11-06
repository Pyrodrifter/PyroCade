# PyroCade — Tauri v2 migration

## Where the work is

The fork is migrating from Electron to Tauri v2, retaining the web renderer where practical and targeting macOS ARM64 plus ARM64 Linux on modern Snapdragon hardware. The ten slices are budgeted in `.babysteps/tauri-migration.plan.md`. P1 / S01 (`b9ce85e`), P2 / S02 (`bd4eb4f`), P3 / S03 (`d96b133`), P4 / S04 (`ff2ff8f`), P5 / S05 (`74bdbae`), P6 / S07 (`3a65afa`), P7 / S06 (`39b7d24`, `4692cb5`), P8 / S08 (`c555b43`, `2895559`), and P9 / S09 (`c5525fc`) are complete. Android Rust target and debug APK build/install on device succeeded; the release APK is unsigned and withheld from uploads. Android folder selection/URI access and installed-emulator linking/launch remain unimplemented. **The next action** is P10a — Sign and publish the Android release APK.

## Next action

**P10a — Sign and publish the Android release APK.** Configure Tauri Android signing (keystore, alias, password) and integrate it into the CI workflow so the release APK is signed and uploaded to release artifacts, while the debug build remains unsigned.

**The Do-Not list is `docs/donot.md`** — 4 entries, append-only. Never dropped, never trimmed.

## Task queue

### Completed

- BabySteps limits and the ten-slice Tauri plan are recorded.
- **P1 / S01 — Complete Tauri window and renderer bridge.** Source committed as `b9ce85e` (`P1: complete Tauri window and renderer bridge`). Exact action: "P1 — Complete Tauri window and renderer bridge. Finish Tauri startup from the existing renderer, wire the current `window.api` surface to Rust commands, and preserve progress/toast events and local asset URLs."
  - Close condition: "Closes when the selected Rust gates pass and `npm start` launches the renderer with the bridge available." `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed; `cargo test --manifest-path src-tauri/Cargo.toml` passed (3 tests); `cargo check --manifest-path src-tauri/Cargo.toml` passed with the existing `merge_object` dead-code warning.
  - `npm start` built and ran without startup panic through a 90-second smoke window, then was stopped. The mock bridge test passed F11 and repeat-key behavior. Interactive dialogs were not verified and the WebView was not visually inspected.
  - Runtime startup required leaving updater-plugin initialization out until its plugin config is added in the later updater slice; current manual release commands remain. Initial scaffold compile errors were corrected: missing imports, opener `PathBuf`/string calls, async mutex-guard scope, and ZIP API return type.
  - Boundary: `package.json:24` retains an `electron .` route resolving to `main.js` via `package.json:6`; this is intentionally left for the later Electron-removal slice, not a Do-Not fault.
  - Post-commit guard: NEAR at 202,421/225,000 tokens (90%); measured session cost $0.15114795/$0.70, within the cost stop threshold. The P1 brief reported no withdrawn numbers and no applicable Do-Not entries (count 0).

- **P2 / S02 — Port settings and ROM library service.** Source committed as `bd4eb4f` (`fix(tauri): preserve ROM media compatibility`). The settings migration/save path and data-directory mapping were already implemented; the slice restored the manual-path payload contract, legacy local-media aliases/formats, title normalization, and duplicate-ROM selection behavior.
  - Close condition: settings load/migration/atomic save; existing PyroCade data locations; configured ROM scanning; `gamelist.xml` parsing; duplicate selection; local artwork/manual indexing; and the existing game payload shape. Rust gates passed: format check, 7 tests, and cargo check (existing `merge_object` dead-code warning).
  - `npm start` launched `tauri dev` without startup error and stayed running through the 90-second smoke window; the tool timeout stopped it. No visual inspection was performed. Boundary linkage and path checks found no references into `main.js`, `preload.js`, or `artwork.js`.
  - Post-commit guard: WITHIN at 145,692/225,000 tokens (65%); session cost $0.090936/$0.70. Do-Not count increased from 0 to 1; new entry #1 records the manual-path/file-URL mismatch.

- **P3 / S03 — Make the emulator catalog platform and architecture aware.** Source committed as `d96b133` (`feat: add macOS and ARM64 emulator support`). Catalog selection now keys on OS and CPU, with managed macOS ARM64 app bundles/binaries and Linux ARM64 AppImages where upstream publishes them. Custom/manual linking remains available; legacy manifests without target metadata are trusted only on the prior x86_64 targets.
  - Close condition: explicit OS/CPU selection; x86_64 assets are never offered to ARM64; custom/manual linking is preserved; managed/installed status is target-aware for macOS ARM64 and Linux ARM64.
  - Rust gates passed: format check, 12 tests, and cargo check. The existing `merge_object` dead-code warning remains. Node syntax checks and `emulators.json` parsing passed.
  - `npm start` and macOS runtime behavior were not exercised. The boundary guide was absent; a diff-scoped review found no new linkage to `preload.js` or `artwork.js`, and managed bundle paths stay under the emulator data directory.
  - Post-commit guard: NEAR at 220,515/225,000 tokens (98%); session cost $0.20465935/$0.70, within the cost stop threshold. The Do-Not count remains 1; no withdrawn numbers or applicable Do-Not entries were reported.

- **P4 / S04 — Port emulator install and game launch workflows.** Source committed as `ff2ff8f` (`fix: harden emulator launch and ZIP extraction`). The Tauri emulator service covers GitHub release checks, downloads/progress, manifests and updates, uninstall/folder/file/custom-emulator flows, argument parsing, launch, and hide/restore. This slice rejects unsafe ZIP member paths before extraction and reaps launched emulator children when the window remains visible.
  - Close condition: S04's stated contract is complete. Rust gates passed: format check, 14 tests, and cargo check; the existing `merge_object` dead-code warning remains.
  - `npm start` built and launched `target/debug/pyrocade`, then reached the 90-second tool timeout; the process was no longer present afterward. Interactive emulator workflows and visual WebView behavior were not verified.
  - Boundary linkage check found no new references to `main.js`, `preload.js`, or `artwork.js`; the slice changed only `src-tauri/src/backend.rs` and `src-tauri/src/emulators.rs`. The boundary note was absent.
  - Post-commit guard: WITHIN at 166,913/225,000 tokens (74%); session cost $0.13497802/$0.70. Do-Not count increased from 1 to 3; entries #2 and #3 record child reaping and unsafe ZIP-path rejection.

- **P5 / S05 — Port artwork download and import service.** Source committed as `74bdbae` (`Port artwork service parity to Tauri`). The Rust service now refreshes cached indexes once per requested key when retrying, prefers Libretro's US then Europe/World matches, preserves non-overwriting writes across races, bounds converted image pixels, and updates backend game media when an import replaces an image.
  - Close condition: Libretro and Switch artwork lookup, cached indexes, image validation/conversion, safe non-overwriting downloads, import replacement, library media updates, cancellation, status snapshots, and progress events are ported to Tauri.
  - Rust gates passed: format check, 17 tests, and cargo check. The existing `merge_object` dead-code warning remains. `npm start` was not run; runtime behavior was not exercised.
  - Boundary linkage and paths passed: the diff changed only `src-tauri/src/artwork.rs` and introduced no links to `main.js`, `preload.js`, or `artwork.js`. The boundary guide was absent.
  - Post-commit guard: WITHIN at 169,518/225,000 tokens (75%); session cost $0.17537604/$0.70. The Do-Not count remains 3; #1 applies, no new fault was added, and no numbers were withdrawn.

- **P6 / S07 — Package macOS and Linux ARM64 builds.** Source committed as `3a65afa` (`build: package macOS and Linux ARM64 releases`). Electron Builder configuration and dependency were removed; Electron remains for existing helper scripts. Tauri ARM64 target scripts already existed and are invoked by the new macOS/Linux ARM64 CI jobs. Tauri metadata includes the existing PNG/ICO assets, app metadata, and macOS minimum version; Debian and RPM runtime dependencies are configured.
  - Close condition: S07's stated contract is complete: Tauri bundles, icons, runtime dependencies, artifact names, app metadata, npm scripts, and target-specific build commands for macOS ARM64 and ARM64 Linux are configured, and the product build is free of Electron runtime packaging.
  - Rust gates passed: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml` (17 tests), and `cargo check --manifest-path src-tauri/Cargo.toml`. Test/check retain the existing `merge_object` dead-code warning.
  - `npm start` reached `target/debug/pyrocade`, remained active for 30 seconds, then the process group was stopped. No visual inspection or target build was performed; actual ARM64 bundles and workflow execution remain unverified.
  - Boundary linkage and path checks found no new linkage to `main.js`, `preload.js`, or `artwork.js`; changed slice paths are packaging config/workflow/lock files only. `.babysteps/babysteps-boundary.md` was absent.
  - Post-commit guard: WITHIN at 123,826/225,000 tokens (55%); cost $0.0598383/$0.70. Do-Not count remains 3; no new fault, no applicable Do-Not entry, and no withdrawn numbers.

- **P7 / S06 — Port app update and release behavior.** Source committed as `39b7d24` (`Add signed Tauri app updates`) and `4692cb5` (`Harden release workflow shell handling`). Tauri release discovery now uses the signed updater when configured on macOS ARM64 and Linux ARM64 AppImages; package-managed Linux installs use the manual release path. The ARM64 workflow publishes an updater manifest only when signed artifacts are present; Electron sources remain for P9.
  - Close condition: S06's stated contract is complete: Electron app-version/update/install behavior is replaced with Tauri-compatible release discovery and platform/architecture artifacts, signed Tauri updater artifacts are integrated where configured, and package-managed installs have a clear manual-release fallback.
  - Rust gates passed: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml` (18 tests), and `cargo check --manifest-path src-tauri/Cargo.toml`. The existing `merge_object` dead-code warning remains. `actionlint .github/workflows/release.yml` passed.
  - `npm start` built `target/debug/pyrocade` and stayed active through a 60-second smoke window; its process group was stopped. No visual inspection, signed update installation, ARM64 build, or release workflow execution was performed.
  - Boundary linkage and path checks found no new references into `main.js`, `preload.js`, or `artwork.js`; the boundary guide was absent.
  - Post-commit guard after `4692cb5`: WITHIN at 148,172/225,000 tokens (66%); cost $0.10602815/$0.70. Do-Not count remains 3; no applicable entry, new fault, or withdrawn number.

- **P8 / S08 — Port validation and release automation.** P8 implementation was committed as `c555b43` (`P8: Add native validation and release smoke checks`); the completion code commit is `2895559` (`P8: smoke-test Tauri on native ARM64 WebView`).
  - Close condition: "Closes when Electron-bound checks are replaced or adapted, observable tests cover migrated public behavior, native ARM64 Linux and macOS release jobs are configured, installed artifacts and controller/audio/rendering paths are smoke-tested, and the support matrix is documented."
  - Passed `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml` (19 passed), and `cargo check --manifest-path src-tauri/Cargo.toml`; each Rust invocation showed the existing `backend.rs::merge_object` dead-code warning. `actionlint .github/workflows/release.yml` passed.
  - The native ARM64 Linux `.deb` was built in Apple Container, installed, and passed a Tauri WebDriver smoke in WebKit covering the Gamepad API query/event, AudioUI `AudioContext` creation, canvas pixel, and 3D transform. Debian bundling and installed runtime passed. The full local AppImage bundle attempt failed in `linuxdeploy` in Apple Container.
  - The native macOS ARM64 app and DMG were built. The host denied mounting the DMG; a copied `.app` bundle launched successfully. Native DMG mounting was not possible here, and CI retains the DMG install/smoke job. `npm start` started the Tauri dev app and stayed alive through its smoke window.
  - `docs/SUPPORT.md` documents artifacts, update routes, and validation limits. Do-Not count remains 3; no new Do-Not entry was added, and no numbers were withdrawn.

- **P9 / S09 — Remove obsolete Electron application runtime.** Committed as `c5525fc` (`P9: remove obsolete Electron app runtime`). Removed the Electron app entrypoint, preload bridge, and launcher; retained Electron as a dev dependency for existing checks and asset/demo tooling.
  - Close condition: S09's contract is complete: Tauri parity gates passed, Electron main/preload/runtime packaging and the obsolete app-launch command were removed, and the built Tauri release artifact contains no Electron runtime.
  - Rust gates passed: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml` (19 passed), and `cargo check --manifest-path src-tauri/Cargo.toml`; each test/check showed the existing `backend.rs::merge_object` dead-code warning.
  - Built the macOS ARM64 `.app` and DMG. The `.app` contains the Tauri executable, icon, and plist; no Electron runtime, `app.asar`, or `node_modules` was present. The package lock remains unchanged because Electron is still a development dependency for tooling.
  - Boundary checks on this slice's diff found no new linkage or paths into `main.js`, `preload.js`, or `artwork.js`; the deleted runtime paths and package launcher were removed.
  - Post-commit guard: WITHIN at 141,114/225,000 tokens (63%); session cost $0.06328219/$0.70. Do-Not count remains 3; #1 applies, no new fault was added, and no numbers were withdrawn.

## Queued

- **P10 — Re-cut into sub-slices.** Android Rust target and debug APK build/install on device succeeded; the release APK is unsigned and withheld from uploads. Re-cut into:
  - **P10a — Sign and publish the Android release APK.** Configure Tauri Android signing (keystore, alias, password) and integrate it into the CI workflow so the release APK is signed and uploaded to release artifacts, while the debug build remains unsigned.
  - **P10b — Implement Storage Access Framework (SAF) storage and import.** Replace filesystem-path-based storage on Android with URI-aware I/O using persistent document-tree grants, since Tauri's dialog plugin does not support Android folder picking.
  - **P10c — Implement installed-emulator linking and launch on Android.** Link installed emulators from the Android device and support launching them, adapting the existing emulator service for Android's package-based emulator model.
  - **P10d — On-device renderer, controller, and audio validation.** Verify the renderer bridge, controller input, and audio paths on Android hardware, then update the support and validation documentation.
