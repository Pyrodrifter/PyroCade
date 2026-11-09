---
slice: P3
stateFile: docs/STATE.md
donotCount: 4
seededFrom: 60fdc7a
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-delta.tasks.json
  - renderer/prompts.js
  - scripts/build-prompts.js
  - scripts/check-prompts.cjs
  - scripts/check-prompts-preload.cjs
  - localTmp/main-ref-0310657/renderer/prompts.js
  - localTmp/main-ref-0310657/scripts/build-prompts.js
  - localTmp/main-ref-0310657/scripts/check-prompts.cjs
allowanceTokens: 27828
---

**P3 / D03 — Flat button-prompt assets and generator.** Third slice of the
2026-11-06..08 delta queue. Baseline `tauri-port` at `b0eec88` plus D01 (`20b610a`)
and D02 (`60fdc7a`); source `main` at `0310657` (`96fd68c..0310657`). Main originals are
in `localTmp/main-ref-0310657/`. D02 closed: `LibraryChrome`, `DetailsResize`,
reclaimed shelf space, `/` search, console previews, keyboard navigation and demo
authored order.

## Action

Replace the branch's prompt art with main's flat graphite SVG and transparent PNG
set, and port the `build-prompts.js` changes that produce it (flat shells, centred
labels and symbols, 64/128 px raster output), `prompts.js`, the generated manifest
and preview. Copy the 845 generated assets from main verbatim instead of redrawing
them, and update the prompt checks. Do not run Electron to rasterize and do not
introduce a new image pipeline.

## Scope and exclusions

- Copy the 845 generated assets from main verbatim; do not redraw them.
- Keep Tauri v2 as the runtime; do not touch the Electron/Capacitor release path.
- Do not port Leia hooks or feedback markup.

## Code to touch

`renderer/prompts.js`, `scripts/build-prompts.js`, the generated prompt asset set
and manifest/preview, `scripts/check-prompts.cjs` and
`scripts/check-prompts-preload.cjs`.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `docs/donot.md`
- `localTmp/main-ref-0310657/renderer/prompts.js`,
  `localTmp/main-ref-0310657/scripts/build-prompts.js`,
  `localTmp/main-ref-0310657/scripts/check-prompts.cjs`
- `renderer/prompts.js`, `scripts/build-prompts.js`, `scripts/check-prompts.cjs`,
  `scripts/check-prompts-preload.cjs`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 applies only if manual media paths are touched;
this slice must not change them. Entry #4 governs Android SAF paths and is unaffected.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check renderer/prompts.js`
- `npm start` smoke: the library renders without a startup error.

`node scripts/check-prompts.cjs`, `node scripts/check-carousel.cjs` and
`node scripts/check-library-ui.cjs` cannot run on this host (no Electron runtime;
no `tauri-driver`). Record that rather than claiming they passed.

## When this seed closes

Close D03 when the flat graphite prompt set, `build-prompts.js`, `prompts.js`,
manifest and preview are working without Electron rasterization. Record the
verification in `docs/STATE.md` and seed P4/D04 from `.babysteps/main-delta.tasks.json`.
