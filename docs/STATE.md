# PyroCade — Tauri v2 migration

## Where the work is

The fork is migrating from Electron to Tauri v2, retaining the web renderer where practical and targeting macOS ARM64 plus ARM64 Linux on modern Snapdragon hardware. The nine slices are budgeted in `.babysteps/tauri-migration.plan.md`. P1 / S01 (`b9ce85e`) and P2 / S02 (`bd4eb4f`) are complete; the next slice is P3.

**The next action is P3 / S03.**

## Next action

P3 — Make the emulator catalog platform and architecture aware. Replace the Windows-versus-Linux assumption with explicit OS/CPU selection, prevent x86_64 assets from being offered to ARM64, preserve custom/manual linking, and return accurate managed/installed status for macOS ARM64 and Linux ARM64.

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
  - `npm start` was not run; it is configured as `runCommand`, not in `gateCommands`. Boundary linkage and path checks found no references into `main.js`, `preload.js`, or `artwork.js`.
  - Post-commit guard: WITHIN at 145,692/225,000 tokens (65%); session cost $0.090936/$0.70. Do-Not count increased from 0 to 1; new entry #1 records the manual-path/file-URL mismatch.

### In progress

- **P3 / S03 — Make the emulator catalog platform and architecture aware.** Replace the Windows-versus-Linux assumption with explicit OS/CPU selection, prevent x86_64 assets from being offered to ARM64, preserve custom/manual linking, and return accurate managed/installed status for macOS ARM64 and Linux ARM64.

### Queued

- **P4 — Port emulator install and game launch workflows.** Preserve release checks, downloads, extraction, manual linking, process launch, and progress events.
- **P5 — Port artwork download and import service.** Preserve Libretro/GameTDB sources, caching, import conversion, cancellation, and progress.
- **P6 — Package macOS and Linux ARM64 builds.** Configure Tauri bundles, icons, dependencies, artifact names, and build commands.
- **P7 — Port app update and release behavior.** Add release discovery and signed Tauri updater behavior where configured, with a manual fallback.
- **P8 — Port validation and release automation.** Adapt checks, add ARM64 release jobs, and verify target behavior.
- **P9 — Remove obsolete Electron application runtime.** Remove Electron runtime packaging after Tauri parity gates pass.
