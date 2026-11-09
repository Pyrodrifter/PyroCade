---
slice: P7
stateFile: docs/STATE.md
donotCount: 4
seededFrom: 2fa1983
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-delta.tasks.json
  - src-tauri/src/artwork.rs
  - src-tauri/src/backend.rs
  - renderer/artwork-ui.js
  - scripts/check-artwork.cjs
  - scripts/check-artwork-ui.cjs
  - .operator/specs/artwork-service.md
  - localTmp/main-ref-0310657/web-source.js
  - localTmp/main-ref-0310657/mariowiki.js
  - localTmp/main-ref-0310657/internet-archive.js
  - localTmp/main-ref-0310657/artwork.js
  - localTmp/main-ref-0310657/scripts/check-artwork.cjs
  - localTmp/main-ref-0310657/scripts/check-artwork-ui.cjs
allowanceTokens: 102827
---

**P7 / D07 — MarioWiki and Internet Archive cover fallbacks.** Seventh slice of the
2026-11-06..08 delta queue. Baseline `tauri-port` at `b0eec88` plus D01 (`20b610a`),
D02 (`60fdc7a`), D03 (`030662e`), D04 (`fd7a8c8`), D05 (`d4778d3`) and D06
(`2fa1983`); source `main` at `0310657` (`96fd68c..0310657`). Main originals are in
`localTmp/main-ref-0310657/`. D06 closed: cache-first library start via
`library-cache.json`, `cachedLibrary`/`scan {onlyIfChanged}`, one listing per
folder, 16-way media matching, tied-only size stats, disc side-file shell check,
case-insensitive title sort, and renderer `startLibrary`/`applyLibrary`. Its
library WebDriver check could not run on the host (no `tauri-driver`); that is
recorded in `docs/STATE.md`, not claimed.

## Action

Add Rust equivalents of `web-source.js`, `mariowiki.js` and
`internet-archive.js`: one polite request per second with a PyroCade user
agent, per-site 20 s timeout, 404/410 treated as no answer, 429/503 surfaced
as slow-down, and a 30-day JSON disk cache. Match Super Mario Wiki raw page
text with its cover category check, and the Internet Archive softwareboxart
index with serial/system-shape and front-cover checks; skip untrusted
releases, ignore `version` when comparing titles, and use tagged regions.
Front covers only, after the existing providers, never replacing an existing
cover. Update the artwork source display and checks.

## Scope and exclusions

- Adapt the web sources to the branch Rust artwork service; front covers only,
  after Libretro/GameTDB, never replacing an existing cover.
- Do not port LaunchBox/ScreenScraper comparison or manual workflows (M04),
  and do not port Leia hooks.

## Code to touch

`src-tauri/src/artwork.rs`, `src-tauri/src/backend.rs`,
`renderer/artwork-ui.js`, `scripts/check-artwork.cjs` and
`scripts/check-artwork-ui.cjs`.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `.operator/specs/artwork-service.md`
- `docs/donot.md`
- `localTmp/main-ref-0310657/web-source.js`, `localTmp/main-ref-0310657/mariowiki.js`,
  `localTmp/main-ref-0310657/internet-archive.js`, `localTmp/main-ref-0310657/artwork.js`,
  `localTmp/main-ref-0310657/scripts/check-artwork.cjs`, `localTmp/main-ref-0310657/scripts/check-artwork-ui.cjs`
- `src-tauri/src/artwork.rs`, `src-tauri/src/backend.rs`, `renderer/artwork-ui.js`,
  `scripts/check-artwork.cjs`, `scripts/check-artwork-ui.cjs`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 applies (manual paths stay filesystem paths).
Entry #4 governs Android SAF paths and is unaffected.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check renderer/artwork-ui.js`
- `node --check scripts/check-artwork.cjs`
- `node --check scripts/check-artwork-ui.cjs`
- `npm start` smoke: artwork source display without a startup error.

`node scripts/check-artwork-ui.cjs` and the artwork checks may not run on this
host (no Electron runtime); record that rather than claiming they passed.

## When this seed closes

Close D07 when the MarioWiki and Internet Archive front-cover fallbacks are
ported to Rust with the polite-rate, timeout, slow-down and 30-day cache
contract, front covers only after existing providers, and the artwork checks
are adapted (the artwork UI check is the branch Electron smoke). Record the
verification in `docs/STATE.md` and seed P8/D08 from
`.babysteps/main-delta.tasks.json`.
