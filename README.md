# PyroCade

![PyroCade — Your collection. A little more alive.](renderer/assets/brand/pyrocade-banner.png)

A glass-styled emulator front end with a 3D library, animated physical media, four browsing layouts and a built-in emulator downloader and updater.

[![Watch the PyroCade demo](docs/media/pyrocade-demo.jpg)](docs/media/pyrocade-demo.mp4)

**[Watch the 35-second demo](docs/media/pyrocade-demo.mp4)** · [Appearance & sound](#library-appearance-and-sound) · [Controller support](#button-prompts)

## Install
Download **PyroCade-Setup-x.y.z.exe** from the [latest release](https://github.com/Pyrodrifter/PyroCade/releases/latest) and run it. The installer isn't code-signed yet, so Windows SmartScreen may say "Windows protected your PC": click **More info → Run anyway**.

Installed copies keep their settings, emulators and artwork in `%APPDATA%\PyroCade\data`. PyroCade checks for new releases when it starts and can update itself from the banner or **Settings → PyroCade updates**.

### Linux
Every release has 64-bit (x86_64) Linux builds:

| Distribution | Download | Install |
| --- | --- | --- |
| **SteamOS** (Steam Deck) and any distro | `PyroCade-x.y.z-x86_64.AppImage` | In Desktop Mode, right-click the file → Properties → Permissions → *Is executable*, then open it. To play from Game Mode, add it in Steam with *Add a Non-Steam Game*. |
| **Ubuntu**, Debian, Linux Mint, Pop!_OS | `pyrocade_x.y.z_amd64.deb` | `sudo apt install ./pyrocade_x.y.z_amd64.deb` |
| **Fedora**, Nobara, openSUSE | `pyrocade-x.y.z.x86_64.rpm` | `sudo dnf install ./pyrocade-x.y.z.x86_64.rpm` |
| **Arch**, Manjaro, EndeavourOS, CachyOS | `pyrocade-x.y.z-x86_64.pkg.tar.zst` | `sudo pacman -U ./pyrocade-x.y.z-x86_64.pkg.tar.zst` |

On Linux, settings and emulators are kept in `~/.config/PyroCade/data`. The emulator downloader installs the official Linux AppImages. The AppImage updates itself; the .deb, .rpm and Arch packages show the update banner and are updated by installing the new package.

On Ubuntu 24.04 and newer, prefer the .deb: AppImages built with Electron need to be started with `--no-sandbox` there because of Ubuntu's AppArmor rules.

## Run from source
    npm ci
    npm start

Build the installer with `npm run dist` (output in `dist/`).

## Releasing an update
Raise `version` in `package.json`, commit, then push a tag `v<version>` (for example `git tag v0.3.0 && git push origin v0.3.0`). The **Release** GitHub Action builds the Windows installer and the Linux packages, smoke-tests Linux, and attaches them to a draft release. Publish the draft, and installed copies offer the update on their next start.

## Brand assets
The flame and play-button mark, glass app icon, wordmark and banner are in `renderer/assets/brand/`. The set includes SVG masters, PNG icons from 16 to 1024px, a transparent wordmark and a multi-resolution Windows `.ico`. The header mark follows the selected colour theme. Rebuild the complete set with `npm run brand:build`.

## Use
- **Settings**: set a ROM folder for each system, pick its emulator, then click *Save & rescan*.
- **Emulators**: *Install* downloads the latest Windows build from the project's official GitHub releases into `data/emulators/<id>`. *Check all for updates* compares your copy with the newest release, and updates are copied over the old files so emulator settings survive. *Use existing .exe…* links an emulator you already have. *Add your own emulator* covers anything not in the list (Eden, Dolphin, RetroArch…).
- **Library**: ← → to browse, ↑ ↓ to switch system in Carousel/Flipbook, Enter to play, Space to open the case, M for the manual. Vertical stack uses ↑ ↓ to browse; Colour cards uses the arrow keys as a grid. Controllers work too (A play, B back, Y case, X manual, LB/RB system).

## Library appearance and sound

The compact 36px systems rail uses translucent glass, console icons, short labels and game counts. Scroll it with the mouse wheel, the edge arrows, or focus it and use the arrow keys. Full names appear in tooltips and in **All systems**. **Ctrl+K** opens the searchable system browser; the controller Menu/Start button opens it too. Configured empty systems remain available. Press **/** to search games and use the × button or Escape to clear the search.

Open **View & theme** in the header for live changes that save automatically:

- **Carousel**, **Vertical stack**, **Flipbook** and **Colour cards** offer different browsing layouts. Every view keeps Play, Open case, Manual and Artwork controls. Colour cards take their background colours from the game art.
- **Ember**, **Glacier**, **Violet**, **Mint** and **Rose** change the accents, highlights and ambient lighting.
- **Interface sound** controls synthesized scroll ticks, system-change tones, confirmations, case opening/closing and launch/error cues. Sound starts at 25%; mute, adjust the slider or use Test to preview. Cues are short, throttled and generated locally without downloaded audio or background music.

**Ambient mode.** A slow, theme-coloured ribbon background drifts behind the library, and the on-screen key hints fade out a few seconds after you stop using the controls. After the idle time set in **Settings → Ambient mode** (default 2 minutes), the interface hides, a large clock appears and PyroCade drifts through the current collection every 11 seconds, like a screensaver. Any key, click, mouse movement or controller input wakes it; that first input is not passed on, so it can't launch a game. Choose the background in **View & theme → Background** or **Settings → Background**: the **XMB ribbon**, an animated 16-bit style **pixel-art day** scene (drifting clouds, scrolling hills and pines, birds) or **night** scene (stars, moon, shooting stars, a lit-window skyline, fireflies), **pixel art that follows the time of day**, or **Off** for a plain background that only uses the game's colours. **Interface motion → Reduced** freezes whichever you pick.

Cases without a spine scan wrap the cover's edge colours around a generated spine, and plastic cases have a moulded hinge groove. Put a real `spine.png` in a game's artwork folder (or use **Artwork → Use your own image → Spine**) and it always wins. The built-in scrapers (Libretro, GameTDB) don't carry spine art.

Keyboard and controller navigation follow the chosen layout. In the system browser, the controller's west face button opens appearance controls; use the D-pad/stick to choose layouts/themes or adjust volume. All visual motion still follows **Settings → Interface motion**. Run `npm run ui:check` to verify navigation, layouts, themes, saved settings, minimum-window sizing and offline-rendered sound.

## Button prompts
The frontend includes **283 matching prompts** for Xbox, PlayStation, Nintendo, generic gamepads, keyboard and mouse. Hints and action buttons automatically follow the last input used. Choose a fixed family in **Settings → Button prompts**, then **Save & rescan** to keep it. Face-button actions use physical positions: Nintendo B plays and A goes back. Triggers jump ten games in the library and zoom in the case viewer; the top face button opens/closes the case lid.

Browse the complete set in `renderer/assets/prompts/preview.html`. Scalable SVGs, transparent 64/128 px PNGs, the inventory and usage notes are in `renderer/assets/prompts/`. Rebuild with `npm run prompts:build`, export PNGs with `npm run prompts:export`, and verify integration with `npm run prompts:check`.

## Living carousel
Selecting a game reveals its physical media after a short pause: discs slide out from behind the case, and cartridges lift out with system-specific shells for Nintendo handhelds, Switch, NES/SNES/N64, Sega and Atari. The shelf uses six-sided boxes with cover art, spines, depth, soft reflections and a gentle idle movement. The full case viewer uses the same disc and cartridge models.

Cartridges have separate molded contours and label layouts for 12 systems: black Switch and red Switch 2 cards, DS/3DS cards with their corner cuts and tabs, the three Game Boy shells, NES, SNES, N64, Genesis and Atari 2600. Shell thickness follows each contour, with embossed details and grip grooves; exposed gold contacts are omitted. Preview the models with `npx electron scripts/preview-cartridges.cjs` (`output/cartridge-models.png`).

Boxes use system packaging profiles: clear jewel cases and hinges, coloured plastic rims, slim Switch cases, DS/3DS cases and folded cardboard boxes with appropriate thicknesses. Cardboard opens at the top, and its cartridge lifts through the flap. Generated spines use system branding, colours, fitted titles and publisher text when available; PS2 filename regions select light PAL or dark US/Japanese layouts. Switch 2 spines carry artwork around the side. Real spine scans always take priority. These generated layouts approximate the packaging when a scan is missing; they are not reproductions of each title's original printed spine. Preview and verify with `npx electron scripts/preview-packaging.cjs` (`output/packaging-models.png`).

Raised bevels and layered rim highlights give the shells more depth while leaving cover files intact. Jewel cases, plastic and cardboard have different surface finishes. Move the pointer across the selected box for a soft moving highlight; reduced motion keeps it static. The shelf adds a faint cover reflection and a contact shadow. Open plastic cases include booklet clips and closure latches.

Use the on-screen arrows, mouse wheel, keyboard or controller to browse. Fast scrolling cancels old reveal animations. The shelf resizes around the title, description and screenshot so game details and button prompts remain visible. **Settings → Interface motion** follows Windows by default; choose **Reduced** for instant previews without idle movement, or **Full** for animated media and light. Save & rescan keeps the preference.

Run `npm run carousel:check` for the isolated interaction and layout check. It verifies disc/cartridge reveal, box depth, rapid selection, case open/close cancellation, keyboard focus, empty search, reduced motion and the minimum 1100 × 650 window. Captures are saved under `output/`.

## Artwork
Box art and screenshots download automatically from the free libretro thumbnail archive as you browse, and are cached in `data/media/<system>/covers` and `screenshots`. Your own artwork always wins. See Settings → *Artwork folders*. Both folder-per-game (`front.png`, `back.png`, `spine.png`, `disc.png`, `manual.pdf`, `screenshot.png`, `fanart.jpg`, `video.mp4`, `info.json`) and ES-DE/Skraper layouts are supported, as is `gamelist.xml`. Anything missing gets generated art.

Use the **Artwork** tab for explicit downloads. Choose **Selected game**, **One system**, or **Entire library**, select covers/screenshots/title screens, then **Download artwork**. The **Artwork** button beside Play opens the downloader for that game. Downloads update the library as they arrive; the tab shows progress, recent results, kept images, unavailable matches, unsupported systems and errors. **Cancel download** stops the batch; start again to continue because completed files are kept. A running batch can also be followed after navigating away or reloading the renderer.

**Refresh matches and retry missing artwork** retrieves fresh source lists and retries previous misses. Existing art is never replaced. Custom artwork in your configured artwork folder or ROM folders takes priority over the download cache. Covers no longer prevent missing screenshots from downloading. Title screens are stored in `data/media/<system>/titlescreens` and shown when no gameplay screenshot is available. **Open artwork folder** opens the download cache.

The built-in sources require no account or API key. The public [Libretro thumbnail archive](https://docs.libretro.com/guides/roms-playlists-thumbnails/) provides covers, gameplay screenshots and title screens for supported retro systems. **Nintendo Switch uses [GameTDB](https://www.gametdb.com/Switch/downloads)** for box covers, back covers and cartridge labels. Choose Nintendo Switch in Artwork, select the available image types, and click Download artwork. Switch screenshots and title screens are disabled because GameTDB does not supply them. Product names are matched after removing filename tags and version numbers; available US, English and Japanese artwork is tried in that order. JPEG covers are normalized to PNG through Electron's image decoder.

For any game without a match, open its **Artwork** button and use **Use your own image → Choose image…**. Choose the artwork type, then pick a PNG, JPG or WebP file. The selected type is explicitly replaced and the library updates immediately. This also works for Switch 2 and systems without a downloader source. Images are copied into a per-game artwork folder, so they survive rescanning and restarting; downloads continue to preserve them. Spines, manuals, videos and other images not provided by the selected source can still be supplied through artwork folders.

GameTDB's red eShop placeholders get an art-first sleeve with larger game artwork, readable titles and a matching cartridge preview. Higher-resolution artwork is cached separately in `data/media/switch/cover-hq`; original downloads stay intact. Choose **Settings → eShop covers → Original downloaded cover** to restore the source presentation. The same sleeve appears in the carousel and case viewer. Run `npm run eshop:check` to verify detection, display, settings and preservation of the originals.

Switch 2 covers can be supplied through **Use your own image**. Square product photos are fitted to the case by trimming their white side margins in the display. Switch 2 does not yet have an automatic download provider. Game artwork is cached locally and is not included in the repository.

Run `npm run artwork:check` to verify the download service and the integrated UI without modifying your ROMs, emulator settings or real artwork.

## Emulator catalog
`emulators.json` lists each emulator's GitHub repo, a regex for the Windows download, a regex for the program file, and the default launch arguments. Edit it to add more.

## Your data stays local
Everything personal lives in `data/` next to the app and is not part of this repository: `data/config.json` (your ROM folders and emulator paths), `data/emulators/` (emulators installed by PyroCade) and `data/media/` (downloaded artwork).

## Legal
PyroCade is only a launcher. It does not include or download games, BIOS files or console firmware/keys. Use dumps of games and systems you own. Emulators are downloaded from their own official GitHub releases and remain under their own licenses.

## License
MIT. See [LICENSE](LICENSE).
