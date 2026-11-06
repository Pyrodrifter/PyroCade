---
slice: exhausted
stateFile: docs/STATE.md
donotCount: 4
seededFrom: P10d
reads:
  - docs/STATE.md
  - .operator/specs/desktop-runtime.md
allowanceTokens: 0
---

**Next action:** The migration queue is exhausted. Do not start a new slice until a new task is added to `docs/STATE.md` and priced in `.babysteps/tauri-migration.plan.md`.

## What is settled

- P1 through P10d are complete.
- P10d built and installed the current Android ARM64 debug APK on an Odin2 running Android 13/API 33 and system WebView 101.0.4951.61.
- On-device renderer checks passed for stage availability, Gamepad API query, canvas paint, CSS preserve-3d/perspective, and AudioContext running at 48 kHz/stereo on the speaker route. Controller navigation was confirmed by the operator. Subjective audio quality was not assessed; repeated WebView tile-memory-limit warnings appeared during rendering.
- The Android-only build required desktop process-launch setup in `backend.rs` to be excluded from Android builds. The configured Rust gates pass.
- Android release APKs are signed in non-PR CI and uploaded as release artifacts; PR APKs remain unsigned. Android updates are manual downloads.
- The Do-Not list has 4 entries; #4 applies to future Android SAF work.

## Withdrawn

None.

## Code to touch

None until a new task is queued.

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — `Desktop Runtime Direction` (Android SAF section)

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #4 applies.

## Gate

No slice is queued; do not run gates until a new task is priced and seeded.

## When this seed closes

This exhausted-queue seed closes when a new priced task is added to `docs/STATE.md` and `.babysteps/tauri-migration.plan.md` and a replacement seed is written.
