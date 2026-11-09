---
slice: P12a
stateFile: docs/STATE.md
donotCount: 4
seededFrom: 306ce2e
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-to-tauri.tasks.json
  - renderer/app.js
  - src-tauri/src/backend.rs
  - src-tauri/src/config.rs
allowanceTokens: 70000
---

**P12a / M05a — Platform-aware launch behaviour.** M03 closed collection
administration and M04b closed manual workflows. The original P12/M05 row
priced 227,654 tokens, over the 225,000 work budget, so M05 was re-cut into
M05a (launch, this slice) and M05b (emulator metadata).

## Action

Port the main-side Steam/SteamOS launch behavior, Linux gamescope/X11 handling and launch logging where not already covered by Tauri. Keep OS/CPU selection, Android package launch, safe install/extraction, and the no-x86-on-ARM64 invariant intact.

## Scope and exclusions

- Launch behaviour differs by platform: preserve macOS `.app` bundles, ARM64-only selection, and Android intent launch.
- Do-Not #2 (child reaping) and #4 (SAF URIs) apply to launch changes. Entries #1 and #3 do not apply unless touched.

## Code to touch

`renderer/app.js`, `src-tauri/src/backend.rs`, `src-tauri/src/config.rs`.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `.babysteps/main-to-tauri.tasks.json` (M05a row)
- `renderer/app.js`, `src-tauri/src/backend.rs`, `src-tauri/src/config.rs`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #2 (child reaping) and entry #4 (Android SAF URIs) apply. Entries #1 and #3 do not apply unless touched.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check renderer/app.js` plus any touched check scripts

## When this seed closes

Close M05a when launch behavior is platform-aware with the OS/CPU, Android, safe-install and no-x86-on-ARM64 invariants intact, and the verification is recorded in `docs/STATE.md` with seed P12b (M05b — emulator metadata and custom game configuration).
