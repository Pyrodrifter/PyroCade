# Native Leia SR bridge

Architecture: the original Electron UI remains the interactive window. A hidden, shared-texture offscreen window renders two mirrored DOM views. Each eye retains full viewport dimensions; only the CSS perspective origin differs, creating genuine geometry disparity in the carousel and inspection view. The initial scene is sent once; later DOM mutations are sparse patches. CSS and Web Animations run locally in each eye instead of repeatedly rebuilding full scenes. Background animation is rendered locally without CPU image readback. Flat UI stays at screen depth.

The separate native presenter duplicates the frame's NT handle from Electron, opens it on the matching D3D11 adapter, copies into a persistent full-SbS texture, waits for GPU completion before acknowledging release, and passes its shader-resource view to SRInterfaceDX11. The output window is DPI-aware, follows the original client rectangle, and is non-activating and input-transparent. The runtime owns the weaving and eye prediction. The process releases the lens hint on pause/shutdown. The host stays usable in 2D if initialization fails.

Build with Visual Studio 2022 C++ tools and CMake. Fetch the pinned SR bridge dependency into the ignored local directory before configuring:

    git clone --branch api_expansion https://github.com/bo3b/SR-lib.git native/SR-lib
    git -C native/SR-lib checkout 39de32110ca05842cd0a7b48560e9194c28ef7cb

Then build the presenter:

    cmake -S native -B native/build -G "Visual Studio 17 2022" -A x64
    cmake --build native/build --config Release

The presenter uses a static MSVC runtime; SR dependencies are delay-loaded. The installer packages only native/bin/PyroCadeLeia.exe as resources/leia/PyroCadeLeia.exe, not the SR runtime or SDK. SDK/runtime libraries remain governed by their owners' terms.

References:
- https://github.com/oneup03/3D-Skills — bc6772747387e4afaeffb2bdb4e02b1682ab7cfb
- https://github.com/bo3b/SR-lib/tree/api_expansion — 39de32110ca05842cd0a7b48560e9194c28ef7cb

Tests: scripts/check-leia-native.cjs verifies two-eye disparity, GPU transport and native SR initialization with a hidden owner and no lens activation. Real launcher and packaged F9 startup/shutdown were also checked using isolated portable test settings. Final perceptual depth and crosstalk require physical display inspection.

F9 enables 3D; Shift+F9 shows the floating Depth, Popout and Convergence controls (0�200%, 100% reset). Windows requests the high-performance GPU before Electron starts. The controls show the actual native adapter and measured stereo frame delivery. A local movement-update benchmark reduced sender CPU time from about 24 ms to 0.04 ms and per-eye application from about 34 ms to 0.03 ms; this measures update processing, not total display frame time.

The stereo backing surface is capped at 1280 x 720 per eye. Both eyes retain the original CSS viewport; SR weaves to the native client size. Frame acceptance waits for the new layout and matching pixel dimensions. Model nodes and artwork references are reused. GPU copy completion is polled, with at most two Electron frames held. Superseded frames are released without counting as delivered textures.
