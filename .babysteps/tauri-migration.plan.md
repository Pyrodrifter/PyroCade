# Main-to-Tauri feature-parity follow-up

This is a feature-parity follow-up, not a whole-branch merge. At planning time, the target was `tauri-port` at `0657352aa24a7d0ef6dea19bcbda7a4f805208f0`; comparison source `main` was at `96fd68ce93c67299b2354db26d6eebe8aed4f6be`, with merge base `96aac041ee6af2b347afba60c9bb2d08b5a930df`. There were 49 main-only and 32 tauri-port-only commits.

Keep Tauri v2 as the product runtime. The six planner estimates below are each under 225,000 tokens and the configured $0.70 cap; they are estimates, not guarantees. The conservative budget-check forecast prices each allowance as output and peaks at $0.0767032. P1-P5 exceed the local host's 153,354-token usable window and need the configured model; P6 fits locally. Existing desktop/Android target and release constraints remain in force; existing docs/specs, especially the Android support limitations and `docs/donot.md`, remain authoritative.

| Slice | Task | Scope | Total tokens | Headroom | Conservative cost forecast (USD) |
|---|---|---|---:|---:|---:|
| P1 | M01 | Renderer presentation and library-view parity: ambient scenes, bookshelf/spinner and carousel refinements, physical media models, manual/booklet presentation, appearance/performance settings, renderer checks. | 179,070 | 45,930 | 0.0679070 |
| P2 | M02 | Library state and play-history workflows: favorites, recently played/play time, sorting/filtering, multidisc handling, screenshots; preserve renderer payload and backend-owned state. | 177,773 | 47,227 | 0.0717773 |
| P3 | M03 | Collection administration and per-game controls: hide/group/rename, user-added systems/games, per-game emulator selection. | 184,286 | 40,714 | 0.0704286 |
| P4 | M04 | Artwork enrichment and manual workflows: compare main's LaunchBox/ScreenScraper and manual discovery/download/viewing with current Rust Libretro/GameTDB services; preserve safe write/import/cancellation/progress/library-sync/path contracts. | 187,032 | 37,968 | 0.0767032 |
| P5 | M05 | Platform-aware launch/emulator behavior: Steam/SteamOS, Linux X11/gamescope launch, logging and metadata/custom-PC config only where missing; preserve OS/CPU, Android package launch, safe extraction, and no-x86-on-ARM64 invariants. | 179,836 | 45,164 | 0.0679836 |
| P6 | M06 | Parity checks, Tauri release docs, target validation. | 132,438 | 92,562 | 0.0572438 |

## Dependencies and exclusions

- Order: M01; M02 after M01; M03 and M04 after M02; M05 after M03; M06 after M01, M04, and M05.
- P1/M01 is complete as `b1b29ac`; start P2/M02 next. Parity implementation for M02 has not started.
- Do not reintroduce Electron `main.js`/`preload.js`, the separate Capacitor Android project, or the Windows launcher from `main`. Do not port all of `main` or copy runtime pieces incompatible with Tauri.
- The approved task list is `.babysteps/main-to-tauri.tasks.json`; do not change its scope, estimates, or priority order.

## Budget rows

| Slice | Reads | Allowance |
|---|---|---:|
| P1 | `docs/STATE.md`, `.babysteps/tauri-migration.plan.md`, `.babysteps/main-to-tauri.tasks.json`, `.operator/specs/desktop-runtime.md`, `docs/donot.md`, `renderer/app.js`, `renderer/appearance.js`, `renderer/library-ui.js`, `renderer/cartridges.js`, `renderer/packaging.js`, `renderer/styles.css`, `renderer/index.html`, `scripts/check-carousel.cjs`, `scripts/check-library-ui.cjs` | 114037 |
| P2 | `renderer/app.js`, `renderer/library-ui.js`, `renderer/tauri-bridge.js`, `src-tauri/src/backend.rs`, `src-tauri/src/config.rs`, `scripts/check-library-ui.cjs` | 135000 |
| P3 | `renderer/app.js`, `renderer/tauri-bridge.js`, `src-tauri/src/backend.rs`, `src-tauri/src/config.rs`, `src-tauri/src/emulators.rs`, `scripts/check-library-ui.cjs` | 130000 |
| P4 | `artwork.js`, `renderer/art.js`, `renderer/artwork-ui.js`, `src-tauri/src/artwork.rs`, `src-tauri/src/backend.rs`, `scripts/check-artwork.cjs`, `scripts/check-artwork-ui.cjs` | 145000 |
| P5 | `emulators.json`, `renderer/app.js`, `src-tauri/src/backend.rs`, `src-tauri/src/emulators.rs`, `src-tauri/src/config.rs` | 125000 |
| P6 | `scripts/check-library-ui.cjs`, `scripts/check-carousel.cjs`, `scripts/check-artwork.cjs`, `scripts/check-artwork-ui.cjs`, `.github/workflows/release.yml`, `README.md`, `docs/SUPPORT.md`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` | 110000 |
