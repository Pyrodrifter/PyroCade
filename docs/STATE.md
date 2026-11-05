# PyroCade — Tauri v2 migration

## Where the work is

The fork is migrating from Electron to Tauri v2, retaining the web renderer where practical and targeting macOS ARM64 plus ARM64 Linux on modern Snapdragon hardware. The nine slices are budgeted in `.babysteps/tauri-migration.plan.md`. P1 / S01 is complete and its source is committed as `b9ce85e`; the next slice is P2 / S02.

**The next action is P2 / S02.**

## Next action

P2 — Port settings and ROM library service. Complete settings load/migration/atomic save, preserve existing PyroCade data locations, scan configured ROM roots, parse gamelist.xml, select duplicate ROM copies, index local artwork/manuals, and return the existing game payload shape.

**The Do-Not list is `docs/donot.md`** — 0 entries, append-only. Never dropped, never trimmed.

## Task queue

### Completed

- BabySteps limits and the nine-slice Tauri plan are recorded.
- **P1 / S01 — Complete Tauri window and renderer bridge.** Source committed as `b9ce85e` (`P1: complete Tauri window and renderer bridge`). Exact action: “P1 — Complete Tauri window and renderer bridge. Finish Tauri startup from the existing renderer, wire the current `window.api` surface to Rust commands, and preserve progress/toast events and local asset URLs.”
  - Close condition: “Closes when the selected Rust gates pass and `npm start` launches the renderer with the bridge available.” `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check` passed; `cargo test --manifest-path src-tauri/Cargo.toml` passed (3 tests); `cargo check --manifest-path src-tauri/Cargo.toml` passed with the existing `merge_object` dead-code warning.
  - `npm start` built and ran without startup panic through a 90-second smoke window, then was stopped. The mock bridge test passed F11 and repeat-key behavior. Interactive dialogs were not verified and the WebView was not visually inspected.
  - Runtime startup required leaving updater-plugin initialization out until its plugin config is added in the later updater slice; current manual release commands remain. Initial scaffold compile errors were corrected: missing imports, opener `PathBuf`/string calls, async mutex-guard scope, and ZIP API return type.
  - Boundary: `package.json:24` retains an `electron .` route resolving to `main.js` via `package.json:6`; this is intentionally left for the later Electron-removal slice, not a Do-Not fault.
  - Post-commit guard: NEAR at 202,421/225,000 tokens (90%); measured session cost $0.15114795/$0.70, within the cost stop threshold. The P1 brief reported no withdrawn numbers and no applicable Do-Not entries (count 0).

### In progress

- **P2 / S02 — Port settings and ROM library service.** Complete settings load/migration/atomic save, preserve existing PyroCade data locations, scan configured ROM roots, parse gamelist.xml, select duplicate ROM copies, index local artwork/manuals, and return the existing game payload shape.

### Queued

- **P3 — Make the emulator catalog platform and architecture aware.** Add OS/CPU selection and prohibit x86_64 downloads on ARM64.
- **P4 — Port emulator install and game launch workflows.** Preserve release checks, downloads, extraction, manual linking, process launch, and progress events.
- **P5 — Port artwork download and import service.** Preserve Libretro/GameTDB sources, caching, import conversion, cancellation, and progress.
- **P6 — Package macOS and Linux ARM64 builds.** Configure Tauri bundles, icons, dependencies, artifact names, and build commands.
- **P7 — Port app update and release behavior.** Add release discovery and signed Tauri updater behavior where configured, with a manual fallback.
- **P8 — Port validation and release automation.** Adapt checks, add ARM64 release jobs, and verify target behavior.
- **P9 — Remove obsolete Electron application runtime.** Remove Electron runtime packaging after Tauri parity gates pass.
