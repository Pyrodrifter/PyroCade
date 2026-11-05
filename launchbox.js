// LaunchBox Games Database: full-size box scans, discs and screenshots. No account needed.
// The public Metadata.zip (~100 MB, refreshed daily) lists every game and image filename.
// It is downloaded once, streamed through, and boiled down to a small index for PyroCade's systems.
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const PLATFORMS = {
  ps1:'Sony Playstation', ps2:'Sony Playstation 2', ps3:'Sony Playstation 3', ps4:'Sony Playstation 4', psp:'Sony PSP',
  switch:'Nintendo Switch', switch2:'Nintendo Switch 2', wiiu:'Nintendo Wii U', wii:'Nintendo Wii', gc:'Nintendo GameCube',
  n64:'Nintendo 64', snes:'Super Nintendo Entertainment System', nes:'Nintendo Entertainment System', '3ds':'Nintendo 3DS',
  nds:'Nintendo DS', gba:'Nintendo Game Boy Advance', gbc:'Nintendo Game Boy Color', gb:'Nintendo Game Boy',
  dreamcast:'Sega Dreamcast', genesis:'Sega Genesis', xbox:'Microsoft Xbox', x360:'Microsoft Xbox 360', a2600:'Atari 2600', arcade:'Arcade',
};
// PyroCade artwork type -> LaunchBox image types, best first.
const IMAGE_TYPES = {
  front:['Box - Front','Box - Front - Reconstructed'],
  frontHQ:['Box - Front','Box - Front - Reconstructed'],
  back:['Box - Back'],
  disc:['Disc','Cart - Front'],
  screenshot:['Screenshot - Gameplay'],
  title:['Screenshot - Game Title'],
  spine:['Box - Spine'],
  logo:['Clear Logo'],
  fanart:['Fanart - Background'],
};
const TYPE_OF = new Map(Object.entries(IMAGE_TYPES).filter(([k])=>k!=='frontHQ').flatMap(([kind,list])=>list.map((t,i)=>[t,[kind,i]])));
const REGION_RANK = r => !r ? 1 : /North America|United States|World|Canada/.test(r) ? 0 : /Europe|United Kingdom|Australia|Oceania/.test(r) ? 2 : 3;
const INDEX_VERSION = 2, MAX_AGE = 30*864e5, KEEP = 6, OVERVIEW_LIMIT = 1200;

const decodeXml = s => s.replace(/&(amp|lt|gt|quot|apos|#\d+|#x[0-9a-f]+);/gi, (_, e) =>
  e[0]==='#' ? String.fromCodePoint(e[1].toLowerCase()==='x' ? parseInt(e.slice(2),16) : +e.slice(1)) : ({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'"})[e.toLowerCase()]);
function field(record, tag) {
  const open=`<${tag}>`, a=record.indexOf(open);if(a<0)return '';
  const b=record.indexOf(`</${tag}>`, a);return b<0 ? '' : decodeXml(record.slice(a+open.length, b).trim());
}

// Minimal zip reader: finds one entry through the central directory and streams it out.
async function zipEntryStream(zipPath, name) {
  const handle = await fs.promises.open(zipPath, 'r');
  try {
    const {size} = await handle.stat();
    const tailSize = Math.min(size, 65557), tail = Buffer.alloc(tailSize);
    await handle.read(tail, 0, tailSize, size - tailSize);
    const eocd = tail.lastIndexOf(Buffer.from([0x50,0x4b,0x05,0x06]));
    if (eocd < 0) throw new Error('The LaunchBox database download is not a valid zip file');
    const cdSize = tail.readUInt32LE(eocd+12), cdOffset = tail.readUInt32LE(eocd+16);
    const cd = Buffer.alloc(cdSize);await handle.read(cd, 0, cdSize, cdOffset);
    for (let p = 0; p + 46 <= cd.length && cd.readUInt32LE(p) === 0x02014b50;) {
      const method=cd.readUInt16LE(p+10), compSize=cd.readUInt32LE(p+20), nameLen=cd.readUInt16LE(p+28), extraLen=cd.readUInt16LE(p+30), commentLen=cd.readUInt16LE(p+32), local=cd.readUInt32LE(p+42);
      if (cd.toString('utf8', p+46, p+46+nameLen) === name) {
        const header = Buffer.alloc(30);await handle.read(header, 0, 30, local);
        const start = local + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
        const raw = fs.createReadStream(zipPath, {start, end:start+compSize-1});
        if (method === 0) return raw;
        if (method !== 8) throw new Error('Unsupported compression in the LaunchBox database');
        return raw.pipe(zlib.createInflateRaw());
      }
      p += 46 + nameLen + extraLen + commentLen;
    }
    throw new Error(`The LaunchBox database is missing ${name}`);
  } finally { await handle.close(); }
}

// Streams Metadata.xml once and keeps only the platforms and image kinds PyroCade uses.
async function buildIndex(zipPath, normalize) {
  const wanted = new Set(Object.values(PLATFORMS));
  const dict = () => Object.create(null), platformOf = new Map(), names = dict(), images = dict(), meta = dict();
  const addName = (platform, name, id) => {
    const key = normalize(name);if(!key)return;
    const map = names[platform] ||= dict();const list = map[key] ||= [];if(!list.includes(id))list.push(id);
  };
  const stream = await zipEntryStream(zipPath, 'Metadata.xml');
  stream.setEncoding('utf8');
  const pattern = /<(Game|GameAlternateName|GameImage)>([\s\S]*?)<\/\1>/g;
  let buffer = '';
  for await (const chunk of stream) {
    buffer += chunk;pattern.lastIndex = 0;let end = 0, m;
    while ((m = pattern.exec(buffer))) {
      end = pattern.lastIndex;const record = m[2], id = field(record, 'DatabaseID');if(!id)continue;
      if (m[1] === 'Game') {
        const platform = field(record, 'Platform');if(!wanted.has(platform))continue;
        platformOf.set(id, platform);addName(platform, field(record, 'Name'), id);
        // Game details shown under the shelf (only what PyroCade displays).
        let description = field(record, 'Overview').replace(/\r/g, '').trim();
        if (description.length > OVERVIEW_LIMIT) description = description.slice(0, OVERVIEW_LIMIT).replace(/\s+\S*$/, '') + '…';
        const year = (field(record, 'ReleaseDate') || field(record, 'ReleaseYear')).slice(0, 4);
        const info = {description, year, developer: field(record, 'Developer'), publisher: field(record, 'Publisher'),
          genre: field(record, 'Genres').split(';').map(g => g.trim()).filter(Boolean).slice(0, 2).join(', '), players: field(record, 'MaxPlayers')};
        for (const k of Object.keys(info)) if (!info[k] || info[k] === '0') delete info[k];
        if (Object.keys(info).length) (meta[platform] ||= dict())[id] = info;
      } else if (m[1] === 'GameAlternateName') {
        const platform = platformOf.get(id);if(platform)addName(platform, field(record, 'AlternateName'), id);
      } else {
        const platform = platformOf.get(id), type = TYPE_OF.get(field(record, 'Type'));if(!platform||!type)continue;
        const file = field(record, 'FileName');if(!/^[\w.-]+\.(png|jpe?g)$/i.test(file))continue;
        const [kind, typeRank] = type, byKind = (images[platform] ||= dict())[id] ||= dict();
        (byKind[kind] ||= []).push([file, typeRank*10 + REGION_RANK(field(record, 'Region'))]);
      }
    }
    buffer = buffer.slice(end);
    if (buffer.length > 4e6) buffer = buffer.slice(-1e6); // a broken record should never grow the buffer forever
  }
  for (const byId of Object.values(images)) for (const kinds of Object.values(byId))
    for (const kind of Object.keys(kinds)) kinds[kind] = kinds[kind].sort((a,b)=>a[1]-b[1]).slice(0, KEEP).map(x=>x[0]);
  if (!platformOf.size) throw new Error('Could not read any games from the LaunchBox database');
  return {version:INDEX_VERSION, built:Date.now(), names, images, meta};
}

const slug = platform => platform.toLowerCase().replace(/[^a-z0-9]+/g, '-');
function createLaunchBox({dataDir, normalize, download, onStatus=()=>{},
  metadataUrl='https://gamesdb.launchbox-app.com/Metadata.zip', imageUrl='https://images.launchbox-app.com'}) {
  const dir = path.join(dataDir, 'media', '_index'), indexFile = path.join(dir, 'launchbox-index.json'), metaDir = path.join(dir, 'launchbox-meta');
  let pending = null;const metaCache = new Map();
  // offline: use the database already on disk, however old, and never download. Background work
  // (library scans, automatic lookups) is always offline; only an Artwork download may refresh it.
  async function readCached() {
    const cached = JSON.parse(await fs.promises.readFile(indexFile, 'utf8'));
    if (cached?.version !== INDEX_VERSION) throw new Error('The LaunchBox database is from an older PyroCade');
    return cached;
  }
  function load(refresh = false, {offline = false} = {}) {
    if (offline) return pending || readCached().then(index => (pending ||= Promise.resolve(index)));
    let age = Infinity;try { age = Date.now() - fs.statSync(indexFile).mtimeMs; } catch {}
    if (refresh && age < 864e5) refresh = false; // "Refresh matches" re-downloads at most once a day
    if (pending && !refresh && age < MAX_AGE) return pending;
    const promise = (async () => {
      if (!refresh && age < MAX_AGE) try { return await readCached(); } catch {}
      const zip = path.join(dir, 'launchbox-metadata.zip');
      await fs.promises.mkdir(dir, {recursive:true});
      onStatus('Downloading the LaunchBox games database (about 100 MB, once a month)…');
      let shown = 0;
      await download(metadataUrl, zip, (got, total) => {
        if (Date.now() - shown < 400) return;shown = Date.now();
        onStatus(`Downloading the LaunchBox games database: ${(got/1048576).toFixed(0)}${total ? ` of ${(total/1048576).toFixed(0)}` : ''} MB (once a month)…`);
      });
      onStatus('Reading the LaunchBox games database…');
      const {meta, ...index} = await buildIndex(zip, normalize);
      // Game details are large, so each system gets its own file, read only when needed.
      await fs.promises.mkdir(metaDir, {recursive:true});
      for (const [platform, byId] of Object.entries(meta)) await fs.promises.writeFile(path.join(metaDir, slug(platform) + '.json'), JSON.stringify(byId));
      metaCache.clear();
      await fs.promises.writeFile(indexFile + '.tmp', JSON.stringify(index));
      await fs.promises.rename(indexFile + '.tmp', indexFile);
      await fs.promises.unlink(zip).catch(()=>{});
      return index;
    })();
    pending = promise;promise.catch(() => { if (pending === promise) pending = null; });
    return promise;
  }
  // Image URLs for one game and artwork kind, best first. Empty when the game or system is unknown.
  async function find(sysId, keys, kind, {refresh=false, offline=false}={}) {
    const platform = PLATFORMS[sysId], wantedKind = kind === 'frontHQ' ? 'front' : kind;
    if (!platform || !IMAGE_TYPES[kind]) return [];
    const index = await load(refresh, {offline});
    const names = index.names[platform] || {}, own = k => Object.hasOwn(names, k) && Array.isArray(names[k]) ? names[k] : [];
    const ids = [...new Set(keys.filter(Boolean).flatMap(own))];
    for (const id of ids) {
      const byId = index.images[platform] || {}, files = Object.hasOwn(byId, id) ? byId[id][wantedKind] : null;
      if (files?.length) return files.map(f => `${imageUrl}/${encodeURIComponent(f)}`);
    }
    return [];
  }
  // True once the database has been prepared, so lookups need no download.
  // Reads only the start of the index (it is ~18 MB) and remembers the answer until the file changes.
  let availableAt = -1, availableNow = false;
  const available = () => {
    try {
      const {mtimeMs} = fs.statSync(indexFile);
      if (mtimeMs !== availableAt) {
        const head = Buffer.alloc(64), fd = fs.openSync(indexFile, 'r');
        try { fs.readSync(fd, head, 0, 64, 0); } finally { fs.closeSync(fd); }
        availableNow = Number(head.toString('utf8').match(/"version":(\d+)/)?.[1]) === INDEX_VERSION;availableAt = mtimeMs;
      }
      return availableNow;
    } catch { return false; }
  };
  // Description, year, developer, publisher, genre and players for one game, or null.
  async function details(sysId, keys) {
    const platform = PLATFORMS[sysId];if(!platform)return null;
    const index = await load(false, {offline:true});
    const names = index.names[platform] || {};
    const ids = [...new Set(keys.filter(Boolean).flatMap(k => Object.hasOwn(names, k) && Array.isArray(names[k]) ? names[k] : []))];
    if (!ids.length) return null;
    if (!metaCache.has(platform)) {
      let byId = {};try { byId = JSON.parse(await fs.promises.readFile(path.join(metaDir, slug(platform) + '.json'), 'utf8')); } catch {}
      metaCache.set(platform, byId);
    }
    const byId = metaCache.get(platform);
    for (const id of ids) if (Object.hasOwn(byId, id)) return byId[id];
    return null;
  }
  return {find, load, details, available, platforms:PLATFORMS};
}

module.exports = {createLaunchBox, buildIndex, zipEntryStream, PLATFORMS};
