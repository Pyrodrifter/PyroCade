---
slice: P10b
stateFile: docs/STATE.md
donotCount: 4
seededFrom: 5f3c2e1
reads:
  - src-tauri/src/backend.rs
  - src-tauri/src/config.rs
  - src-tauri/src/lib.rs
  - renderer/tauri-bridge.js
allowanceTokens: 120000
---

**P10b — Implement Storage Access Framework (SAF) storage and import on Android.** Replace filesystem-path-based storage on Android with URI-aware I/O using persistent document-tree grants, since Tauri's dialog plugin does not support Android folder picking.

**The Do-Not list is `docs/donot.md`** — 4 entries, append-only. Never dropped, never trimmed.

## What is settled — do not re-derive

- P1 through P10a are complete. Android signing is configured; release APKs are signed and uploaded to release artifacts.
- The CI workflow builds and signs Android ARM64 APKs for release builds. Debug CI builds remain unsigned.
- Do-Not #4: Do not treat Android Storage Access Framework content URIs as filesystem paths; persistent document-tree grants and URI-aware I/O are required, and Tauri's dialog plugin does not support Android folder picking.

## Withdrawn — proven wrong, do not use

None.

## Code to touch

- `src-tauri/src/backend.rs` — Replace filesystem-path library/import functions with URI-aware versions for Android; use `open_document_tree`/`open_document` with persistent grants.
- `src-tauri/src/config.rs` — Adapt settings path handling for Android's document-tree grants.
- `src-tauri/src/lib.rs` — Add Android-specific storage path resolution.
- `renderer/tauri-bridge.js` — Update library/import bridge to pass URIs instead of paths on Android.

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — `Desktop Runtime Direction` (Android SAF section)
- `.babysteps/tauri-migration.plan.md` — `Budget rows` (P10b row)

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #4 applies: Do not treat Android Storage Access Framework content URIs as filesystem paths; persistent document-tree grants and URI-aware I/O are required, and Tauri's dialog plugin does not support Android folder picking.

## The gate

`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
`cargo test --manifest-path src-tauri/Cargo.toml`
`cargo check --manifest-path src-tauri/Cargo.toml`

## When this slice closes

Write the next seed with the next sub-slice (P10c — installed-emulator linking/launch), advance the state file, and re-verify the Do-Not count.
