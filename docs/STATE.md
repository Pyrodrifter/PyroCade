# PyroCade — Tauri v2 migration

## Where the work is

The fork is migrating from Electron to Tauri v2, retaining the web renderer where practical and targeting macOS ARM64 plus ARM64 Linux on modern Snapdragon hardware. The nine slices are budgeted in `.babysteps/tauri-migration.plan.md`. P1 / S01 (`b9ce85e`), P2 / S02 (`bd4eb4f`), P3 / S03 (`d96b133`), P4 / S04 (`ff2ff8f`), P5 / S05 (`74bdbae`), and P6 / S07 (`3a65afa`) are complete; the next slice is P7 / S06.

**The next action is P7 / S06.**

## Next action

P7 — Port app update and release behavior. Replace Electron app-version/update/install behavior with Tauri-compatible release discovery and platform/architecture artifacts. Integrate signed Tauri updater artifacts where configured, with a clear manual-release fallback for package-managed installs.

**The Do-Not list is `docs/donot.md`** — 3 entries, append-only. Never dropped, never trimmed.

## Task queue

### Completed

- BabySteps limits and the nine-slice Tauri plan are recorded.
- **P1 / S01 — Complete Tauri window and renderer bridge.** Source committed as `b9ce85e` (`P1: complete Tauri window and renderer bridge`). Exact action: “P1 — Complete Tauri window and renderer bridge. Finish Tauri startup from the existing renderer, wire the current `window.api` surface to Rust commands, and preserve progress/toast events and local asset URLs.”
  - Close condition: “Closes when the selected Rust gates pass and `npm start` launches the renderer with the bridge available.” `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed; `cargo test --manifest-path src-tauri/Cargo.toml` passed (3 tests); `cargo check --manifest-path src-tauri/Cargo.toml` passed with the existing `merge_object` dead-code warning.
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

### In progress

- None.

### Queued

- **P7 / S06 — Port app update and release behavior.** Replace Electron app-version/update/install behavior with Tauri-compatible release discovery and platform/architecture artifacts; integrate signed Tauri updater artifacts where configured, with a clear manual-release fallback for package-managed installs.
- **P8 — Port validation and release automation.** Adapt checks and release automation; verify ARM64 target behavior.
- **P9 — Remove obsolete Electron application runtime.** Remove Electron runtime packaging after Tauri parity gates pass.
