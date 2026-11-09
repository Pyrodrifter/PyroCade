# Main-to-Tauri feature-parity follow-up

Feature parity, not a whole-branch merge. Two queues share this file: the active
2026-11-06..08 delta queue (D01-D09), then the remaining collection/artwork/platform
queue (M03-M06) from the earlier plan.

## Where the branches stand

- Baseline: `tauri-port` at `b0eec88` (`3e1432c` M02 plus the artwork-display fix).
- Source: `origin/main` at `0310657`; the delta is `96fd68c..0310657`, 32 commits.
  The earlier plan compared against `96fd68c`, and `main` was fast-forwarded from
  there to `0310657` after M01/M02 were planned.
- Completed already: M01 (`b1b29ac`) and M02 (`3e1432c`).
- Main originals for every read below are snapshotted in
  `localTmp/main-ref-0310657/` (ignored scratch; regenerate with the command under
  Reference snapshot if the directory is missing).

Keep Tauri v2 as the product runtime. Every forecast below is under the 225,000-token
work budget. The active model prices all stages at $0, so the $0.70 per-slice cap is
not approached; a paid model would be governed by the same cap. Existing desktop and
Android target constraints, the Android support limitations, and `docs/donot.md`
remain authoritative.

## Delta queue (active)

Every row prices the standing set — `docs/STATE.md`, this plan, its task list,
`docs/donot.md` and `.operator/specs/desktop-runtime.md` — plus the task's own reads.
`reads` is the row's whole priced set and `allowance` is the non-reading estimate; a
slice's seed copies both verbatim and `babysteps-budget --seed` rejects any file the
row does not price.

| slice | task | scope | reads | allowance |
|---|---|---|---|---:|
| P1 | D01 | Quiet interface palette, `interface.css`, grouped Settings, shortened copy, artwork type grid, transparent header. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-delta.tasks.json, renderer/index.html, renderer/styles.css, renderer/appearance.js, localTmp/main-ref-0310657/renderer/index.html, localTmp/main-ref-0310657/renderer/styles.css, localTmp/main-ref-0310657/renderer/appearance.js, localTmp/main-ref-0310657/renderer/interface.css | 87827 |
| P2 | D02 | Launcher chrome: `LibraryChrome`, `DetailsResize`, shelf space when details hide, `/` search, console previews and key navigation. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-delta.tasks.json, renderer/app.js, renderer/index.html, renderer/styles.css, localTmp/main-ref-0310657/renderer/app.js, localTmp/main-ref-0310657/renderer/index.html | 70827 |
| P3 | D03 | Flat graphite button-prompt SVG/PNG set, `build-prompts.js`, manifest and preview, prompt checks. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-delta.tasks.json, renderer/prompts.js, scripts/build-prompts.js, scripts/check-prompts.cjs, scripts/check-prompts-preload.cjs, localTmp/main-ref-0310657/renderer/prompts.js, localTmp/main-ref-0310657/scripts/build-prompts.js, localTmp/main-ref-0310657/scripts/check-prompts.cjs | 27828 |
| P4 | D04 | Page turn and media carousel replacing spinner and colour cards, retired-layout migration, selected-disc geometry, bookshelf disc peek and sizing, carousel checks. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-delta.tasks.json, renderer/app.js, renderer/appearance.js, renderer/library-ui.css, renderer/styles.css, scripts/check-carousel.cjs, scripts/check-library-ui.cjs, localTmp/main-ref-0310657/renderer/app.js, localTmp/main-ref-0310657/renderer/appearance.js, localTmp/main-ref-0310657/renderer/library-ui.css, localTmp/main-ref-0310657/renderer/styles.css, localTmp/main-ref-0310657/scripts/check-carousel.cjs, localTmp/main-ref-0310657/scripts/check-library-ui.cjs | 48827 |
| P5 | D05 | Back covers, cartridge lift, spine hinges, label z-offset, physical-media overrides, Super Famicom packaging, booklet proportions. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-delta.tasks.json, renderer/app.js, renderer/art.js, renderer/packaging.js, renderer/cartridges.js, renderer/styles.css, localTmp/main-ref-0310657/renderer/app.js, localTmp/main-ref-0310657/renderer/art.js, localTmp/main-ref-0310657/renderer/packaging.js, localTmp/main-ref-0310657/renderer/cartridges.js, localTmp/main-ref-0310657/renderer/styles.css | 53828 |
| P6 | D06 | Library cache and cache-first start, 16-way parallel scan, one listing per folder, tie-only size stats, disc side-file check, title sort, `startLibrary`/`applyLibrary`. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-delta.tasks.json, src-tauri/src/backend.rs, src-tauri/src/config.rs, src-tauri/src/lib.rs, renderer/app.js, renderer/tauri-bridge.js, scripts/check-library-ui.cjs, localTmp/main-ref-0310657/main.js, localTmp/main-ref-0310657/renderer/app.js, localTmp/main-ref-0310657/preload.js | 50827 |
| P7 | D07 | Polite web artwork source plus MarioWiki and Internet Archive front-cover fallbacks, disk cache, source UI and checks. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-delta.tasks.json, src-tauri/src/artwork.rs, src-tauri/src/backend.rs, renderer/artwork-ui.js, scripts/check-artwork.cjs, scripts/check-artwork-ui.cjs, .operator/specs/artwork-service.md, localTmp/main-ref-0310657/web-source.js, localTmp/main-ref-0310657/mariowiki.js, localTmp/main-ref-0310657/internet-archive.js, localTmp/main-ref-0310657/artwork.js, localTmp/main-ref-0310657/scripts/check-artwork.cjs, localTmp/main-ref-0310657/scripts/check-artwork-ui.cjs | 102827 |
| P8 | D08 | Feedback dialog, report composition, diagnostics/copy/open commands and issue templates. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-delta.tasks.json, renderer/index.html, renderer/styles.css, renderer/tauri-bridge.js, src-tauri/src/backend.rs, src-tauri/src/lib.rs, src-tauri/Cargo.toml, localTmp/main-ref-0310657/feedback.js, localTmp/main-ref-0310657/renderer/feedback-ui.js, localTmp/main-ref-0310657/renderer/index.html, localTmp/main-ref-0310657/renderer/styles.css, localTmp/main-ref-0310657/scripts/check-feedback.cjs, localTmp/main-ref-0310657/scripts/check-feedback-ui.cjs, localTmp/main-ref-0310657/.github/ISSUE_TEMPLATE/bug_report.md, localTmp/main-ref-0310657/.github/ISSUE_TEMPLATE/feedback.md | 67827 |
| P9 | D09 | Demo capture, README/CHANGELOG/screenshots, exclusion record, gates and the parity audit close-out. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-delta.tasks.json, README.md, docs/SUPPORT.md, package.json, .github/workflows/release.yml, scripts/record-reddit-demo.cjs, scripts/reddit-demo-timeline.js, localTmp/main-ref-0310657/README.md, localTmp/main-ref-0310657/CHANGELOG.md, localTmp/main-ref-0310657/package.json, localTmp/main-ref-0310657/scripts/capture-readme.cjs, localTmp/main-ref-0310657/scripts/record-reddit-demo.cjs, localTmp/main-ref-0310657/scripts/reddit-demo-timeline.js, localTmp/main-ref-0310657/scripts/full-demo-timeline.js | 60975 |
| P10 | M03 | Collection administration, user-added systems and games, hide/group/rename, per-game emulator selection, details editor, hidden list, drag order and Recomp menus from `64a5ba6`. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-to-tauri.tasks.json, renderer/app.js, renderer/tauri-bridge.js, src-tauri/src/backend.rs, src-tauri/src/config.rs, src-tauri/src/emulators.rs, scripts/check-library-ui.cjs | 104888 |
| P11a | M04a | Compatible LaunchBox/ScreenScraper provider behavior through the Rust artwork service only; manual workflows stay in M04b. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-to-tauri.tasks.json, src-tauri/src/artwork.rs, src-tauri/src/backend.rs, scripts/check-artwork.cjs, .operator/specs/artwork-service.md | 70000 |
| P11b | M04b | Manual discovery/download/viewing workflows (artwork.js manual handling, Art manual drawing, artwork UI) against the provider contract established in M04a. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-to-tauri.tasks.json, artwork.js, renderer/art.js, renderer/artwork-ui.js, scripts/check-artwork-ui.cjs | 55000 |
| P12a | M05a | Platform-aware launch behavior: Steam/SteamOS, Linux X11/gamescope, and launch logging only where missing. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-to-tauri.tasks.json, renderer/app.js, src-tauri/src/backend.rs, src-tauri/src/config.rs | 70000 |
| P12b | M05b | Emulator metadata and custom/PC game configuration: updated emulator/system metadata and custom/PC game configuration only where missing. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-to-tauri.tasks.json, emulators.json, src-tauri/src/emulators.rs, src-tauri/src/config.rs | 50000 |
| P13 | M06 | Remaining parity checks, Tauri release docs and target validation not already closed by D09. | docs/STATE.md, .babysteps/tauri-migration.plan.md, docs/donot.md, .operator/specs/desktop-runtime.md, .babysteps/main-to-tauri.tasks.json, scripts/check-library-ui.cjs, scripts/check-carousel.cjs, scripts/check-artwork.cjs, scripts/check-artwork-ui.cjs, .github/workflows/release.yml, README.md, docs/SUPPORT.md, src-tauri/Cargo.toml, src-tauri/tauri.conf.json | 95019 |

Order is strictly D01, D02, D03, D04, D05, D06, D07, D08, D09, then M03, M04a, M04b, M05a, M05b, M06 (M03 after D09; M04a after M03; M04b after M04a; M05a after M03; M05b after M03; M06 after M01, M04b and M05b).

## Exclusions

- Leia SR is Windows-only: an Electron offscreen renderer and a native D3D11
  presenter. No macOS, Linux ARM64 or Android target can use it, so `native/leia-*`,
  `renderer/leia-*`, `leia-output.js`, the `3D` button, `LeiaUI` and the snapshot
  IPC are excluded. Revisit only if a Windows target is added.
- Main's Electron release path, `checks.yml`, Capacitor `android/` project and
  `start.bat` are excluded. The Tauri `.github/workflows/release.yml` is authoritative.
- The stray 571 KB root file `1` added by `01b77fd` is not ported.
- Do not port all of `main`; port the listed behaviour and adapt it to the branch
  renderer.

## Renderer divergence to respect

The branch renderer is not a smaller copy of main's: at `b0eec88`, `app.js` is 50 KB
against main's 124 KB, `index.html` 19 KB against 34 KB, `packaging.js` 8 KB against
17 KB, and `cartridges.js` 6 KB against 17 KB. The branch has no `minimal.css` or
`physical-models.css` at all; its rules are merged into `styles.css`. Main's delta
patches therefore have to be translated, not cherry-picked, and whole-file imports
of `minimal.css`/`physical-models.css` are out of scope.

## Approved task list

`.babysteps/main-delta.tasks.json` for D01-D09, then `.babysteps/main-to-tauri.tasks.json`
for M03-M06. Do not change scope, estimates or order without re-planning.

## Reference snapshot

```sh
mkdir -p localTmp/main-ref-0310657
git archive 0310657 -- feedback.js main.js preload.js artwork.js web-source.js \
  mariowiki.js internet-archive.js CHANGELOG.md .github/ISSUE_TEMPLATE \
  scripts/build-prompts.js scripts/check-carousel.cjs scripts/check-library-ui.cjs \
  scripts/check-artwork.cjs scripts/check-artwork-ui.cjs scripts/check-feedback.cjs \
  scripts/check-feedback-ui.cjs scripts/check-prompts.cjs scripts/capture-readme.cjs \
  scripts/record-reddit-demo.cjs scripts/reddit-demo-timeline.js \
  scripts/full-demo-timeline.js renderer/app.js renderer/appearance.js \
  renderer/art.js renderer/packaging.js renderer/cartridges.js \
  renderer/library-ui.css renderer/library-ui.js renderer/styles.css \
  renderer/index.html renderer/prompts.js renderer/interface.css \
  renderer/minimal.css renderer/physical-models.css renderer/feedback-ui.js \
  renderer/xmb.css package.json README.md |
  tar -x -C localTmp/main-ref-0310657
```

