---
slice: P10-recut
stateFile: docs/STATE.md
donotCount: 4
seededFrom: re-cut-required
reads: []
---

# P10 remainder — re-cut before implementation

## Next action

Unknown — P10 is not closed. Run `/babysteps-handoff` to create priced slices for Android signing, Storage Access Framework storage/import, installed-emulator linking and launch, and on-device renderer/controller/audio validation. Do not reuse P10's previous reading set for that work.

**Closes when:** The remaining Android requirements have separate priced plan rows and the next seed names only the selected slice's reads.

## Settled

- Android Rust mobile entry, app-private data path, minimum API, and ARM64 CI build configuration are implemented.
- Android Rust cross-compilation and a local debug APK build succeeded; the test app installs and its process starts on the connected ARM64 device.
- The Tauri bridge now exposes and merges the app-update progress subscription; the debug app installed and started on-device, and the user confirms it renders normally when the device is awake.
- Android release signing is not configured; CI does not publish Android APKs to release assets, and no installable release artifact is available.
- Tauri's dialog plugin lacks Android folder selection, and its content URIs are not compatible with the current filesystem-path backend.
- Managed emulator downloads do not provide Android app linking or ROM launch.

## Withdrawn numbers

- None.

## Code to touch

Not priced; determine in the handoff re-cut.

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — `Desktop Runtime Direction`
- `.operator/specs/artwork-service.md` — `Contract`
- `.babysteps/tauri-migration.plan.md` — `Tauri v2 migration slices`, `Budget rows`
- `.babysteps/tauri-migration.tasks.json` — Android task split

## Gate commands

Not selected until the remaining requirements are priced.

## Applicable Do-Not entries

- #1
- #4
