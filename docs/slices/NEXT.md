---
slice: P11b
stateFile: docs/STATE.md
donotCount: 4
seededFrom: a7ef170
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-to-tauri.tasks.json
  - artwork.js
  - renderer/art.js
  - renderer/artwork-ui.js
  - scripts/check-artwork-ui.cjs
allowanceTokens: 55000
---

**P11b / M04b — Manual artwork workflows.** M04a (P11a, `a7ef170`) established the provider
contract in the Rust artwork service: Libretro/GameTDB primaries, then front-cover-only
fallbacks (LaunchBox, ScreenScraper, MarioWiki, Internet Archive), never replacing an existing
cover, manual media as filesystem paths. This slice ports the manual workflows against it.

## Action

Port manual discovery, download and viewing workflows (artwork.js manual path handling, Art manual
drawing, artwork UI) against the provider contract established in M04a. Preserve the
filesystem-path payload contract; do not convert manual media paths to file URLs.

## Scope and exclusions

- Provider behavior stays in the Rust artwork service; do not re-add provider logic to the
  renderer. Manual workflows consume what the service returns.
- Do not convert `manual` media paths to file URLs (Do-Not #1): the renderer passes manual paths
  to the native opener; artwork paths use file URLs.
- ScreenScraper credential entry (user/devId/passwords) belongs to this manual-workflow slice
  if the artwork UI needs it; passwords never cross `get_config` to the renderer.
- Android SAF paths are unaffected (Do-Not #4).

## Code to touch

`artwork.js`, `renderer/art.js`, `renderer/artwork-ui.js`, `scripts/check-artwork-ui.cjs`.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `.operator/specs/artwork-service.md`
- `docs/donot.md`
- `artwork.js`, `renderer/art.js`, `renderer/artwork-ui.js`, `scripts/check-artwork-ui.cjs`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 (manual paths stay filesystem paths) and entry #4 (Android SAF
URIs are not filesystem paths) apply. Entries #2 (child reaping) and #3 (ZIP member paths)
do not apply to this slice.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check artwork.js`, `renderer/art.js`, `renderer/artwork-ui.js`,
  `scripts/check-artwork-ui.cjs`
- `node scripts/check-artwork.cjs`

`node scripts/check-artwork-ui.cjs` requires `tauri-driver`; if it cannot run on this host,
record that rather than claiming it passed.

## When this seed closes

Close M04b when manual discovery, download and viewing work against the M04a provider contract
with the filesystem-path payload preserved. Record the verification in `docs/STATE.md` and seed
P12 (M05 — platform-aware launch and emulator behaviour).
