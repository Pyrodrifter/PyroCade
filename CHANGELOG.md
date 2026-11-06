# Changelog

All notable changes to PyroCade. Downloads are on the [releases page](https://github.com/Pyrodrifter/PyroCade/releases).

## [Unreleased]

### Added
- **An emulator per game:** the new **Emulator** button next to Play chooses the emulator for just that game, such as a fork made for one game, or **Run the file itself**. **Same as <system>** goes back to the system's emulator. The list shows the system's emulators first, then the ones you added or installed.
- **Favourites:** press **F** (Select on a controller) or **☆ Favourite** to star a game. Starred games get their own **Favourites** shelf next to All games.
- **Play time:** PyroCade counts how long each game runs and shows "12 h played" and "Last played yesterday" with the game's details. A **Recently played** shelf lists the last 30 games you played. Shortcuts opened through Windows (such as Steam `.url` files) count as played, but their time can't be measured.
- **Sort and filter:** **Sort** (title, newest, oldest, most played, last played, developer) and **Show** (multiplayer, not played yet, or a genre) sit under the shelf.
- **Random game:** **⚄ Random** under the shelf, or the left stick button, jumps to a random game.
- **PyroCade opens where you left it:** the system, the selected game in each system, and the sort and filter are kept between starts.
- **Multi-disc games:** "Game (Disc 1)", "(Disc 2)"… files become one game, with **Start with Disc 1 / 2 / 3** in the case view (LB/RB on a controller). The disc you choose is remembered. PlayStation games get a playlist (`.m3u`) so the emulator can still change discs during play.
- **Your screenshots:** screenshots taken in the emulator appear under the open case. Click one to view it full size. PyroCade looks in the screenshot folders of DuckStation, PCSX2, Dolphin, PPSSPP, RetroArch and the game's own emulator, and matches screenshots by the game's title.
- **Hold Select + Start to quit:** while a game is running, hold Select and Start (View and Menu, Share and Options, − and +) for 1.5 seconds to close it and return to PyroCade.
- **GameCube mini discs:** GameCube games show an 8 cm disc, and the GameCube case tray matches it.
- **PSP UMDs** are shown as a disc in its plastic shell. PlayStation discs have their black data side, Wii discs a white hub, Wii U discs a rounded edge, and Dreamcast discs the GD-ROM ring.
- **Settings → Show cases at their real sizes:** a Game Boy box next to a PS2 case looks as small as it really is.
- **Hide a system:** an empty system's shelf has a **Hide** button, and **Settings → Show** turns any system on or off. A hidden system and its games leave every shelf until you show it again.
- **Settings → Used copies:** scuffed cases, worn corners, faded labels and light scratches on discs and cartridges.

### Changed
- **PyroCade no longer minimizes when a game starts.** The game opens on top of it, and PyroCade comes back to the front when the game closes. While a game is running behind it, PyroCade stops its animations and ignores controller input other than **hold Select + Start**. The "Minimise PyroCade while a game is running" setting is removed.
- **Each system remembers its selected game:** switching back to a system shows the game you had selected there.

### Fixed
- **SteamOS Game Mode** (Steam Deck, Legion Go S): PyroCade could open in Desktop Mode but not from Steam in Game Mode. When Steam starts it on Linux, PyroCade now restarts itself once without Steam's overlay and runtime libraries, without Chromium's sandbox, and on X11 under gamescope. No launch options needed. `PYROCADE_STEAM_FIX=off` turns this off.
- **A log file** in `data/logs/pyrocade.log` (on Linux `~/.config/PyroCade/data/logs/`) records each start, so a start that fails can be looked into.
- After clicking a button with the mouse, **Enter**, **Space** and the arrow keys no longer get stuck on that button. They control the shelf again.

## [0.4.4] - 2026-11-05

### Added
- **Cartridge colours:** every cartridge can have its own plastic colour. PyroCade uses, in this order:
  - **your own colour**, chosen in **Artwork → Change an image → Cartridge colour**, with **Automatic** to go back;
  - **the real colour**, read from a photo of the actual cartridge when one is downloaded;
  - **a built-in list** of famous coloured cartridges, such as gold Ocarina of Time and Majora's Mask, the gold NES Zelda games, yellow Donkey Kong 64, and the coloured Pokémon cartridges on Game Boy Color and Game Boy Advance.
- **N64 cartridges** have the real shape, measured from a retail cartridge: one smooth curved top with rounded corners, straight sides with the side grooves moulded into the face, seams beside the label, and a tall label with rounded corners.
- **Switch 2:** `.nup` files are picked up in Switch 2 folders and passed to your emulator. Existing settings get the new file type once.

## [0.4.3] - 2026-11-05

### Added
- **PC games:**
  - A new **PC Games** system takes a folder of shortcuts (`.lnk`, Steam `.url`) or game programs (`.exe`).
  - Games start directly, with no emulator. Batch files and shortcuts open the way Windows would.
  - Only the folder itself is searched, so installers and helper programs inside game folders are left out.
  - Artwork and details come from LaunchBox's Windows games.
- **Add game…** in Settings adds a single game file to any system. A program inside its own folder is named after that folder. Added games are listed under "Games you added" and can be removed.
- **Add system…** in Settings creates your own system with a name, colour, case style (disc or cartridge), file types, ROM folder and emulator. Your own systems can be removed again.
- Any system can use **Run the file itself** instead of an emulator.

## [0.4.2] - 2026-11-05

### Added
- **macOS:**
  - Disk images (.dmg) and zips for Apple Silicon and Intel Macs, built and smoke-tested on every release.
  - Emulators can be linked as `.app` bundles, and PyroCade starts the program inside.
  - The release-file guess for custom emulator repositories also knows Mac downloads.

## [0.4.1] - 2026-11-05

### Changed
- The header spells out PYROCADE when the app opens, then folds down to **PC**. Hover over it to see the full name again.

## [0.4.0] - 2026-11-05

### Added
- **Manuals:**
  - Manuals in extras folders such as `00 Goodies\Manuals` are found automatically and matched by title, even when names differ slightly or drop a brand ("DreamWorks", "Nickelodeon", "Disney-Pixar").
  - **Find manuals in a folder…** in Artwork matches a whole folder of PDFs to your library.
  - Add a manual to one game with Change an image → Manual (PDF).
  - Manuals can be downloaded from ScreenScraper when you're signed in.
  - Manuals open **inside PyroCade**, in a full-screen PDF viewer with zoom, pages and search. Close it with Esc or a controller's back button, or use "Open in your PDF reader".
- **Bookshelf** library mode: cases stand spine-out side by side, and the selected game slides out to show its cover.
- **Spinner rack** library mode: a rotating store tower with three tiers of cases. Browsing turns the tower, and the selected game pops out.
- **Start animation:** pressing Play spins the disc into a drive slot or pushes the cartridge half-way into its slot, where it stays sticking out like a real one; the game starts as it goes in (about 2.5 seconds). Can be turned off in Settings, and is skipped with reduced motion.
- **Game details** from the LaunchBox database: description, year, developer, publisher, genre and players. They fill only empty fields and need no extra downloads.
- **Clear logos** in place of the game title, **real spine scans** on the shelf, and **background fanart** behind the selected game.
- **Other versions…** in Artwork → Change an image: pick a different cover, spine, disc, logo or background from the online sources.
- Real cartridge labels for NES, SNES, N64, Genesis, DS and 3DS. The 3D NES, N64 and Genesis cartridges place their label where the real one sits.
- Download progress for the LaunchBox database.
- Automatic checks on every pull request.

### Changed
- **Much smaller artwork:** images are capped (covers at 1600 px) and photos are stored as JPEG, about 0.2–0.8 MB each instead of 10–15 MB. Oversized images saved by 0.3.0 are shrunk once, in the background.
- **Generated spines follow each system's retail design:** a logo band in the system's colours (red Switch band over a white spine, green Xbox band, blue Wii U band, PlayStation logo running down a black spine) instead of borrowing the cover's colours.
- Emulators, Artwork and Settings use the same calm style as the top bar.
- Automatic artwork lookups no longer start the 100 MB LaunchBox download; only a download you start does.

### Fixed
- An out-of-date LaunchBox database is never re-downloaded in the background (library scans, automatic lookups); only an artwork download you start refreshes it, and "Refresh matches" does so at most once a day.
- Library scans no longer wait for game details; they fill in right after the library appears.
- Keys and controller input are ignored while a game is starting.
- The instruction booklet in an opened case no longer turns into a floating line when viewed from the side: it has real thickness now.
- **Sharper covers no longer replace images you chose yourself.**
- The emulator Source form keeps what you typed while an install is running.

## [0.3.0] - 2026-11-05

### Added
- **LaunchBox Games Database** as the first artwork source, with no account needed. It provides full-size covers (often 1000–3000 px), back covers, screenshots, title screens and disc scans. Its game list (about 100 MB) is downloaded once and refreshed monthly.
- **Replace low-resolution covers with sharper copies** option in Artwork.
- Real cartridge labels for Game Boy, Game Boy Color and Game Boy Advance, cropped from full cartridge photos. Real disc scans for PS1, PS2, GameCube and Dreamcast.
- Optional **ScreenScraper** artwork source, with an encrypted login under Artwork → Sources.
- **Emulator forks:** each emulator's **Source…** editor accepts a fork or any GitHub repository, optional dev builds and optional file patterns. **Check repo** previews what would be installed, and **Use official** switches back.
- **Add your own emulator** from a GitHub repository, with automatic downloads and updates. The download file and program are guessed when no pattern is given.
- Selectable **backgrounds**: XMB ribbon, Orbit, Constellation, Towers & orbs, Loom, animated pixel-art day/night/auto, or off.
- **Idle screensaver** with a large clock that drifts through your collection. The input that wakes it never launches a game.

### Changed
- Brand, page tabs, systems and search share **one slim top bar**. The selected tab and system are marked with a soft pill and an accent underline.
- Calmer library: shelf heading and badges hidden, arrows shown on hover, hints fade when idle, two-line descriptions, and the demo banner fades by itself.
- Plastic cases have a hinge groove, and generated spines take their colours from the cover.

### Fixed
- RPCS3 couldn't install, because its Windows download is now named `…_win64_msvc.7z`.
- WebP images with a `.jpg` name are now read correctly, and one unreadable image no longer hides the next candidate.

## [0.2.1] - 2026-11-05

### Added
- Systems can have several ROM folders, separated by `|` or added with **+ Add**. Missing folders, such as an unplugged SD card, are skipped.
- Switch 2 games get artwork from GameTDB.

### Changed
- Removed marketing-style taglines and decorative labels, and hid extra headings, hints and the input badge.

## [0.2.0] - 2026-11-04

### Added
- **Linux packages:** AppImage, deb, rpm and pacman.
- Linux download rules (official AppImages) for all 11 catalog emulators.
- Self-update on Linux: the AppImage replaces itself, and distro packages show an update banner.
- Release workflow that builds Windows and Linux, smoke-tests the AppImage and .deb, and attaches everything to a draft release.

### Changed
- Emulator installs handle single-file AppImages, use the Linux extract tools and mark programs executable. Old versioned AppImages are cleaned up.

## [0.1.0] - 2026-11-04

### Added
- First release: a 3D carousel launcher with box art, manuals and disc/cartridge reveals, an emulator downloader and updater, artwork fetching, and controller button prompts.
- Windows installer, plus an update check on start that offers the new setup or source zip.
- PyroCade flame-play branding and app icon.

### Fixed
- Emulator links and custom emulators are protected from stale settings saves, and the linked `.exe` is kept apart from the catalog's file pattern.
- Launching finds the ROM by game ID, keeps `$` in paths, and only minimizes once the emulator has started.
- Settings are saved atomically, and a damaged settings file is backed up instead of overwritten.

[0.4.4]: https://github.com/Pyrodrifter/PyroCade/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/Pyrodrifter/PyroCade/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/Pyrodrifter/PyroCade/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/Pyrodrifter/PyroCade/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Pyrodrifter/PyroCade/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Pyrodrifter/PyroCade/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Pyrodrifter/PyroCade/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Pyrodrifter/PyroCade/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Pyrodrifter/PyroCade/releases/tag/v0.1.0
