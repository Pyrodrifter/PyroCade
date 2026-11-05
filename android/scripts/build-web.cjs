// Copies the desktop renderer (../renderer) into www/ unchanged and adds the Android bridge.
// The only edit is one <script> tag in the copy of index.html, placed before the renderer's own
// scripts, so window.api exists before app.js runs. The desktop files are never touched.
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const here = path.resolve(__dirname, '..');
const src = path.resolve(here, '..', 'renderer');
const out = path.join(here, 'www');

// Large source PNGs for the controller prompts are only needed to rebuild them; the desktop
// build leaves them out too (see "!renderer/assets/prompts/png/**" in ../package.json).
const skip = new Set([path.join(src, 'assets', 'prompts', 'png')]);

fs.rmSync(out, { recursive: true, force: true });
fs.cpSync(src, out, { recursive: true, filter: p => !skip.has(p) });
fs.copyFileSync(path.join(here, 'bridge', 'android-bridge.js'), path.join(out, 'android-bridge.js'));

// The system list (names, extensions, case shapes) is read from DEFAULT_SYSTEMS in ../main.js,
// so the Android build always matches the desktop one.
const mainJs = fs.readFileSync(path.resolve(here, '..', 'main.js'), 'utf8');
const m = mainJs.match(/const DEFAULT_SYSTEMS = (\[[\s\S]*?\n\]);/);
if (!m) throw new Error('DEFAULT_SYSTEMS not found in main.js');
const systems = vm.runInNewContext(m[1], {}, { timeout: 1000 });
fs.writeFileSync(path.join(out, 'systems.js'), `window.PYROCADE_SYSTEMS = ${JSON.stringify(systems, null, 1)};\n`);

const indexPath = path.join(out, 'index.html');
let html = fs.readFileSync(indexPath, 'utf8');
const firstScript = html.indexOf('<script ');
if (firstScript < 0) throw new Error('No <script> tag found in renderer/index.html');
const tags = '<script src="systems.js"></script>\n  <script src="android-bridge.js"></script>\n  ';
html = html.slice(0, firstScript) + tags + html.slice(firstScript);
fs.writeFileSync(indexPath, html);
console.log(`www/ ready: renderer + Android bridge, ${systems.length} systems from main.js.`);
