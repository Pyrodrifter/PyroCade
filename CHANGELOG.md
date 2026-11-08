# Changelog

All notable changes to PyroCade. Downloads are on the [releases page](https://github.com/Pyrodrifter/PyroCade/releases).

## [Unreleased]

## [0.8.0] - 2026-11-08

### Added
- **Page turn layout.** Cases swing across a spine like the pages of a book: the games you have passed lie open on the left showing their back covers, and the selected one stands open on the right.
- **Media carousel layout.** The games themselves instead of their cases: every disc, mini disc, UMD and cartridge on a carousel, with the selected disc spinning.
- **A new 20-second demo** and new README screenshots, including the two new layouts.
- **Android:** an updated experimental build with everything in this release (see the `android-v0.8.0-experimental` pre-release).

### Changed
- **The library opens straight away.** PyroCade shows the library it found last time and rescans your folders in the background, redrawing the shelf only if something changed. On a 7,691-game library on a hard drive the shelf appeared after about 0.8 s instead of 2.6 s.
- **Scans are about four times faster** (about 0.6 s instead of 2.3 s on the same library). Folders are read in parallel and listed only once per scan, and the file sizes used to choose between copies of a game (US and EU releases, for example) are remembered between scans. **Save & rescan** in Settings still reads them all again.
- **Switching consoles is about twice as fast** (about 75 ms instead of 145 ms, and 245 ms instead of 610 ms for the first switch to All games). Generated back covers for games without a scan are drawn in the background, one per frame, and filled in as they are ready; the case view draws its back cover at once.
- **A cartridge comes up out of its cardboard box.** In the case view it rises straight out of the open top and glides forward in one smooth, untilted motion to rest above the box, in front of the flap, so the whole label shows.
- Super Famicom boxes keep their real proportions, the Bookshelf leaves room beside the pulled-out case for its disc, and hinged cases fold open around their spine.
- **Spinner rack and Colour cards are replaced by Page turn and Media carousel.** If one of them was your layout, PyroCade opens in its replacement.

### Fixed
- **Cartridge labels no longer go blank** when a cartridge is seen at an angle. The label sat a tenth of a pixel above the shell, close enough that the plain shell was sometimes drawn over it.
- **A turning case no longer shows its disc or cartridge on its back** in Page turn.
- The cartridge no longer passes through the open flap of a small cardboard box (Game Boy Advance) as it comes out.

## [0.7.0] - 2026-11-08

### Added
- Optional Leia SR stereo on Windows. Press **F9** for 3D and **Shift+F9** for depth, popout, convergence and stereo FPS. Stereo needs a compatible display and the Leia SR runtime.
- Shelf-edge previews, drag-to-reorder, editable game versions and media models, custom screenshots, and a Recomp shelf for standalone Windows games.
- **Report a problem or send feedback from Settings.** Describe an error or suggestion, optionally include the app version and basic device details, then review and submit a prefilled public GitHub issue. **Copy report** works offline. The repository also has problem and feedback templates.
- **Two more places to find a missing front cover: the Super Mario Wiki and the Internet Archive.** When LaunchBox, ScreenScraper, GameTDB and Libretro have no cover, PyroCade now asks the [Super Mario Wiki](https://www.mariowiki.com/) for Mario, Yoshi, Wario, Donkey Kong and Smash Bros. games, then the Internet Archive's [box scan collection](https://archive.org/details/softwareboxart). They are only ever a last resort, so a game that already gets a cover keeps the same one. A wrong cover is worse than none, so a picture is used only when it is filed under the game's own system, named as the front of the box and shaped like one (collectors often scan a box flat, flaps and all, and call it the front): full wraps, cartridge scans, store displays, promos and fan-made covers are skipped, and so are demos, prototypes and ROM hacks, which share a name with the original game. Both sites are run by volunteers: PyroCade asks each at most once a second, reads the wiki's raw page text (its robots.txt allows that, not its API), and keeps the answers for a month. GamesDatabase.org was considered too, but its terms forbid automated queries.

### Changed
- Charcoal interface, brighter accents, a transparent top bar and flatter, centred keyboard and controller prompts.
- Hiding game details makes more room for the shelf. Cartridges rise higher so their labels are visible.
- Large libraries skip unnecessary file-size checks, reuse neighbouring shelf previews and do less rendering work in Bookshelf and Spinner rack.
- **Bookshelf spines are twice the size and readable.** The layout took its size from the same scale as every other layout, which stops growing at 1.16, so on a 1920×1080 screen the whole shelf sat 600px wide in the middle with spine titles 8px tall. It now sizes the shelf from the room it has: standing cases fill about half the stage height, titles come out around 16px on that screen (24px on 2560×1440), and the case you pulled out grows with them while staying clear of the header and the game details. Every case also stands on the same line now; the cardboard boxes used to sit slightly lower than the rest.
- **The cartridges look like moulded plastic rather than modelling clay.** Every shell now catches a sheen off the top left, bounces a little light back from the bottom right, darkens where the face turns into its own walls and ends on a crisp lit edge, instead of sitting under one flat wash. Ribs, raised panels and the label recess all got the same lift.
- **The Nintendo 64 cartridge has lost the two raised rectangles** either side of its label. A real cartridge is smooth there; the moulding seams that are genuinely on the face are unchanged.

### Fixed
- **The cartridge no longer cuts through the front of a cardboard box.** Opening a Super Nintendo, Nintendo 64 or Atari 2600 case drew the bottom of the cartridge across the cover art and left it there once the box was open. Those cartridges are nearly as deep as the box itself, so one lifted 8px towards you came out through the front of it. The cartridge now rises behind the box, which hides the part still inside, and always stops clear of the top edge.

## [0.6.0] - 2026-11-06

Entries marked *(u/RiceDesperate5724)* were asked for by [u/RiceDesperate5724](https://www.reddit.com/user/RiceDesperate5724/) on Reddit, who also built their own version of four of them.

### Added
- **Hide a game:** **⊘ Hide** next to Favourite, the **Delete** key, or right-click → **Hide from the library** takes a game off every shelf. Nothing in your ROM folder is renamed, moved or deleted — the choice lives in PyroCade's own library file. **Show → Hidden games** lists everything you hid, with **⊙ Unhide** to bring one back. *(u/RiceDesperate5724)*
- **Right-click a game on the shelf** for Play, Open case, Manual, Favourite, Rename…, Hide, Emulator… and Artwork, all acting on the game you pointed at. Arrow keys and a controller work in the menu too. *(u/RiceDesperate5724)*
- **Rename a game:** right-click → **Rename…** sets the title PyroCade shows. The file on disk keeps its name, the shelf re-sorts straight away, and **Use the file name** (or typing the scanned title back) clears the override. *(u/RiceDesperate5724)*
- **Browsing no longer stops at the end of the shelf.** On a system's shelf, pressing right past the last game carries on into the next system that has games, and left past the first goes back into the previous one. All games, Favourites and Recently played are one list already, so they wrap round to the other end. *(u/RiceDesperate5724)*
- **Settings → Disable 3D models** and **Disable animations**, for computers that struggle with the shelf. Flat covers skip building the case and media models altogether (a shelf item goes from about 680 nodes to 16), and turning animations off stops the ambient background, the idle screensaver and every transition. Both apply at once and save themselves.
- **Fullscreen is remembered and has a switch:** **Settings → Fullscreen**, as well as **F11**. **Ctrl/Cmd+Shift+F** does the same, for keyboards and desktops where F11 belongs to the window manager. `--fullscreen` and `--windowed` set it from a shortcut or from Steam's launch options. *(u/RiceDesperate5724)*

### Changed
- **Nintendo Switch updates and DLC join their game.** Files are grouped by the title ID in their name (`Game [0100ABCD12345000][v0].nsp`): an update ends in `…800` and a DLC pack in `…1000` and up, so they all belong to the game ending in `…000` instead of each becoming a game of its own. The game itself is what the library lists and launches. Files without a title ID are grouped by name, as before. *(u/RiceDesperate5724)*

### Fixed
- **The cartridge no longer cuts through its own case.** Part way through the slide out from behind the case, pieces of the cartridge were drawn on top of the cover art: CSS 3D sorts flat planes rather than solids, so a cartridge sharing space with the box is not reliably hidden inside it. The media now waits and travels entirely behind the case, one cartridge depth clear of its back face.
- **The cartridge no longer covers the next game.** A wide cartridge (Game Boy Advance, SNES, Nintendo 64) or a 12 cm disc slid so far out from behind its case that it was drawn over its neighbour on the shelf. It now stops just clear of the case, whatever its size.
- **Side ribs no longer double the cartridge's outline.** SNES and Game Boy ribs reached the edge of the shell and hid its side wall in slivers, which read as a second, ragged silhouette. Raised moulding is also kept inside the bevelled face, so a panel written flush with the edge can no longer hang over it.
- **Square covers fill the label instead of being letterboxed.** A Switch 2 eShop packshot has a white bar down each side; those bars were measured only for Switch 2 cases and were left on every cartridge label. They are now measured for any cover on any system, and a cover without them is untouched.

## [0.5.0] - 2026-11-06

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
- **Solid cartridge and case models:** cartridges, the PSP UMD and cases are rebuilt with closed edges, bevelled caps and separate labels, in the proportions of the real thing. The measurements used are listed in `docs/physical-models.md`.
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

[0.8.0]: https://github.com/Pyrodrifter/PyroCade/compare/v0.7.0...v0.8.0
[0.7.0]: https://github.com/Pyrodrifter/PyroCade/compare/v0.6.0...v0.7.0
[0.6.0]: https://github.com/Pyrodrifter/PyroCade/compare/v0.5.0...v0.6.0
[0.5.0]: https://github.com/Pyrodrifter/PyroCade/compare/v0.4.4...v0.5.0
[0.4.4]: https://github.com/Pyrodrifter/PyroCade/compare/v0.4.3...v0.4.4
[0.4.3]: https://github.com/Pyrodrifter/PyroCade/compare/v0.4.2...v0.4.3
[0.4.2]: https://github.com/Pyrodrifter/PyroCade/compare/v0.4.1...v0.4.2
[0.4.1]: https://github.com/Pyrodrifter/PyroCade/compare/v0.4.0...v0.4.1
[0.4.0]: https://github.com/Pyrodrifter/PyroCade/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/Pyrodrifter/PyroCade/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Pyrodrifter/PyroCade/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Pyrodrifter/PyroCade/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Pyrodrifter/PyroCade/releases/tag/v0.1.0
