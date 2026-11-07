# PyroCade — Tauri v2 migration

## Where the work is

The base Tauri v2 migration queue is complete for macOS ARM64, Linux ARM64 on modern Snapdragon hardware, and Android ARM64. Its completed history is preserved below. A new main-to-Tauri feature-parity follow-up queue is now active; it is not a whole-branch merge. The follow-up plan is in `.babysteps/tauri-migration.plan.md`, and its approved task list is `.babysteps/main-to-tauri.tasks.json`. Existing Android support limitations and release constraints remain authoritative.

## Next action

The base migration queue's final task, **P10d — On-device renderer, controller, and audio validation**, is complete, and the first parity slice, **P1 / M01 — Renderer presentation and library-view parity**, is committed. Their verification records remain in the completed history below.

**Next action:** Start **P2 / M02 — Library state and play-history workflows** from `docs/slices/NEXT.md`.

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

- **P10c / S10c — Implement installed-emulator linking and launch on Android.** Source committed as `ac63358` (`P10c: link and launch Android emulator packages`). Emulator service links installed Android apps by package (`link_android_emulator`/`unlink_android_emulator` commands, `package` field, reverse-DNS validation), marks Android manual linking available but never managed, blocks desktop download/update/folder/file-pick paths on Android with Play Store guidance, and launches games via Android Intent ACTION_VIEW with the ROM content URI passed through unchanged. Library UI shows per-system emulator linkage state on Android.
  - Close condition: S10c's contract is complete. Rust gates passed: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml` (26 passed), and `cargo check --manifest-path src-tauri/Cargo.toml`.
  - Boundary linkage and path checks on this slice's diff found no new linkage or paths into `main.js`, `preload.js`, or `artwork.js`.
  - Post-commit guard: WITHIN at 109,766/225,000 tokens (49%); cost $0/$0.70. Do-Not count remains 4; #4 applies, no new fault was added, and no numbers were withdrawn.

- **P10d / S10d — On-device renderer, controller, and audio validation.** Android's debug build initially failed because the desktop process-launch block remained compiled after Android's intent-launch return; gated desktop-only process setup to non-Android targets. Built and installed the fresh ARM64 debug APK on an Odin2 (Android 13/API 33, WebView 101.0.4951.61). The PyroCade renderer launched visibly; the operator confirmed controller navigation works. DevTools checks confirmed stage presence, callable Gamepad API, canvas pixel output, CSS preserve-3d/perspective, and AudioContext running at 48 kHz with stereo output routed to the Odin2 speaker. Repeated Chromium tile-memory-limit warnings occurred during renderer capture; subjective audio quality was not assessed.
  - Rust gates passed: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml` (26 passed), and `cargo check --manifest-path src-tauri/Cargo.toml`. Existing dead-code warnings remain; Android build also reports unreachable/dead-code warnings for desktop-only launch helpers.
  - `README.md` and `docs/SUPPORT.md` now describe signed Android release APKs, SAF/emulator support, and the tested-device validation scope. Do-Not count remains 4; #4 applies, no new fault was added, and no numbers were withdrawn.

- **P1 / M01 — Renderer presentation and library-view parity.** Source committed as `b1b29ac` (`Port renderer presentation parity from main`). Ported the canvas ambient scene stack (ribbon, orbit, constellation, towers, loom, pixel day/night) with the idle screensaver, bookshelf and spinner layouts, flat-cover mode, real-size and worn-case options, PSP UMD and GameCube mini-disc media, and the thicker booklet model. Added the game-details-bar options and the matching renderer check assertions.
  - Close condition: the approved M01 renderer presentation and library-view scope is implemented and renderer checks were updated for the new behavior.
  - Rust gates passed: `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`, `cargo test --manifest-path src-tauri/Cargo.toml` (26 passed), and `cargo check --manifest-path src-tauri/Cargo.toml`; the existing dead-code warnings remain.
  - `node scripts/check-carousel.cjs` could not run on this host: plain `node` has no Electron `app` (`TypeError: Cannot read properties of undefined (reading 'setPath')`) and `node_modules/.bin/electron` fails with `spawn ENOEXEC`. Its new assertions are syntax-checked but unexecuted. `node scripts/check-library-ui.cjs` could not run: `spawn tauri-driver ENOENT`, and the Linux ARM64 release binary is unavailable on macOS.
  - Boundary linkage and path checks on this slice's diff found no changes to `main.js`, `preload.js`, or `artwork.js`.
  - Post-commit guard: EXHAUSTED at 247,705/225,000 tokens (110%, 1 compaction); session cost $0.15860209/$0.70. Do-Not count remains 4; no new fault was added and no numbers were withdrawn.

## Queue

- **P1 / M01 — Renderer presentation and library-view parity.** [COMPLETE] Committed as `b1b29ac`.
- **P2 / M02 — Library state and play-history workflows.** [PENDING] Depends on M01.
- **P3 / M03 — Collection administration and per-game controls.** [PENDING] Depends on M02.
- **P4 / M04 — Artwork enrichment and manual workflows.** [PENDING] Depends on M02.
- **P5 / M05 — Platform-aware launch/emulator behavior.** [PENDING] Depends on M03.
- **P6 / M06 — Parity checks, Tauri release docs, target validation.** [PENDING] Depends on M01, M04, and M05.

Task scope and planner estimates are recorded in `.babysteps/tauri-migration.plan.md`; the approved task definitions are in `.babysteps/main-to-tauri.tasks.json`.
