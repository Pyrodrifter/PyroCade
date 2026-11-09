---
slice: P4
stateFile: docs/STATE.md
donotCount: 4
seededFrom: 030662e
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-delta.tasks.json
  - renderer/app.js
  - renderer/appearance.js
  - renderer/library-ui.css
  - renderer/styles.css
  - scripts/check-carousel.cjs
  - scripts/check-library-ui.cjs
  - localTmp/main-ref-0310657/renderer/app.js
  - localTmp/main-ref-0310657/renderer/appearance.js
  - localTmp/main-ref-0310657/renderer/library-ui.css
  - localTmp/main-ref-0310657/renderer/styles.css
  - localTmp/main-ref-0310657/scripts/check-carousel.cjs
  - localTmp/main-ref-0310657/scripts/check-library-ui.cjs
allowanceTokens: 48827
---

**P4 / D04 — Page turn, media carousel, and shelf sizing.** Fourth slice of the
2026-11-06..08 delta queue. Baseline `tauri-port` at `b0eec88` plus D01 (`20b610a`),
D02 (`60fdc7a`) and D03 (`030662e`); source `main` at `0310657` (`96fd68c..0310657`).
Main originals are in `localTmp/main-ref-0310657/`. D03 closed: flat graphite
prompt set (283 SVGs, 566 PNGs, manifest, preview) copied verbatim from main with
`build-prompts.js` ported verbatim; `prompts.js` adapted to the branch (Details/UI
mode hints added, Favourite/Random omitted, branch vertical/swatches handling kept).

## Action

Replace the spinner rack and colour cards with Page turn and Media carousel,
migrating saved retired layouts (spinner to page-turn, swatches and top-flip to
media). Add the selected-disc test to the appearance geometry, the page-turn radius
and bookshelf disc peek, the stage-sized bookshelf from `e1b504e`, the media
reveal/hide behaviour, the layout options, and the shelf-model cache invalidation
when flat covers toggle. Port the matching CSS and update the carousel and library
checks. Leave packaging shapes, back covers and booklet proportions to D05, and
exclude Leia.

## Scope and exclusions

- Migrate retired layouts on load; keep the branch bridge and backend-owned state.
- Do not port the per-game details editor, hidden-game list, drag order or Recomp
  menus (M03 owns those), and do not port Leia hooks.
- Leave packaging shapes, back covers and booklet proportions to D05.

## Code to touch

`renderer/app.js`, `renderer/appearance.js`, `renderer/library-ui.css`,
`renderer/styles.css`, `scripts/check-carousel.cjs` and
`scripts/check-library-ui.cjs`.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `docs/donot.md`
- `localTmp/main-ref-0310657/renderer/app.js`,
  `localTmp/main-ref-0310657/renderer/appearance.js`,
  `localTmp/main-ref-0310657/renderer/library-ui.css`,
  `localTmp/main-ref-0310657/renderer/styles.css`,
  `localTmp/main-ref-0310657/scripts/check-carousel.cjs`,
  `localTmp/main-ref-0310657/scripts/check-library-ui.cjs`
- `renderer/app.js`, `renderer/appearance.js`, `renderer/library-ui.css`,
  `renderer/styles.css`, `scripts/check-carousel.cjs`,
  `scripts/check-library-ui.cjs`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 applies only if manual media paths are touched.
Entry #4 governs Android SAF paths and is unaffected.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check renderer/app.js`
- `node --check renderer/appearance.js`
- `npm start` smoke: the library renders without a startup error.

`node scripts/check-carousel.cjs` and `node scripts/check-library-ui.cjs` cannot
run on this host (no Electron runtime; no `tauri-driver`). Record that rather than
claiming they passed.

## When this seed closes

Close D04 when Page turn and Media carousel replace the spinner rack and colour
cards with retired-layout migration, the selected-disc geometry, bookshelf disc
peek and stage-sized shelf, and carousel/library checks updated. Record the
verification in `docs/STATE.md` and seed P5/D05 from `.babysteps/main-delta.tasks.json`.
