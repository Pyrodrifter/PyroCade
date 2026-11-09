// PyroCade for Android — window.api bridge (proof of concept).
//
// The desktop renderer talks to Electron's main process through window.api (see ../../preload.js).
// This file provides the same object inside a Capacitor WebView:
//   - getConfig / setConfig      -> Capacitor Preferences (one JSON value)
//   - pickFolder / scan          -> Storage Access Framework, via the PyroNative plugin (Java)
//   - launch                     -> an Intent to RetroArch or a standalone emulator app
//   - emuList                    -> which supported Android emulators are installed
//   - everything else            -> stubs that return empty results
// window.PYROCADE_SYSTEMS is generated from DEFAULT_SYSTEMS in ../../main.js by scripts/build-web.cjs.
(() => {
  'use strict';
  const Cap = window.Capacitor;

  // The desktop layout assumes at least 1100×650 CSS px (the Electron window minimum). A phone in
  // landscape is about 950×400, so lay the page out at a virtual width that keeps 650 px of height
  // and let the WebView scale it to fit (needs setUseWideViewPort, set in MainActivity).
  (() => {
    const w = Math.max(innerWidth, innerHeight), h = Math.min(innerWidth, innerHeight); // window, not screen: bars excluded
    const width = Math.ceil(Math.max(1100, 650 * w / h));
    const meta = document.createElement('meta');
    meta.name = 'viewport';
    meta.content = `width=${width}, user-scalable=no`;
    document.head.append(meta);
  })();
  const native = (plugin, method, options = {}) => {
    if (!Cap) return Promise.reject(new Error('Capacitor is not available (open this page inside the Android app).'));
    const p = Cap.Plugins?.[plugin];
    if (p && typeof p[method] === 'function') return p[method](options);
    return Cap.nativePromise(plugin, method, options);
  };
  const Pyro = (method, options) => native('PyroNative', method, options);
  const prefs = {
    get: async key => (await native('Preferences', 'get', { key })).value,
    set: (key, value) => native('Preferences', 'set', { key, value }),
  };

  // ---------- Android emulators ----------
  // Launch recipes follow what Android front ends (ES-DE, Daijisho) send. "packages" are tried in
  // order; the first one installed is used.
  //  retroarch: explicit activity + ROM/LIBRETRO/CONFIGFILE extras. RetroArch opens the ROM by
  //             file path, so it needs "All files access" granted inside RetroArch.
  //  view:      ACTION_VIEW with the SAF document URI as data (read permission granted).
  //  extra:     explicit activity with the SAF document URI in a named extra (permission granted).
  const RA_CORES = {
    nes: 'fceumm', snes: 'snes9x', n64: 'mupen64plus_next_gles3', gb: 'gambatte', gbc: 'gambatte', gba: 'mgba',
    nds: 'melondsds', genesis: 'genesis_plus_gx', ps1: 'swanstation', psp: 'ppsspp', dreamcast: 'flycast',
    a2600: 'stella', arcade: 'fbneo', gc: 'dolphin', wii: 'dolphin',
  };
  const EMULATORS = [
    { id: 'retroarch', name: 'RetroArch', kind: 'retroarch', systems: Object.keys(RA_CORES),
      packages: ['com.retroarch.aarch64', 'com.retroarch', 'com.retroarch.ra32'],
      activity: 'com.retroarch.browser.retroactivity.RetroActivityFuture' },
    { id: 'ppsspp', name: 'PPSSPP', kind: 'view', systems: ['psp'],
      packages: ['org.ppsspp.ppssppgold', 'org.ppsspp.ppsspp'], activity: 'org.ppsspp.ppsspp.PpssppActivity' },
    { id: 'dolphin', name: 'Dolphin', kind: 'extra', extra: 'AutoStartFile', systems: ['gc', 'wii'],
      packages: ['org.dolphinemu.dolphinemu'], activity: 'org.dolphinemu.dolphinemu.ui.main.MainActivity' },
    { id: 'duckstation', name: 'DuckStation', kind: 'extra', extra: 'bootPath', systems: ['ps1'],
      packages: ['com.github.stenzek.duckstation'], activity: 'com.github.stenzek.duckstation.EmulationActivity' },
    { id: 'nethersx2', name: 'NetherSX2 / AetherSX2', kind: 'extra', extra: 'bootPath', systems: ['ps2'],
      packages: ['xyz.aethersx2.android'], activity: 'xyz.aethersx2.android.EmulationActivity' },
  ];
  const ANDROID_DEFAULT = { psp: 'ppsspp', gc: 'dolphin', wii: 'dolphin', ps2: 'nethersx2' };
  const defaultEmulator = id => ANDROID_DEFAULT[id] || (RA_CORES[id] ? 'retroarch' : '');
  const emuById = id => EMULATORS.find(e => e.id === id);

  let installed = null; // { package: versionName } for the packages above
  async function refreshInstalled() {
    try { installed = (await Pyro('installedPackages', { packages: EMULATORS.flatMap(e => e.packages) })).installed || {}; }
    catch { installed = {}; }
    return installed;
  }
  const installedPackage = emu => emu.packages.find(p => installed && p in installed);

  // ---------- Config ----------
  const SYSTEMS = window.PYROCADE_SYSTEMS || [];
  function defaultConfig() {
    return {
      mediaRoot: '', hideWhilePlaying: true, launchAnimation: true, checkUpdates: false,
      promptFamily: 'auto', motion: 'auto', eShopStyle: 'enhanced',
      libraryTheme: 'ember', libraryLayout: 'carousel', ambient: { idleMinutes: 2, background: 'ribbon' }, uiSound: { enabled: true, volume: .25 },
      systems: SYSTEMS.map(s => ({ ...s, romDir: '', emulator: defaultEmulator(s.id) })),
      emulators: {}, customEmulators: [],
      androidRomRoot: null, // { uri, label } — one folder with a sub-folder per system
    };
  }
  let config = null;
  async function loadConfig() {
    if (config) return config;
    const def = defaultConfig();
    let saved = null;
    try { saved = JSON.parse(await prefs.get('config') || 'null'); } catch {}
    if (!saved || !Array.isArray(saved.systems)) return (config = def);
    const ids = new Set(saved.systems.map(s => s.id));
    for (const s of def.systems) if (!ids.has(s.id)) saved.systems.push(s);
    saved.systems = saved.systems.map(s => {
      const merged = { ...(def.systems.find(d => d.id === s.id) || {}), ...s };
      if (merged.emulator && !emuById(merged.emulator)) merged.emulator = defaultEmulator(s.id); // desktop ids mean nothing here
      return merged;
    });
    return (config = { ...def, ...saved });
  }
  async function saveConfig(next) {
    config = next;
    await prefs.set('config', JSON.stringify(next));
    return next;
  }

  // ---------- Library scanning ----------
  // Same rules as main.js where they matter: extensions per system, extras folders skipped,
  // .m3u preferred over its discs, "(Track n)" files ignored, best copy kept per title.
  const SKIP_DIRS = /^(source archives|_extras|extras|texture packs|saves?|states|bios|cheats|patches|media|images|manuals|downloaded_media|covers|screenshots)$/i;
  const IMG = ['.png', '.jpg', '.jpeg', '.webp'];
  const ART_FOLDERS = { covers: 'front', box2dfront: 'front', boxart: 'front', screenshots: 'screenshot', snaps: 'screenshot', marquees: 'logo', wheel: 'logo', fanart: 'fanart' };
  // ES-DE / RetroBat / Batocera folder names, for a single ROM root with one folder per system.
  const ALIASES = {
    ps1: ['psx', 'ps1', 'playstation'], ps2: ['ps2'], ps3: ['ps3'], ps4: ['ps4'], psp: ['psp'],
    switch: ['switch'], switch2: ['switch2'], wiiu: ['wiiu'], wii: ['wii'], gc: ['gc', 'gamecube', 'ngc'],
    n64: ['n64'], snes: ['snes', 'sfc', 'superfamicom'], nes: ['nes', 'famicom', 'fc'], '3ds': ['3ds', 'n3ds'],
    nds: ['nds', 'ds'], gba: ['gba'], gbc: ['gbc'], gb: ['gb'], dreamcast: ['dreamcast', 'dc'],
    genesis: ['genesis', 'megadrive', 'md'], xbox: ['xbox'], x360: ['xbox360', 'x360'],
    a2600: ['atari2600', 'a2600'], arcade: ['arcade', 'mame', 'fbneo', 'fba'],
  };
  const ext = n => { const i = n.lastIndexOf('.'); return i < 0 ? '' : n.slice(i).toLowerCase(); };
  const stemOf = n => { const i = n.lastIndexOf('.'); return i < 0 ? n : n.slice(0, i); };
  const cleanTitle = name => name.replace(/\s*[\(\[][^\)\]]*[\)\]]/g, '').replace(/_/g, ' ')
    .replace(/^\d{3,5}\s*-?\s+(?=\S)/, '').replace(/\s*\b(decrypted|encrypted)\b\s*$/i, '').replace(/\s+/g, ' ').trim() || name;
  const displayTitle = s => cleanTitle(s).replace(/^(.+?),? (The|A|An)(?= - |$)/, '$2 $1');
  const looseKey = s => cleanTitle(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&|\band\b|\bthe\b/g, '').replace(/[^a-z0-9]/g, '');
  function copyScore(f) {
    const n = f.name; let s = 0;
    if (/\((u|usa|us|e|eu|europe|world|en)\b|\(usa?,|\[usa?\]|\(ue\)/i.test(n)) s += 4;
    if (/\((j|jp|japan)\)/i.test(n)) s -= 2;
    if (/\[!\]/.test(n)) s += 2;
    if (/\b(update|upd|dlc)\b|\[v[1-9]\d*\]|\(beta|\(proto|\(demo|\(hack|\[(b|h|t|o)\d*\]/i.test(n)) s -= 6;
    if (!/\.zip$/i.test(n)) s += 1;
    return s + Math.min((f.size || 0) / 1e10, 0.9);
  }
  // content:// URIs are not loadable as <img src>; Capacitor serves them through its local server.
  const mediaUrl = uri => (Cap?.convertFileSrc ? Cap.convertFileSrc(uri) : uri);

  const library = new Map(); // game id -> { system, uri, path }
  async function listTree(uri, exts) {
    const r = await Pyro('scanTree', { uri, extensions: [...new Set([...exts, ...IMG])], maxDepth: 5 });
    return r.files || [];
  }
  async function scan() {
    const cfg = await loadConfig();
    const perSystem = new Map(cfg.systems.map(s => [s.id, []]));
    const extsOf = s => s.extensions.map(e => e.toLowerCase());
    const notes = [];
    // 1) Folders chosen per system in Settings (several separated by "|").
    for (const sys of cfg.systems) {
      const dirs = String(sys.romDir || '').split('|').map(d => d.trim()).filter(Boolean);
      for (const [ri, dir] of dirs.entries()) {
        try { for (const f of await listTree(dir, extsOf(sys))) perSystem.get(sys.id).push({ ...f, rootIndex: ri }); }
        catch (e) { notes.push(`${sys.name}: ${e.message}`); }
      }
    }
    // 2) One ROM root: its first-level folders are matched to systems by name (psx, snes, megadrive…).
    if (cfg.androidRomRoot?.uri) {
      const all = cfg.systems.flatMap(extsOf);
      let files = [];
      try { files = await listTree(cfg.androidRomRoot.uri, all); } catch (e) { notes.push(`ROM folder: ${e.message}`); }
      for (const f of files) {
        const top = f.rel.includes('/') ? f.rel.split('/')[0].toLowerCase() : '';
        const sys = cfg.systems.find(s => (ALIASES[s.id] || [s.id]).includes(top) || s.id === top);
        if (sys) perSystem.get(sys.id).push({ ...f, rel: f.rel.slice(top.length + 1), rootIndex: 'r' });
      }
    }
    const games = [];
    library.clear();
    for (const sys of cfg.systems) {
      const exts = extsOf(sys);
      const entries = perSystem.get(sys.id);
      const roms = entries.filter(f => exts.includes(ext(f.name)) && !/\(track \d+\)/i.test(f.name)
        && !f.rel.split('/').slice(0, -1).some(d => SKIP_DIRS.test(d)));
      // Images in covers/, screenshots/… (ES-DE style) or next to the ROM with the same name.
      const art = new Map();
      for (const f of entries) {
        if (!IMG.includes(ext(f.name))) continue;
        const parts = f.rel.split('/'), folder = (parts[parts.length - 2] || '').toLowerCase();
        const kind = ART_FOLDERS[folder] || (parts.length === 1 || !SKIP_DIRS.test(folder) ? 'front' : null);
        if (!kind) continue;
        const key = `${kind}:${stemOf(f.name).toLowerCase()}`;
        if (!art.has(key)) art.set(key, f.uri);
      }
      const m3u = new Set(roms.filter(f => /\.m3u$/i.test(f.name)).map(f => looseKey(stemOf(f.name))));
      const best = new Map();
      for (const f of roms) {
        const base = stemOf(f.name);
        if (!/\.m3u$/i.test(f.name) && /\(disc \d+\)/i.test(base) && m3u.has(looseKey(base))) continue;
        const key = looseKey(base) || base.toLowerCase();
        f.score = copyScore(f);
        if (!best.has(key) || best.get(key).score < f.score) best.set(key, f);
      }
      for (const f of best.values()) {
        const base = stemOf(f.name), low = base.toLowerCase();
        const id = `${sys.id}:${f.rootIndex ? f.rootIndex + ':' : ''}${f.rel}`;
        const media = {};
        for (const kind of ['front', 'screenshot', 'logo', 'fanart']) { const u = art.get(`${kind}:${low}`); if (u) media[kind] = mediaUrl(u); }
        library.set(id, { system: sys.id, uri: f.uri, path: f.path || null });
        games.push({ id, system: sys.id, romPath: f.path || f.uri, base, title: displayTitle(base), info: {}, media });
      }
    }
    games.sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }));
    if (notes.length) toast(notes.join(' · '));
    return games;
  }

  // ---------- Launching ----------
  async function launch(id) {
    const game = library.get(id);
    if (!game) throw new Error('This game is no longer in your library. Rescan and try again.');
    const cfg = await loadConfig();
    const sys = cfg.systems.find(s => s.id === game.system);
    const emu = emuById(sys?.emulator || defaultEmulator(game.system));
    if (!emu) throw new Error(`No Android emulator is set for ${sys?.name || game.system}. Choose one in Settings.`);
    await refreshInstalled();
    const pkg = installedPackage(emu);
    if (!pkg) throw new Error(`${emu.name} is not installed. Install it from the Play Store or F-Droid, then try again.`);
    let intent;
    if (emu.kind === 'retroarch') {
      const core = RA_CORES[game.system];
      if (!core) throw new Error(`RetroArch has no core set for ${sys.name} in PyroCade yet.`);
      if (!game.path) throw new Error('RetroArch opens games by file path, and this folder has none (choose a folder on internal storage or an SD card).');
      intent = {
        package: pkg, activity: emu.activity, action: 'android.intent.action.MAIN',
        extras: {
          ROM: game.path,
          LIBRETRO: `/data/data/${pkg}/cores/${core}_libretro_android.so`,
          CONFIGFILE: `/storage/emulated/0/Android/data/${pkg}/files/retroarch.cfg`,
          QUITFOCUS: '',
        },
      };
    } else if (emu.kind === 'view') {
      intent = { package: pkg, activity: emu.activity, action: 'android.intent.action.VIEW', data: game.uri, grantUri: game.uri };
    } else {
      intent = { package: pkg, activity: emu.activity, action: 'android.intent.action.MAIN', extras: { [emu.extra]: game.uri }, grantUri: game.uri };
    }
    await Pyro('launch', intent);
    return true;
  }

  async function emuList() {
    await refreshInstalled();
    return EMULATORS.map(e => {
      const pkg = installedPackage(e);
      return { id: e.id, name: e.name, systems: e.systems, exe: pkg ? `${pkg} ${installed[pkg] || ''}`.trim() : '', installed: null, managed: false, custom: false };
    });
  }

  // ---------- Events & helpers ----------
  const listeners = { toast: [] };
  function toast(msg) { for (const fn of listeners.toast) try { fn(msg); } catch {} }
  const nothing = () => () => {};
  const unsupported = what => async () => { throw new Error(`${what} is not available in the Android preview yet.`); };

  window.api = {
    getConfig: async () => ({ ...(await loadConfig()) }),
    setConfig: async cfg => {
      if (!cfg || !Array.isArray(cfg.systems)) throw new Error('Invalid settings');
      const cur = await loadConfig();
      return saveConfig({ ...cfg, emulators: cur.emulators, customEmulators: cur.customEmulators, androidRomRoot: cur.androidRomRoot });
    },
    scan,
    launch,
    pickFolder: async () => (await Pyro('pickFolder')).uri || null,
    // Artwork: no downloads yet; images found next to the ROMs are shown.
    fetchArt: async () => null,
    artStart: unsupported('Artwork download'),
    artStatus: async () => null,
    artCancel: async () => null,
    artOpenFolder: unsupported('Opening folders'),
    artImport: unsupported('Importing artwork'),
    artSources: async () => ({ launchbox: { built: 0 }, screenscraper: { user: '', devId: '', hasPassword: false, hasDevPassword: false, ready: false } }),
    artCandidates: async () => [],
    artFindManuals: unsupported('Finding manuals'),
    artChoose: unsupported('Choosing artwork'),
    artSetScreenScraper: unsupported('ScreenScraper'),
    onArtProgress: nothing(), onArtMedia: nothing(), onLibraryInfo: nothing(),
    // Emulators come from the Play Store / F-Droid; PyroCade only checks which are installed.
    emuList,
    emuCheck: async () => ({ error: 'Updates come from the Play Store or F-Droid.' }),
    emuInstall: async id => { const e = emuById(id); if (e) await Pyro('openStore', { package: e.packages[0] }); return null; },
    emuUninstall: async () => null,
    emuOpenFolder: async id => { const e = emuById(id); const pkg = e && installedPackage(e); if (pkg) await Pyro('openApp', { package: pkg }); },
    emuPickExe: async id => { const e = emuById(id); if (e) await Pyro('openStore', { package: e.packages[0] }); return null; },
    emuAddCustom: unsupported('Custom emulators'),
    emuSetSource: unsupported('Emulator sources'),
    emuTestSource: unsupported('Emulator sources'),
    emuAddRepo: unsupported('Custom emulators'),
    emuRemove: unsupported('Custom emulators'),
    openManual: unsupported('Manuals'),
    manualUrl: unsupported('Manuals'),
    onProgress: nothing(),
    onToast: fn => listeners.toast.push(fn),
    appVersion: async () => (await Pyro('appInfo').catch(() => ({}))).version || 'android-preview',
    quitApp: () => Pyro('quitApp'),
    appCheckUpdate: async () => ({ available: false, current: 'android-preview' }),
    appInstallUpdate: unsupported('Updating'),
    appOpenRelease: unsupported('Opening links'),
    onAppUpdateProgress: nothing(),
  };

  // First-run helper: one button on the demo shelf to choose a ROM root with a folder per system.
  document.addEventListener('DOMContentLoaded', () => {
    const banner = document.getElementById('demoBanner');
    if (!banner) return;
    const btn = document.createElement('button');
    btn.textContent = 'Choose ROM folder…';
    btn.style.marginLeft = '12px';
    btn.onclick = async () => {
      try {
        const r = await Pyro('pickFolder');
        if (!r?.uri) return;
        const cfg = await loadConfig();
        await saveConfig({ ...cfg, androidRomRoot: { uri: r.uri, label: r.label || r.uri } });
        location.reload();
      } catch (e) { toast(e.message); }
    };
    banner.append(btn);
  });
})();
