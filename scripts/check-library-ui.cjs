const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const root = path.resolve(__dirname, '..');
// The WebDriver listener uses port 4444, because tauri-driver uses it by default.
// A second driver on that port conflicts instead of opening another session.
const webdriverPort = process.env.TAURI_WEBDRIVER_PORT || '4444';
// The readiness timeout is 30,000 milliseconds, because a driver that never binds has established nothing.
// The client must stop retrying rather than leave a CI job hanging.
const readinessTimeoutMs = Number(process.env.TAURI_WEBDRIVER_TIMEOUT_MS || '30000');
// The poll interval is 100 milliseconds, because readiness checks need room to yield.
// A zero-delay retry loop would waste a core while WebKit starts.
const readinessPollIntervalMs = Number(process.env.TAURI_WEBDRIVER_POLL_MS || '100');
// The canvas sample extent is one pixel, because one painted pixel proves renderer output.
// An unpainted sample would confuse API availability with drawing.
const canvasSampleExtent = 1;
// The canvas origin is zero pixels, because drawing starts at its upper-left corner.
// A non-origin sample would miss the one-pixel test surface.
const canvasOrigin = 0;
// The smoke transform rotates by 90 degrees, because an identity transform proves no 3D path.
// A missing preserve-3d result means the platform renderer flattened the surface.
const smokeTransformCss = 'rotateY(90deg)';
const appBinary = process.env.TAURI_APP_BINARY || path.join(root, 'src-tauri/target/aarch64-unknown-linux-gnu/release/pyrocade');
const baseUrl = `http://127.0.0.1:${webdriverPort}`;
const driver = spawn(process.env.TAURI_DRIVER || 'tauri-driver', ['--port', webdriverPort], {
  cwd: root,
  stdio: ['ignore', 'ignore', 'pipe'],
});

let driverOutput = '';
let driverSpawnError;
let sessionId;
driver.stderr.on('data', (chunk) => { driverOutput += chunk.toString(); });
driver.on('error', (error) => { driverSpawnError = error; });

async function request(method, route, body) {
  const response = await fetch(`${baseUrl}${route}`, {
    method,
    headers: body ? { 'content-type': 'application/json' } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${route} failed (${response.status}): ${text}`);
  const value = payload && Object.hasOwn(payload, 'value') ? payload.value : payload;
  if (value && value.error) throw new Error(`${value.error}: ${value.message || text}`);
  return value;
}

async function waitForDriver() {
  const deadline = Date.now() + readinessTimeoutMs;
  while (Date.now() < deadline) {
    if (driverSpawnError) throw driverSpawnError;
    if (driver.exitCode !== null) throw new Error(`tauri-driver exited ${driver.exitCode}: ${driverOutput}`);
    try {
      const status = await request('GET', '/status');
      if (!status || status.ready !== false) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, readinessPollIntervalMs));
  }
  throw new Error(`tauri-driver did not become ready: ${driverOutput}`);
}

async function run() {
  fs.accessSync(appBinary, fs.constants.X_OK);
  await waitForDriver();
  const session = await request('POST', '/session', {
    capabilities: {
      alwaysMatch: {
        'tauri:options': { application: appBinary },
      },
    },
  });
  sessionId = session.sessionId;
  if (!sessionId) throw new Error(`tauri-driver did not return a session id: ${JSON.stringify(session)}`);

  const script = `
    // The callback offset is one argument, because WebDriver appends it after the provided arguments.
    // Any other offset invokes a test argument instead of completing the command.
    const lastArgumentOffset = 1;
    const completionArgumentPosition = arguments.length - lastArgumentOffset;
    const complete = arguments[completionArgumentPosition];
    (async () => {
      const assert = (condition, message) => { if (!condition) throw new Error(message); };
      const stage = document.querySelector('#stage');
      assert(stage, 'Tauri renderer did not create the library stage');

      assert(typeof navigator.getGamepads === 'function', 'Gamepad API is unavailable');
      assert(navigator.getGamepads() !== null, 'Gamepad API could not be queried');
      window.dispatchEvent(new Event('gamepadconnected'));
      document.dispatchEvent(new KeyboardEvent('keydown', {key:'ArrowRight', bubbles:true, cancelable:true}));

      const tile = document.createElement('div');
      tile.style.transformStyle = 'preserve-3d';
      tile.style.transform = ${JSON.stringify(smokeTransformCss)};
      stage.append(tile);
      assert(getComputedStyle(tile).transformStyle === 'preserve-3d', 'WebView did not preserve 3D transforms');
      assert(getComputedStyle(stage).perspective !== 'none', 'Library stage has no perspective');
      const canvas = document.createElement('canvas');
      canvas.width = ${canvasSampleExtent};
      canvas.height = ${canvasSampleExtent};
      const context = canvas.getContext('2d');
      assert(context, 'Canvas 2D context is unavailable');
      context.fillStyle = 'red';
      context.fillRect(${canvasOrigin}, ${canvasOrigin}, ${canvasSampleExtent}, ${canvasSampleExtent});
      assert(context.getImageData(${canvasOrigin}, ${canvasOrigin}, ${canvasSampleExtent}, ${canvasSampleExtent}).data[${canvasOrigin}] > ${canvasOrigin}, 'Canvas did not render a pixel');

      assert(typeof AudioUI !== 'undefined' && typeof AudioUI.play === 'function', 'Renderer audio service is unavailable');
      assert(Appearance.layouts['page-turn'] && Appearance.layouts.media, 'Page turn and Media carousel layouts are unavailable');
      assert(!Appearance.layouts.spinner && !Appearance.layouts.swatches, 'Retired layouts remain in the picker');
      Appearance.apply({layout:'spinner'}, false);
      assert(Appearance.mode() === 'page-turn', 'Saved spinner layout did not migrate to page-turn');
      Appearance.apply({layout:'swatches'}, false);
      assert(Appearance.mode() === 'media', 'Saved swatches layout did not migrate to media');
      Appearance.apply({layout:'carousel'}, false);
      let audioContextCreated = false;
      const NativeAudioContext = window.AudioContext;
      window.AudioContext = class extends NativeAudioContext {
        constructor() { super(); audioContextCreated = true; }
      };
      AudioUI.configure({enabled:true});
      AudioUI.play('scroll');
      assert(audioContextCreated, 'Renderer audio service did not create an AudioContext');
      assert(AudioUI.settings().enabled, 'Renderer audio service did not enable sound');

      assert(typeof api.cachedLibrary === 'function', 'Tauri bridge does not expose cachedLibrary');
      assert(typeof api.scan === 'function', 'Tauri bridge does not expose scan');
      assert(typeof startLibrary === 'function', 'Renderer does not expose startLibrary');
      assert(typeof applyLibrary === 'function', 'Renderer does not expose applyLibrary');
      const cached = await api.cachedLibrary();
      assert(cached === null || Array.isArray(cached), 'cachedLibrary did not return a library or null');
      const unchanged = await api.scan(false, {onlyIfChanged: true});
      assert(unchanged === null || Array.isArray(unchanged), 'scan onlyIfChanged did not return null or a library');
      return {gamepadApi:'available', transform:'preserve-3d', canvas:'painted', audio:'AudioContext created', libraryCache:'cachedLibrary and scan onlyIfChanged exposed'};
    })().then(complete).catch(error => complete({error:error.message || String(error), stack:error.stack}));
  `;
  const result = await request('POST', `/session/${sessionId}/execute/async`, { script, args: [] });
  if (result && result.error) throw new Error(result.error);

  const screenshot = await request('GET', `/session/${sessionId}/screenshot`);
  const screenshotPath = path.join(root, 'localTmp', `tauri-webdriver-${Date.now()}.png`);
  fs.writeFileSync(screenshotPath, Buffer.from(screenshot, 'base64'));
  console.log(JSON.stringify({ passed: result, screenshot: screenshotPath }));
}

run()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (sessionId) {
      try { await request('DELETE', `/session/${sessionId}`); } catch {}
    }
    driver.kill();
  });
