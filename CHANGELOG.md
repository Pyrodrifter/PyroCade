# Changelog

All notable changes to PyroCade. Downloads are on the [releases page](https://github.com/Pyrodrifter/PyroCade/releases).

## [Unreleased]

### Added
- **Bookshelf** library mode: cases stand spine-out on a wooden shelf, and the selected game slides out to show its cover.
- **Spinner rack** library mode: a rotating store tower with three tiers of cases. Browsing turns the tower, and the selected game pops out.
- **Start animation:** pressing Play spins the disc into a drive slot or pushes the cartridge into its slot while the emulator starts. Skipped with reduced motion.
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

[0.3.0]: https://github.com/Pyrodrifter/PyroCade/compare/v0.2.1...v0.3.0
[0.2.1]: https://github.com/Pyrodrifter/PyroCade/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/Pyrodrifter/PyroCade/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Pyrodrifter/PyroCade/releases/tag/v0.1.0
