---
slice: P9
stateFile: docs/STATE.md
donotCount: 4
seededFrom: 97ed95c
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-delta.tasks.json
  - README.md
  - docs/SUPPORT.md
  - package.json
  - .github/workflows/release.yml
  - scripts/record-reddit-demo.cjs
  - scripts/reddit-demo-timeline.js
  - localTmp/main-ref-0310657/README.md
  - localTmp/main-ref-0310657/CHANGELOG.md
  - localTmp/main-ref-0310657/package.json
  - localTmp/main-ref-0310657/scripts/capture-readme.cjs
  - localTmp/main-ref-0310657/scripts/record-reddit-demo.cjs
  - localTmp/main-ref-0310657/scripts/reddit-demo-timeline.js
  - localTmp/main-ref-0310657/scripts/full-demo-timeline.js
allowanceTokens: 60975
---

**P9 / D09 — Demo capture, docs, and delta audit close-out.** Ninth slice of the
2026-11-06..08 delta queue. Baseline `tauri-port` at `b0eec88` plus D01 (`20b610a`),
D02 (`60fdc7a`), D03 (`030662e`), D04 (`fd7a8c8`), D05 (`d4778d3`), D06
(`2fa1983`), D07 (`7c04a03`) and D08 (`97ed95c`); source `main` at `0310657`
(`96fd68c..0310657`). Main originals are in `localTmp/main-ref-0310657/`. D08
closed: feedback dialog, report composition, Settings entry, focus handling and
demo-order fix, plus Rust diagnostics/copy/open commands, copy-report offline,
issue templates and feedback checks; reports carry only the user's text plus the
listed device details. Its Electron UI check and `npm start` dialog smoke could
not run on the host (Electron failed to install correctly / no display); that
is recorded in `docs/STATE.md`, not claimed.

## Action

Port the demo timelines, the capture/record scripts that fit the Tauri host,
README/CHANGELOG updates and the new screenshots, then record the deliberate
exclusions (Leia SR presenter, Windows start.bat, Electron/Capacitor release
path, stray root file 1) and the still-unported base stylesheets. Run all Rust
gates and the renderer checks that this host can execute, and update
STATE/SUPPORT with what remains unverified. Do not restore main's Electron
release.yml or checks.yml.

## Scope and exclusions

- Adapt the demo timelines and capture/record scripts to the Tauri host; skip
  Electron-only capture.
- Record deliberate exclusions in STATE/SUPPORT; do not restore main's Electron
  release.yml or checks.yml; do not port the stray root file `1`.
- Update README/CHANGELOG/screenshots from main where they fit Tauri.

## Code to touch

`README.md`, `CHANGELOG.md`, `docs/SUPPORT.md`, `docs/STATE.md`,
`scripts/record-reddit-demo.cjs`, `scripts/reddit-demo-timeline.js`,
`scripts/capture-readme.cjs` (new unless present), `scripts/full-demo-timeline.js`
(new unless present), screenshots under `docs/media/`.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `docs/donot.md`
- `localTmp/main-ref-0310657/README.md`, `localTmp/main-ref-0310657/CHANGELOG.md`,
  `localTmp/main-ref-0310657/package.json`, `localTmp/main-ref-0310657/scripts/capture-readme.cjs`,
  `localTmp/main-ref-0310657/scripts/record-reddit-demo.cjs`, `localTmp/main-ref-0310657/scripts/reddit-demo-timeline.js`,
  `localTmp/main-ref-0310657/scripts/full-demo-timeline.js`
- `README.md`, `docs/SUPPORT.md`, `package.json`, `.github/workflows/release.yml`,
  `scripts/record-reddit-demo.cjs`, `scripts/reddit-demo-timeline.js`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 applies (manual paths stay filesystem paths).
Entry #4 governs Android SAF paths and is unaffected.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node scripts/check-feedback.cjs`
- `node scripts/check-artwork.cjs`
- `npm start` smoke: Tauri build starts without a startup error.

`electron scripts/check-feedback-ui.cjs` and `electron scripts/check-artwork-ui.cjs`
may not run on this host (no Electron runtime / display); record that
rather than claiming they passed.

## When this seed closes

Close D09 when the demo timelines and Tauri-fitting capture/record scripts are
ported, README/CHANGELOG/screenshots are updated, exclusions and unported
stylesheets are recorded in STATE/SUPPORT, all Rust gates and runnable renderer
checks are recorded, and what remains unverified is listed. Record the
verification in `docs/STATE.md` and seed P10/M03 from
`.babysteps/main-to-tauri.tasks.json`.
