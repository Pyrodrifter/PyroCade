---
slice: P12b
stateFile: docs/STATE.md
donotCount: 4
seededFrom: 7781cd3
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-to-tauri.tasks.json
  - emulators.json
  - src-tauri/src/emulators.rs
  - src-tauri/src/config.rs
allowanceTokens: 50000
---

**P12b / M05b — Emulator metadata and custom game configuration.** M05a
closed platform-aware launch behavior (`7781cd3`): launch logging and the
Linux Steam/gamescope handling are settled. The original P12/M05 row
priced 227,654 tokens, over the 225,000 work budget, so M05 was re-cut
into M05a (launch) and M05b (emulator metadata, this slice).

## Action

Port updated emulator/system metadata and custom/PC game configuration
where not already covered by Tauri. Keep OS/CPU selection, Android package
launch, safe install/extraction, and the no-x86-on-ARM64 invariant intact.

## Scope and exclusions

- Emulator/system metadata differs: compare main's `emulators.json` catalog
  and `main.js` system defaults against Rust defaults; port only what is
  missing, keeping target-aware managed builds.
- Do-Not #3 (unsafe ZIP) and #4 (SAF URIs) apply to emulator install and
  config paths. Entries #1 and #2 do not apply unless touched.

## Code to touch

`emulators.json`, `src-tauri/src/emulators.rs`, `src-tauri/src/config.rs`.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `.babysteps/main-to-tauri.tasks.json` (M05b row)
- `emulators.json`, `src-tauri/src/emulators.rs`, `src-tauri/src/config.rs`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #3 (unsafe ZIP) and entry #4 (Android SAF
URIs) apply. Entries #1 and #2 do not apply unless touched.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`

## When this seed closes

Close M05b when emulator metadata and custom/PC game configuration are
current with OS/CPU, Android, safe-install and no-x86-on-ARM64 invariants
intact, and the verification is recorded in `docs/STATE.md` with seed P13
(M06 — remaining parity checks, release docs and target validation).
