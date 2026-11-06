# Tauri v2 migration slices

Generated with `babysteps_slice_plan` for `opencode-go/gpt-6-luna`.

- Work-unit budget: 225,000 tokens (`workBudgetTokens` and `contextCeilingTokens`).
- Cost ceiling: $0.70 per session/slice guard.
- All proposals fit both limits; no task was refused.
- Input tokens are measured from each task's `reads` set. Cache-read, cache-write, and output stages are planning estimates declared in `tauri-migration.tasks.json`.
- The planner uses base rates for these slices; its maximum stage-priced slice estimate is $0.0243187. The budget table's combined allowance is conservatively priced as output by the guard; its highest forecast is $0.0827521. Both are below the $0.70 ceiling.
- Budget rows use each proposal's combined cache-read/cache-write/output estimate as its allowance, so the seed gate remains conservative when it prices allowance as output.

| Slice | Task | Scope | Total tokens | Headroom | Estimated cost (USD) |
|---|---|---|---:|---:|---:|
| P1 | S01 | Tauri window and renderer bridge | 206,787 | 18,213 | 0.0220537 |
| P2 | S02 | Settings and ROM library service | 203,347 | 21,653 | 0.0232597 |
| P3 | S03 | Platform/architecture-aware emulator catalog | 202,858 | 22,142 | 0.0216608 |
| P4 | S04 | Emulator install, management, and launch | 218,437 | 6,563 | 0.0243187 |
| P5 | S05 | Artwork download and import | 185,400 | 39,600 | 0.0214650 |
| P6 | S07 | macOS and Linux ARM64 packaging | 157,267 | 67,733 | 0.0171017 |
| P7 | S06 | App updater and release behavior | 167,793 | 57,207 | 0.0186043 |
| P8 | S08 | Validation and release automation | 204,010 | 20,990 | 0.0228760 |
| P9 | S09 | Remove obsolete Electron runtime | 163,456 | 61,544 | 0.0166206 |
| P10 | S10 | Add Android ARM64 target | 180,263 | 44,737 | 0.0194013 |
| P10a | S10a | Sign and publish the Android release APK | 85,000 | 140,000 | 0.0085000 |
| P10b | S10b | Implement Storage Access Framework storage and import | 120,000 | 105,000 | 0.0120000 |
| P10c | S10c | Implement installed-emulator linking and launch on Android | 110,000 | 115,000 | 0.0110000 |
| P10d | S10d | On-device renderer, controller, and audio validation | 130,000 | 95,000 | 0.0130000 |

Execution order is dependency-aware; packaging (S07) precedes updater integration (S06), and Android ARM64 target work (S10) follows Electron runtime removal (S09).

## Budget rows

| Slice | Reads | Allowance |
|---|---|---:|
| P1 | `package.json`, `main.js`, `preload.js`, `renderer/index.html`, `renderer/tauri-bridge.js`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`, `src-tauri/src/backend.rs`, `src-tauri/src/config.rs`, `src-tauri/src/emulators.rs`, `src-tauri/src/artwork.rs` | 140000 |
| P2 | `main.js`, `emulators.json`, `src-tauri/src/config.rs`, `src-tauri/src/backend.rs`, `renderer/app.js` | 150000 |
| P3 | `emulators.json`, `main.js`, `src-tauri/src/emulators.rs`, `src-tauri/src/backend.rs`, `renderer/app.js` | 140000 |
| P4 | `main.js`, `preload.js`, `emulators.json`, `src-tauri/src/emulators.rs`, `src-tauri/src/backend.rs`, `renderer/app.js` | 155000 |
| P5 | `artwork.js`, `renderer/artwork-ui.js`, `renderer/art.js`, `src-tauri/src/artwork.rs`, `src-tauri/src/backend.rs` | 150000 |
| P6 | `package.json`, `package-lock.json`, `.github/workflows/release.yml`, `src-tauri/tauri.conf.json`, `src-tauri/Cargo.toml` | 140000 |
| P7 | `main.js`, `package.json`, `.github/workflows/release.yml`, `src-tauri/src/backend.rs`, `src-tauri/tauri.conf.json` | 135000 |
| P8 | `package.json`, `scripts/check-library-ui.cjs`, `scripts/check-carousel.cjs`, `scripts/check-artwork-ui.cjs`, `.github/workflows/release.yml`, `src-tauri/src/lib.rs`, `src-tauri/src/backend.rs`, `src-tauri/src/emulators.rs`, `src-tauri/src/artwork.rs` | 155000 |
| P9 | `package.json`, `package-lock.json`, `main.js`, `preload.js`, `artwork.js`, `.github/workflows/release.yml`, `src-tauri/tauri.conf.json` | 125000 |
| P10 | `package.json`, `.github/workflows/release.yml`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/src/lib.rs`, `src-tauri/src/backend.rs`, `src-tauri/src/config.rs`, `src-tauri/src/emulators.rs`, `renderer/tauri-bridge.js`, `README.md` | 140000 |
| P10a | `package.json`, `.github/workflows/release.yml`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` | 85000 |
| P10b | `src-tauri/src/backend.rs`, `src-tauri/src/config.rs`, `src-tauri/src/lib.rs`, `renderer/tauri-bridge.js` | 120000 |
| P10c | `src-tauri/src/emulators.rs`, `src-tauri/src/backend.rs`, `src-tauri/src/lib.rs`, `renderer/library-ui.js` | 110000 |
| P10d | `package.json`, `.github/workflows/release.yml`, `src-tauri/src/lib.rs`, `src-tauri/src/backend.rs`, `src-tauri/src/emulators.rs`, `renderer/tauri-bridge.js`, `renderer/ui-audio.js`, `README.md`, `docs/SUPPORT.md` | 130000 |
