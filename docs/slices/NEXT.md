---
slice: P5
stateFile: docs/STATE.md
donotCount: 4
seededFrom: fd7a8c8
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-delta.tasks.json
  - renderer/app.js
  - renderer/art.js
  - renderer/packaging.js
  - renderer/cartridges.js
  - renderer/styles.css
  - localTmp/main-ref-0310657/renderer/app.js
  - localTmp/main-ref-0310657/renderer/art.js
  - localTmp/main-ref-0310657/renderer/packaging.js
  - localTmp/main-ref-0310657/renderer/cartridges.js
  - localTmp/main-ref-0310657/renderer/styles.css
allowanceTokens: 53828
---

**P5 / D05 — Case art, physical media, and booklet proportions.** Fifth slice of the
2026-11-06..08 delta queue. Baseline `tauri-port` at `b0eec88` plus D01 (`20b610a`),
D02 (`60fdc7a`), D03 (`030662e`) and D04 (`fd7a8c8`); source `main` at `0310657` (`96fd68c..0310657`).
Main originals are in `localTmp/main-ref-0310657/`. D04 closed: Page turn and Media
carousel replaced the spinner rack and colour cards with retired-layout migration
(spinner to page-turn, swatches and top-flip to media), the stage-sized bookshelf
from `e1b504e`, bookshelf disc peek and reveal, and the carousel/library checks
adapted (the library check is the branch Tauri WebDriver smoke). Its Electron and
WebDriver checks could not run on the host (Electron failed to install, no
`tauri-driver`); that is recorded in `docs/STATE.md`, not claimed.

## Action

Port back covers drawn in the background behind cartridges, the cartridge lift
above its cover, spine hinges, the cartridge label z-offset, per-game physical
media overrides, Super Famicom package shapes, and the real-manual booklet
proportions. Adapt main's `art.js` drawing and packaging/cartridge profiles to
the branch renderer rather than importing main's larger files. Keep the case
payload contract and existing artwork paths. The D04 slice left these pieces of
main's `8e15d77` commit (`Packaging.size` and the case-spine hinge, the lid
transform, the snes cover `background-size: contain`, the cartridge label z-offset
in `cartridges.js`, and the `art.js` manual cache key) plus `98e07ee` (back
covers, cartridge lift above `f-left`), `3f297f1` and `7209b33` (booklet
proportions) for this slice.

## Scope and exclusions

- Adapt main's drawing and profiles to the branch renderer; keep the case
  payload contract (front/back/spine/disc paths) and existing artwork paths.
- Do not port the per-game details editor, hidden-game list, drag order or Recomp
  menus (M03 owns those), and do not port Leia hooks.

## Code to touch

`renderer/app.js`, `renderer/art.js`, `renderer/packaging.js`,
`renderer/cartridges.js` and `renderer/styles.css`.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `docs/donot.md`
- `localTmp/main-ref-0310657/renderer/app.js`,
  `localTmp/main-ref-0310657/renderer/art.js`,
  `localTmp/main-ref-0310657/renderer/packaging.js`,
  `localTmp/main-ref-0310657/renderer/cartridges.js`,
  `localTmp/main-ref-0310657/renderer/styles.css`
- `renderer/app.js`, `renderer/art.js`, `renderer/packaging.js`,
  `renderer/cartridges.js`, `renderer/styles.css`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 applies only if manual media paths are touched.
Entry #4 governs Android SAF paths and is unaffected.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check renderer/app.js`
- `node --check renderer/art.js`
- `node --check renderer/packaging.js`
- `node --check renderer/cartridges.js`
- `npm start` smoke: the library renders without a startup error.

`node scripts/check-carousel.cjs` and `node scripts/check-library-ui.cjs` cannot
run on this host (no Electron runtime; no `tauri-driver`). Record that rather than
claiming they passed.

## When this seed closes

Close D05 when back covers, cartridge lift, spine hinges, label z-offset,
physical-media overrides, Super Famicom packaging and booklet proportions are
ported. Record the verification in `docs/STATE.md` and seed P6/D06 from
`.babysteps/main-delta.tasks.json`.
