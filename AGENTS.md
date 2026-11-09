# PyroCade — `tauri-port` Fork (Windows build guide)

> **Windows-only: if you are building on macOS, ignore this file.**
> This file lives at the repo root, *outside* `renderer/`. The Tauri build
> bundles `frontendDist` (`../renderer`), so `AGENTS.md` is never packaged into
> a macOS `.app`/`.dmg` (or any other bundle) and is not read by any build
> script. On a Mac, delete/skip this file and build with the standard
> `npm run dist:macos:arm64` flow instead.

An agent (Claude Code / Anthropic harness, Cursor, Copilot, etc.) ramping on
this fork should treat **Windows as the primary target**. Upstream
(`Pyrodrifter/PyroCade`, branch `main`) is the original Electron app. This
fork (`kaicherry/PyroCade`, branch `tauri-port`) is the Tauri v2 port.

```
Branch: tauri-port   Remote: https://github.com/kaicherry/PyroCade.git
Renderer: renderer/  (static HTML/CSS/JS, no bundler)
Host:     src-tauri/ (Tauri 2 + Rust)
Emulator catalog: emulators.json
CI: .github/workflows/release.yml
```

Electron is **dev-only** — it is not part of the shipped app. It is used for
`scripts/check-*.cjs` harness runs (`prompts:export`, `prompts:check`,
`carousel:check`, `brand:*`, `demo:record`, `docs:screens`). The shipped runtime
is Tauri WebView2 (Windows) / WKWebView (macOS) / WebKitGTK (Linux).

---

## 1. Prerequisites (Windows)

All paths below assume PowerShell 7+ (or Windows Terminal) and a **native
Win32** checkout (not WSL for the Tauri build itself).

| Tool | Version / notes |
|------|-----------------|
| Windows | 10 (1809+) or 11, x64. ARM64 Windows cross-build is not configured. |
| Git | For `git clone`; line endings must be `CRLF` (default on Windows) |
| Node.js | **22 LTS** (match `.github/workflows/release.yml`). Add Node to `PATH` before Tauri. |
| Rust | **stable** via rustup; MSVC target. `rustup toolchain install stable`, `rustup default stable`. |
| MSVC Build Tools | Required by Tauri/Rust: **Visual Studio Build Tools 2022** with _“Desktop development with C++”_ workload (MSVC v143, Windows 10/11 SDK). |
| WebView2 | Pre-installed on Win10 1809+/Win11. On older/enterprise images, install the Evergreen Runtime: <https://developer.microsoft.com/en-us/microsoft-edge/webview2/> |
| NSIS / WiX | Optional for Windows installers. If you add bundle targets, install NSIS (and WiX 3 for MSI) and ensure `makensis.exe` is on `PATH`. |

Verify:

```powershell
node -v      # v22.x
npm -v
cargo --version
rustc --version
cl.exe       # from “Developer PowerShell for VS 2022” — or install Build Tools
```

If `cl.exe` is not found, launch a **Developer PowerShell for VS 2022**,
or run `vswhere` / enable “VS Developer Shell” before `tauri build`.

---

## 2. Clone and install

```powershell
git clone https://github.com/kaicherry/PyroCade.git pyroCade
Set-Location pyroCade
git checkout tauri-port
npm ci
```

`npm ci` installs `npm` deps including `@tauri-apps/cli` (`^2.11.4`) and
dev-only `electron` (`^39.0.0`). `cargo` deps install on first build.

If Electron fails with `Electron failed to install correctly, please delete
node_modules/electron`:

```powershell
Remove-Item -Recurse -Force node_modules\electron
npm install electron --ignore-scripts=false
```

Electron is only needed for `npx electron scripts/*.cjs` checks. Tauri
`tauri dev` / `tauri build` do not need a working Electron install.

---

## 3. Run in dev mode

```powershell
npm start
# = tauri dev
```

Runs the Rust host + dev WebView and presents `renderer/index.html`. The
renderer is **static** — there is no `vite`/`webpack` step. Edit
`renderer/*.js|css` and the dev window reloads.

- Rust changes: Vite-style hot reload does **not** apply — let `tauri dev`
  rebuild the Rust binary.
- To test the release bundle: `npm run build` (see §4).

Environment:

| Var | Purpose |
|-----|---------|
| `TAURI_CONFIG` | Override bundle keys at build time (updater pubkey/endpoints in CI). |
| `CARGO_TARGET_DIR` | Custom target dir (CI Linux job uses `localTmp/`; on Windows you can keep the default `src-tauri\target\`). |

---

## 4. Build a Windows release

The fork's `package.json` ships only macOS/Linux/Android wrapper scripts
(`dist:macos:arm64`, `dist:linux:arm64`, `dist:android:arm64`). On Windows,
use Tauri directly:

```powershell
# Dev/debug bundle (single-file .exe + default targets)
npx tauri build

# Bundled release (same command, release profile)
npm run build

# Output layout (default targets from src-tauri/tauri.conf.json)
#   src-tauri\target\release\pyrocade.exe
#   src-tauri\target\release\bundle\
```

### Bundle targets

`src-tauri/tauri.conf.json` currently lists:

```json
"targets": ["app", "dmg", "appimage", "deb", "rpm"]
```

There is **no Windows target** in CI yet. To add a Windows installer:

1. Edit `src-tauri/tauri.conf.json` → `bundle.targets` to include `"nsis"`
   (and/or `"msi"`).
2. Add empty right-side keys as needed:
   ```json
   "windows": { "nsis": { "installerIcon": "../renderer/assets/brand/pyrocade-icon-512.png" } }
   ```
3. Install NSIS / WiX and re-run `npm run build`.
4. Outputs land in `src-tauri\target\release\bundle\nsis\` /
   `msi\` (versioned file names).

For a **single-file exe / app folder only** (no installer), keep default
`targets` and use `src-tauri\target\release\pyrocade.exe` (or
`bundle\msi\`/`nsis\` when enabled). Copy the `.exe` for manual QA without
building installers.

### Emulator catalog on Windows

`emulators.json` uses per-OS `platforms` keys (`windows` / `macos` / `linux`).
`src-tauri/src/emulators.rs::target_platform()` returns `windows` under
`cfg(target_os = "windows")`. On Windows, the downloader selects the
`windows/x86_64` (or current-arch) asset when present. Custom linking
(“Use existing program…”, “Choose program…”, `--with-args {rom}`) is the
same flow as the other OSes.

### App data on Windows

Per-user data (`config.json`, `data/emulators/<id>/`, `data/media/`) lives
under Tauri's app-data dir (notably `%APPDATA%\PyroCade` / Letta-style path
returned by `dirs`). Never commit `data/` — it is `.gitignored`.

---

## 5. Checks

Run from the repo root (PowerShell). All should be green before opening a PR.

```powershell
# Rust (gates — fmt/test/check)
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo test --manifest-path src-tauri/Cargo.toml
cargo check --manifest-path src-tauri/Cargo.toml

# Renderer / parity checks
node scripts/check-artwork.cjs        # npm run artwork:check
node scripts/check-feedback.cjs       # part of npm run feedback:check
```

Electron checks (`npx electron scripts/check-*.cjs`, `npm run prompts:check`,
`npm run carousel:check`, etc.) run the static renderer headless — they
exercise Nintendo/Xbox/PlayStation prompts, carousel layout, brand/icon
export and demo timelines without a Tauri window.

On Windows, prefer `node --check <script>.cjs` first if Electron fails to
launch (often because `electron` wasn't rebuilt after `npm ci`).

Useful single-check commands from `package.json`:

```powershell
npm run prompts:build   # rebuild renderer/assets/prompts/* (283 SVGs + manifest)
npm run brand:build     # rebuild brand SVGs/PNGs/ICO (renderer/assets/brand/)
npm run artwork:check
npm run feedback:check
npm run eshop:check
```

---

## 6. Repository map

| Path | What it is |
|------|------------|
| `renderer/` | **All UI**: `index.html` (shell + Settings/Artwork/Emulators views), `app.js` (carousel/case/settings/emulator manager), `appearance.js` (View & theme), `prompts.js` (controller prompts), `tauri-bridge.js` (Tauri IPC → `window.api`), `feedback.js` + `feedback-ui.js`. |
| `src-tauri/` | **Host**: `src/main.rs` + `src/lib.rs` (Tauri 2 entry), `src/backend.rs` (library scan/launch/library cache), `src/emulators.rs` (catalog/download/update), `src/artwork.rs`, `src/config.rs`, `capabilities/default.json`, `tauri.conf.json`. |
| `emulators.json` | Managed emulator catalog (`windows`/`macos`/`linux` per-OS assets). |
| `scripts/check-*.cjs`, `preview-*.cjs` | Electron cross-checks / previews (not part of the shipped binary). |
| `.github/workflows/release.yml` | CI: `validate` → macOS ARM64, Linux ARM64 (Apple Container), Android ARM64 (unsigned CI vs signed release). No Windows job ships today. |
| `docs/STATE.md`, `docs/SUPPORT.md` | Spec/state (read-only from a fresh checkout; see `docs/slices/`). |

Art / screenshots: `renderer/assets/prompts/` (generated SVGs, `manifest.js`,
`manifest.json`, `preview.html`) and `renderer/assets/brand/`.

---

## 7. Notes / pitfalls for Windows

- **Line endings**: Build expects `CRLF`. Set `git config --global core.autocrlf true`.
- **Case-sensitivity**: Windows is case-insensitive but CMake/MSVC may be sensitive to exact file casing. Keep import casing as-is (e.g. `Artwork` vs `artwork`).
- **Path separators**: Tauri/Node handle `\` vs `/` automatically. In Rust, use `PathBuf` joins, not string concat with `\`.
- **Sandbox/offline**: Tests that call Network (artwork sources, GitHub releases) may be flaky offline. `cargo test` offline should still pass (unit tests stub network).
- **WebView2 version**: Windows 10 builds older than 1903 may need WebView2 Evergreen runtime before `tauri dev`.
- **Portability**: Some `dist:*.sh`-style shell snippets (`cp`, `mkdir -p`, `shasum`) in CI scripts are bash — on Windows use PowerShell equivalents (`Copy-Item`, `New-Item -ItemType Directory -Force`).
- **Updater signing**: Signed self-updates are configured via `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_UPDATER_PUBLIC_KEY` env. Without them, bundles build with `createUpdaterArtifacts: false` (as in `tauri.conf.json`).

---

## 8. Typical loop

```powershell
git checkout tauri-port
git pull
npm ci
npm start
# edit renderer/*.js or src-tauri/src/*.rs
cargo test --manifest-path src-tauri/Cargo.toml
npm run build
# smoke-test src-tauri\target\release\pyrocade.exe
```

If the session hands you a seed (`docs/slices/NEXT.md`) or a broken check,
follow `docs/STATE.md` first, then the spec it cites.

---

## 9. For the upstream port (Pyrodrifter → kaicherry)

- Upstream `main` is Electron-only. This fork diverges: Tauri 2 host,
  `window.api` via `renderer/tauri-bridge.js` (no preload), Rust `AppState`
  (config, scan cache, emulator/artwork services), `data/`/`localTmp/`
  scratch convention, and Windows/Linux/Android targets alongside macOS ARM64.
- Check `docs/STATE.md` + `docs/SUPPORT.md` for the per-slice decisions
  (M03–M06 / D01–D09) and remaining Android/storage/URI limits before
  porting new upstream features.

> On macOS, ignore this entire file. macOS ARM64 builds use
> `npm run dist:macos:arm64` (see `README.md` → “Run from source”) and do
> not read `AGENTS.md` at build time.
