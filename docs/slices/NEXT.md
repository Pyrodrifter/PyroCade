---
slice: P13
stateFile: docs/STATE.md
donotCount: 4
seededFrom: fd5b467
reads:
  - docs/STATE.md
  - .babysteps/tauri-migration.plan.md
  - docs/donot.md
  - .operator/specs/desktop-runtime.md
  - .babysteps/main-to-tauri.tasks.json
  - scripts/check-library-ui.cjs
  - scripts/check-carousel.cjs
  - scripts/check-artwork.cjs
  - scripts/check-artwork-ui.cjs
  - .github/workflows/release.yml
  - README.md
  - docs/SUPPORT.md
  - src-tauri/Cargo.toml
  - src-tauri/tauri.conf.json
allowanceTokens: 95019
---

**P13 / M06 — Remaining parity checks, release docs and target validation.**
M05b closed emulator metadata and PC config (`fd5b467`): `pc` direct
system, Switch 2 `.nup` migration, and the RPCS3 `_msvc` variant are
settled. M05a (`7781cd3`) settled platform launch behavior.

## Action

Add/update checks for the ported behavior, run Rust and renderer gates,
validate macOS/Linux ARM64 and Android-specific constraints, and update
Tauri-facing README/release documentation. Do not copy main's Electron
packaging, Windows launcher, or Capacitor Android project into the Tauri
release path.

## Settled

- M05b: `pc` system with `direct: true`, `.nup` default and one-time
  migration, RPCS3 `_msvc` asset, direct-folder scan. Recomp excluded.
- M05a: launch logging, Steam LD sanitization, gamescope/X11 handling.
- D09 already closed its renderer checks and docs; re-verify, do not
  re-port.

## Withdrawn numbers

227,654 tokens (the original M05 row) and the 225,000-token work budget
remain the reason M05 split into M05a/M05b; M06 is priced at 95,019.

## Code to touch

`scripts/check-library-ui.cjs`, `scripts/check-carousel.cjs`,
`scripts/check-artwork.cjs`, `scripts/check-artwork-ui.cjs`,
`.github/workflows/release.yml`, `README.md`, `docs/SUPPORT.md`,
`src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` — checks, workflow,
and docs only unless a check uncovers a defect.

## Read these first

- `.operator/specs/desktop-runtime.md`
- `.babysteps/main-to-tauri.tasks.json` (M06 row)

## Do-Not entries that apply here

Total Do-Not count: 4. Entry #1 (manual paths stay filesystem paths) and
entry #4 (Android SAF URIs) apply to checks and docs. Entries #2 and #3
apply only if launch/extraction paths are touched.

## Gate

- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo test --manifest-path src-tauri/Cargo.toml`
- `cargo check --manifest-path src-tauri/Cargo.toml`

## When this seed closes

Close M06 when checks cover the ported behavior, Rust and renderer gates
pass, macOS/Linux ARM64 and Android constraints are validated against the
desktop-runtime spec, and README/release docs describe the Tauri
artifacts and update routes without the Electron/Capacitor path.
