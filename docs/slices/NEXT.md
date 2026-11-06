---
slice: P10d
stateFile: docs/STATE.md
donotCount: 4
seededFrom: ac63358
reads:
  - package.json
  - .github/workflows/release.yml
  - src-tauri/src/lib.rs
  - src-tauri/src/backend.rs
  - src-tauri/src/emulators.rs
  - renderer/tauri-bridge.js
  - renderer/ui-audio.js
  - README.md
  - docs/SUPPORT.md
allowanceTokens: 130000
---

**P10d — On-device renderer, controller, and audio validation.** Verify the renderer bridge, controller input, and audio paths on Android hardware, then update the support and validation documentation.

**The Do-Not list is `docs/donot.md`** — 4 entries, append-only. Never dropped, never trimmed.

## What is settled — do not re-derive

- P1 through P10c are complete. Android release APKs are signed and uploaded to release artifacts; SAF storage is URI-aware; installed emulators are linked by package and launched via Android intents with ROM URIs passed through unchanged.
- Do-Not #4: Do not treat Android Storage Access Framework content URIs as filesystem paths; persistent document-tree grants and URI-aware I/O are required, and Tauri's dialog plugin does not support Android folder picking.

## Withdrawn — proven wrong, do not use

None.

## Code to touch

- `package.json` — Android on-device validation and release script support.
- `.github/workflows/release.yml` — CI on-device validation job wiring if needed.
- `src-tauri/src/lib.rs` — Register any new Android validation command if needed.
- `src-tauri/src/backend.rs` — Validation hooks for renderer/controller/audio checks.
- `src-tauri/src/emulators.rs` — Emulator validation hooks on Android.
- `renderer/tauri-bridge.js` — Renderer bridge validation surface.
- `renderer/ui-audio.js` — Audio on Android WebView validation.
- `README.md` — Support and validation documentation.
- `docs/SUPPORT.md` — Platform support and validation status.

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — `Desktop Runtime Direction` (Android SAF section)
- `.babysteps/tauri-migration.plan.md` — `Budget rows` (P10d row)

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #4 applies: Do not treat Android Storage Access Framework content URIs as filesystem paths; persistent document-tree grants and URI-aware I/O are required, and Tauri's dialog plugin does not support Android folder picking.

## The gate

`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
`cargo test --manifest-path src-tauri/Cargo.toml`
`cargo check --manifest-path src-tauri/Cargo.toml`

## When this slice closes

Once P10d is complete, write the next seed with the final sub-slice if any remains, otherwise state that the queue is exhausted; advance the state file, and re-verify the Do-Not count.
