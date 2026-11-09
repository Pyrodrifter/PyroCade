---
slice: P8
stateFile: docs/STATE.md
donotCount: 4
seededFrom: 7c04a03
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-delta.tasks.json
  - renderer/index.html
  - renderer/styles.css
  - renderer/tauri-bridge.js
  - src-tauri/src/backend.rs
  - src-tauri/src/lib.rs
  - src-tauri/Cargo.toml
  - localTmp/main-ref-0310657/feedback.js
  - localTmp/main-ref-0310657/renderer/feedback-ui.js
  - localTmp/main-ref-0310657/renderer/index.html
  - localTmp/main-ref-0310657/renderer/styles.css
  - localTmp/main-ref-0310657/scripts/check-feedback.cjs
  - localTmp/main-ref-0310657/scripts/check-feedback-ui.cjs
  - localTmp/main-ref-0310657/.github/ISSUE_TEMPLATE/bug_report.md
  - localTmp/main-ref-0310657/.github/ISSUE_TEMPLATE/feedback.md
allowanceTokens: 67827
---

**P8 / D08 — In-app feedback reporting.** Eighth slice of the
2026-11-06..08 delta queue. Baseline `tauri-port` at `b0eec88` plus D01 (`20b610a`),
D02 (`60fdc7a`), D03 (`030662e`), D04 (`fd7a8c8`), D05 (`d4778d3`), D06
(`2fa1983`) and D07 (`7c04a03`); source `main` at `0310657` (`96fd68c..0310657`). Main originals are in
`localTmp/main-ref-0310657/`. D07 closed: polite 1/s web artwork fallbacks to
Rust (`mariowiki.json` / `archive-boxart.json` v2 30-day cache), front covers only
after Libretro/GameTDB, plus source display and checks. Its Electron UI check
and `npm start` smoke could not run on the host (no Electron runtime / display);
that is recorded in `docs/STATE.md`, not claimed.

## Action

Port the feedback dialog, report composition, the Settings entry, focus handling and demo-order fix, plus Rust commands for the diagnostics text, clipboard copy and opening the GitHub issue page. Keep copy-report working offline. Include the issue templates and feedback checks. Reports contain only the user's text plus the explicitly listed device details; do not attach screenshots or files automatically, and do not port the Electron preload IPC shape.

## Scope and exclusions

- Adapt the dialog and Rust commands to the branch Tauri bridge and backend; keep copy-report offline-capable.
- Do not attach screenshots or files automatically; reports hold only the user's text plus the listed device details.
- Do not port the Electron preload IPC shape; do not port Leia hooks.

## Code to touch

`renderer/index.html`, `renderer/styles.css`, `renderer/tauri-bridge.js`,
`renderer/feedback-ui.js`, `src-tauri/src/backend.rs`, `src-tauri/src/lib.rs`,
`src-tauri/Cargo.toml`, `.github/ISSUE_TEMPLATE/bug_report.md`,
`.github/ISSUE_TEMPLATE/feedback.md`, `scripts/check-feedback.cjs` and
`scripts/check-feedback-ui.cjs` (new unless present).

## Read these first

- `.operator/specs/desktop-runtime.md`
- `docs/donot.md`
- `localTmp/main-ref-0310657/feedback.js`, `localTmp/main-ref-0310657/renderer/feedback-ui.js`,
  `localTmp/main-ref-0310657/renderer/index.html`, `localTmp/main-ref-0310657/renderer/styles.css`,
  `localTmp/main-ref-0310657/scripts/check-feedback.cjs`, `localTmp/main-ref-0310657/scripts/check-feedback-ui.cjs`,
  `localTmp/main-ref-0310657/.github/ISSUE_TEMPLATE/bug_report.md`, `localTmp/main-ref-0310657/.github/ISSUE_TEMPLATE/feedback.md`
- `renderer/index.html`, `renderer/styles.css`, `renderer/tauri-bridge.js`,
  `src-tauri/src/backend.rs`, `src-tauri/src/lib.rs`, `src-tauri/Cargo.toml`

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 applies (manual paths stay filesystem paths).
Entry #4 governs Android SAF paths and is unaffected.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`
- `node --check renderer/tauri-bridge.js`
- `node --check renderer/feedback-ui.js`
- `node --check scripts/check-feedback.cjs`
- `node --check scripts/check-feedback-ui.cjs`
- `npm start` smoke: feedback dialog opens without a startup error.

`node scripts/check-feedback-ui.cjs` and renderer checks may not run on this
host (no Electron runtime); record that rather than claiming they passed.

## When this seed closes

Close D08 when the feedback dialog, report composition, Settings entry, focus
handling and demo-order fix are ported with Rust diagnostics/copy/open commands,
copy-report works offline, the issue templates and feedback checks are included,
and reports carry only the user's text plus the listed device details. Record the
verification in `docs/STATE.md` and seed P9/D09 from
`.babysteps/main-delta.tasks.json`.
