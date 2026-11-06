---
slice: P10c
stateFile: docs/STATE.md
donotCount: 4
seededFrom: 7071f90
reads:
  - src-tauri/src/emulators.rs
  - src-tauri/src/backend.rs
  - src-tauri/src/lib.rs
  - renderer/library-ui.js
allowanceTokens: 110000
---

**P10c — Implement installed-emulator linking and launch on Android.** Link installed emulators from the Android device and support launching them, adapting the existing emulator service for Android's package-based emulator model.

**The Do-Not list is `docs/donot.md`** — 4 entries, append-only. Never dropped, never trimmed.

## What is settled — do not re-derive

- P1 through P10b are complete. Android release APKs are signed and uploaded to release artifacts.
- P10b added URI-aware storage: content:// tree URIs are distinct from filesystem paths and never walked with std::fs.
- Do-Not #4: Do not treat Android Storage Access Framework content URIs as filesystem paths; persistent document-tree grants and URI-aware I/O are required, and Tauri's dialog plugin does not support Android folder picking.

## Withdrawn — proven wrong, do not use

None.

## Code to touch

- `src-tauri/src/emulators.rs` — Link installed Android emulator apps by package; launch via Android intents.
- `src-tauri/src/backend.rs` — Pass ROM URI to the emulator launcher on Android.
- `src-tauri/src/lib.rs` — Register any new Android launch command.
- `renderer/library-ui.js` — Show installed-emulator state on Android.

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — `Desktop Runtime Direction` (Android SAF section)
- `.babysteps/tauri-migration.plan.md` — `Budget rows` (P10c row)

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #4 applies: Do not treat Android Storage Access Framework content URIs as filesystem paths; persistent document-tree grants and URI-aware I/O are required, and Tauri's dialog plugin does not support Android folder picking.

## The gate

`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
`cargo test --manifest-path src-tauri/Cargo.toml`
`cargo check --manifest-path src-tauri/Cargo.toml`

## When this slice closes

Write the next seed with the next sub-slice (P10d — on-device renderer, controller, and audio validation), advance the state file, and re-verify the Do-Not count.
