// PyroCade — main process: config, library scanning, launching, emulator downloads.
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require('electron');
app.setName('PyroCade');
if(process.platform==='win32')app.setAppUserModelId('com.pyrodrifter.pyrocade');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const os = require('os');
const { spawn } = require('child_process');
const { pathToFileURL } = require('url');
const {createArtworkService} = require('./artwork');

const ROOT = __dirname;
const DATA = path.join(process.env.PORTABLE_EXECUTABLE_DIR || ROOT, 'data');
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
  { id: 'switch2', name: 'Nintendo Switch 2', caseType: 'switch', media: 'cart', color: '#d0021b', extensions: ['.nsp', '.xci', '.nsz', '.xcz'], emulator: '' },
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
  { id: 'a2600', name: 'Atari 2600', caseType: 'nesbox', media: 'cart', color: '#a0522d', extensions: ['.a26', '.zip'], emulator: '', libretro: 'Atari - 2600' },
  { id: 'arcade', name: 'Arcade', caseType: 'bigbox', media: 'cart', color: '#d4a017', extensions: ['.zip'], emulator: '', libretro: 'MAME' },
];
// Folders inside ROM folders that hold extras rather than games.
const SKIP_DIRS = /^(source archives|_extras|extras|texture packs|saves?|states|bios|cheats|patches|media|images|manuals|downloaded_media|covers|screenshots)$/i;

function defaultConfig() {
  return {
    mediaRoot: '',
    hideWhilePlaying: true,
    promptFamily: 'auto',
    motion: 'auto',
    eShopStyle: 'enhanced',
    libraryTheme:'ember',libraryLayout:'carousel',uiSound:{enabled:true,volume:.25},
    systems: DEFAULT_SYSTEMS.map(s => ({ ...s, romDir: '' })),
    emulators: {},        // per catalog id: { exe, args, prerelease } overrides
    customEmulators: [],  // { id, name, exe, args, systems: [] }
  };
}

function loadConfig() {
  try {
    const saved = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
    const def = defaultConfig();
    // Keep new default systems appearing for older configs.
    const ids = new Set(saved.systems.map(s => s.id));
    for (const s of def.systems) if (!ids.has(s.id)) saved.systems.push(s);
    // Fill in fields added in newer versions (libretro name, case shape…).
    saved.systems = saved.systems.map(s => ({ ...(def.systems.find(d => d.id === s.id) || {}), ...s }));
    return { ...def, ...saved };
  } catch { return defaultConfig(); }
}
function saveConfig(cfg) {
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(cfg, null, 2));
}
let config = loadConfig();

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
async function indexMediaRoot(root) {
  const idx = { gameDirs: new Map(), kinds: {} };
  for (const e of await listDir(root)) {
    if (!e.isDirectory()) continue;
    const lower = e.name.toLowerCase();
    const kind = Object.entries(KINDS).find(([, k]) => k.folders.includes(lower));
    if (kind) {
      const m = (idx.kinds[kind[0]] ||= new Map());
      for (const f of await listDir(path.join(root, e.name)))
        if (f.isFile() && kind[1].exts.includes(path.extname(f.name).toLowerCase())) m.set(stem(f.name), path.join(root, e.name, f.name));
    } else {
      idx.gameDirs.set(lower, path.join(root, e.name));
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
async function walkRoms(dir, exts, depth = 0, out = []) {
  // Decrypted Switch / Switch 2 dumps are folders: <game>\base\exefs\main (+ romfs), or <game>\exefs\main.
  // The whole folder counts as one game, launched through its exefs\main.
  if (depth > 0 && exts.includes('.nsp')) {
    const main = [path.join(dir, 'base', 'exefs', 'main'), path.join(dir, 'exefs', 'main')].find(p => fs.existsSync(p));
    if (main) {
      const label = path.basename(dir).replace(/([a-z])([A-Z])/g, '$1 $2'); // DonkeyKongBananza -> Donkey Kong Bananza
      out.push({ name: label + '.dump', path: main, size: 9e9, dump: true });
      return out;
    }
  }
  for (const e of await listDir(dir)) {
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

// When the same game appears more than once, keep the best copy.
function copyScore(f) {
  const n = f.name;
  let s = 0;
  if (/\((u|usa|us|e|eu|europe|world|en)\b|\(usa?,|\[usa?\]|\(ue\)/i.test(n)) s += 4;
  if (/\((j|jp|japan)\)/i.test(n)) s -= 2;
  if (/\[!\]/.test(n)) s += 2;
  if (/\b(update|upd|dlc)\b|\[v[1-9]\d*\]|\(beta|\(proto|\(demo|\(hack|\[(b|h|t|o)\d*\]/i.test(n)) s -= 6;
  if (!/\.zip$/i.test(n)) s += 1;
  return s + Math.min(f.size / 1e10, 0.9); // tie-break: bigger file (base game rather than patch)
}

let libraryGames = [];
async function scanLibrary() {
  const games = [];
  for (const sys of config.systems) {
    if (!sys.romDir || !fs.existsSync(sys.romDir)) continue;
    const exts = sys.extensions.map(e => e.toLowerCase());
    const files = (await walkRoms(sys.romDir, exts)).filter(f => !/\(track \d+\)/i.test(f.name));
    // Prefer .m3u playlists over their individual discs.
    const m3u = new Set(files.filter(f => /\.m3u$/i.test(f.name)).map(f => looseKey(stem(f.name))));
    const best = new Map();
    for (const f of files) {
      const base = path.basename(f.name, path.extname(f.name));
      if (!/\.m3u$/i.test(f.name) && /\(disc \d+\)/i.test(base) && m3u.has(looseKey(base))) continue;
      const key = looseKey(base) || base.toLowerCase();
      f.score = copyScore(f);
      if (!best.has(key) || best.get(key).score < f.score) best.set(key, f);
    }
    const roots = [config.mediaRoot && path.join(config.mediaRoot, sys.id), path.join(sys.romDir, 'media'), sys.romDir, path.join(DATA, 'media', sys.id)].filter(Boolean);
    const indexes = await Promise.all(roots.map(indexMediaRoot));
    const gamelist = await readGamelist(sys.romDir);
    for (const f of best.values()) {
      const base = path.basename(f.name, path.extname(f.name));
      const { media, info } = await findMedia(indexes, base);
      const meta = { ...(gamelist.get(base.toLowerCase()) || {}), ...(info || {}) };
      games.push({
        id: `${sys.id}:${path.relative(sys.romDir, f.path)}`,
        system: sys.id,
        romPath: f.path,
        base,
        title: meta.title || displayTitle(base),
        info: meta,
        media: Object.fromEntries(Object.entries(media).map(([k, v]) => [k, k === 'manual' ? v : fileUrl(v)])),
      });
    }
  }
  games.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
  libraryGames = games;
  return games;
}

// ---------- Artwork download ----------
function artworkPng(bytes) {
  const image=nativeImage.createFromBuffer(bytes),size=image.getSize();
  if(image.isEmpty()||size.width>16384||size.height>16384||size.width*size.height>40e6)throw new Error('Choose a valid image smaller than 40 megapixels.');
  return image.toPNG();
}
const artwork = createArtworkService({
  dataDir: DATA,
  getSystems: () => config.systems,
  getGames: () => libraryGames,
  normalize: looseKey,
  decodeImage: artworkPng,
  onProgress: progress => { if (win && !win.isDestroyed()) win.webContents.send('art:progress', progress); },
});

// ---------- Emulators ----------
function emuDef(id) {
  const base = CATALOG.find(e => e.id === id) || config.customEmulators.find(e => e.id === id);
  if (!base) return null;
  return { ...base, ...(config.emulators[id] || {}), custom: !CATALOG.find(e => e.id === id) };
}
function manifestPath(id) { return path.join(EMU_DIR, id, '.pyrocade.json'); }
function readManifest(id) { try { return JSON.parse(fs.readFileSync(manifestPath(id), 'utf8')); } catch { return null; } }

function resolveExe(id) {
  const def = emuDef(id);
  if (!def) return null;
  if (def.exe && path.isAbsolute(def.exe) && fs.existsSync(def.exe)) return def.exe;
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
    args: def.args, exe: resolveExe(id), installed: man ? { version: man.tag, name: man.releaseName, date: man.publishedAt } : null,
    managed: !!def.source,
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
  const re = new RegExp(def.asset, 'i');
  const pre = def.source.prerelease || config.emulators[id]?.prerelease;
  const list = pre
    ? await ghJson(`https://api.github.com/repos/${def.source.repo}/releases?per_page=15`)
    : [await ghJson(`https://api.github.com/repos/${def.source.repo}/releases/latest`)];
  for (const rel of list) {
    if (rel.draft) continue;
    const asset = rel.assets.find(a => re.test(a.name));
    if (asset) return {
      tag: rel.tag_name, releaseName: rel.name || rel.tag_name, publishedAt: asset.updated_at || rel.published_at,
      assetId: asset.id, assetName: asset.name, size: asset.size, url: asset.browser_download_url, notes: rel.body || '',
    };
  }
  throw new Error(`No Windows download matching /${def.asset}/ found in recent releases.`);
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

function extract(archive, dest) {
  const tar = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe');
  return new Promise((res, rej) => {
    const p = spawn(tar, ['-xf', archive, '-C', dest], { windowsHide: true });
    let err = '';
    p.stderr.on('data', d => (err += d));
    p.on('error', rej);
    p.on('close', c => (c === 0 ? res() : rej(new Error(`Extract failed: ${err.trim() || 'exit ' + c}`))));
  });
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
    const out = fs.createWriteStream(archive);
    let got = 0, last = 0;
    for await (const chunk of r.body) {
      got += chunk.length;
      if (!out.write(chunk)) await new Promise(res => out.once('drain', res));
      if (Date.now() - last > 120) { last = Date.now(); send({ id, stage: `Downloading ${rel.assetName}`, pct: total ? got / total : 0, got, total }); }
    }
    await new Promise((res, rej) => out.end(err => (err ? rej(err) : res())));

    send({ id, stage: 'Extracting…', pct: 1 });
    const stage = path.join(tmp, 'x');
    await fsp.mkdir(stage);
    await extract(archive, stage);
    // Flatten a single wrapping folder.
    let src = stage;
    const top = fs.readdirSync(stage, { withFileTypes: true });
    if (top.length === 1 && top[0].isDirectory()) src = path.join(stage, top[0].name);

    const dest = path.join(EMU_DIR, id);
    await fsp.mkdir(dest, { recursive: true });
    // Copy over the top so emulator settings / portable folders survive updates.
    await fsp.cp(src, dest, { recursive: true, force: true });
    const exe = findFile(dest, new RegExp(def.exe, 'i'));
    if (!exe) throw new Error(`Installed, but couldn't find the program (/${def.exe}/) in the download.`);
    const man = { ...rel, exe: path.relative(dest, exe), installedAt: new Date().toISOString() };
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
function launchGame(gameId, romPath) {
  const sysId = gameId.split(':')[0];
  const sys = config.systems.find(s => s.id === sysId);
  if (!sys) throw new Error('Unknown system');
  const emuId = sys.emulator;
  const exe = resolveExe(emuId);
  if (!exe) throw new Error(`${emuDef(emuId)?.name || emuId} isn't installed yet — install it from the Emulators tab.`);
  const tpl = sys.args || emuDef(emuId).args || '{rom}';
  const args = splitArgs(tpl).map(a => a.replace('{rom}', romPath));
  // detached: the game keeps running if PyroCade is closed or restarted while playing.
  const child = spawn(exe, args, { cwd: path.dirname(exe), detached: true, stdio: 'ignore' });
  child.on('error', e => win?.webContents.send('toast', `Launch failed: ${e.message}`));
  if (config.hideWhilePlaying) {
    win.minimize();
    child.on('exit', () => { if (win && !win.isDestroyed()) { win.restore(); win.focus(); } });
  }
  return true;
}

// ---------- Window & IPC ----------
function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 1100, minHeight: 650,
    show: !previewMode,
    backgroundColor: '#07080c', autoHideMenuBar: true, title: 'PyroCade',
    icon:path.join(ROOT,'renderer/assets/brand/pyrocade-icon-256.png'),
    webPreferences: { preload: path.join(ROOT, 'preload.js'), contextIsolation: true, sandbox: false, autoplayPolicy:'no-user-gesture-required',offscreen: previewMode, backgroundThrottling: !previewMode },
  });
  win.loadFile(path.join(ROOT, 'renderer', 'index.html'));
  win.webContents.on('before-input-event', (_, input) => {
    if (input.type === 'keyDown' && input.key === 'F11') win.setFullScreen(!win.isFullScreen());
  });
}

const handle = (ch, fn) => ipcMain.handle(ch, async (_e, ...a) => {
  try { return { ok: true, value: await fn(...a) }; } catch (err) { return { ok: false, error: err.message }; }
});

handle('config:get', () => config);
handle('config:set', cfg => { config = cfg; saveConfig(cfg); return config; });
handle('library:scan', scanLibrary);
handle('game:launch', (id, rom) => launchGame(id, rom));
handle('art:fetch', (sysId, base, options) => artwork.fetchArt(sysId, base, options));
handle('art:start', options => artwork.start(options));
handle('art:status', () => artwork.status());
handle('art:cancel', () => artwork.cancel());
handle('art:openFolder', () => { fs.mkdirSync(path.join(DATA,'media'),{recursive:true});return shell.openPath(path.join(DATA,'media')); });
handle('art:import', async ({gameId,kind}) => {
  const game=libraryGames.find(g=>g.id===gameId);
  if(!game)throw new Error('Select a game in your library first.');
  if(!['front','back','spine','disc','screenshot','title','fanart'].includes(kind))throw new Error('Choose an artwork type.');
  if(/[<>:"/\\|?*\x00-\x1f]/.test(game.base)||game.base==='.'||game.base==='..')throw new Error('Invalid game filename');
  const picked=await dialog.showOpenDialog(win,{title:`Choose ${kind==='front'?'cover':kind==='disc'?'disc or cartridge label':kind} for ${game.title}`,filters:[{name:'Images',extensions:['png','jpg','jpeg','webp']}],properties:['openFile']});
  if(picked.canceled)return null;
  const source=picked.filePaths[0];
  if((await fsp.stat(source)).size>20*1024*1024)throw new Error('Choose an image smaller than 20 MB.');
  const png=artworkPng(await fsp.readFile(source));
  const sys=config.systems.find(s=>s.id===game.system);
  const root=config.mediaRoot?path.join(config.mediaRoot,sys.id):path.join(DATA,'media',sys.id);
  const folder=path.join(root,game.base);await fsp.mkdir(folder,{recursive:true});
  const dest=path.join(folder,`${kind}.png`);await fsp.writeFile(dest,png);
  const url=fileUrl(dest)+'?v='+Date.now();game.media[kind]=url;
  return {gameId:game.id,media:{[kind]:url},replace:true};
});
handle('emu:list', () => [...CATALOG, ...config.customEmulators].map(e => emuStatus(e.id)));
handle('emu:check', id => checkUpdate(id));
handle('emu:install', id => installEmu(id, p => win.webContents.send('emu:progress', p)));
handle('emu:uninstall', async id => { await fsp.rm(path.join(EMU_DIR, id), { recursive: true, force: true }); return emuStatus(id); });
handle('emu:openFolder', id => { const exe = resolveExe(id); shell.openPath(exe ? path.dirname(exe) : EMU_DIR); });
handle('emu:pickExe', async id => {
  const r = await dialog.showOpenDialog(win, { title: 'Choose emulator program', filters: [{ name: 'Programs', extensions: ['exe'] }], properties: ['openFile'] });
  if (r.canceled) return null;
  config.emulators[id] = { ...(config.emulators[id] || {}), exe: r.filePaths[0] };
  saveConfig(config);
  return emuStatus(id);
});
handle('emu:addCustom', async ({ name, systems, args }) => {
  const r = await dialog.showOpenDialog(win, { title: `Choose ${name} program`, filters: [{ name: 'Programs', extensions: ['exe'] }], properties: ['openFile'] });
  if (r.canceled) return null;
  const id = 'custom-' + name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  config.customEmulators = config.customEmulators.filter(e => e.id !== id);
  config.customEmulators.push({ id, name, exe: r.filePaths[0], args: args || '{rom}', systems: systems || [] });
  saveConfig(config);
  return emuStatus(id);
});
handle('dialog:folder', async title => {
  const r = await dialog.showOpenDialog(win, { title, properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});
handle('manual:open', p => {
  const w = new BrowserWindow({ width: 1000, height: 1100, autoHideMenuBar: true, title: 'Manual', backgroundColor: '#222' });
  w.loadURL(pathToFileURL(p).href);
});

app.whenReady().then(createWindow);
app.on('window-all-closed', () => app.quit());

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
