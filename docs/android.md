# PyroCade on Android — proof of concept

Electron doesn't run on Android. This proof of concept keeps the part of PyroCade that matters most, the HTML/CSS library in `renderer/`, and swaps the Node main process for a thin Android layer. It's built with [Capacitor](https://capacitorjs.com/) and lives entirely in `android/`. No desktop file was changed.

```
renderer/ (unchanged) ──copied by android/scripts/build-web.cjs──► android/www/
                                                                    + systems.js        (DEFAULT_SYSTEMS read from main.js)
                                                                    + android-bridge.js (window.api, replaces preload.js)
android/android/  native project: MainActivity + PyroNativePlugin.java (SAF, Intents, installed apps)
```

> **Experimental.** From 0.8.1, a debug-signed APK (`PyroCade-x.y.z-android-experimental.apk`) is attached to each main PyroCade release on GitHub, next to the desktop downloads. The release workflow builds it from the tag (the `android` job in `.github/workflows/release.yml`): its versionName is the tag and its versionCode is major×10000 + minor×100 + patch, so the Android files never need a version bump by hand. To rebuild just the APK for a tag, run the Release workflow with **android_only**, which leaves the release alone and keeps the APK as a workflow artifact. The desktop updater only looks for its own installer, so it never offers the APK. It is a proof of concept. Artwork download, manuals and the updater are not available, and launching an emulator has not been confirmed on a real phone yet. Expect rough edges.

## Build

You need:

| Tool | Version used | Notes |
|---|---|---|
| Node.js | 24 (Capacitor 8 needs 20 or newer) | |
| JDK | Temurin 21 | `JAVA_HOME` must point to JDK 21 (the project uses Gradle 8.14.3 + AGP 8.13, which do not run on the JDK 25 also installed here). |
| Android SDK | Platform 36, Build-Tools 35/36 | `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk` |
| Capacitor | 8.6 (`@capacitor/preferences` 8.0) | installed by `npm install` |

```bash
cd android
```

```bash
npm install
```

```bash
npm run sync
```

```bash
cd android && gradlew.bat assembleDebug
```

`npm run sync` runs `node scripts/build-web.cjs` (copies the renderer into `www/`) and then `npx cap sync android`. Run it every time `renderer/` changes. `npm run apk` runs all three steps. The APK is written to `android/android/app/build/outputs/apk/debug/app-debug.apk` (about 6.6 MB).

To install it on a phone with USB debugging turned on:

```bash
adb install -r android/android/app/build/outputs/apk/debug/app-debug.apk
```

## What was tested

- **Built:** `npx cap sync android` and `gradlew assembleDebug` succeed on this machine, and the APK contains the bridge and the system list.
- **On an Android emulator** (AVD `PyroCade_Test`: Pixel 7, Android 16 / API 36, x86_64, WHPX acceleration, WebView Chrome 133). Test files were placed in `/sdcard/ROMs/{snes,nes,gba,psx,psp}`.
  - The demo shelf, header, system chips and 3D cases render correctly in landscape.
  - **Choose ROM folder…** opens the system folder picker. After choosing `ROMs` and tapping **Allow**, the shelf showed the 6 expected games.
    - "Chrono Trigger (Japan)" was dropped in favour of the USA copy.
    - The FF7 disc was hidden behind its `.m3u`.
    - `snes/saves/` was skipped.
    - `psx/` was matched to PlayStation.
    - Each game got its `/storage/emulated/0/...` path.
  - Tapping **Open case** shows the case, cartridge and booklet. Tapping **Play** shows "RetroArch is not installed…", because no emulator app is on the AVD.
  - The native launcher was then called directly against installed apps:
    - An explicit component with string extras and a ROM URI grant started its activity. `dumpsys activity permissions` shows the `UriPermission` for the PSP game's SAF URI.
    - A missing activity is reported as "This emulator version does not accept games from other apps".
  - **Still not tested: a real emulator starting a game.** I tried to install RetroArch 1.22.2 (universal APK from the libretro buildbot) on the AVD. `adb install` of the 198 MB APK hung and froze the emulator's package manager, so the end-to-end launch is still unproven. It needs a real phone with RetroArch or PPSSPP.
  - **Fix found on the device:** a landscape phone gives the page only ~950×400 CSS px, but the desktop layout needs ≥1100×650. As a result, the shelf was empty and the info panel squeezed. The bridge now adds a `<meta name="viewport" width=…>` that keeps 650 px of height (1562×651 on this phone). `MainActivity` turns on `setUseWideViewPort` so the WebView scales the page to fit. Everything is about 55% size on a phone: readable, but touch targets are small.
  - **Small issue:** the demo banner, and so the **Choose ROM folder…** button, hides itself after a while. If it's gone, use Settings → Browse… instead.
  - To repeat this test, inspect the WebView from desktop Chrome at `chrome://inspect`. Debug builds allow it.
- **Bridge and renderer, tested earlier in a browser:** the unchanged renderer ran with `android-bridge.js` against a mock of the native plugin and Preferences. The test confirmed:
  - The "Choose ROM folder…" button turns the demo shelf into a real library.
  - Scanning applies the desktop rules: duplicate regions removed, `.m3u` kept instead of its discs, `saves/` skipped, and `psx/` matched to PlayStation.
  - A case opens, and **Play** sends the correct RetroArch intent (snes9x core, file path).
  - PSP builds a PPSSPP `ACTION_VIEW` with the SAF URI.
  - Dolphin, when missing, shows "not installed — get it from the Play Store or F-Droid".
  - The Emulators tab lists which Android emulators are installed.
  - No console errors.

### Testing on a device

1. Install RetroArch (Play Store or F-Droid) and open it once. Grant it **All files access** (Settings → Directory, or Android settings). It opens ROMs by file path.
2. Optionally, install PPSSPP.
3. Put ROMs in `Internal storage/ROMs/<system>/`. Folder names follow ES-DE: `snes`, `nes`, `gba`, `psx`, `psp`, `megadrive`, `gc`…
4. Open PyroCade, tap **Choose ROM folder…** on the demo banner and choose the `ROMs` folder. You can also set one folder per system under Settings → Browse….
5. Open a case and press **Play**. If the emulator doesn't start, run `adb logcat | grep -i -E "pyro|retroarch|ActivityTaskManager"` to see what happened.

## What works / what doesn't

| Area | State |
|---|---|
| 3D library, case view, themes, layouts, settings UI | Works on the Android emulator. It is the same renderer code, scaled to a 650 px-high virtual viewport. |
| Settings storage | Works. Capacitor Preferences, one JSON value. |
| ROM folders | Works on the Android emulator. Use the SAF picker, either one root with a sub-folder per system or one folder per system. Access persists after a restart. |
| Scanning | Works. Same systems, extensions and duplicate rules as `main.js`. Images next to ROMs or in `covers/`, `screenshots/`… are shown. |
| Launching | RetroArch (15 systems, core per system), PPSSPP, Dolphin, DuckStation and NetherSX2/AetherSX2. The recipes follow ES-DE/Daijisho and have **not** been tried on a device. |
| Emulators tab | Shows which apps are installed. "Install" and "Use existing .exe…" open the Play Store page; the labels are still the desktop ones. |
| Artwork download, LaunchBox, ScreenScraper | Stubbed. Nothing is downloaded. |
| Manuals | Stubbed. The PDF viewer relies on Chromium's plugin, which Android WebView doesn't have. |
| App updater, emulator installer, custom emulators | Stubbed. |
| gamelist.xml / info.json details | Not read yet. Easy to add in the bridge. |
| Controller | Not verified. Android WebView supports the Gamepad API, so `pollPad` should work. |
| Back button, immersive full screen, touch gestures | Not done. |

## Remaining work (rough effort)

| Piece | Effort | Notes |
|---|---|---|
| **Artwork pipeline** | 1–2 weeks | `artwork.js`, `launchbox.js` and `screenscraper.js` (~700 lines) use `node:fs`, streams, zlib and Electron `nativeImage`. Port them to run in the WebView: `fetch` + `CapacitorHttp` for CORS, `@capacitor/filesystem` for app storage, canvas/`createImageBitmap` for resizing and WebP. Saves go to app-private storage, served through `convertFileSrc`. |
| **LaunchBox index on device** | 3–5 days | The 100 MB `Metadata.zip` has to be streamed through an XML parser. In the WebView, that risks running out of memory on mid-range phones. Do it in Kotlin instead (`ZipInputStream` + `XmlPullParser`) and write the same JSON index. A pre-built index hosted by the project would also work. |
| **Manual viewer** | 2–4 days | Android WebView has no PDF plugin. Bundle pdf.js, or hand the PDF to an external viewer with an `ACTION_VIEW` intent (half a day). |
| **Controller input** | 3–5 days | Check the Gamepad API on real pads. Map the Android Back button and B to "close". Keep the D-pad from moving WebView focus. Hide the system bars. Show touch hints when no pad is connected. |
| **3D cases on mid-range phones** | 1–2 weeks to measure and tune | Many CSS 3D layers, large textures and `backdrop-filter` are the risks. Measure on something like a Snapdragon 7-series or Dimensity 7xxx. Fixes: a lower `motion` default, fewer cases on stage, smaller cover textures (≤1024 px), and turning off the animated XMB/ribbon canvas. Use `chrome://inspect` on a device to profile. |
| **Launch recipes** | 2–4 days | Test each emulator on a device. Add melonDS, Lime3DS/Azahar, Flycast standalone, Yuzu forks, Winlator, etc. Allow a per-system core choice and custom intent strings, like ES-DE's `es_find_rules`. |
| **Play Store rules** | ongoing, about 1 week up front | See below. |
| Polish (UI labels, back navigation, icons, splash, release signing) | 1 week | |

Overall, a usable Android release is roughly **5–8 weeks** of focused work on top of this proof of concept.

### Play Store notes

- Front ends are allowed (Daijisho is on Play). PyroCade must not ship or download ROMs or BIOS files, and must not link to sites that host them.
- Storage: the proof of concept uses SAF only. Play restricts `MANAGE_EXTERNAL_STORAGE` (All files access) to file managers and similar apps, so don't add it. RetroArch asking for it in its own app is fine.
- Package visibility: installed emulators are found through a `<queries>` list in the manifest. Play restricts `QUERY_ALL_PACKAGES`, so custom emulators have to be added to the list or launched blindly.
- Self-update and emulator installer: on Play, an app may not download and install other APKs (`REQUEST_INSTALL_PACKAGES` is restricted) or update itself. Keep these for an F-Droid or GitHub build only.
- Branding: case art and names that copy console packaging (Nintendo, Sony, Sega trademarks) are a takedown risk on Play. Downloaded box art carries the same risk. Use neutral store screenshots.
- Target API: new apps and updates must target a recent API level. The project targets 36.

## Recommendation: Capacitor vs. Tauri 2 mobile vs. native rewrite

**Stay with Capacitor.** Native work goes into Kotlin plugins where the WebView is weak: the LaunchBox index, intents and storage.

- **Capacitor:** reuses `renderer/` byte for byte, and this proof of concept already builds. Native code is small and plain Android (Java/Kotlin). Missing Node APIs are added one by one through plugins. Downside: the desktop main-process code doesn't carry over, so the artwork pipeline has to be ported.
- **Tauri 2 mobile:** uses the same system WebView, so rendering and performance would be identical. The main-process logic would need a rewrite in Rust, plus Kotlin for intents and SAF anyway. It only pays off if the desktop app moves to Tauri too, sharing one Rust core across Windows, macOS, Linux and Android. That is a much bigger decision than an Android port.
- **Native rewrite (Kotlin + Compose or a game engine):** best performance and controller handling, but every case model, theme and layout in the renderer would be rebuilt from scratch. That is months of work, and two UIs to maintain. Consider it only if testing on mid-range phones shows that the CSS 3D shelf can't reach a smooth frame rate after tuning.
