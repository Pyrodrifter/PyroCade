# PyroCade platform support

The fork's target set is macOS ARM64, Linux ARM64 on modern Snapdragon hardware, and Android ARM64. A target is not a shipping platform until its native artifact and platform-specific input, audio, and rendering paths have been validated.

| Platform | Native target | Release artifacts | Updates | Validation status |
|---|---|---|---|---|
| macOS | `aarch64-apple-darwin` | DMG; signed `.app.tar.gz` when updater keys are configured | Signed updater when configured; otherwise manual release | Native release job installs the DMG and smoke-launches the app. Controller, audio-device, and system-WebView rendering checks still require a physical-device pass. |
| Linux ARM64 | `aarch64-unknown-linux-gnu` | AppImage, DEB, RPM | Signed updater for AppImage when configured; package-managed installs use the release package | Native release job installs the DEB and smoke-launches the app. Controller, audio-device, and system-WebView rendering checks still require a physical-device pass. |
| Android ARM64 | Tauri Android ARM64 | Signed `arm64-v8a` APK on release runs; unsigned CI APK on pull requests | Manual release download; no Android updater | Debug APK built and installed on an Odin2 running Android 13 (API 33), system WebView 101.0.4951.61. Controller navigation was verified on-device. WebView Gamepad API query, AudioContext startup (48 kHz, stereo), canvas paint, and CSS preserve-3d/perspective were verified. Audio output was routed to the device speaker; subjective audio quality was not assessed. WebView reported repeated tile-memory-limit warnings during rendering. |

The legacy Electron UI scripts are not used as evidence for Tauri targets; P8's automated behavior evidence comes from Rust tests, and native release jobs smoke-launch installed artifacts. Controller, audio-device, and target-WebView validation is platform-specific; Android validation above applies only to the tested Odin2 and its current system WebView. Release binaries are Tauri applications.

## D09 delta close-out (2026-11-06..08)

D09 ports the demo timelines (`scripts/reddit-demo-timeline.js`, `scripts/full-demo-timeline.js`), Tauri-fitting capture harnesses (`scripts/capture-readme.cjs`, `scripts/record-reddit-demo.cjs`, fixture `scripts/readme-preload.cjs`), README/CHANGELOG and the nine `docs/media/screen-*.jpg` screenshots (copied from upstream main at `0310657`; illustrative layouts, not re-captured from the Tauri build). The 35-second `docs/media/pyrocade-demo.mp4` remains the branch demo; the 20-second Shrek demo was not re-recorded on this host.

Deliberately excluded on Tauri: Leia SR presenter (`native/leia-*`, `renderer/leia-*`, `leia-output.js`, F9/Shift+F9, snapshot IPC), Windows `start.bat`, the Electron/Capacitor release path (`checks.yml`, Capacitor `android/`, Electron Builder), and the stray 571 KB root file `1`. The Tauri `.github/workflows/release.yml` is authoritative; upstream Electron `release.yml`/`checks.yml` are not restored.

Still unported base stylesheets: `minimal.css` and `physical-models.css` (their rules remain merged into branch `styles.css`); only the rules `interface.css` needs were ported in D01. No visual inspection was performed for D09.

What remains unverified after D09: Electron UI checks (`check-feedback-ui.cjs`, `check-artwork-ui.cjs`, `check-carousel.cjs`, `check-library-ui.cjs`) and the `npm start` dialog-open smoke could not run on this host (no Electron runtime/display, no `tauri-driver`); capture harnesses and screenshot re-capture were not executed. See `docs/STATE.md` for the per-slice verification record.

## P10 M03 close-out (collection administration)

M03 implements hide/group/rename, user-added systems/games, per-game emulator selection, and the 64a5ba6 details editor, hidden list, and drag order where they fit Tauri. Switch updates/DLC group by title ID (base ID clears low 13 bits; base game scores +8, others -8). Hidden lives in `config.hiddenGames`, renames/details in `config.gameDetails`, per-game emulator in `config.gameEmulators`, drag order in `config.gameOrders`; all are backend-owned and preserved through `merge_config`/`config_for_save` so the renderer `set_config` cannot overwrite them. `extraGames` injection and `PC Games`-style direct launch are included; Recomp (Windows-only) and Leia SR are excluded per the seed scope, and the Electron `release.yml`/`checks.yml` are not restored. No visual inspection was performed. `scripts/check-library-ui.cjs` now asserts the M03 bridge and dialogs, but could not run on this host (`spawn tauri-driver ENOENT`); Rust gates and `node --check` passed. Do-Not #1 (manual paths stay filesystem paths) applies; #4 (Android SAF) is unaffected. See `docs/STATE.md` for the per-slice verification record.
