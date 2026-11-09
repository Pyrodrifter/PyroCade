---
slice: P2
stateFile: docs/STATE.md
donotCount: 4
seededFrom: 20b610a
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-delta.tasks.json
  - renderer/app.js
  - renderer/index.html
  - renderer/styles.css
  - localTmp/main-ref-0310657/renderer/app.js
  - localTmp/main-ref-0310657/renderer/index.html
allowanceTokens: 70827
---

**P2 / D02 — Launcher chrome and shelf navigation behaviour.** Second slice of the
2026-11-06..08 delta queue. Baseline `tauri-port` at `b0eec88` plus D01 (`20b610a`);
source `main` at `0310657` (`96fd68c..0310657`). Main originals are in
`localTmp/main-ref-0310657/`. D01 closed: `interface.css` loaded, muted palette,
grouped Settings, shortened copy, artwork type grid.

## Action

Port LibraryChrome (O cycles the overlay shown/hidden/pinned, with details staying
independent of the overlay), DetailsResize (the details bar's shot/title sizing), the
shelf space reclaimed when details are hidden, the `/` focus-search shortcut, the
console previews and keyboard navigation that main added in `64a5ba6`, and the demo
shelf's authored order.

## Scope and exclusions

- Keep the branch bridge and backend-owned state; no Electron IPC shape.
- Do not port the per-game details editor, hidden-game list, drag order or Recomp
  menus (M03 owns those).
- Do not port Leia hooks, `#btnLeia3D`, `LeiaUI.init` or 3D snapshot code.
- Keep Tauri v2 as the runtime; do not touch the Electron/Capacitor release path.

## Code to touch

`renderer/app.js`, `renderer/index.html`, `renderer/styles.css`, and the navigation
assertions in the renderer checks if they name the old chrome behaviour.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `docs/donot.md`
- `localTmp/main-ref-0310657/renderer/app.js`, `localTmp/main-ref-0310657/renderer/index.html`
- `renderer/app.js`, `renderer/index.html`, `renderer/styles.css`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 applies only if manual media paths are touched; this
slice must not change them. Entry #4 governs Android SAF paths and is unaffected.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check renderer/app.js`
- `npm start` smoke: the library renders without a startup error.

`node scripts/check-carousel.cjs` and `node scripts/check-library-ui.cjs` cannot run
on this host (no Electron runtime; no `tauri-driver`). Record that rather than
claiming they passed.

## When this seed closes

Close D02 when LibraryChrome, DetailsResize, the reclaimed shelf space, `/` search,
console previews, keyboard navigation and the demo shelf's authored order are working
without Leia or M03 markup. Record the verification in `docs/STATE.md` and seed
P3/D03 from `.babysteps/main-delta.tasks.json`.
