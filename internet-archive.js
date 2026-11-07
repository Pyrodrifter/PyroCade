// Internet Archive (archive.org): the "softwareboxart" collection of box scans uploaded by collectors.
// The collection's item list (about 7,000 items, 2 MB) comes from the advancedsearch API once a month
// and is matched locally on title and system; only a matching item's file list is fetched, from the
// metadata API. Uploads vary, so an item counts only when exactly one of PyroCade's systems is named
// in it, and a file only when its name says it is the front cover. Pictures come through the archive's
// IIIF image service at cover size (about 300 KB) rather than as the full scan (5-15 MB).
const path = require('node:path');
const fs = require('node:fs');
const {createPoliteFetch, createDiskCache, trustedRelease, withoutVersion, regionOf} = require('./web-source');

// How an item names each system: its subjects, the (…) groups of its title, or " - " parts of it.
// Serial prefixes are the strongest sign. `over` lists systems a match on this one rules out
// (a Game Boy Advance item is also tagged "GameBoy").
const SYSTEMS = {
  nds:{names:['nintendo ds','nds'],serial:/\b(?:NTR|TWL)-[A-Z0-9]{3,4}\b/,over:[]},
  '3ds':{names:['nintendo 3ds','3ds'],serial:/\bCTR-[A-Z0-9]{3,4}\b/,over:['nds']},
  gba:{names:['game boy advance','gameboy advance','gba'],serial:/\bAGB-[A-Z0-9]{3,4}\b/,over:['gb','gbc']},
  gbc:{names:['game boy color','gameboy color','gbc'],serial:/\bCGB-[A-Z0-9]{3,4}\b/,over:['gb']},
  gb:{names:['game boy','gameboy','gb'],serial:/\bDMG-[A-Z0-9]{2,4}\b/,over:[]},
  snes:{names:['snes','super nintendo','super nintendo entertainment system','super famicom','sfc'],serial:/\b(?:SNS|SHVC)-[A-Z0-9]{2,4}\b/,over:['nes']},
  nes:{names:['nes','nintendo entertainment system','famicom','nintendo famicom'],serial:/\bNES-[A-Z0-9]{2,4}\b/,over:[]},
  n64:{names:['n64','nintendo 64'],serial:/\bNUS-[A-Z0-9]{3,4}\b/,over:[]},
  gc:{names:['gamecube','nintendo gamecube','gcn'],serial:/\bDOL-[A-Z0-9]{3,4}\b/,over:[]},
  wii:{names:['wii','nintendo wii'],serial:/\bRVL-[A-Z0-9]{3,4}\b/,over:[]},
  wiiu:{names:['wii u','nintendo wii u'],serial:/\bWUP-[A-Z0-9]{3,4}\b/,over:['wii']},
  switch:{names:['nintendo switch','switch'],serial:/\bHAC-[A-Z0-9]{4,5}\b/,over:[]},
  ps1:{names:['ps1','psx','playstation','sony playstation','playstation 1'],serial:null,over:[]},
  ps2:{names:['ps2','playstation 2','sony playstation 2'],serial:null,over:['ps1']},
  ps3:{names:['ps3','playstation 3','sony playstation 3'],serial:null,over:['ps1']},
  psp:{names:['psp','playstation portable','sony psp'],serial:/\bU[LC][UEJAK][SM][- ]?\d{5}\b/,over:['ps1']},
  dreamcast:{names:['dreamcast','sega dreamcast'],serial:null,over:[]},
  genesis:{names:['genesis','mega drive','sega genesis','sega mega drive'],serial:null,over:[]},
  xbox:{names:['xbox','microsoft xbox'],serial:null,over:[]},
  x360:{names:['xbox 360','microsoft xbox 360'],serial:null,over:['xbox']},
  a2600:{names:['atari 2600','atari vcs'],serial:null,over:[]},
};
// Width ÷ height of the front of each system's box, for every shape it was sold in
// (Super Nintendo boxes lie flat in America and Japan and stand up in Europe). A scan must be within 8%.
const FRONT_SHAPE = {
  nds:[0.89], '3ds':[0.89], gba:[1], gbc:[1], gb:[1], snes:[1.38, 0.72], n64:[1.38, 0.72], nes:[0.73, 1.4],
  gc:[0.72], wii:[0.72], wiiu:[0.72], switch:[0.62], ps1:[1], ps2:[0.71], ps3:[0.86], psp:[0.58],
  dreamcast:[1], genesis:[0.71], xbox:[0.71], x360:[0.71], a2600:[0.74],
};
const fitsFront = (sysId, width, height) => (FRONT_SHAPE[sysId] || []).some(shape => Math.abs(width / height / shape - 1) <= 0.08);
// Items that are not the retail box: store displays, promos, demos, fan-made covers…
const NOT_RETAIL = /\b(display|promo\w*|demo|demonstration|custom|fan ?made|fan ?art|mock-?up|reproduction|repro|not for resale|nfr|sample|kiosk|beta|prototype)\b/i;
// …and items of just one other part of the package. "Box, Manual, Cart Scans" still counts.
const PART_ONLY = /\b(manual|map|poster|inserts?|cart|cartridge|disc|label|card|registration card|guide ?book|strategy guide|catalog(?:ue)?|flyer|ad|advert\w*|offer|sweepstakes|coupon)\b/i;
const HAS_BOX = /\b(box|boxes|cover|covers|complete)\b/i;
// Names that are shared by many different games ("2 Games in 1 (…)"): never matched on name alone.
const GENERIC = /^(?:\d+(?:games?)?in1|(?:\d+)?(?:game)?pack|doublepack|combo(?:pack)?|collection|compilation)$/;
// File names: the front cover, and nothing else that also says "front" (cartridge fronts, survey cards…).
const FRONT = /\bfront\b/;
const NOT_FRONT = /\b(back|rear|reverse|spine|side|cart|cartridge|disc|disk|cd|dvd|umd|media|label|manual|insert|inlay|inside|inner|survey|poster|card|sleeve|obi|tray|case|shell|sticker|thumb|thumbnail|preview|ad|advert|outer|slip ?cover)\b/;
const MAX_AGE = 30 * 864e5, INDEX_VERSION = 2, MAX_FILE = 19 * 1024 * 1024;

const tokens = s => String(s || '').toLowerCase().replace(/[_]+/g, ' ').trim();
// Every system an item names. A system named alongside a more specific one (GameBoy + GameBoy Advance) is dropped.
function systemsOf(title, subjects) {
  const words = new Set([...subjects.map(tokens), ...(title.match(/\(([^)]+)\)/g) || []).map(g => tokens(g.slice(1, -1))), ...title.split(/\s+[-–—]\s+/).map(tokens)]);
  const found = new Set();
  for (const [id, s] of Object.entries(SYSTEMS)) if (s.names.some(n => words.has(n)) || s.serial?.test(title)) found.add(id);
  const serial = [...found].filter(id => SYSTEMS[id].serial?.test(title));
  if (serial.length === 1) return serial;
  for (const id of [...found]) for (const lower of SYSTEMS[id].over) found.delete(lower);
  return [...found];
}
// "Pokemon - Black Version [TWL-IRBO-USA] (Nintendo DS) - Box Scans (1200DPI)" -> "Pokemon - Black Version"
function itemName(title) {
  // Everything from the first (…) or […], a TV standard, a serial number or a scan resolution is about the scan.
  // Case matters here: serials are capitals joined by hyphens (SLES-01600, DMG-SE-ESP), unlike title words.
  let name = String(title || '').split(/\s+(?:[[(]|(?:PAL|NTSC(?:-[UJ])?)\b|[A-Z]{2,4}-[A-Z0-9]{2,5}(?:-[A-Z0-9]{1,3})*\b|\d{3,4} ?[dD][pP][iI]\b|\d{2}-[bB][iI][tT]\b)/)[0];
  const parts = name.split(/\s+[-–—]\s+/);
  const stop = parts.findIndex((p, i) => i && (Object.values(SYSTEMS).some(s => s.names.includes(tokens(p))) || /^(box|cover|complete|scans?|full cover|europe|usa|japan)\b/i.test(p)));
  if (stop > 0) name = parts.slice(0, stop).join(' - ');
  name = name.replace(/^scans?\s+-\s+/i, '').replace(/\s+(?:box scans?|box art|boxart|box|hi ?res|scans?|covers?|full cover)\b.*$/i, '').trim();
  // A system name left at the end ("Advance Wars Dual Strike Nintendo Ds") is not part of the title.
  for (const n of Object.values(SYSTEMS).flatMap(s => s.names).sort((a, b) => b.length - a.length))
    if (name.toLowerCase().endsWith(' ' + n)) { name = name.slice(0, -n.length - 1).trim(); break; }
  return name;
}
// One collection item as PyroCade indexes it, or null when it cannot be trusted.
function indexItem(doc, normalize) {
  const id = typeof doc?.identifier === 'string' ? doc.identifier : '', title = typeof doc?.title === 'string' ? doc.title : '';
  if (!/^[\w.-]+$/.test(id) || !title || NOT_RETAIL.test(title) || (PART_ONLY.test(title) && !HAS_BOX.test(title))) return null;
  const subjects = [].concat(doc.subject || []).filter(s => typeof s === 'string');
  if (subjects.some(s => NOT_RETAIL.test(s))) return null;
  if (subjects.some(s => PART_ONLY.test(s)) && !HAS_BOX.test(title) && !subjects.some(s => HAS_BOX.test(s))) return null;
  const systems = systemsOf(title, subjects);
  if (systems.length !== 1) return null;
  const key = normalize(itemName(title));
  return key.length >= 3 && !GENERIC.test(key) ? {id, key, system: systems[0], region: regionOf(title)} : null;
}
// The front cover among an item's files, best first.
function frontFiles(files) {
  return (Array.isArray(files) ? files : []).filter(f => {
    if (typeof f?.name !== 'string' || !/^(JPEG|PNG)$/i.test(f.format || '') || Number(f.size) > MAX_FILE) return false;
    const base = f.name.split('/').pop().replace(/\.[a-z0-9]+$/i, '').replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase().replace(/[_.\-]+/g, ' ');
    return FRONT.test(base) && !NOT_FRONT.test(base);
  }).sort((a, b) => (/jpe?g/i.test(a.format) ? 0 : 1) - (/jpe?g/i.test(b.format) ? 0 : 1)).map(f => f.name);
}

function createInternetArchive({dataDir, normalize, fetchImpl = fetch, userAgent, gapMs = 1000, api = 'https://archive.org', iiif = 'https://iiif.archive.org/image/iiif/3', collection = 'softwareboxart'}) {
  const get = createPoliteFetch({fetchImpl, userAgent, gapMs, name: 'The Internet Archive'});
  const dir = path.join(dataDir, 'media', '_index'), indexFile = path.join(dir, 'archive-boxart.json');
  const files = createDiskCache(path.join(dir, 'archive-items.json'), MAX_AGE);
  let index = null;
  async function build(signal) {
    const docs = [];
    for (let page = 1; page <= 5; page++) {
      const params = new URLSearchParams({q: `collection:${collection}`, rows: '10000', page: String(page), output: 'json'});
      for (const f of ['identifier', 'title', 'subject']) params.append('fl[]', f);
      const data = await get(`${api}/advancedsearch.php?${params}`, {kind: 'json', signal});
      const found = data?.response?.docs;
      if (!Array.isArray(found)) throw new Error('Could not read the Internet Archive box art list');
      docs.push(...found);
      if (!found.length || docs.length >= Number(data.response.numFound || 0)) break;
    }
    const items = docs.map(d => indexItem(d, normalize)).filter(Boolean);
    if (!items.length) throw new Error('The Internet Archive box art list was empty');
    const built = {version: INDEX_VERSION, built: Date.now(), items};
    await fs.promises.mkdir(dir, {recursive: true});
    await fs.promises.writeFile(indexFile + '.tmp', JSON.stringify(built));await fs.promises.rename(indexFile + '.tmp', indexFile);
    return built;
  }
  function load(refresh, signal) {
    let age = Infinity;try { age = Date.now() - fs.statSync(indexFile).mtimeMs; } catch {}
    if (refresh && age < 864e5) refresh = false; // "Refresh matches" asks again at most once a day
    if (index && !refresh) return index;
    const promise = (async () => {
      if (!refresh && age < MAX_AGE) try {
        const cached = JSON.parse(await fs.promises.readFile(indexFile, 'utf8'));
        if (cached?.version === INDEX_VERSION && Array.isArray(cached.items)) return cached;
      } catch {}
      return build(signal);
    })().then(data => {
      const bySystem = new Map();
      for (const item of data.items) {
        if (!bySystem.has(item.system)) bySystem.set(item.system, new Map());
        const keys = bySystem.get(item.system);
        for (const k of new Set([item.key, withoutVersion(item.key)])) { if (!keys.has(k)) keys.set(k, []); keys.get(k).push(item); }
      }
      return bySystem;
    });
    index = promise;promise.catch(() => { if (index === promise) index = null; });
    return promise;
  }
  // Width and height of one scan, from the IIIF service's info.json; null when it cannot be read.
  async function scanSize(id, name, signal) {
    const key = `size:${id}/${name}`, cached = files.get(key);
    if (cached !== undefined) return cached;
    const info = await get(`${iiif}/${encodeURIComponent(`${id}/${name}`)}/info.json`, {kind: 'json', signal});
    const size = Number(info?.width) > 0 && Number(info?.height) > 0 ? [Number(info.width), Number(info.height)] : null;
    files.set(key, size);
    return size;
  }
  async function itemFiles(id, signal) {
    const cached = files.get(id);
    if (cached) return cached;
    const data = await get(`${api}/metadata/${encodeURIComponent(id)}/files`, {kind: 'json', signal});
    const names = frontFiles(data?.result);
    files.set(id, names);
    return names;
  }
  const covers = sysId => Object.hasOwn(SYSTEMS, sysId);
  // Front cover URLs for one game, best first: the game's own region, then USA, Europe, the rest.
  async function find(game, sysId, keys, {signal, refresh = false} = {}) {
    if (!covers(sysId) || !trustedRelease(game.base)) return [];
    const bySystem = (await load(refresh, signal)).get(sysId);
    if (!bySystem) return [];
    const own = regionOf(game.base), rank = r => r && r === own ? 0 : ({us: 1, eu: 2, jp: 3})[r] ?? 4;
    const items = [...new Map(keys.filter(Boolean).flatMap(k => [k, withoutVersion(k)]).flatMap(k => bySystem.get(k) || []).map(i => [i.id, i])).values()]
      .sort((a, b) => rank(a.region) - rank(b.region)).slice(0, 3);
    const urls = [];
    for (const item of items) for (const name of (await itemFiles(item.id, signal)).slice(0, 2)) {
      // A file named "Box Front" is often the whole box scanned flat, flaps and all, or a full wrap.
      // Only a scan with the shape of this system's box front is used.
      const size = await scanSize(item.id, name, signal);
      if (!size || !fitsFront(sysId, ...size)) continue;
      // The archive's IIIF image service scales the 1200 dpi scan to cover size before sending it.
      urls.push(`${iiif}/${encodeURIComponent(`${item.id}/${name}`)}/full/!1600,1600/0/default.jpg`);
    }
    return urls.slice(0, 4);
  }
  return {find, covers, flush: () => files.flush()};
}

module.exports = {createInternetArchive, indexItem, itemName, systemsOf, frontFiles, fitsFront, SYSTEMS};
