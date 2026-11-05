# PyroCade — Tauri v2 migration

## Where the work is

The fork is migrating from Electron to Tauri v2, retaining the web renderer where practical and targeting macOS ARM64 plus ARM64 Linux on modern Snapdragon hardware. The nine slices are budgeted in `.babysteps/tauri-migration.plan.md`. P1 / S01 (`b9ce85e`), P2 / S02 (`bd4eb4f`), and P3 / S03 (`d96b133`) are complete; the next slice is P4.

**The next action is P4 / S04.**

## Next action

P4 — Port emulator install and game launch workflows. Port GitHub release checks, downloads, safe archive extraction, manifests, updates, uninstall/open-folder/file-pick/custom-emulator flows, argument parsing, process launch, and hide/restore behavior; retain progress/error contracts.

**The Do-Not list is `docs/donot.md`** — 1 entry, append-only. Never dropped, never trimmed.

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

### In progress

- **P4 / S04 — Port emulator install and game launch workflows.** Port GitHub release checks, downloads, safe archive extraction, manifests, updates, uninstall/open-folder/file-pick/custom-emulator flows, argument parsing, process launch, and hide/restore behavior; retain progress/error contracts.

### Queued

- **P5 — Port artwork download and import service.** Preserve Libretro/GameTDB sources, caching, import conversion, cancellation, and progress.
- **P6 — Package macOS and Linux ARM64 builds.** Configure Tauri bundles, icons, dependencies, artifact names, and build commands.
- **P7 — Port app update and release behavior.** Add release discovery and signed Tauri updater behavior where configured, with a manual fallback.
- **P8 — Port validation and release automation.** Adapt checks, add ARM64 release jobs, and verify target behavior.
- **P9 — Remove obsolete Electron application runtime.** Remove Electron runtime packaging after Tauri parity gates pass.
