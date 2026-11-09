---
slice: P11a
stateFile: docs/STATE.md
donotCount: 4
seededFrom: cea7392
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-to-tauri.tasks.json
  - src-tauri/src/artwork.rs
  - src-tauri/src/backend.rs
  - scripts/check-artwork.cjs
  - .operator/specs/artwork-service.md
allowanceTokens: 70000
---

**P11a / M04a — Compatible artwork providers.** Built from `.babysteps/tauri-migration.plan.md` after the
original M04 row priced over the work-unit budget (236,134 > 225,000) and was split into M04a (this
slice) and M04b. Cover providers (MarioWiki, Internet Archive) were closed by D07; this keeps the
LaunchBox/ScreenScraper comparison through the Rust artwork service only.

## Action

Port only the compatible LaunchBox and ScreenScraper provider behavior that fits the existing
Libretro/GameTDB contract, through the Rust artwork service. Preserve safe writes, import
replacement, cancellation, progress, and the filesystem-path payload contract for artwork paths.

## Scope and exclusions

- Manual discovery/download/viewing workflows stay in M04b (P11b); do not port them here.
- Do not convert `manual` media paths to file URLs (Do-Not #1).
- Android SAF paths are unaffected (Do-Not #4).

## Code to touch

`src-tauri/src/artwork.rs`, `src-tauri/src/backend.rs`, `scripts/check-artwork.cjs`.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `.operator/specs/artwork-service.md`
- `docs/donot.md`
- `src-tauri/src/artwork.rs`, `src-tauri/src/backend.rs`, `scripts/check-artwork.cjs`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 applies only if manual media paths are touched.
Entry #4 governs Android SAF paths and is unaffected.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check scripts/check-artwork.cjs`

`node scripts/check-artwork-ui.cjs` and `node scripts/check-library-ui.cjs` cannot run on this host
(no `tauri-driver`); record that rather than claiming they passed.

## When this seed closes

Close M04a when the compatible LaunchBox/ScreenScraper provider behavior is available through the
Rust artwork service with the existing payload contract. Record the verification in `docs/STATE.md`
and seed P11b (M04b — manual artwork workflows).
