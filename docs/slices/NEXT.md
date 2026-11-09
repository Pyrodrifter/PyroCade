---
slice: P6
stateFile: docs/STATE.md
donotCount: 4
seededFrom: d4778d3
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-delta.tasks.json
  - src-tauri/src/backend.rs
  - src-tauri/src/config.rs
  - src-tauri/src/lib.rs
  - renderer/app.js
  - renderer/tauri-bridge.js
  - scripts/check-library-ui.cjs
  - localTmp/main-ref-0310657/main.js
  - localTmp/main-ref-0310657/renderer/app.js
  - localTmp/main-ref-0310657/preload.js
allowanceTokens: 50827
---

**P6 / D06 — Library cache and parallel Rust scan.** Sixth slice of the
2026-11-06..08 delta queue. Baseline `tauri-port` at `b0eec88` plus D01 (`20b610a`),
D02 (`60fdc7a`), D03 (`030662e`), D04 (`fd7a8c8`) and D05 (`d4778d3`); source `main`
at `0310657` (`96fd68c..0310657`). Main originals are in `localTmp/main-ref-0310657/`.
D05 closed: back covers drawn in the background, cartridge lift above covers,
spine hinges, label z-offset, physical-media overrides, Super Famicom packaging
and booklet proportions ported. Its Electron and WebDriver checks could not run
on the host (Electron failed to install, no `tauri-driver`); that is recorded in
`docs/STATE.md`, not claimed.

## Action

Show the last scan immediately, rescan behind it, and redraw only when the scan
changed. Add `library-cache.json` under the app data dir keyed by app version,
mediaRoot, extra games and each system's id/romDir/extensions/direct, with
tie-break sizes kept separately; expose `cachedLibrary` and `scan
{onlyIfChanged}` through the Tauri bridge; return null when unchanged. In Rust,
list each folder once per scan, match media with 16-way concurrency, stat only
tied duplicate copies, check disc `.json` side files against the listing, sort
titles case-insensitively, and refactor renderer `loadLibrary` into
`startLibrary`/`applyLibrary` restoring selection by id. Keep the disc/shell
metadata contract.

## Scope and exclusions

- Adapt the cache and scan to the branch's Rust backend and Tauri bridge; keep the
  disc/shell metadata contract.
- Do not port the per-game details editor, hidden-grouping or Recomp menus (M03
  owns those), and do not port Leia hooks.

## Code to touch

`src-tauri/src/backend.rs`, `src-tauri/src/config.rs`, `src-tauri/src/lib.rs`,
`renderer/app.js`, `renderer/tauri-bridge.js` and `scripts/check-library-ui.cjs`.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `docs/donot.md`
- `localTmp/main-ref-0310657/main.js`, `localTmp/main-ref-0310657/preload.js`,
  `localTmp/main-ref-0310657/renderer/app.js`
- `src-tauri/src/backend.rs`, `src-tauri/src/config.rs`, `src-tauri/src/lib.rs`,
  `renderer/app.js`, `renderer/tauri-bridge.js`, `scripts/check-library-ui.cjs`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 applies (manual paths stay filesystem paths).
Entry #4 governs Android SAF paths and is unaffected.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check renderer/app.js`
- `node --check renderer/tauri-bridge.js`
- `node --check scripts/check-library-ui.cjs`
- `npm start` smoke: cache-first start and unchanged rescan without a startup error.

`node scripts/check-library-ui.cjs` cannot run on this host (no `tauri-driver`).
Record that rather than claiming it passed.

## When this seed closes

Close D06 when the cache-first start, `onlyIfChanged` rescan and 16-way parallel
Rust scan are ported, and the library checks are adapted (the library check is
the branch Tauri WebDriver smoke). Record the verification in `docs/STATE.md`
and seed P7/D07 from `.babysteps/main-delta.tasks.json`.
