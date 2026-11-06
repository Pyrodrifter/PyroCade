---
slice: P10a
stateFile: docs/STATE.md
donotCount: 4
seededFrom: c5525fc
reads:
  - package.json
  - .github/workflows/release.yml
  - src-tauri/Cargo.toml
  - src-tauri/tauri.conf.json
allowanceTokens: 85000
---

**P10a — Sign and publish the Android release APK.** Configure Tauri Android signing (keystore, alias, password) and integrate it into the CI workflow so the release APK is signed and uploaded to release artifacts, while the debug build remains unsigned. The release APK is currently unsigned and withheld from uploads; this slice adds signing configuration and CI integration.

**The Do-Not list is `docs/donot.md`** — 4 entries, append-only. Never dropped, never trimmed.

## What is settled — do not re-derive

- P1 through P9 are complete. Android Rust target and debug APK build/install on device succeeded. The release APK is unsigned and withheld from uploads. Do-Not #4 records the SAF URI constraint (not relevant to signing).
- The CI workflow (`release.yml`) builds macOS ARM64, Linux ARM64, and Android ARM64 artifacts. The Android job produces an unsigned APK.
- Tauri's Android signing is configured via `tauri.conf.json` (`androidSigning`) and/or `Cargo.toml` build script overrides.

## Withdrawn — proven wrong, do not use

None.

## Code to touch

- `package.json` — Add or update Android build scripts; reference signing config.
- `.github/workflows/release.yml` — Add signing step to the Android ARM64 build job; upload signed APK to release artifacts.
- `src-tauri/tauri.conf.json` — Add Android signing configuration (keystore path, alias, password source).
- `src-tauri/Cargo.toml` — Ensure Android build script respects signing config.

## Read these first, and only these

- `.operator/specs/desktop-runtime.md` — `Desktop Runtime Direction` (Android target section)
- `.babysteps/tauri-migration.plan.md` — `Budget rows` (P10 row for reference)

## Do-Not entries that apply here

Total Do-Not count: 4. No entries apply to this signing-only slice.

## The gate

`cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
`cargo test --manifest-path src-tauri/Cargo.toml`
`cargo check --manifest-path src-tauri/Cargo.toml`

## When this slice closes

Write the next seed with the next sub-slice (P10b — SAF storage/import), advance the state file, and re-verify the Do-Not count.
