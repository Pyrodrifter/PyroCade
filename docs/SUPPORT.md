# PyroCade platform support

The fork's target set is macOS ARM64, Linux ARM64 on modern Snapdragon hardware, and Android ARM64. A target is not a shipping platform until its native artifact and platform-specific input, audio, and rendering paths have been validated.

| Platform | Native target | Release artifacts | Updates | Validation status |
|---|---|---|---|---|
| macOS | `aarch64-apple-darwin` | DMG; signed `.app.tar.gz` when updater keys are configured | Signed updater when configured; otherwise manual release | Native release job installs the DMG and smoke-launches the app. Controller, audio-device, and system-WebView rendering checks still require a physical-device pass. |
| Linux ARM64 | `aarch64-unknown-linux-gnu` | AppImage, DEB, RPM | Signed updater for AppImage when configured; package-managed installs use the release package | Native release job installs the DEB and smoke-launches the app. Controller, audio-device, and system-WebView rendering checks still require a physical-device pass. |
| Android ARM64 | Tauri Android ARM64 | Not configured yet | Not configured yet | Planned in P10; the local Android SDK and connected-device validation are available for that slice. |

The legacy Electron UI scripts are not used as evidence for Tauri targets; P8's automated behavior evidence comes from Rust tests, and native release jobs smoke-launch installed artifacts. Controller, audio-device, and target-WebView behavior is not claimed until it is checked on each platform. Release binaries are Tauri applications.
