// Isolated fixture for README screenshots: the demo shelf with every built-in system, the real
// emulator catalog, and no ROM folders, downloads, launches or saved settings.
const {contextBridge} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

// Reuse PyroCade's own system list so cases, spines and cartridges match the app.
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const list = main.slice(main.indexOf('const DEFAULT_SYSTEMS = ['), main.indexOf('];', main.indexOf('const DEFAULT_SYSTEMS = [')) + 2);
const systems = new Function(`${list}; return DEFAULT_SYSTEMS;`)().map(s => ({...s, romDir: ''}));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'emulators.json'), 'utf8'));
const config = {systems, emulators:{}, customEmulators:[], hideWhilePlaying:true, launchAnimation:true,
  libraryTheme:'ember', libraryLayout:'carousel', uiSound:{enabled:false, volume:.25}, ambient:{idleMinutes:60, background:'ribbon'}};
const installed = new Set(['duckstation', 'pcsx2', 'mgba']);
const emus = catalog.map(e => ({id:e.id, name:e.name, systems:e.systems, repo:e.source?.repo, officialRepo:e.source?.repo, managed:true,
  prerelease:!!e.source?.prerelease, args:e.args, exe:installed.has(e.id) ? `C:\\PyroCade\\emulators\\${e.id}\\${e.id}.exe` : null,
  installed:installed.has(e.id) ? {name:'Latest release', date:'2026-11-01'} : null, forked:false}));
const sources = {launchbox:{built:Date.now()}, screenscraper:{user:'', devId:'', hasPassword:false, hasDevPassword:false, ready:false}};

contextBridge.exposeInMainWorld('api', {
  appVersion:async()=>require(path.join(root, 'package.json')).version, appCheckUpdate:async()=>({available:false}), appInstallUpdate:async()=>{},
  appOpenRelease:async()=>{}, onAppUpdateProgress:()=>{}, artSources:async()=>sources, artSetScreenScraper:async()=>sources,
  artStatus:async()=>null, onArtProgress:()=>{}, onArtMedia:()=>{}, onLibraryInfo:()=>{},
  getConfig:async()=>config, scan:async()=>[], emuList:async()=>emus, onToast:()=>{}, onProgress:()=>{}, fetchArt:async()=>null,
  setConfig:async c=>Object.assign(config, c), openManual:async()=>{}, launch:async()=>{}, pickFolder:async()=>null,
});
