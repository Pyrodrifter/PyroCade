# PyroCade platform support

The fork's target set is macOS ARM64, Linux ARM64 on modern Snapdragon hardware, and Android ARM64. A target is not a shipping platform until its native artifact and platform-specific input, audio, and rendering paths have been validated.

| Platform | Native target | Release artifacts | Updates | Validation status |
|---|---|---|---|---|
| macOS | `aarch64-apple-darwin` | DMG; signed `.app.tar.gz` when updater keys are configured | Signed updater when configured; otherwise manual release | Native release job installs the DMG and smoke-launches the app. Controller, audio-device, and system-WebView rendering checks still require a physical-device pass. |
| Linux ARM64 | `aarch64-unknown-linux-gnu` | AppImage, DEB, RPM | Signed updater for AppImage when configured; package-managed installs use the release package | Native release job installs the DEB and smoke-launches the app. Controller, audio-device, and system-WebView rendering checks still require a physical-device pass. |
| Android ARM64 | Tauri Android ARM64 | Signed `arm64-v8a` APK on release runs; unsigned CI APK on pull requests | Manual release download; no Android updater | Debug APK built and installed on an Odin2 running Android 13 (API 33), system WebView 101.0.4951.61. Controller navigation was verified on-device. WebView Gamepad API query, AudioContext startup (48 kHz, stereo), canvas paint, and CSS preserve-3d/perspective were verified. Audio output was routed to the device speaker; subjective audio quality was not assessed. WebView reported repeated tile-memory-limit warnings during rendering. |

The legacy Electron UI scripts are not used as evidence for Tauri targets; P8's automated behavior evidence comes from Rust tests, and native release jobs smoke-launch installed artifacts. Controller, audio-device, and target-WebView validation is platform-specific; Android validation above applies only to the tested Odin2 and its current system WebView. Release binaries are Tauri applications.
