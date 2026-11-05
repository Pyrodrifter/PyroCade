// ScreenScraper: large community database, matched by ROM name, size and checksum.
// Needs a free screenscraper.fr account plus developer credentials (asked for on their forum).
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

// PyroCade system id -> ScreenScraper systemeid.
const SYSTEMS = {
  genesis:1, nes:3, snes:4, gb:9, gbc:10, gba:12, gc:13, n64:14, nds:15, wii:16, '3ds':17, wiiu:18,
  dreamcast:23, a2600:26, xbox:32, x360:33, ps1:57, ps2:58, ps3:59, psp:61, arcade:75, switch:225,
};
// PyroCade artwork type -> ScreenScraper media types, best first.
const MEDIA = {
  front:['box-2D'], frontHQ:['box-2D'], back:['box-2D-back'], disc:['support-2D'], screenshot:['ss'], title:['sstitle'], manual:['manuel'],
};
const REGIONS = ['us','wor','ss','eu','uk','fr','de','jp'];
const regionRank = r => { const i = REGIONS.indexOf(r); return i < 0 ? REGIONS.length : i; };
const ERRORS = {
  400:'ScreenScraper could not read the request', 401:'ScreenScraper is busy right now; try again later',
  403:'ScreenScraper rejected the developer ID or password', 423:'ScreenScraper is down for maintenance',
  426:'ScreenScraper no longer accepts this version of PyroCade', 429:'ScreenScraper says too many requests; slow down and retry',
  430:'Your ScreenScraper daily quota is used up', 431:'ScreenScraper saw too many unknown ROMs today',
};
const CRC_LIMIT = 64 * 1024 * 1024; // checksum only cartridge-sized files; big disc images are matched by name and size

async function crc32(file) {
  let crc = 0;
  for await (const chunk of fs.createReadStream(file)) crc = zlib.crc32(chunk, crc);
  return (crc >>> 0).toString(16).padStart(8, '0').toUpperCase();
}

function createScreenScraper({getCredentials, fetchImpl = fetch, softname = 'PyroCade', api = 'https://api.screenscraper.fr/api2'}) {
  const games = new Map(); // romPath -> Promise<medias[] | null>
  let chain = Promise.resolve(), blocked = null;
  // ScreenScraper gives free users a single thread: requests go out one at a time.
  const serial = fn => { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; };

  function configured() {
    const c = getCredentials();
    return !!(c?.user && c?.password && c?.devId && c?.devPassword);
  }
  async function lookup(game, signal) {
    const c = getCredentials(), system = SYSTEMS[game.system];
    if (!system || !configured()) return null;
    if (blocked) throw new Error(blocked);
    const folder = /[\\/]exefs[\\/]main$/i.test(game.romPath || '');
    const params = new URLSearchParams({devid:c.devId, devpassword:c.devPassword, softname, output:'json', ssid:c.user, sspassword:c.password, systemeid:String(system)});
    if (folder) { params.set('romtype', 'dossier'); params.set('romnom', game.base); }
    else if (game.romPath) {
      params.set('romtype', 'rom'); params.set('romnom', path.basename(game.romPath));
      try {
        const {size} = await fs.promises.stat(game.romPath); params.set('romtaille', String(size));
        if (size <= CRC_LIMIT) params.set('crc', await crc32(game.romPath));
      } catch {}
    } else params.set('romnom', game.base);
    const response = await serial(() => fetchImpl(`${api}/jeuInfos.php?${params}`, {headers:{'User-Agent':'PyroCade-Frontend'}, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(25000)]) : AbortSignal.timeout(25000)}));
    if (response.status === 404) return [];
    if (!response.ok) {
      const message = ERRORS[response.status] || `ScreenScraper returned HTTP ${response.status}`;
      if ([403, 423, 426, 430, 431].includes(response.status)) blocked = message; // stop asking for the rest of this run
      throw new Error(message);
    }
    let data;try { data = await response.json(); } catch { throw new Error('ScreenScraper sent an unreadable reply'); }
    return Array.isArray(data?.response?.jeu?.medias) ? data.response.jeu.medias : [];
  }
  // Image URLs for one game and artwork kind, best first.
  async function find(game, kind, {signal, refresh = false} = {}) {
    if (!MEDIA[kind] || !configured() || !SYSTEMS[game.system]) return [];
    const key = game.romPath || `${game.system}/${game.base}`;
    if (refresh || !games.has(key)) {
      const pending = lookup(game, signal);games.set(key, pending);
      pending.catch(() => { if (games.get(key) === pending) games.delete(key); });
    }
    const medias = await games.get(key) || [];
    return medias
      .filter(m => MEDIA[kind].includes(m?.type) && typeof m.url === 'string' && /^https:\/\/[\w.-]*screenscraper\.fr\//.test(m.url))
      .sort((a, b) => MEDIA[kind].indexOf(a.type) - MEDIA[kind].indexOf(b.type) || regionRank(a.region) - regionRank(b.region))
      .slice(0, 6).map(m => m.url);
  }
  return {find, configured, reset: () => { blocked = null; games.clear(); }, systems: SYSTEMS};
}

module.exports = {createScreenScraper, SYSTEMS};
