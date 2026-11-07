// PyroCade — main process: config, library scanning, launching, emulator downloads.
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage, safeStorage } = require('electron');
app.setName('PyroCade');
if(process.platform==='win32')app.setAppUserModelId('com.pyrodrifter.pyrocade');
// PyroCade stays open behind a running game. Without this, Windows reports the covered window as
// hidden and Chromium stops reading controllers, so "hold to quit" would never be seen.
app.commandLine.appendSwitch('disable-features', 'CalculateNativeWinOcclusion');
// Started by Steam on Linux (a non-Steam shortcut, in Game Mode or not): PyroCade opened from the
// desktop but not from Steam's Game Mode. Steam's environment is what differs, so PyroCade starts
// again once without the parts that commonly stop Electron apps there:
//  - Steam's overlay (LD_PRELOAD) and Steam runtime libraries (LD_LIBRARY_PATH),
//  - Chromium's sandbox, which can't always start inside Steam (--no-sandbox),
//  - Wayland under gamescope, whose socket can't show a normal app window (--ozone-platform=x11).
// These are chosen before this file can change them, hence the restart. Nothing changes on the
// desktop. PYROCADE_STEAM_FIX=off turns it off; what was done is written to the log below.
const startedBySteam = process.platform === 'linux' && !!(process.env.SteamGameId || process.env.SteamAppId || process.env.STEAM_COMPAT_APP_ID
  || process.env.XDG_CURRENT_DESKTOP === 'gamescope' || process.env.GAMESCOPE_WAYLAND_DISPLAY);
if (startedBySteam && !process.env.PYROCADE_STEAM_FIX) {
  const gamescope = process.env.XDG_CURRENT_DESKTOP === 'gamescope' || !!process.env.GAMESCOPE_WAYLAND_DISPLAY;
  const done = [];
  if (process.env.LD_PRELOAD) { delete process.env.LD_PRELOAD; done.push('cleared LD_PRELOAD'); }
  if (process.env.LD_LIBRARY_PATH) {
    const kept = process.env.LD_LIBRARY_PATH.split(':').filter(d => d && !/steam-runtime|steamrt|ubuntu12_(32|64)|pressure-vessel|\/steam\//i.test(d));
    if (kept.join(':') !== process.env.LD_LIBRARY_PATH) { if (kept.length) process.env.LD_LIBRARY_PATH = kept.join(':'); else delete process.env.LD_LIBRARY_PATH; done.push('removed Steam libraries from LD_LIBRARY_PATH'); }
  }
  const args = process.argv.slice(1);
  if (!args.includes('--no-sandbox')) { args.push('--no-sandbox'); done.push('--no-sandbox'); }
  if (gamescope && !args.some(x => x.startsWith('--ozone-platform'))) { args.push('--ozone-platform=x11'); done.push('--ozone-platform=x11'); }
  process.env.PYROCADE_STEAM_FIX = done.length ? done.join(', ') : 'nothing needed';
  if (done.length) {
    app.relaunch({ ...(process.env.APPIMAGE ? { execPath: process.env.APPIMAGE } : {}), args });
    app.exit(0);
  }
}
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { spawn } = require('child_process');
const { randomUUID } = require('crypto');
const { pipeline } = require('stream/promises');
const { Readable } = require('stream');
const { pathToFileURL } = require('url');
const {createArtworkService} = require('./artwork');
const {createLaunchBox} = require('./launchbox');
const {createScreenScraper} = require('./screenscraper');
const {createMarioWiki} = require('./mariowiki');
const {createInternetArchive} = require('./internet-archive');

const ROOT = __dirname;
// Where settings, installed emulators and artwork live:
//  - portable build: next to the .exe
//  - installed build: %APPDATA%\PyroCade\data (the program folder is read-only / inside app.asar)
//  - running from source (npm start): ./data
const DATA = process.env.PORTABLE_EXECUTABLE_DIR ? path.join(process.env.PORTABLE_EXECUTABLE_DIR, 'data')
  : app.isPackaged ? path.join(app.getPath('appData'), 'PyroCade', 'data')
  : path.join(ROOT, 'data');
// A short log in data/logs/pyrocade.log (Linux: ~/.config/PyroCade/data/logs), so a start that
// fails on someone else's device can be looked at without asking them to run anything.
const LOG_PATH = path.join(DATA, 'logs', 'pyrocade.log');
function log(...parts) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    try { if (fs.statSync(LOG_PATH).size > 512 * 1024) fs.renameSync(LOG_PATH, LOG_PATH + '.old'); } catch {}
    fs.appendFileSync(LOG_PATH, `${new Date().toISOString()} ${parts.map(p => typeof p === 'string' ? p : JSON.stringify(p)).join(' ')}\n`);
  } catch {}
}
log(`start ${require('./package.json').version}`, { platform: process.platform, electron: process.versions.electron, argv: process.argv.slice(1),
  desktop: process.env.XDG_CURRENT_DESKTOP || '', session: process.env.XDG_SESSION_TYPE || '', wayland: !!process.env.WAYLAND_DISPLAY,
  display: process.env.DISPLAY || '', steam: startedBySteam, steamFix: process.env.PYROCADE_STEAM_FIX || '', appImage: !!process.env.APPIMAGE });
process.on('uncaughtExceptionMonitor', e => log('error', e?.stack || String(e)));
app.on('child-process-gone', (_e, d) => log('child process gone', d));
app.on('render-process-gone', (_e, _w, d) => log('window process gone', d));
app.whenReady().then(() => log('ready')).catch(e => log('not ready', e?.stack || String(e)));
const EMU_DIR = path.join(DATA, 'emulators');
const CONFIG_PATH = path.join(DATA, 'config.json');
const CATALOG = JSON.parse(fs.readFileSync(path.join(ROOT, 'emulators.json'), 'utf8'));
const UA = { 'User-Agent': 'PyroCade-Frontend', Accept: 'application/vnd.github+json' };
const previewMode=!!(process.env.PYROCADE_SNAP||process.env.PYROCADE_RECORD);
if (previewMode) {
  const previewCache = path.join(os.tmpdir(),`PyroCade-preview-${process.pid}`);
  fs.mkdirSync(previewCache,{recursive:true});
  app.setPath('sessionData',previewCache);
}

// ---------- Systems ----------
// caseType drives the 3D model: size of the box and whether it holds a disc or a cartridge.
const DEFAULT_SYSTEMS = [
  // Sony
  { id: 'ps1', name: 'PlayStation', caseType: 'jewel', media: 'disc', color: '#9aa3ad', extensions: ['.m3u', '.cue', '.chd', '.pbp'], emulator: 'duckstation', libretro: 'Sony - PlayStation' },
  { id: 'ps2', name: 'PlayStation 2', caseType: 'dvd', media: 'disc', color: '#1d3f8f', extensions: ['.iso', '.chd', '.cso', '.gz'], emulator: 'pcsx2', libretro: 'Sony - PlayStation 2' },
  { id: 'ps3', name: 'PlayStation 3', caseType: 'bluray', media: 'disc', color: '#2b2b2b', extensions: ['.iso'], emulator: 'rpcs3', libretro: 'Sony - PlayStation 3' },
  { id: 'ps4', name: 'PlayStation 4', caseType: 'bluray', media: 'disc', color: '#1a4fb5', extensions: ['.pkg'], emulator: 'shadps4' },
  { id: 'psp', name: 'PSP', caseType: 'umd', media: 'disc', color: '#111111', extensions: ['.iso', '.cso', '.chd'], emulator: 'ppsspp', libretro: 'Sony - PlayStation Portable' },
  // Nintendo
  { id: 'switch', name: 'Nintendo Switch', caseType: 'switch', media: 'cart', color: '#e60012', extensions: ['.nsp', '.xci', '.nsz'], emulator: '', artworkProvider: 'gametdb-switch' },
  { id: 'switch2', name: 'Nintendo Switch 2', caseType: 'switch', media: 'cart', color: '#d0021b', extensions: ['.nsp', '.xci', '.nsz', '.xcz', '.nup'], emulator: '', artworkProvider: 'gametdb-switch' },
  { id: 'wiiu', name: 'Wii U', caseType: 'dvd', media: 'disc', color: '#1a9ad6', extensions: ['.wua', '.wud', '.wux', '.rpx'], emulator: 'cemu', libretro: 'Nintendo - Wii U' },
  { id: 'wii', name: 'Wii', caseType: 'dvd', media: 'disc', color: '#e9eef2', extensions: ['.rvz', '.wbfs', '.iso'], emulator: '', libretro: 'Nintendo - Wii' },
  { id: 'gc', name: 'GameCube', caseType: 'gc', media: 'disc', color: '#5a4a9c', extensions: ['.rvz', '.iso', '.gcm', '.ciso'], emulator: '', libretro: 'Nintendo - GameCube' },
  { id: 'n64', name: 'Nintendo 64', caseType: 'bigbox', media: 'cart', color: '#2a7d3a', extensions: ['.z64', '.n64', '.v64'], emulator: '', libretro: 'Nintendo - Nintendo 64' },
  { id: 'snes', name: 'Super Nintendo', caseType: 'bigbox', media: 'cart', color: '#7b6fb5', extensions: ['.sfc', '.smc'], emulator: '', libretro: 'Nintendo - Super Nintendo Entertainment System' },
  { id: 'nes', name: 'NES', caseType: 'nesbox', media: 'cart', color: '#c4262e', extensions: ['.nes', '.zip'], emulator: '', libretro: 'Nintendo - Nintendo Entertainment System' },
  { id: '3ds', name: 'Nintendo 3DS', caseType: 'ds', media: 'cart', color: '#d41e2a', extensions: ['.3ds', '.cci', '.cxi', '.cia'], emulator: 'azahar', libretro: 'Nintendo - Nintendo 3DS' },
  { id: 'nds', name: 'Nintendo DS', caseType: 'ds', media: 'cart', color: '#c9c9c9', extensions: ['.nds', '.zip'], emulator: 'melonds', libretro: 'Nintendo - Nintendo DS' },
  { id: 'gba', name: 'Game Boy Advance', caseType: 'cartbox', media: 'cart', color: '#4b3a9b', extensions: ['.gba', '.zip'], emulator: 'mgba', libretro: 'Nintendo - Game Boy Advance' },
  { id: 'gbc', name: 'Game Boy Color', caseType: 'cartbox', media: 'cart', color: '#7a3fb0', extensions: ['.gbc', '.zip'], emulator: 'mgba', libretro: 'Nintendo - Game Boy Color' },
  { id: 'gb', name: 'Game Boy', caseType: 'cartbox', media: 'cart', color: '#8b8f6a', extensions: ['.gb', '.zip'], emulator: 'mgba', libretro: 'Nintendo - Game Boy' },
  // Sega / Microsoft / other
  { id: 'dreamcast', name: 'Dreamcast', caseType: 'jewel', media: 'disc', color: '#e8e8e8', extensions: ['.chd', '.gdi', '.cdi'], emulator: 'flycast', libretro: 'Sega - Dreamcast' },
  { id: 'genesis', name: 'Sega Genesis', caseType: 'dvd', media: 'cart', color: '#1b1b1b', extensions: ['.md', '.gen', '.smd', '.zip'], emulator: '', libretro: 'Sega - Mega Drive - Genesis' },
  { id: 'xbox', name: 'Xbox', caseType: 'dvd', media: 'disc', color: '#1c8a2e', extensions: ['.iso', '.xiso'], emulator: 'xemu', libretro: 'Microsoft - Xbox' },
  { id: 'x360', name: 'Xbox 360', caseType: 'dvd', media: 'disc', color: '#7cbb00', extensions: ['.iso', '.xex', '.zar'], emulator: '', libretro: 'Microsoft - Xbox 360' },
  // PC: a folder of shortcuts (.lnk, Steam .url) or game programs. Games start directly, no emulator.
  { id: 'pc', name: 'PC Games', caseType: 'dvd', media: 'disc', color: '#3b82f6', extensions: ['.lnk', '.url', '.exe'], emulator: '', direct: true },
  { id: 'a2600', name: 'Atari 2600', caseType: 'nesbox', media: 'cart', color: '#a0522d', extensions: ['.a26', '.zip'], emulator: '', libretro: 'Atari - 2600' },
  { id: 'arcade', name: 'Arcade', caseType: 'bigbox', media: 'cart', color: '#d4a017', extensions: ['.zip'], emulator: '', libretro: 'MAME' },
];
// Folders inside ROM folders that hold extras rather than games.
const SKIP_DIRS = /^(source archives|_extras|extras|texture packs|saves?|states|bios|cheats|patches|media|images|manuals|downloaded_media|covers|screenshots)$/i;

function defaultConfig() {
  return {
    mediaRoot: '',
    launchAnimation: true,
    checkUpdates: true,
    fullscreen: false,
    promptFamily: 'auto',
    motion: 'auto',
    eShopStyle: 'enhanced',
    libraryTheme:'ember',libraryLayout:'carousel',ambient:{idleMinutes:2,background:'ribbon'},uiSound:{enabled:true,volume:.25},
    systems: DEFAULT_SYSTEMS.map(s => ({ ...s, romDir: '' })),
    emulators: {},        // per catalog id: { exe, args, prerelease } overrides
    customEmulators: [],  // { id, name, exe, args, systems: [] }
    extraGames: [],       // games added one by one: { id, system, path, title }
  };
}

let configWarning = null;
function loadConfig() {
  let text;
  try { text = fs.readFileSync(CONFIG_PATH, 'utf8'); } catch { return defaultConfig(); } // first run
  try {
    const saved = JSON.parse(text);
    if (!saved || !Array.isArray(saved.systems)) throw new Error('missing systems');
    saved.emulators ||= {};
    saved.customEmulators ||= [];
    saved.extraGames ||= [];
    const def = defaultConfig();
    // Keep new default systems appearing for older configs.
    const ids = new Set(saved.systems.map(s => s.id));
    for (const s of def.systems) if (!ids.has(s.id)) saved.systems.push(s);
    // Fill in fields added in newer versions (libretro name, case shape…).
    saved.systems = saved.systems.map(s => ({ ...(def.systems.find(d => d.id === s.id) || {}), ...s }));
    // File types added to a built-in system after release reach existing settings once; a type the
    // user removes afterwards stays removed.
    const done = new Set(saved.migrations || []);
    for (const [key, sysId, ext] of [['ext-switch2-nup', 'switch2', '.nup']]) {
      if (done.has(key)) continue;
      const sys = saved.systems.find(s => s.id === sysId);
      if (sys && Array.isArray(sys.extensions) && !sys.extensions.includes(ext)) sys.extensions = [...sys.extensions, ext];
      done.add(key);
    }
    saved.migrations = [...done];
    return { ...def, ...saved };
  } catch (e) {
    // Keep the damaged file instead of letting the next save overwrite it with defaults.
    const backup = `${CONFIG_PATH}.broken-${Date.now()}`;
    try { fs.copyFileSync(CONFIG_PATH, backup); } catch {}
    console.error(`config.json could not be read (${e.message}); a copy was kept at ${backup}`);
    configWarning = `Your settings file was damaged, so defaults were loaded. The old file was kept as ${path.basename(backup)} in the data folder.`;
    return defaultConfig();
  }
}
function saveConfig(cfg) {
  fs.mkdirSync(DATA, { recursive: true });
  // Write to a temp file and swap it in, so a crash mid-save can't leave a half-written config.
  const tmp = `${CONFIG_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2));
  fs.renameSync(tmp, CONFIG_PATH);
}
let config = loadConfig();

// ---------- Library state: favourites, play time, last selection ----------
// Kept apart from config.json: it changes after every game and every selection, and the window's
// "Save & rescan" (which sends a whole config) must never overwrite it.
const STATE_PATH = path.join(DATA, 'library-state.json');
const emptyState = () => ({ favorites: {}, stats: {}, discs: {}, hidden: {}, titles: {}, ui: {} });
function loadState() {
  try { const s = JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); return { ...emptyState(), ...(s && typeof s === 'object' ? s : {}) }; }
  catch { return emptyState(); }
}
let libraryState = loadState(), stateTimer = null;
function writeState() {
  clearTimeout(stateTimer); stateTimer = null;
  try {
    fs.mkdirSync(DATA, { recursive: true });
    const tmp = `${STATE_PATH}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(libraryState));
    fs.renameSync(tmp, STATE_PATH);
  } catch (e) { console.error(`library-state.json could not be saved: ${e.message}`); }
}
const saveState = () => { clearTimeout(stateTimer); stateTimer = setTimeout(writeState, 800); };
// What the window needs to know about one game: favourite, hidden, play time, last played, chosen disc.
function gameState(id) {
  const st = libraryState.stats[id] || {};
  return { favorite: !!libraryState.favorites[id], hidden: !!libraryState.hidden?.[id], customTitle: libraryState.titles?.[id] || '', playMs: st.ms || 0, lastPlayed: st.last || 0, plays: st.plays || 0, disc: libraryState.discs[id] || 0 };
}

// ---------- Library scanning ----------
const IMG = ['.png', '.jpg', '.jpeg', '.webp', '.gif'];
// For each media kind: names used in per-game folders, and ES-DE / Skraper style folder names.
const KINDS = {
  front:      { names: ['front', 'cover', 'box-front', 'boxfront', 'box'], folders: ['covers', 'box2dfront', 'boxart'], exts: IMG },
  frontHQ:    { names: ['front-hq'], folders: ['cover-hq'], exts: IMG },
  back:       { names: ['back', 'box-back', 'boxback'], folders: ['backcovers', 'box2dback'], exts: IMG },
  spine:      { names: ['spine', 'box-spine', 'side'], folders: ['spines', 'box2dside'], exts: IMG },
  disc:       { names: ['disc', 'cd', 'cart', 'cartridge', 'media', 'physicalmedia'], folders: ['physicalmedia', 'discs', 'support'], exts: IMG },
  manual:     { names: ['manual'], folders: ['manuals'], exts: ['.pdf'] },
  screenshot: { names: ['screenshot', 'snap', 'screen'], folders: ['screenshots', 'snaps', 'images'], exts: IMG },
  title:      { names: ['title', 'titlescreen'], folders: ['titlescreens', 'titles'], exts: IMG },
  fanart:     { names: ['fanart', 'background', 'bg'], folders: ['fanart', 'backgrounds'], exts: IMG },
  logo:       { names: ['logo', 'marquee', 'wheel'], folders: ['marquees', 'wheel', 'logos'], exts: IMG },
  video:      { names: ['video', 'trailer'], folders: ['videos'], exts: ['.mp4', '.webm'] },
};

async function listDir(dir) {
  try { return await fsp.readdir(dir, { withFileTypes: true }); } catch { return []; }
}
const stem = f => path.basename(f, path.extname(f)).toLowerCase();
const fileUrl = p => (p ? pathToFileURL(p).href : null);

function cleanTitle(name) {
  return name.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '')
    .replace(/_/g, ' ')
    .replace(/^\d{3,5}\s*-?\s+(?=\S)/, '')          // release numbers: "0004 - Zelda", "1158 Zelda"
    .replace(/\s*\b(decrypted|encrypted)\b\s*$/i, '')
    .replace(/\s+/g, ' ').trim() || name;
}
// "Legend of Zelda, The - Ocarina" -> "The Legend of Zelda - Ocarina" (display only)
const displayTitle = s => cleanTitle(s).replace(/^(.+?),? (The|A|An)(?= - |$)/, '$2 $1');

// Index a media root once: folder-per-game dirs + ES-DE style kind folders.
// Kind folders (covers, manuals…) are found directly in a root or one level down, so extras kept
// in e.g. "00 Goodies\Manuals" are picked up too. Files are matched by exact name, then loosely by
// title ("Game (USA).pdf" for "Game (USA) (Rev 1).rvz").
async function indexMediaRoot(root) {
  const idx = { gameDirs: new Map(), kinds: {}, loose: {} };
  const kindOf = name => Object.entries(KINDS).find(([, k]) => k.folders.includes(name.toLowerCase()));
  async function addKindFolder(dir, [kind, k]) {
    const m = (idx.kinds[kind] ||= new Map()), loose = (idx.loose[kind] ||= new Map());
    for (const f of await listDir(dir)) {
      if (!f.isFile() || !k.exts.includes(path.extname(f.name).toLowerCase())) continue;
      const file = path.join(dir, f.name);
      if (!m.has(stem(f.name))) m.set(stem(f.name), file);
      const key = looseKey(path.basename(f.name, path.extname(f.name)));
      for (const k of [key, bareKey(path.basename(f.name, path.extname(f.name)))]) if (k && !loose.has(k)) loose.set(k, file);
    }
  }
  for (const e of await listDir(root)) {
    if (!e.isDirectory()) continue;
    const kind = kindOf(e.name);
    if (kind) { await addKindFolder(path.join(root, e.name), kind); continue; }
    idx.gameDirs.set(e.name.toLowerCase(), path.join(root, e.name));
    for (const sub of await listDir(path.join(root, e.name))) {
      const inner = sub.isDirectory() && kindOf(sub.name);
      if (inner) await addKindFolder(path.join(root, e.name, sub.name), inner);
    }
  }
  return idx;
}

async function findMedia(indexes, base) {
  const key = base.toLowerCase();
  const media = {};
  let info = null;
  for (const idx of indexes) {
    const dir = idx.gameDirs.get(key) || idx.gameDirs.get(cleanTitle(base).toLowerCase());
    if (dir) {
      const files = (await listDir(dir)).filter(f => f.isFile());
      for (const [kind, k] of Object.entries(KINDS)) {
        if (media[kind]) continue;
        const hit = k.names.map(name=>files.filter(f=>stem(f.name)===name&&k.exts.includes(path.extname(f.name).toLowerCase())).sort((a,b)=>(path.extname(a.name).toLowerCase()==='.png'?0:1)-(path.extname(b.name).toLowerCase()==='.png'?0:1))[0]).find(Boolean);
        if (hit) media[kind] = path.join(dir, hit.name);
      }
      const inf = files.find(f => f.name.toLowerCase() === 'info.json');
      if (inf && !info) try { info = JSON.parse(await fsp.readFile(path.join(dir, inf.name), 'utf8')); } catch {}
    }
    for (const [kind, m] of Object.entries(idx.kinds)) if (!media[kind] && m.has(key)) media[kind] = m.get(key);
  }
  const loose = looseKey(base);
  for (const k of [loose, bareKey(base)]) if (k) for (const idx of indexes) for (const [kind, m] of Object.entries(idx.loose || {})) if (!media[kind] && m.has(k)) media[kind] = m.get(k);
  return { media, info };
}

// Minimal EmulationStation gamelist.xml reader.
async function readGamelist(dir) {
  const map = new Map();
  let xml;
  try { xml = await fsp.readFile(path.join(dir, 'gamelist.xml'), 'utf8'); } catch { return map; }
  const tag = (s, t) => { const m = s.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1].trim()) : undefined; };
  const decode = s => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'");
  for (const g of xml.match(/<game[\s>][\s\S]*?<\/game>/g) || []) {
    const p = tag(g, 'path'); if (!p) continue;
    const rd = tag(g, 'releasedate');
    map.set(stem(p), {
      title: tag(g, 'name'), description: tag(g, 'desc'), developer: tag(g, 'developer'),
      publisher: tag(g, 'publisher'), genre: tag(g, 'genre'), players: tag(g, 'players'),
      year: rd ? rd.slice(0, 4) : undefined,
    });
  }
  return map;
}

// Walk a ROM folder (and its sub-folders) collecting files with matching extensions.
const exists = p => fsp.access(p).then(() => true, () => false);
async function walkRoms(dir, exts, depth = 0, out = []) {
  const entries = await listDir(dir);
  // Decrypted Switch / Switch 2 dumps are folders: <game>\base\exefs\main (+ romfs), or <game>\exefs\main.
  // The whole folder counts as one game, launched through its exefs\main. Only folders that
  // actually contain base\ or exefs\ are checked, so normal folders cost no extra disk access.
  if (exts.includes('.nsp') && entries.some(e => e.isDirectory() && /^(base|exefs)$/i.test(e.name))) {
    for (const main of [path.join(dir, 'base', 'exefs', 'main'), path.join(dir, 'exefs', 'main')]) {
      if (!(await exists(main))) continue;
      const label = path.basename(dir).replace(/([a-z])([A-Z])/g, '$1 $2'); // DonkeyKongBananza -> Donkey Kong Bananza
      out.push({ name: label + '.dump', path: main, size: 9e9, dump: true });
      return out;
    }
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (depth < 4 && !SKIP_DIRS.test(e.name)) await walkRoms(p, exts, depth + 1, out); }
    else if (exts.includes(path.extname(e.name).toLowerCase())) {
      let size = 0; try { size = (await fsp.stat(p)).size; } catch {}
      out.push({ name: e.name, path: p, size });
    }
  }
  return out;
}

// Loose key for matching names across naming schemes: "Pokémon - Ruby (U) [!]" -> "pokemonruby".
const looseKey = s => cleanTitle(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/&|\band\b|\bthe\b/g, '').replace(/[^a-z0-9]/g, '');

// The same key without a leading brand ("Nickelodeon SpongeBob…", "DreamWorks Shrek…"), which
// manual and artwork collections often leave out. Only used as a last resort.
// Works on the original name, where "Nickelodeon's" and "Nickelodeon SpongeBob" can still be told apart.
const BRAND = /^\s*(disney\s*[-•]?\s*pixar|disney|pixar|dreamworks|nickelodeon|nicktoons)('s)?\b[\s:-]*/i;
const bareKey = name => { if (!BRAND.test(cleanTitle(name))) return ''; const b = looseKey(cleanTitle(name).replace(BRAND, '')); return b.length >= 6 ? b : ''; };

// Nintendo Switch dumps write the 16-digit title ID into the file name:
// "Game [0100ABCD12345000][v0].nsp". A game's update ends in …800 and its downloadable content in
// …1000 and up, so clearing the low 13 bits of any of them gives the base game's own ID. Nintendo
// never hands out a base ID inside that range, so two different games can never collide here.
const TITLE_ID = /\[([0-9a-f]{16})\]/i;
function switchTitleId(name) {
  const m = name.match(TITLE_ID);
  if (!m) return null;
  const id = BigInt('0x' + m[1]);
  // part: 0 = the game itself, 0x800 = its update, 0x1000 and up = one of its DLC packs.
  return { base: (id & ~0x1fffn).toString(16).padStart(16, '0'), part: Number(id & 0x1fffn) };
}
// Updates and DLC join the game they belong to instead of each becoming a game of their own.
const switchGroup = name => switchTitleId(name)?.base || '';

// When the same game appears more than once, keep the best copy.
function copyScore(f, titleIds) {
  const n = f.name;
  let s = 0;
  if (/\((u|usa|us|e|eu|europe|world|en)\b|\(usa?,|\[usa?\]|\(ue\)/i.test(n)) s += 4;
  if (/\((j|jp|japan)\)/i.test(n)) s -= 2;
  if (/\[!\]/.test(n)) s += 2;
  if (/\b(update|upd|dlc)\b|\[v[1-9]\d*\]|\(beta|\(proto|\(demo|\(hack|\[(b|h|t|o)\d*\]/i.test(n)) s -= 6;
  if (!/\.zip$/i.test(n)) s += 1;
  // Switch: the game itself is what you launch, so it beats its own update and DLC files.
  if (titleIds) { const id = switchTitleId(n); if (id) s += id.part === 0 ? 8 : -8; }
  return s + Math.min(f.size / 1e10, 0.9); // tie-break: bigger file (base game rather than patch)
}

const romDirsOf = sys => String(sys.romDir || '').split('|').map(d => d.trim()).filter(Boolean);
let libraryGames = [];
async function scanLibrary() {
  const games = [];
  for (const sys of config.systems) {
    // A system can have several ROM folders (e.g. games split across two SD cards), separated by "|".
    // Folders that are missing - an SD card that isn't inserted - are skipped.
    const dirs = romDirsOf(sys).filter(d => fs.existsSync(d));
    const extras = (config.extraGames || []).filter(x => x.system === sys.id && fs.existsSync(x.path));
    if (!dirs.length && !extras.length) continue;
    const exts = sys.extensions.map(e => e.toLowerCase());
    const files = [];
    // Direct-launch systems (PC) only look at the folder itself: game folders are full of helper programs.
    for (const [ri, dir] of dirs.entries()) {
      for (const f of await walkRoms(dir, exts, sys.direct ? 4 : 0)) if (!/\(track \d+\)/i.test(f.name)) files.push({ ...f, root: dir, rootIndex: ri });
    }
    for (const x of extras) {
      let size = 0; try { size = (await fsp.stat(x.path)).size; } catch {}
      files.push({ name: path.basename(x.path), path: x.path, size, root: path.dirname(x.path), rootIndex: 'added-' + x.id, title: x.title, added: x.id, score: Infinity });
    }
    // Prefer .m3u playlists over their individual discs.
    const m3u = new Set(files.filter(f => /\.m3u$/i.test(f.name)).map(f => looseKey(stem(f.name))));
    // Switch-style libraries group by title ID, so an update or a DLC pack never becomes its own game.
    const titleIds = ['.nsp', '.xci', '.nsz', '.xcz'].some(e => exts.includes(e));
    const best = new Map();
    for (const f of files) {
      const base = path.basename(f.name, path.extname(f.name));
      if (!/\.m3u$/i.test(f.name) && /\(disc \d+\)/i.test(base) && m3u.has(looseKey(base))) continue;
      const key = (titleIds && switchGroup(base)) || looseKey(base) || base.toLowerCase();
      if (f.score !== Infinity) f.score = copyScore(f, titleIds);
      if (!best.has(key) || best.get(key).score < f.score) best.set(key, f);
    }
    const roots = [config.mediaRoot && path.join(config.mediaRoot, sys.id), ...dirs.flatMap(d => [path.join(d, 'media'), d]), path.join(DATA, 'media', sys.id)].filter(Boolean);
    const indexes = await Promise.all(roots.map(indexMediaRoot));
    const gamelist = new Map();
    for (const d of dirs) for (const [k, v] of await readGamelist(d)) if (!gamelist.has(k)) gamelist.set(k, v);
    // Multi-disc games without an .m3u: "Game (USA) (Disc 1).cue", "(Disc 2).cue"… become one game
    // with a disc list. Only discs of the same copy (same name apart from the disc number) are grouped.
    const discTag = /\s*\(dis[ck]\s*(\d+)[^)]*\)/i;
    for (const [key, chosen] of best) {
      const copy = n => path.basename(n, path.extname(n)).replace(discTag, '').toLowerCase();
      if (chosen.added || !discTag.test(chosen.name)) continue;
      const seen = new Map();
      for (const f of files) {
        if (f.added || /\.m3u$/i.test(f.name) || copy(f.name) !== copy(chosen.name)) continue;
        const n = Number(path.basename(f.name, path.extname(f.name)).match(discTag)?.[1]);
        if (n && !seen.has(n)) seen.set(n, f);
      }
      if (seen.size < 2) continue;
      const discs = [...seen].sort((a, b) => a[0] - b[0]);
      best.set(key, { ...discs[0][1], score: chosen.score, discs: discs.map(([n, f]) => ({ n, path: f.path })) });
    }
    for (const f of best.values()) {
      const base = path.basename(f.name, path.extname(f.name));
      const { media, info } = await findMedia(indexes, base);
      const meta = { ...(gamelist.get(base.toLowerCase()) || {}), ...(info || {}), ...(f.title ? { title: f.title } : {}) };
      let shell = null;
      if (media.disc) try { shell = JSON.parse(await fsp.readFile(media.disc.replace(/\.[^.\\/]+$/, '.json'), 'utf8')).shell || null; } catch {}
      games.push({
        id: `${sys.id}:${f.rootIndex ? f.rootIndex + ':' : ''}${path.relative(f.root, f.path)}`,
        system: sys.id,
        romPath: f.path,
        base,
        title: meta.title || displayTitle(base),
        ...(f.added ? { added: f.added } : {}),
        ...(f.discs ? { discs: f.discs.map(d => d.n), discPaths: f.discs.map(d => d.path) } : {}),
        ...(shell && /^#[0-9a-f]{6}$/i.test(shell) ? { shell } : {}),
        info: meta,
        media: Object.fromEntries(Object.entries(media).map(([k, v]) => [k, k === 'manual' ? v : fileUrl(v)])),
      });
    }
  }
  for (const g of games) {
    if (config.shellColors?.[g.id]) g.shellCustom = config.shellColors[g.id];
    if (config.gameEmulators?.[g.id]) g.emulator = config.gameEmulators[g.id];
    // A title typed in Rename… wins over the scanned one, so the shelf sorts by it too.
    // The scanned title is kept so "Use the file name" can put it back exactly.
    g.scannedTitle = g.title;
    if (libraryState.titles?.[g.id]) g.title = libraryState.titles[g.id];
  }
  games.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  libraryGames = games;
  // The window gets the disc numbers and the game's own state, never the other disc paths.
  return games.map(({ discPaths, ...g }) => ({ ...g, ...gameState(g.id) }));
}

// ---------- Artwork download ----------
// WebP (common in newer LaunchBox uploads, often named .jpg) is not readable by nativeImage,
// so it is decoded by Chromium in a hidden sandboxed window and handed back as PNG.
let webpWindow=null,webpQueue=Promise.resolve(),webpIdle=null;
const closeWebpWindow=()=>{clearTimeout(webpIdle);if(webpWindow&&!webpWindow.isDestroyed())webpWindow.destroy();webpWindow=null};
const isWebp=b=>b.length>12&&b.toString('latin1',0,4)==='RIFF'&&b.toString('latin1',8,12)==='WEBP';
function webpToPng(bytes) {
  const run=webpQueue.then(async()=>{
    if(!webpWindow||webpWindow.isDestroyed()) {
      webpWindow=new BrowserWindow({show:false,width:64,height:64,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,javascript:true}});
      await webpWindow.loadURL('about:blank');
    }
    const script=`(async()=>{const b=Uint8Array.from(atob("${bytes.toString('base64')}"),c=>c.charCodeAt(0));
      const bmp=await createImageBitmap(new Blob([b],{type:'image/webp'}));
      if(bmp.width>16384||bmp.height>16384||bmp.width*bmp.height>40e6)throw new Error('too large');
      const c=new OffscreenCanvas(bmp.width,bmp.height);c.getContext('2d').drawImage(bmp,0,0);
      const out=new Uint8Array(await (await c.convertToBlob({type:'image/png'})).arrayBuffer());
      let s='';for(let i=0;i<out.length;i+=32768)s+=String.fromCharCode(...out.subarray(i,i+32768));return btoa(s)})()`;
    return Buffer.from(await webpWindow.webContents.executeJavaScript(script),'base64');
  });
  webpQueue=run.catch(()=>{});
  // Close the helper once it has been idle for a while, so it never keeps the app running.
  webpQueue.then(()=>{clearTimeout(webpIdle);webpIdle=setTimeout(closeWebpWindow,15000)});
  return run.catch(()=>{throw new Error('Could not read this WebP image.')});
}
function artworkPng(bytes) {
  if(isWebp(bytes))return webpToPng(bytes);
  const image=nativeImage.createFromBuffer(bytes),size=image.getSize();
  if(image.isEmpty()||size.width>16384||size.height>16384||size.width*size.height>40e6)throw new Error('Choose a valid image smaller than 40 megapixels.');
  return image.toPNG();
}
// Downloaded artwork is kept at a sensible size: full-size scans are scaled to fit these limits
// (longest side, in pixels) and photos are saved as JPEG. Small pixel art and anything with
// transparency (discs, logos) stays PNG so it keeps crisp edges.
const ARTWORK_LIMITS = { front: 1600, frontHQ: 2000, back: 1600, spine: 1600, screenshot: 1920, title: 1920, disc: 1200, logo: 1000, fanart: 1920 };
function hasTransparency(image) {
  const { width, height } = image.getSize(), px = image.toBitmap();
  const step = Math.max(1, Math.floor(width * height / 40000)); // sample ~40k pixels
  for (let i = 0; i < width * height; i += step) if (px[i * 4 + 3] < 250) return true;
  return false;
}
function encodeArtwork(png, type) {
  let image = nativeImage.createFromBuffer(png);
  const { width, height } = image.getSize(), limit = ARTWORK_LIMITS[type] || 1600;
  if (image.isEmpty()) return { bytes: png, ext: 'png' };
  if (Math.max(width, height) > limit) image = image.resize(width >= height ? { width: limit, quality: 'best' } : { height: limit, quality: 'best' });
  const size = image.getSize();
  if (Math.max(size.width, size.height) < 400 || hasTransparency(image)) return { bytes: image.toPNG(), ext: 'png' };
  return { bytes: image.toJPEG(88), ext: 'jpg' };
}

// Cartridge photos (LaunchBox, ScreenScraper) show the whole plastic shell, but PyroCade draws its own
// shell and only needs the sticker. Trim the transparent margin, then cut out the label area,
// measured on real scans (percent of the cartridge: left, top, width, height).
const CART_LABELS = {
  gb:[12.5,28,75,59], gbc:[14,33,73,57], gba:[13.5,22.5,73,65.5],
  nes:[40,1,46.5,67], snes:[18.7,1,62,43], n64:[25.3,10.4,49.4,74.9], genesis:[14.5,2.6,71.3,86],
  nds:[10,5.5,80.5,82.5], '3ds':[8.3,7.5,77.5,83.3],
};
function cartridgeLabel(bytes, systemId) {
  const area = CART_LABELS[systemId];
  if (!area) return null; // no measured label for this cartridge yet: keep the generated label
  const image = nativeImage.createFromBuffer(bytes), {width, height} = image.getSize();
  if (image.isEmpty() || width < 64 || height < 64) return null;
  const px = image.toBitmap(); // BGRA
  let left = width, right = -1, top = height, bottom = -1;
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    if (px[(y * width + x) * 4 + 3] > 40) { if (x < left) left = x; if (x > right) right = x; if (y < top) top = y; if (y > bottom) bottom = y; }
  }
  if (right < left || bottom < top) return null;
  const w = right - left + 1, h = bottom - top + 1;
  const rect = { x: Math.round(left + w * area[0] / 100), y: Math.round(top + h * area[1] / 100), width: Math.round(w * area[2] / 100), height: Math.round(h * area[3] / 100) };
  if (rect.width < 32 || rect.height < 32) return null;
  // The plastic colour: median of the shell pixels around the label (skipping the label itself).
  const r = [], g = [], b = [];
  const step = Math.max(1, Math.floor(Math.sqrt(w * h / 20000)));
  for (let y = top; y <= bottom; y += step) for (let x = left; x <= right; x += step) {
    if (x >= rect.x - 4 && x <= rect.x + rect.width + 4 && y >= rect.y - 4 && y <= rect.y + rect.height + 4) continue;
    const i = (y * width + x) * 4;
    if (px[i + 3] < 200) continue;
    b.push(px[i]); g.push(px[i + 1]); r.push(px[i + 2]);
  }
  const median = list => list.sort((p, q) => p - q)[list.length >> 1] || 0;
  const label = image.crop(rect).toPNG();
  if (r.length > 50) label.shellColor = '#' + [median(r), median(g), median(b)].map(v => v.toString(16).padStart(2, '0')).join('');
  return label;
}

// ScreenScraper login. Passwords are encrypted with the operating system's key store when it is available.
const sealed = text => {
  if (!text) return '';
  return safeStorage.isEncryptionAvailable() ? 'enc:' + safeStorage.encryptString(text).toString('base64') : 'raw:' + Buffer.from(text).toString('base64');
};
const unsealed = value => {
  try {
    if (typeof value !== 'string' || !value) return '';
    if (value.startsWith('enc:')) return safeStorage.decryptString(Buffer.from(value.slice(4), 'base64'));
    if (value.startsWith('raw:')) return Buffer.from(value.slice(4), 'base64').toString();
  } catch {}
  return '';
};
let scraperCredentials = null;
function screenScraperCredentials() {
  if (scraperCredentials) return scraperCredentials;
  const c = config.screenscraper || {};
  return scraperCredentials = { user: c.user || '', devId: c.devId || '', password: unsealed(c.password), devPassword: unsealed(c.devPassword) };
}
const screenscraper = createScreenScraper({ getCredentials: screenScraperCredentials });
const launchbox = createLaunchBox({
  dataDir: DATA,
  normalize: looseKey,
  download: (url, file, onBytes) => artwork.download(url, file, onBytes),
  onStatus: message => artwork.note(message),
});
// Volunteer-run sites: a generic name that says what is asking, one request a second, answers kept a month.
const WEB_AGENT = `PyroCade/${require('./package.json').version} (+https://github.com/Pyrodrifter/PyroCade)`;
const mariowiki = createMarioWiki({ dataDir: DATA, userAgent: WEB_AGENT });
const internetArchive = createInternetArchive({ dataDir: DATA, normalize: looseKey, userAgent: WEB_AGENT });
const artwork = createArtworkService({
  launchbox,
  screenscraper,
  mariowiki,
  internetArchive,
  cartridgeLabel,
  encodeImage: encodeArtwork,
  dataDir: DATA,
  getSystems: () => config.systems,
  getGames: () => libraryGames,
  normalize: looseKey,
  decodeImage: artworkPng,
  onProgress: progress => {
    if (win && !win.isDestroyed()) win.webContents.send('art:progress', progress);
    // The first download builds the LaunchBox database; fill in game details right away.
    if (progress.status === 'complete') fillGameDetails(libraryGames).then(changed => {
      if (changed.length && win && !win.isDestroyed()) win.webContents.send('library:info', changed);
    }).catch(() => {});
  },
});

// ---------- Emulators ----------
function emuDef(id) {
  const catalog = CATALOG.find(e => e.id === id);
  const base = catalog || config.customEmulators.find(e => e.id === id);
  if (!base) return null;
  const override = config.emulators[id] || {};
  // On Linux the catalog's "linux" block replaces the Windows download rules. Catalog emulators
  // without one aren't managed by the downloader there (they can still be linked by hand).
  let platform = base;
  if (catalog && process.platform !== 'win32') {
    platform = catalog.linux && process.platform === 'linux'
      ? { ...catalog, asset: catalog.linux.asset, exe: catalog.linux.exe, source: { ...catalog.source, repo: catalog.linux.repo || catalog.source.repo } }
      : { ...catalog, source: undefined };
  }
  // A fork (or any other repository) chosen by the user replaces the official download source.
  // Its own file patterns are optional: without them PyroCade guesses the right download and program.
  let source = platform.source, asset = platform.asset, exe = platform.exe;
  if (override.repo) {
    const forked = override.repo !== platform.source?.repo;
    source = { type: 'github', repo: override.repo, prerelease: !!override.prerelease };
    asset = override.assetPattern || (forked ? '' : platform.asset);
    exe = override.exePattern || (forked ? '' : platform.exe);
  }
  // For downloaded emulators `exe` is a filename regex used after installing; a program the user
  // linked with "Use existing .exe…" is kept separately as exePath so the two never mix.
  return { ...platform, ...override, exe, source, asset,
    exePath: override.exe || (catalog || base.source ? null : base.exe), custom: !catalog,
    officialRepo: catalog?.source?.repo || null, forked: !!(catalog && override.repo && override.repo !== catalog.source?.repo) };
}

// "owner/repo" or a github.com link -> "owner/repo".
function parseRepo(input) {
  const text = String(input || '').trim().replace(/\.git$/i, '').replace(/\/+$/, '');
  const m = text.match(/^(?:https?:\/\/(?:www\.)?github\.com\/)?([A-Za-z0-9](?:[A-Za-z0-9-]{0,38}))\/([A-Za-z0-9._-]{1,100})(?:\/.*)?$/);
  if (!m || m[2] === '.' || m[2] === '..') throw new Error('Enter a GitHub repository as owner/name, e.g. eden-emulator/Releases');
  return `${m[1]}/${m[2]}`;
}
function checkPattern(pattern, what) {
  if (!pattern) return '';
  const text = String(pattern).trim().slice(0, 200);
  try { new RegExp(text, 'i'); } catch { throw new Error(`The ${what} pattern is not a valid regular expression.`); }
  return text;
}
// Picks the download for this computer when the repository gives no pattern.
function guessAsset(assets) {
  const win = process.platform === 'win32';
  const score = a => {
    const n = a.name.toLowerCase();
    if (/source|src\b|symbols|pdb|debug|[-_.]dbg[-_.]|libretro|\.sha\d*|\.sig$|\.asc$|\.txt$|\.json$/.test(n)) return -1;
    if (/arm64|aarch64|armv7|x86(?!_64)|i686|32bit|win32(?!-x64)/.test(n)) return -1;
    let v = 0;
    if (win) {
      if (!/\.(zip|7z|exe)$/.test(n)) return -1;
      if (/(macos|mac|osx|darwin|linux|android|ios|appimage|flatpak)/.test(n)) return -1;
      if (/win|windows|msvc|mingw/.test(n)) v += 4;
      if (/x64|x86_64|amd64|win64/.test(n)) v += 2;
      if (/\.zip$|\.7z$/.test(n)) v += 2; // portable archives over installers
      if (/setup|install/.test(n)) v -= 3;
      if (/msvc|clang|mingw|llvm/.test(n)) v -= .5; // when a plain build sits next to compiler variants, take the plain one
    } else if (process.platform === 'darwin') {
      // Mac: archives that hold an .app (disk images can't be unpacked here).
      if (/(windows|win64|win32|\.exe$|linux|appimage|android|\.deb$|\.rpm$|\.dmg$)/.test(n)) return -1;
      if (!/\.(zip|tar\.(gz|xz|zst|bz2)|tgz)$/.test(n)) return -1;
      if (/mac|macos|osx|darwin|apple/.test(n)) v += 5; else return -1;
      if (/universal/.test(n)) v += 2;
      else if (process.arch === 'arm64' ? /arm64|aarch64|apple/.test(n) : /x64|x86_64|intel/.test(n)) v += 2;
    } else {
      if (/(windows|win64|\.exe$|macos|osx|darwin|android)/.test(n)) return -1;
      if (/\.appimage$/.test(n)) v += 6;
      else if (/linux/.test(n) && /\.(tar\.(gz|xz|zst)|zip|7z)$/.test(n)) v += 3;
      else return -1;
      if (/x86_64|amd64|x64/.test(n)) v += 2;
    }
    return v;
  };
  return assets.map(a => [score(a), a]).filter(([v]) => v >= 0).sort((x, y) => y[0] - x[0])[0]?.[1] || null;
}
// Picks the emulator program among unpacked files when the repository gives no pattern.
function guessProgram(dir, repo) {
  const files = [], stack = [dir];
  while (stack.length) {
    const d = stack.shift();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p); else files.push(p);
    }
  }
  const win = process.platform === 'win32';
  const hint = String(repo || '').split('/').pop().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (process.platform === 'darwin') {
    // Mac: the program is an .app bundle; pick the best-named one and start the binary inside.
    const apps = [], walk = [dir];
    while (walk.length) {
      const d = walk.shift();
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        const p = path.join(d, e.name);
        if (/\.app$/i.test(e.name)) apps.push(p); else walk.push(p);
      }
    }
    const best = apps.sort((a, b) => Number(path.basename(b).toLowerCase().replace(/[^a-z0-9]/g, '').includes(hint)) - Number(path.basename(a).toLowerCase().replace(/[^a-z0-9]/g, '').includes(hint)))[0];
    return best ? macAppBinary(best) : null;
  }
  const candidates = files.filter(f => {
    const n = path.basename(f).toLowerCase();
    if (/unins|uninstall|update|crash|redist|vc_?redist|setup|installer|helper|elevate|dxwebsetup/.test(n)) return false;
    return win ? n.endsWith('.exe') : (n.endsWith('.appimage') || !path.extname(n));
  });
  const rank = f => {
    const n = path.basename(f).toLowerCase().replace(/[^a-z0-9]/g, '');
    let v = fs.statSync(f).size / 1e9; // larger programs first, as a tiebreak
    if (hint && (n.includes(hint) || hint.includes(n.replace(/exe$|appimage$/, '')))) v += 10;
    if (/qt|gui/.test(n)) v += 1;
    if (/cli|cmd|test|bench/.test(n)) v -= 2;
    return v;
  };
  return candidates.sort((a, b) => rank(b) - rank(a))[0] || null;
}
function manifestPath(id) { return path.join(EMU_DIR, id, '.pyrocade.json'); }
function readManifest(id) { try { return JSON.parse(fs.readFileSync(manifestPath(id), 'utf8')); } catch { return null; } }

function resolveExe(id) {
  const def = emuDef(id);
  if (!def) return null;
  if (def.exePath && path.isAbsolute(def.exePath) && fs.existsSync(def.exePath)) return def.exePath;
  const man = readManifest(id);
  if (man?.exe) { const p = path.join(EMU_DIR, id, man.exe); if (fs.existsSync(p)) return p; }
  return null;
}

function emuStatus(id) {
  const def = emuDef(id);
  const man = readManifest(id);
  return {
    id, name: def.name, systems: def.systems || [], repo: def.source?.repo, custom: def.custom,
    prerelease: !!def.source?.prerelease || !!config.emulators[id]?.prerelease,
    args: def.args, exe: resolveExe(id), installed: man ? { version: man.tag, name: man.releaseName, date: man.publishedAt, repo: man.repo || null } : null,
    managed: !!def.source, officialRepo: def.officialRepo, forked: def.forked,
    assetPattern: config.emulators[id]?.assetPattern || (def.custom ? def.asset || '' : ''), exePattern: config.emulators[id]?.exePattern || (def.custom && def.source ? def.exe || '' : ''),
  };
}

async function ghJson(url) {
  const r = await fetch(url, { headers: UA });
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${r.statusText}${r.status === 403 ? ' (rate limited — try again later)' : ''}`);
  return r.json();
}

async function latestRelease(id) {
  const def = emuDef(id);
  if (!def?.source) throw new Error('This emulator is not managed by the downloader.');
  return findRelease(def.source.repo, { asset: def.asset, prerelease: def.source.prerelease || config.emulators[id]?.prerelease });
}
async function findRelease(repo, { asset: pattern, prerelease }) {
  const re = pattern ? new RegExp(pattern, 'i') : null;
  let list;
  if (prerelease) list = await ghJson(`https://api.github.com/repos/${repo}/releases?per_page=15`);
  else {
    // Forks often only publish pre-releases, which /releases/latest skips.
    try { list = [await ghJson(`https://api.github.com/repos/${repo}/releases/latest`)]; }
    catch (e) { if (!/GitHub 404/.test(e.message)) throw e; list = (await ghJson(`https://api.github.com/repos/${repo}/releases?per_page=15`)).filter(r => !r.draft); }
    if (!list.length) throw new Error(`${repo} has no releases to download.`);
  }
  for (const rel of list) {
    if (rel.draft) continue;
    const asset = re ? rel.assets.find(a => re.test(a.name)) : guessAsset(rel.assets);
    if (asset) return {
      tag: rel.tag_name, releaseName: rel.name || rel.tag_name, publishedAt: asset.updated_at || rel.published_at,
      assetId: asset.id, assetName: asset.name, size: asset.size, url: asset.browser_download_url, notes: rel.body || '',
    };
  }
  const platformName = process.platform === 'win32' ? 'Windows' : process.platform === 'darwin' ? 'macOS' : 'Linux';
  throw new Error(re ? `No ${platformName} download matching /${pattern}/ found in recent releases of ${repo}.` : `No ${platformName} download found in recent releases of ${repo}. Set a download pattern under Source.`);
}

async function checkUpdate(id) {
  const latest = await latestRelease(id);
  const man = readManifest(id);
  return { latest, updateAvailable: !man || man.assetId !== latest.assetId };
}

function findFile(dir, re) {
  const stack = [dir];
  while (stack.length) {
    const d = stack.shift();
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (re.test(e.name)) return p;
    }
  }
  return null;
}

// Linux programs (AppImages, binaries) usually have no .exe extension.
const PROGRAM_FILTERS = process.platform === 'win32' ? [{ name: 'Programs', extensions: ['exe'] }]
  : process.platform === 'darwin' ? [{ name: 'Applications', extensions: ['app'] }, { name: 'All files', extensions: ['*'] }]
  : [{ name: 'All files', extensions: ['*'] }];
const PROGRAM_START = process.platform === 'darwin' ? { defaultPath: '/Applications' } : {};
const ARCHIVE = /\.(zip|7z|tar|tgz|tar\.(gz|xz|zst|bz2))$/i;
function run(cmd, args) {
  return new Promise((res, rej) => {
    const p = spawn(cmd, args, { windowsHide: true });
    let err = '';
    p.stderr.on('data', d => (err += d));
    p.on('error', rej);
    p.on('close', c => (c === 0 ? res() : rej(new Error(`Extract failed: ${err.trim() || 'exit ' + c}`))));
  });
}
// Windows has bsdtar built in (handles zip and 7z). On Linux try the usual tools in turn:
// bsdtar (Arch/SteamOS), unzip / 7z, then GNU tar for tarballs.
async function extract(archive, dest) {
  if (process.platform === 'win32') return run(path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe'), ['-xf', archive, '-C', dest]);
  const tries = [['bsdtar', ['-xf', archive, '-C', dest]]];
  if (/\.zip$/i.test(archive)) tries.push(['unzip', ['-o', '-q', archive, '-d', dest]], ['7z', ['x', '-y', `-o${dest}`, archive]]);
  else if (/\.7z$/i.test(archive)) tries.push(['7z', ['x', '-y', `-o${dest}`, archive]], ['7za', ['x', '-y', `-o${dest}`, archive]]);
  else tries.push(['tar', ['-xf', archive, '-C', dest]]);
  for (const [cmd, args] of tries) {
    try { return await run(cmd, args); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  }
  throw new Error(`Can't unpack ${path.basename(archive)}: install bsdtar (libarchive) or ${/\.zip$/i.test(archive) ? 'unzip' : '7-Zip'}.`);
}

// Stream a fetch() response to a file, calling onChunk for progress.
async function downloadTo(response, file, onChunk = () => {}) {
  await pipeline(Readable.fromWeb(response.body), async function* (source) {
    for await (const chunk of source) { onChunk(chunk); yield chunk; }
  }, fs.createWriteStream(file));
}

const installing = new Set();
async function installEmu(id, send) {
  if (installing.has(id)) throw new Error('Already installing');
  installing.add(id);
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'pyrocade-'));
  try {
    const def = emuDef(id);
    send({ id, stage: 'Checking latest release…', pct: 0 });
    const rel = await latestRelease(id);
    const archive = path.join(tmp, rel.assetName);
    const r = await fetch(rel.url, { headers: { 'User-Agent': UA['User-Agent'] } });
    if (!r.ok) throw new Error(`Download failed: HTTP ${r.status}`);
    const total = Number(r.headers.get('content-length')) || rel.size || 0;
    let got = 0, last = 0;
    // pipeline() closes the file on any error, so a dropped connection can't leave it locked.
    await downloadTo(r, archive, chunk => {
      got += chunk.length;
      if (Date.now() - last > 120) { last = Date.now(); send({ id, stage: `Downloading ${rel.assetName}`, pct: total ? got / total : 0, got, total }); }
    });

    const stage = path.join(tmp, 'x');
    await fsp.mkdir(stage);
    if (ARCHIVE.test(rel.assetName)) {
      send({ id, stage: 'Extracting…', pct: 1 });
      await extract(archive, stage);
    } else {
      // A single program file (e.g. a Linux AppImage) is used as downloaded.
      await fsp.rename(archive, path.join(stage, rel.assetName));
    }
    // Flatten a single wrapping folder.
    let src = stage;
    const top = fs.readdirSync(stage, { withFileTypes: true });
    if (top.length === 1 && top[0].isDirectory()) src = path.join(stage, top[0].name);

    // Look for the program in the new files only, so an old version left in the folder is never picked.
    const found = def.exe ? findFile(src, new RegExp(def.exe, 'i')) : guessProgram(src, def.source.repo);
    if (!found) throw new Error(def.exe ? `Downloaded, but couldn't find the program (/${def.exe}/) in it.` : `Downloaded, but couldn't tell which file is the emulator. Set a program pattern under Source.`);
    const exeRel = path.relative(src, found);
    const dest = path.join(EMU_DIR, id);
    await fsp.mkdir(dest, { recursive: true });
    // Copy over the top so emulator settings / portable folders survive updates.
    await fsp.cp(src, dest, { recursive: true, force: true });
    const exe = path.join(dest, exeRel);
    if (process.platform !== 'win32') await fsp.chmod(exe, 0o755);
    // Versioned single-file programs (pcsx2-v2.8.2-….AppImage) would otherwise pile up.
    const old = readManifest(id)?.exe;
    if (old && old !== exeRel && !/[\\/]/.test(old) && /\.appimage$/i.test(old)) await fsp.rm(path.join(dest, old), { force: true });
    const man = { ...rel, exe: exeRel, repo: def.source.repo, installedAt: new Date().toISOString() };
    delete man.notes;
    fs.writeFileSync(manifestPath(id), JSON.stringify(man, null, 2));
    send({ id, stage: 'Done', pct: 1, done: true });
    return emuStatus(id);
  } finally {
    installing.delete(id);
    fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- Launching ----------
function splitArgs(s) {
  const out = []; let cur = '', q = false, any = false;
  for (const ch of s || '') {
    if (ch === '"') { q = !q; any = true; }
    else if (/\s/.test(ch) && !q) { if (any) out.push(cur); cur = ''; any = false; }
    else { cur += ch; any = true; }
  }
  if (any) out.push(cur);
  return out;
}

let win;
// On a Mac, emulators are .app bundles (folders). Start the program inside: Contents/MacOS/<CFBundleExecutable>.
function macAppBinary(p) {
  if (process.platform !== 'darwin' || !/\.app\/?$/i.test(p || '')) return p;
  try {
    const plist = fs.readFileSync(path.join(p, 'Contents', 'Info.plist'), 'utf8');
    const name = plist.match(/<key>CFBundleExecutable<\/key>\s*<string>([^<]+)<\/string>/)?.[1];
    if (name && fs.existsSync(path.join(p, 'Contents', 'MacOS', name))) return path.join(p, 'Contents', 'MacOS', name);
    const first = fs.readdirSync(path.join(p, 'Contents', 'MacOS'))[0];
    if (first) return path.join(p, 'Contents', 'MacOS', first);
  } catch {}
  return p;
}
// ---------- Running games: play time and "hold to quit" ----------
// Each started game is tracked until its process exits, so play time and "last played" are counted.
// Shortcuts opened through the system (.lnk, Steam .url) have no process to follow: they only count
// as played.
const running = new Map(); // game id -> { child, start }
const sendWindow = (channel, payload) => { if (win && !win.isDestroyed()) win.webContents.send(channel, payload); };
function recordPlay(gameId, ms = 0, started = !ms) {
  const st = (libraryState.stats[gameId] ||= { ms: 0, last: 0, plays: 0 });
  st.ms = (st.ms || 0) + Math.max(0, Math.round(ms)); st.last = Date.now(); st.plays = (st.plays || 0) + (started ? 1 : 0);
  saveState();
  const g = libraryGames.find(x => x.id === gameId);
  return { gameId, ...gameState(gameId), title: g?.title };
}
function track(game, child) {
  const start = Date.now();
  running.set(game.id, { child, start });
  sendWindow('game:started', recordPlay(game.id));
  child.once('exit', () => {
    if (running.get(game.id)?.child === child) running.delete(game.id);
    // The game window opened on top of PyroCade, so there was nothing to minimize; just come back to the front.
    sendWindow('game:ended', { ...recordPlay(game.id, Date.now() - start, false), running: running.size });
    if (win && !win.isDestroyed()) win.focus();
  });
}
// Ends the newest running game and everything it started (an emulator's helper processes).
function quitGame() {
  const last = [...running.values()].pop();
  if (!last) return false;
  const pid = last.child.pid;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    else process.kill(-pid, 'SIGTERM'); // detached: the game leads its own process group
  } catch { try { last.child.kill(); } catch {} }
  return true;
}

// PC games and other "run the file itself" systems: programs are started in their own folder;
// shortcuts (.lnk, .url) and anything else are opened the way Windows would open them.
async function launchDirect(game) {
  const file = game.romPath;
  if (!fs.existsSync(file)) throw new Error(`${path.basename(file)} is missing. Rescan in Settings.`);
  // Programs are started directly; batch files, shortcuts and anything else open the way the system would.
  const program = process.platform === 'win32' ? /\.exe$/i.test(file) : (/\.app$/i.test(file) || (fs.statSync(file).mode & 0o111) !== 0);
  if (!program) {
    const err = await shell.openPath(file);
    if (err) throw new Error(`Couldn't open ${path.basename(file)}: ${err}`);
    sendWindow('game:started', { ...recordPlay(game.id), untracked: true });
    return true;
  }
  const exe = macAppBinary(file);
  return new Promise((resolve, reject) => {
    const child = spawn(exe, [], { cwd: path.dirname(exe), detached: true, stdio: 'ignore' });
    child.once('error', e => reject(new Error(`Launch failed: ${e.message}`)));
    child.once('spawn', () => { track(game, child); child.unref(); resolve(true); });
  });
}
// The disc to start a multi-disc game with. Systems whose emulators read .m3u playlists get one
// (written to the data folder, chosen disc first), so the emulator can still swap discs in-game.
function discFile(game, sys, index) {
  if (!game.discPaths?.length) return game.romPath;
  const i = Math.max(0, Math.min(game.discPaths.length - 1, Number(index) || 0));
  if (!(sys.extensions || []).includes('.m3u')) return game.discPaths[i];
  const order = [...game.discPaths.slice(i), ...game.discPaths.slice(0, i)];
  const dir = path.join(DATA, 'playlists', sys.id);
  const file = path.join(dir, `${(looseKey(game.base) || 'game').slice(0, 80)}-disc${game.discs[i]}.m3u`);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file, order.join('\n') + '\n');
  return file;
}
function launchGame(gameId, options = {}) {
  // The ROM path always comes from the scanned library, never from the renderer.
  const game = libraryGames.find(g => g.id === gameId);
  if (!game) throw new Error('This game is no longer in your library. Rescan in Settings and try again.');
  const sys = config.systems.find(s => s.id === game.system);
  if (!sys) throw new Error('Unknown system');
  let disc = 0;
  if (game.discPaths?.length) {
    disc = Math.max(0, Math.min(game.discPaths.length - 1, Number(options.disc ?? libraryState.discs[game.id] ?? 0) || 0));
    if (disc) libraryState.discs[game.id] = disc; else delete libraryState.discs[game.id];
    saveState();
  }
  // A game can have its own emulator (a fork for one game, say); otherwise the system's is used.
  const own = config.gameEmulators?.[game.id] || '';
  if (own === '__direct' || (!own && sys.direct)) return launchDirect(game);
  const emuId = own || sys.emulator;
  if (!emuId) throw new Error(`No emulator is set for ${sys.name}. Choose one in Settings.`);
  if (!emuDef(emuId)) throw new Error(`The emulator chosen for ${game.title} is no longer set up. Choose another with the Emulator button.`);
  const exe = macAppBinary(resolveExe(emuId));
  if (!exe) throw new Error(`${emuDef(emuId)?.name || emuId} isn't installed yet. Install it from the Emulators tab.`);
  // The system's custom arguments belong to the system's emulator; another emulator uses its own.
  const tpl = (emuId === sys.emulator && sys.args) || emuDef(emuId).args || '{rom}';
  const rom = discFile(game, sys, disc);
  // split/join instead of replace(): "$&", "$$" etc. in a filename must stay literal.
  const args = splitArgs(tpl).map(a => a.split('{rom}').join(rom));
  return new Promise((resolve, reject) => {
    // detached: the game keeps running if PyroCade is closed or restarted while playing.
    const child = spawn(exe, args, { cwd: path.dirname(exe), detached: true, stdio: 'ignore' });
    child.once('error', e => reject(new Error(`Launch failed: ${e.message}`)));
    child.once('spawn', () => { track(game, child); resolve(true); });
  });
}

// ---------- Your own screenshots ----------
// Screenshots taken in the emulator, found in the folders emulators save them to. A file belongs to
// a game when its name, or its folder's name, contains the game's title.
async function findScreenshots(gameId) {
  const game = libraryGames.find(g => g.id === gameId);
  if (!game) return [];
  const keys = [looseKey(game.title), looseKey(game.base || '')].filter(k => k.length >= 4);
  if (!keys.length) return [];
  const where = name => { try { return app.getPath(name); } catch { return os.homedir(); } };
  const roots = [where('documents'), where('appData')];
  const sys = config.systems.find(s => s.id === game.system);
  const emuIds = [...new Set([config.gameEmulators?.[game.id], sys?.emulator].filter(id => id && id !== '__direct'))];
  const dirs = new Set();
  const add = (...parts) => dirs.add(path.join(...parts));
  for (const id of emuIds) {
    const exe = resolveExe(id), name = emuDef(id)?.name || id;
    if (exe) for (const sub of ['screenshots', 'snaps', 'ScreenShots', path.join('User', 'ScreenShots'), path.join('user', 'screenshots'), path.join('memstick', 'PSP', 'SCREENSHOT')]) add(path.dirname(exe), sub);
    for (const root of roots) for (const sub of ['screenshots', 'snaps', 'ScreenShots', path.join('PSP', 'SCREENSHOT')]) add(root, name, sub);
  }
  for (const [folder, sub] of [['Dolphin Emulator', 'ScreenShots'], ['PPSSPP', path.join('PSP', 'SCREENSHOT')], ['RetroArch', 'screenshots'], ['DuckStation', 'screenshots'], ['PCSX2', 'snaps']]) for (const root of roots) add(root, folder, sub);
  const found = [];
  async function walk(dir, depth, parentMatch) {
    for (const e of await listDir(dir)) {
      const p = path.join(dir, e.name), k = looseKey(path.basename(e.name, e.isDirectory() ? '' : path.extname(e.name)));
      const match = parentMatch || (!!k && keys.some(key => k.includes(key)));
      if (e.isDirectory()) { if (depth < 2) await walk(p, depth + 1, match); }
      else if (match && IMG.includes(path.extname(e.name).toLowerCase())) {
        try { found.push({ path: p, time: (await fsp.stat(p)).mtimeMs }); } catch {}
      }
      if (found.length > 200) return;
    }
  }
  // Windows folder names ignore case, so "screenshots" and "ScreenShots" are the same folder.
  const unique = [...new Map([...dirs].map(d => [process.platform === 'win32' ? path.resolve(d).toLowerCase() : path.resolve(d), d])).values()];
  for (const d of unique) if (await exists(d)) await walk(d, 0, false);
  return found.sort((a, b) => b.time - a.time).slice(0, 12).map(f => ({ url: fileUrl(f.path), time: f.time }));
}

// ---------- PyroCade self-update ----------
// New versions are published as GitHub releases on APP_REPO with tags like "v0.2.0".
const APP_REPO = 'Pyrodrifter/PyroCade';
const APP_VERSION = require('./package.json').version;
// A git checkout is a developer copy: never overwrite it, just point at the release.
const isDevCheckout = () => fs.existsSync(path.join(ROOT, '.git'));
const versionParts = v => String(v).replace(/^v/i, '').split(/[.+-]/).slice(0, 3).map(n => parseInt(n, 10) || 0);
function isNewer(latest, current) {
  const a = versionParts(latest), b = versionParts(current);
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i];
  return false;
}

async function checkAppUpdate() {
  const r = await fetch(`https://api.github.com/repos/${APP_REPO}/releases/latest`, { headers: UA });
  if (r.status === 404) return { current: APP_VERSION, available: false }; // no releases published yet
  if (!r.ok) throw new Error(`GitHub ${r.status}: ${r.statusText}${r.status === 403 ? ' (rate limited — try again later)' : ''}`);
  const rel = await r.json();
  // Installed builds update from a release file: the setup .exe on Windows, the AppImage on Linux.
  // deb / rpm / pacman installs belong to the system package manager, so those update by hand.
  const appImage = process.platform === 'linux' && process.env.APPIMAGE;
  const pattern = process.platform === 'win32' ? /^PyroCade-Setup-.*\.exe$/i : appImage ? /^PyroCade-.*\.AppImage$/i : null;
  const installer = pattern && (rel.assets || []).find(a => pattern.test(a.name));
  return {
    current: APP_VERSION, latest: rel.tag_name.replace(/^v/i, ''), available: isNewer(rel.tag_name, APP_VERSION),
    name: rel.name || rel.tag_name, notes: rel.body || '', url: rel.html_url, zip: rel.zipball_url,
    installer: installer ? { url: installer.browser_download_url, name: installer.name, size: installer.size } : null,
    canInstall: app.isPackaged ? !!installer && !process.env.PORTABLE_EXECUTABLE_DIR : !isDevCheckout(),
    // Shown instead of "Update now" when this copy can't update itself.
    manualHint: !app.isPackaged ? 'This is a git copy, so update it with "git pull".'
      : process.platform === 'linux' && !appImage ? 'Install the new .deb, .rpm or Arch package from the release page.'
      : process.platform === 'darwin' ? 'Download the new .dmg from the release page and drag PyroCade to Applications.'
      : 'Download it from the release page.',
  };
}

// Linux AppImage: download the new AppImage, swap it in place of the running one and restart it.
async function installAppImage(info, send) {
  const target = process.env.APPIMAGE;
  const next = `${target}.new`;
  const r = await fetch(info.installer.url, { headers: { 'User-Agent': UA['User-Agent'] } });
  if (!r.ok) throw new Error(`Download failed: HTTP ${r.status}`);
  const total = Number(r.headers.get('content-length')) || info.installer.size || 0;
  let got = 0, last = 0;
  try {
    await downloadTo(r, next, chunk => {
      got += chunk.length;
      if (Date.now() - last > 120) { last = Date.now(); send({ stage: `Downloading PyroCade ${info.latest}…`, pct: total ? got / total : 0, got, total }); }
    });
    await fsp.chmod(next, 0o755);
    await fsp.rename(next, target); // the running copy keeps its open file; the new one takes the name
  } catch (e) {
    await fsp.rm(next, { force: true });
    throw new Error(e.code === 'EACCES' ? `PyroCade can't write to ${path.dirname(target)}. Move the AppImage to a folder you own.` : e.message);
  }
  send({ stage: 'Restarting…', pct: 1, done: true });
  return { version: info.latest, mode: 'appimage' };
}

// Installed build: download the new setup .exe, run it silently and quit so it can replace us.
// The installer starts PyroCade again when it's done (--force-run).
async function installFromSetup(info, send) {
  const file = path.join(os.tmpdir(), info.installer.name);
  const r = await fetch(info.installer.url, { headers: { 'User-Agent': UA['User-Agent'] } });
  if (!r.ok) throw new Error(`Download failed: HTTP ${r.status}`);
  const total = Number(r.headers.get('content-length')) || info.installer.size || 0;
  let got = 0, last = 0;
  await downloadTo(r, file, chunk => {
    got += chunk.length;
    if (Date.now() - last > 120) { last = Date.now(); send({ stage: `Downloading PyroCade ${info.latest}…`, pct: total ? got / total : 0, got, total }); }
  });
  send({ stage: 'Installing… PyroCade will restart by itself.', pct: 1, done: true });
  await new Promise((resolve, reject) => {
    const child = spawn(file, ['/S', '--force-run'], { detached: true, stdio: 'ignore' });
    child.once('error', e => reject(new Error(`Couldn't start the installer: ${e.message}`)));
    child.once('spawn', () => { child.unref(); resolve(); });
  });
  return { version: info.latest, mode: 'installer' };
}

let appUpdating = false;
async function installAppUpdate(send) {
  if (!app.isPackaged && isDevCheckout()) throw new Error('This copy of PyroCade is a git checkout. Update it with "git pull" instead.');
  if (appUpdating) throw new Error('An update is already being installed.');
  appUpdating = true;
  const tmp = await fsp.mkdtemp(path.join(os.tmpdir(), 'pyrocade-update-'));
  try {
    const info = await checkAppUpdate();
    if (!info.available) throw new Error('PyroCade is already up to date.');
    if (app.isPackaged) {
      if (!info.canInstall) throw new Error('This release has no installer. Download it from the release page.');
      return process.platform === 'win32' ? await installFromSetup(info, send) : await installAppImage(info, send);
    }
    // Source copy (npm start): replace the program files from the release's source zip.
    send({ stage: `Downloading PyroCade ${info.latest}…`, pct: 0 });
    const r = await fetch(info.zip, { headers: { 'User-Agent': UA['User-Agent'] } });
    if (!r.ok) throw new Error(`Download failed: HTTP ${r.status}`);
    const archive = path.join(tmp, 'pyrocade.zip');
    let got = 0, last = 0;
    const total = Number(r.headers.get('content-length')) || 0;
    await downloadTo(r, archive, chunk => {
      got += chunk.length;
      if (Date.now() - last > 120) { last = Date.now(); send({ stage: `Downloading PyroCade ${info.latest}…`, pct: total ? got / total : 0, got, total }); }
    });
    send({ stage: 'Installing…', pct: 1 });
    const stage = path.join(tmp, 'x');
    await fsp.mkdir(stage);
    await extract(archive, stage);
    const top = fs.readdirSync(stage, { withFileTypes: true });
    const src = top.length === 1 && top[0].isDirectory() ? path.join(stage, top[0].name) : stage;
    if (!fs.existsSync(path.join(src, 'package.json')) || !fs.existsSync(path.join(src, 'main.js'))) throw new Error('The downloaded release does not look like PyroCade.');
    const depsOf = p => JSON.stringify({ ...(p.dependencies || {}), ...(p.devDependencies || {}) });
    const oldDeps = depsOf(require('./package.json'));
    const newDeps = depsOf(JSON.parse(fs.readFileSync(path.join(src, 'package.json'), 'utf8')));
    // Copy the new program files over the old ones. Your data (config, emulators, artwork) is untouched.
    const keep = new Set(['data', 'node_modules', '.git']);
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
      if (keep.has(e.name.toLowerCase())) continue;
      await fsp.cp(path.join(src, e.name), path.join(ROOT, e.name), { recursive: true, force: true });
    }
    send({ stage: 'Restarting…', pct: 1, done: true });
    return { version: info.latest, mode: 'source', needsNpmInstall: oldDeps !== newDeps };
  } finally {
    appUpdating = false;
    fsp.rm(tmp, { recursive: true, force: true }).catch(() => {});
  }
}

// ---------- Window & IPC ----------
// Fullscreen is remembered, so PyroCade opens the way it was left. --fullscreen and --windowed set
// it from a shortcut or from Steam's launch options; like F11, the choice is then remembered.
const flag = name => process.argv.slice(1).includes('--' + name);
const startFullscreen = flag('fullscreen') || (!!config.fullscreen && !flag('windowed'));
function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1100, minHeight: 650,
    show: !previewMode,
    fullscreen: startFullscreen && !previewMode,
    backgroundColor: '#07080c', autoHideMenuBar: true, title: 'PyroCade',
    icon:path.join(ROOT,'renderer/assets/brand/pyrocade-icon-256.png'),
    // plugins: Chromium's built-in PDF viewer, used to read manuals inside PyroCade.
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, sandbox: false, plugins: true, autoplayPolicy:'no-user-gesture-required',offscreen: previewMode, backgroundThrottling: !previewMode },
  });
  // A --fullscreen / --windowed launch is the same choice as pressing F11, so record it either way.
  if (!previewMode && config.fullscreen !== startFullscreen) { config.fullscreen = startFullscreen; saveConfig(config); }
  win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  win.webContents.once('did-finish-load', () => log('window loaded', { visible: win.isVisible(), bounds: win.getBounds() }));
  win.webContents.on('did-fail-load', (_e, code, desc) => log('window failed to load', code, desc));
  if (configWarning) win.webContents.once('did-finish-load', () => win.webContents.send('toast', configWarning));
  // F11 is taken by the window manager on macOS and on some Linux desktops, so Ctrl/Cmd+Shift+F
  // does the same thing and Settings has a switch for people whose keyboard has neither.
  win.webContents.on('before-input-event', (_, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '');
    if (key === 'F11' || (key.toLowerCase() === 'f' && input.shift && (input.control || input.meta))) setFullScreen(!win.isFullScreen());
  });
  // Remember the choice however it was made: the shortcut, the setting, or the title bar.
  for (const [event, on] of [['enter-full-screen', true], ['leave-full-screen', false]])
    win.on(event, () => {
      if (config.fullscreen !== on) { config.fullscreen = on; saveConfig(config); }
      if (!win.isDestroyed()) win.webContents.send('fullscreen', on);
    });
}
function setFullScreen(on) {
  if (!win || win.isDestroyed()) return false;
  win.setFullScreen(!!on);
  // Linux window managers answer asynchronously, so report what was asked for.
  return !!on;
}

const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => {
  try { return { ok: true, value: await fn(...a) }; } catch (err) { return { ok: false, error: err.message }; }
});

handle('config:get', () => ({ ...config, screenscraper: undefined }));
// Emulator links and custom emulators are owned by the main process (emu:* handlers), so a
// renderer holding an older copy of the config can never overwrite them.
handle('config:set', cfg => {
  if (!cfg || !Array.isArray(cfg.systems)) throw new Error('Invalid settings');
  // fullscreen is owned by the window (app:setFullscreen), so a stale copy here can never undo it.
  config = { ...cfg, emulators: config.emulators, customEmulators: config.customEmulators, screenscraper: config.screenscraper, extraGames: config.extraGames, shellColors: config.shellColors, gameEmulators: config.gameEmulators, fullscreen: config.fullscreen };
  saveConfig(config);
  return config;
});
// Game details (description, year, developer, publisher, genre, players) from the LaunchBox database.
// Only empty fields are filled, so gamelist.xml and info.json always win. Needs no network.
async function fillGameDetails(games) {
  if (!launchbox.available()) return [];
  const changed = [];
  for (const game of games) {
    if (game.demo || (game.info?.description && game.info?.year)) continue;
    let details = null;
    try { details = await launchbox.details(game.system, artwork.titleKeys(game)); } catch { return changed; }
    if (!details) continue;
    const added = {};
    for (const [k, v] of Object.entries(details)) if (!game.info?.[k]) added[k] = v;
    if (!Object.keys(added).length) continue;
    game.info = { ...(game.info || {}), ...added };
    changed.push({ gameId: game.id, info: game.info });
  }
  return changed;
}

// After the first scan, shrink oversized images saved by 0.3.0 in the background and hand the
// new files to the window as they are ready.
let compacted = false;
handle('library:scan', async () => {
  const games = await scanLibrary();
  // Details are filled in after the library is shown, so a scan never waits on them.
  setImmediate(() => fillGameDetails(games).then(changed => {
    if (changed.length && win && !win.isDestroyed()) win.webContents.send('library:info', changed);
  }).catch(() => {}));
  if (!compacted) {
    compacted = true;
    const marker = path.join(DATA, 'media', '_index', 'compacted-v1');
    if (!fs.existsSync(marker)) artwork.compact((system, type, base, url) => {
      const game = libraryGames.find(g => g.system === system && g.base === base);
      if (!game) return;
      game.media[type] = url;
      if (win && !win.isDestroyed()) win.webContents.send('art:media', { gameId: game.id, media: { [type]: url }, replace: true });
    }).then(() => { fs.mkdirSync(path.dirname(marker), { recursive: true }); fs.writeFileSync(marker, new Date().toISOString()); }).catch(() => {});
  }
  return games;
});
handle('app:version', () => APP_VERSION);
handle('app:checkUpdate', checkAppUpdate);
handle('app:installUpdate', async () => {
  const result = await installAppUpdate(p => { if (win && !win.isDestroyed()) win.webContents.send('app:updateProgress', p); });
  // Installer mode: just quit; the setup replaces the files and starts PyroCade again.
  if (result.mode === 'installer') setTimeout(() => app.quit(), 800);
  else if (result.mode === 'appimage') setTimeout(() => { app.relaunch({ execPath: process.env.APPIMAGE }); app.exit(0); }, 800);
  else if (!result.needsNpmInstall) setTimeout(() => { app.relaunch(); app.exit(0); }, 800);
  return result;
});
handle('app:openRelease', url => {
  if (!/^https:\/\/github\.com\//.test(String(url))) throw new Error('Not a GitHub link');
  return shell.openExternal(url);
});
handle('game:launch', (id, options) => launchGame(id, options || {}));
handle('game:quit', () => quitGame());
handle('game:running', () => [...running.keys()]);
handle('game:screenshots', id => findScreenshots(id));
handle('game:setFavorite', ({ gameId, favorite }) => {
  if (!libraryGames.some(g => g.id === gameId)) throw new Error('Select a game in your library first.');
  if (favorite) libraryState.favorites[gameId] = true; else delete libraryState.favorites[gameId];
  saveState();
  return gameState(gameId);
});
// Hiding a game only writes to library-state.json: the ROM folder is never touched, and the game
// comes back through "Show → Hidden games" in the library.
handle('game:setHidden', ({ gameId, hidden }) => {
  if (!libraryGames.some(g => g.id === gameId)) throw new Error('Select a game in your library first.');
  libraryState.hidden ||= {};
  if (hidden) libraryState.hidden[gameId] = true; else delete libraryState.hidden[gameId];
  saveState();
  return gameState(gameId);
});
// Rename a game. Like hiding, this lives in library-state.json; the file on disk keeps its name.
// An empty title clears the override and the scanned file name comes back.
handle('game:setTitle', ({ gameId, title }) => {
  const game = libraryGames.find(g => g.id === gameId);
  if (!game) throw new Error('Select a game in your library first.');
  const wanted = String(title ?? '').replace(/\s+/g, ' ').trim().slice(0, 120);
  libraryState.titles ||= {};
  if (wanted) libraryState.titles[gameId] = wanted; else delete libraryState.titles[gameId];
  game.title = wanted || game.scannedTitle || displayTitle(game.base);
  saveState();
  return { title: game.title, ...gameState(gameId) };
});
handle('app:fullscreen', () => !!(win && !win.isDestroyed() && win.isFullScreen()));
handle('app:setFullscreen', on => setFullScreen(on));
// What the library looked like when PyroCade was closed: system, selected game per system, sort and filter.
handle('library:ui', () => libraryState.ui || {});
handle('library:saveUi', patch => {
  if (!patch || typeof patch !== 'object') return false;
  const ui = { ...(libraryState.ui || {}) };
  for (const k of ['system', 'game', 'perSystem', 'sort', 'filter']) if (k in patch) ui[k] = patch[k];
  if (ui.perSystem && typeof ui.perSystem === 'object') ui.perSystem = Object.fromEntries(Object.entries(ui.perSystem).slice(-100).filter(([k, v]) => typeof k === 'string' && typeof v === 'string'));
  libraryState.ui = ui; saveState();
  return true;
});
// Add one game file (a PC game's .exe or shortcut, or any ROM) to a system, without a ROM folder.
handle('game:add', async ({ system, title }) => {
  const sys = config.systems.find(s => s.id === system);
  if (!sys) throw new Error('Choose a system first.');
  const exts = (sys.extensions || []).map(e => e.replace(/^\./, '')).filter(Boolean);
  const r = await dialog.showOpenDialog(win, { title: `Add a game to ${sys.name}`, properties: ['openFile'],
    filters: [...(exts.length ? [{ name: `${sys.name} games`, extensions: exts }] : []), { name: 'All files', extensions: ['*'] }],
    ...(sys.direct && process.platform === 'darwin' ? { defaultPath: '/Applications' } : {}) });
  if (r.canceled) return null;
  const file = r.filePaths[0];
  if (config.extraGames.some(x => x.system === sys.id && path.resolve(x.path) === path.resolve(file))) throw new Error('That game is already in your library.');
  // A program inside its own folder ("Hollow Knight\hollow_knight.exe") is named after the folder.
  const guess = /\.(exe|app)$/i.test(file) && path.basename(path.dirname(file)).length > 2 ? path.basename(path.dirname(file)) : displayTitle(path.basename(file, path.extname(file)));
  const entry = { id: randomUUID().slice(0, 8), system: sys.id, path: file, title: String(title || '').trim().slice(0, 120) || guess };
  config.extraGames.push(entry);
  saveConfig(config);
  return entry;
});
handle('game:remove', id => {
  config.extraGames = config.extraGames.filter(x => x.id !== id);
  saveConfig(config);
  return true;
});
// A cartridge colour chosen by hand for one game ("#rrggbb"), or null to go back to automatic.
handle('game:setShell', ({ gameId, color }) => {
  const game = libraryGames.find(g => g.id === gameId);
  if (!game) throw new Error('Select a game in your library first.');
  if (color != null && !/^#[0-9a-f]{6}$/i.test(color)) throw new Error('Choose a colour.');
  config.shellColors = { ...(config.shellColors || {}) };
  if (color) config.shellColors[gameId] = color; else delete config.shellColors[gameId];
  saveConfig(config);
  game.shellCustom = color || undefined;
  return { gameId, media: {}, shellCustom: color || null };
});
// An emulator chosen for one game (an emulator id, or "__direct" to run the file itself),
// or null to use the system's emulator again.
handle('game:setEmulator', ({ gameId, emulator }) => {
  const game = libraryGames.find(g => g.id === gameId);
  if (!game) throw new Error('Select a game in your library first.');
  if (emulator && emulator !== '__direct' && !emuDef(emulator)) throw new Error('That emulator is no longer set up.');
  config.gameEmulators = { ...(config.gameEmulators || {}) };
  if (emulator) config.gameEmulators[gameId] = emulator; else delete config.gameEmulators[gameId];
  saveConfig(config);
  game.emulator = emulator || undefined;
  return { gameId, emulator: emulator || null };
});
handle('game:list', () => config.extraGames.map(x => ({ ...x, missing: !fs.existsSync(x.path) })));
handle('art:fetch', (sysId, base, options) => artwork.fetchArt(sysId, base, options));
handle('art:start', options => artwork.start(options));
handle('art:status', () => artwork.status());
handle('art:cancel', () => artwork.cancel());
// "Choose another" picker: previews are made here, so the window never loads remote images.
// The full images stay in the main process until one is chosen.
let pickerChoices = new Map();
handle('art:candidates', async ({ gameId, kind }) => {
  const game = libraryGames.find(g => g.id === gameId);
  if (!game) throw new Error('Select a game in your library first.');
  if (!['front', 'back', 'spine', 'disc', 'screenshot', 'title', 'logo', 'fanart'].includes(kind)) throw new Error('Choose an artwork type.');
  const found = await artwork.candidates(game, kind);
  pickerChoices = new Map();
  return found.map(bytes => {
    const token = randomUUID(), image = nativeImage.createFromBuffer(bytes), size = image.getSize();
    pickerChoices.set(token, { gameId, kind, bytes });
    const preview = size.height > size.width ? image.resize({ height: 260, quality: 'good' }) : image.resize({ width: 260, quality: 'good' });
    return { token, preview: preview.toDataURL(), width: size.width, height: size.height };
  });
});
handle('art:choose', async ({ token }) => {
  const choice = pickerChoices.get(token);
  if (!choice) throw new Error('That choice has expired. Look up the versions again.');
  const game = libraryGames.find(g => g.id === choice.gameId);
  if (!game) throw new Error('This game is no longer in your library.');
  pickerChoices = new Map();
  return artwork.choose(game, choice.kind, choice.bytes);
});
// Artwork sources: which ones are ready, and the ScreenScraper login (passwords never go back to the window).
function artSources() {
  const c = screenScraperCredentials();
  let built = 0;
  try { built = fs.statSync(path.join(DATA, 'media', '_index', 'launchbox-index.json')).mtimeMs; } catch {}
  return { launchbox: { built }, screenscraper: { user: c.user, devId: c.devId, hasPassword: !!c.password, hasDevPassword: !!c.devPassword, ready: screenscraper.configured() } };
}
handle('art:sources', () => artSources());
handle('art:setScreenScraper', input => {
  if (!input || typeof input !== 'object') throw new Error('Invalid ScreenScraper details');
  const text = (v, max = 200) => typeof v === 'string' ? v.trim().slice(0, max) : undefined;
  const old = config.screenscraper || {};
  const next = { user: text(input.user) ?? old.user ?? '', devId: text(input.devId) ?? old.devId ?? '', password: old.password || '', devPassword: old.devPassword || '' };
  // An empty password field keeps the saved one; "clear" removes everything.
  if (input.clear) Object.assign(next, { user: '', devId: '', password: '', devPassword: '' });
  else {
    if (text(input.password)) next.password = sealed(text(input.password));
    if (text(input.devPassword)) next.devPassword = sealed(text(input.devPassword));
  }
  config = { ...config, screenscraper: next };
  saveConfig(config);
  scraperCredentials = null;
  screenscraper.reset();
  return artSources();
});
handle('art:openFolder', () => { fs.mkdirSync(path.join(DATA,'media'),{recursive:true});return shell.openPath(path.join(DATA,'media')); });
handle('art:import', async ({gameId,kind}) => {
  const game=libraryGames.find(g=>g.id===gameId);
  if(!game)throw new Error('Select a game in your library first.');
  if(!['front','back','spine','disc','screenshot','title','logo','fanart','manual'].includes(kind))throw new Error('Choose an artwork type.');
  if(/[<>:"/\\|?*\x00-\x1f]/.test(game.base)||game.base==='.'||game.base==='..')throw new Error('Invalid game filename');
  if(kind==='manual'){
    const picked=await dialog.showOpenDialog(win,{title:`Choose the manual for ${game.title}`,filters:[{name:'PDF manuals',extensions:['pdf']}],properties:['openFile']});
    if(picked.canceled)return null;
    const file=await keepManual(game,picked.filePaths[0]);
    return {gameId:game.id,media:{manual:file},replace:true};
  }
  const picked=await dialog.showOpenDialog(win,{title:`Choose ${kind==='front'?'cover':kind==='disc'?'disc or cartridge label':kind} for ${game.title}`,filters:[{name:'Images',extensions:['png','jpg','jpeg','webp']}],properties:['openFile']});
  if(picked.canceled)return null;
  const source=picked.filePaths[0];
  if((await fsp.stat(source)).size>20*1024*1024)throw new Error('Choose an image smaller than 20 MB.');
  const png=await artworkPng(await fsp.readFile(source));
  const sys=config.systems.find(s=>s.id===game.system);
  const root=config.mediaRoot?path.join(config.mediaRoot,sys.id):path.join(DATA,'media',sys.id);
  const folder=path.join(root,game.base);await fsp.mkdir(folder,{recursive:true});
  const dest=path.join(folder,`${kind}.png`);await fsp.writeFile(dest,png);
  const url=fileUrl(dest)+'?v='+Date.now();game.media[kind]=url;
  return {gameId:game.id,media:{[kind]:url},replace:true};
});
// Manuals are PDFs kept as media/<system>/manuals/<game>.pdf. A hard link is used when the PDF is on
// the same drive (no extra space); otherwise it is copied.
async function keepManual(game, source) {
  const head = Buffer.alloc(5); const fd = await fsp.open(source, 'r');
  try { await fd.read(head, 0, 5, 0); } finally { await fd.close(); }
  if (head.toString('latin1') !== '%PDF-') throw new Error(`${path.basename(source)} is not a PDF file.`);
  if (/[<>:"/\\|?*\x00-\x1f]/.test(game.base) || game.base === '.' || game.base === '..') throw new Error('Invalid game filename');
  const dir = path.join(config.mediaRoot ? path.join(config.mediaRoot, game.system) : path.join(DATA, 'media', game.system), 'manuals');
  await fsp.mkdir(dir, { recursive: true });
  const dest = path.join(dir, game.base + '.pdf');
  if (path.resolve(dest) === path.resolve(source)) return dest;
  await fsp.rm(dest, { force: true });
  try { await fsp.link(source, dest); } catch { await fsp.copyFile(source, dest); }
  game.media.manual = dest;
  return dest;
}
// Looks through a folder (and its subfolders) for PDF manuals and gives each game without a manual the
// best match by title. When the same title exists on several systems, a folder named after the system wins.
handle('art:findManuals', async () => {
  const picked = await dialog.showOpenDialog(win, { title: 'Choose a folder with game manuals (PDF)', properties: ['openDirectory'] });
  if (picked.canceled) return null;
  const pdfs = [];
  async function walk(dir, depth) {
    for (const e of await listDir(dir)) {
      const p = path.join(dir, e.name);
      if (e.isDirectory() && depth < 6) await walk(p, depth + 1);
      else if (e.isFile() && /\.pdf$/i.test(e.name)) pdfs.push(p);
      if (pdfs.length > 20000) return;
    }
  }
  await walk(picked.filePaths[0], 0);
  const byKey = new Map();
  for (const p of pdfs) { const name = path.basename(p, path.extname(p)); for (const key of [looseKey(name), bareKey(name)]) if (key) (byKey.get(key) || byKey.set(key, []).get(key)).push(p); }
  const words = id => { const s = config.systems.find(x => x.id === id); return [s?.name, s?.id, s?.libretro].filter(Boolean).map(w => w.toLowerCase()); };
  const matched = [];
  for (const game of libraryGames) {
    if (game.demo || game.media.manual) continue;
    const names = [game.base, game.title || ''].filter(Boolean);
    const options = [...new Set([...names.map(looseKey), ...names.map(bareKey)].filter(Boolean))].flatMap(k => byKey.get(k) || []);
    if (!options.length) continue;
    const best = options.find(p => words(game.system).some(w => p.toLowerCase().includes(w))) || options[0];
    try { matched.push({ gameId: game.id, media: { manual: await keepManual(game, best) }, replace: true }); } catch {}
  }
  return { folder: picked.filePaths[0], found: pdfs.length, matched };
});
handle('emu:list', () => [...CATALOG, ...config.customEmulators].map(e => emuStatus(e.id)));
handle('emu:check', id => checkUpdate(id));
handle('emu:install', id => installEmu(id, p => win.webContents.send('emu:progress', p)));
handle('emu:uninstall', async id => { await fsp.rm(path.join(EMU_DIR, id), { recursive: true, force: true }); return emuStatus(id); });
handle('emu:openFolder', id => { const exe = resolveExe(id); shell.openPath(exe ? path.dirname(exe) : EMU_DIR); });
handle('emu:pickExe', async id => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose emulator program', filters: PROGRAM_FILTERS, properties: ['openFile'], ...PROGRAM_START });
  if (r.canceled) return null;
  config.emulators[id] = { ...(config.emulators[id] || {}), exe: r.filePaths[0] };
  saveConfig(config);
  return emuStatus(id);
});
handle('emu:addCustom', async ({ name, systems, args }) => {
  const r = await dialog.showOpenDialog(win, { title: `Choose ${name} program`, filters: PROGRAM_FILTERS, properties: ['openFile'], ...PROGRAM_START });
  if (r.canceled) return null;
  const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  config.customEmulators = config.customEmulators.filter(e => e.id !== id);
  config.customEmulators.push({ id, name, exe: r.filePaths[0], args: args || '{rom}', systems: systems || [] });
  saveConfig(config);
  return emuStatus(id);
});
// Download source for an emulator: a fork of a catalog emulator, or the repository of a custom one.
handle('emu:setSource', ({ id, repo, prerelease, assetPattern, exePattern }) => {
  const def = emuDef(id);
  if (!def) throw new Error('Unknown emulator');
  const custom = config.customEmulators.find(e => e.id === id);
  const next = { ...(config.emulators[id] || {}) };
  if (!repo && def.officialRepo) { delete next.repo; delete next.assetPattern; delete next.exePattern; delete next.prerelease; } // back to official
  else {
    next.repo = parseRepo(repo || custom?.source?.repo);
    next.prerelease = !!prerelease;
    next.assetPattern = checkPattern(assetPattern, 'download');
    next.exePattern = checkPattern(exePattern, 'program');
    if (!next.assetPattern) delete next.assetPattern;
    if (!next.exePattern) delete next.exePattern;
  }
  config.emulators[id] = next;
  saveConfig(config);
  return emuStatus(id);
});
// Looks a repository up without saving anything, so the form can show what would be installed.
handle('emu:testSource', async ({ repo, prerelease, assetPattern }) => {
  const rel = await findRelease(parseRepo(repo), { asset: checkPattern(assetPattern, 'download'), prerelease: !!prerelease });
  return { releaseName: rel.releaseName, assetName: rel.assetName, size: rel.size };
});
handle('emu:addRepo', ({ name, repo, systems, args, prerelease, assetPattern, exePattern }) => {
  const label = String(name || '').trim().slice(0, 60);
  if (!label) throw new Error('Give the emulator a name');
  const id = 'custom-' + label.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const entry = { id, name: label, args: args || '{rom}', systems: (systems || []).map(String).slice(0, 40),
    source: { type: 'github', repo: parseRepo(repo), prerelease: !!prerelease },
    asset: checkPattern(assetPattern, 'download'), exe: checkPattern(exePattern, 'program') };
  config.customEmulators = config.customEmulators.filter(e => e.id !== id);
  config.customEmulators.push(entry);
  delete config.emulators[id];
  saveConfig(config);
  return emuStatus(id);
});
handle('emu:remove', id => {
  if (!config.customEmulators.some(e => e.id === id)) throw new Error('Only emulators you added can be removed');
  config.customEmulators = config.customEmulators.filter(e => e.id !== id);
  delete config.emulators[id];
  saveConfig(config);
  return true;
});
handle('dialog:folder', async title => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
// Manuals open in PyroCade's own viewer; this gives it the file address of a library manual.
const knownManual = p => typeof p === 'string' && /\.pdf$/i.test(p) && libraryGames.some(g => g.media.manual === p) && fs.existsSync(p);
handle('manual:url', p => { if (!knownManual(p)) throw new Error('Manual not found.'); return pathToFileURL(p).href; });
// "Open in your PDF reader" from the viewer.
handle('manual:open', async p => { if (!knownManual(p)) throw new Error('Manual not found.'); const err = await shell.openPath(p); if (err) throw new Error(err); });

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => { if (stateTimer) writeState(); });
app.on('browser-window-created', (_e, created) => { if (created !== webpWindow) created.on('closed', () => { if (BrowserWindow.getAllWindows().every(w => w === webpWindow)) closeWebpWindow(); }); });

// Dev helper: PYROCADE_SNAP=<file.png> captures the window after load and quits.
if (process.env.PYROCADE_SNAP) app.whenReady().then(async () => {
  try {
    // Wait for the actual library rather than capturing a partly loaded shelf.
    const deadline = Date.now()+60000;
    while (Date.now()<deadline) {
      if (await win.webContents.executeJavaScript('!!document.querySelector("#loading.hidden")').catch(()=>false)) break;
      await new Promise(r=>setTimeout(r,250));
    }
    win.setContentSize(1584,861);
    if (process.env.PYROCADE_JS) fs.writeFileSync(process.env.PYROCADE_SNAP+'.txt',String(await win.webContents.executeJavaScript(process.env.PYROCADE_JS)));
    await new Promise(r=>setTimeout(r,2200));
    win.webContents.invalidate();
    await new Promise(r=>setTimeout(r,100));
    const shot=await win.webContents.capturePage();
    if (shot.isEmpty()) throw new Error('Empty preview capture');
    fs.writeFileSync(process.env.PYROCADE_SNAP,shot.toPNG());
    app.quit();
  } catch(e) { console.error(e);app.exit(1); }
});
