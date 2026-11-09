// Tauri fixture for rendered demo/screenshot capture. Provides the branch renderer's
// `window.api` surface without the Tauri host, so timelines and screenshots run
// offscreen. Electron is dev-only tooling here, never the product runtime.
// Systems reuse src-tauri/src/config.rs (the Rust default catalog) instead of
// main's deleted main.js; the emulator catalog is emulators.json.
const {contextBridge} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');

const rust = fs.readFileSync(path.join(root, 'src-tauri/src/config.rs'), 'utf8');
const systemsJson = rust.slice(rust.indexOf('const SYSTEMS: &str = r###"[') + 'const SYSTEMS: &str = r###"'.length, rust.indexOf(']"###;') + 1);
const systems = JSON.parse(systemsJson).map(s => ({...s, romDir: ''}));
const catalog = JSON.parse(fs.readFileSync(path.join(root, 'emulators.json'), 'utf8'));
const config = {systems, emulators:{}, customEmulators:[], hideWhilePlaying:true, launchAnimation:true,
  mediaRoot:'', checkUpdates:true, promptFamily:'auto', motion:'auto', eShopStyle:'enhanced',
  libraryTheme:'ember', libraryLayout:'carousel', uiSound:{enabled:false, volume:.25}, ambient:{idleMinutes:60, background:'ribbon'},
  extraGames:[], favorites:[], hiddenGames:[], gameDetails:{}, gameEmulators:{}, gameOrders:{}, recentlyPlayed:[], sortKey:'title', sortAsc:true,
  showFavoritesOnly:false, showRecentlyPlayed:false, recentlyPlayedLimit:20};
const installed = new Set(['duckstation', 'pcsx2', 'mgba']);
const emus = catalog.map(e => ({id:e.id, name:e.name, systems:e.systems, repo:e.source?.repo ?? e.repo, officialRepo:e.source?.repo ?? e.repo, managed:true,
  prerelease:!!e.source?.prerelease, args:e.args, exe:installed.has(e.id) ? `C:\\PyroCade\\emulators\\${e.id}\\${e.id}.exe` : null,
  installed:installed.has(e.id) ? {name:'Latest release', date:'2026-11-01'} : null, forked:false}));
const sources = {launchbox:{built:Date.now()}, screenscraper:{user:'', devId:'', hasPassword:false, hasDevPassword:false, ready:false}};

contextBridge.exposeInMainWorld('api', {
  appVersion:async()=>require(path.join(root, 'package.json')).version, appCheckUpdate:async()=>({available:false}), appInstallUpdate:async()=>{},
  appOpenRelease:async()=>{}, onAppUpdateProgress:()=>{}, artSources:async()=>sources, artSetScreenScraper:async()=>sources,
  artStatus:async()=>null, onArtProgress:()=>{}, onArtMedia:()=>{}, onLibraryInfo:()=>{}, onToast:()=>{}, onProgress:()=>{},
  getConfig:async()=>config, setConfig:async c=>Object.assign(config, c), scan:async()=>[], cachedLibrary:async()=>null,
  toggleFavorite:async()=>[], recordPlay:async()=>true, updateLibraryPrefs:async()=>true,
  getFavorites:async()=>[], getRecentlyPlayed:async()=>[],
  setHidden:async()=>({hidden:false}), setSystemGamesHidden:async()=>[], setMetadata:async()=>({}), setGameEmulator:async()=>({}), saveGameOrder:async()=>[],
  addGame:async()=>null, removeGame:async()=>true, gameList:async()=>[],
  emuList:async()=>emus, emuCheck:async()=>({upToDate:true}), emuInstall:async()=>true, emuUninstall:async()=>true,
  emuOpenFolder:async()=>true, emuPickExe:async()=>null, emuAddCustom:async()=>true,
  fetchArt:async()=>null, artStart:async()=>false, artCancel:async()=>true, artOpenFolder:async()=>true, artImport:async()=>({}),
  openManual:async()=>{}, launch:async()=>true, pickFolder:async()=>null,
  feedbackInfo:async()=>'PyroCade: fixture\nOS: Fixture\nTauri: fixture\nInstallation: Fixture', feedbackCopy:async()=>true, feedbackOpen:async()=>true,
});
