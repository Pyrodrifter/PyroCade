// Shared plumbing for artwork sources that are websites run by volunteers (Super Mario Wiki,
// Internet Archive): one request at a time with a pause between them, and answers kept on disk so a
// library is only looked up once a month.
const fs = require('node:fs');
const path = require('node:path');

const abortError = () => new DOMException('Cancelled', 'AbortError');
function pause(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(abortError());
    const done = () => { signal?.removeEventListener('abort', stop); resolve(); };
    const timer = setTimeout(done, ms);
    const stop = () => { clearTimeout(timer); reject(abortError()); };
    signal?.addEventListener('abort', stop, {once: true});
  });
}

// get(url, {kind:'text'|'json', signal}) -> body, or null for a page that does not exist.
// Requests to one site queue behind each other, gapMs apart, however many games ask at once.
function createPoliteFetch({fetchImpl = fetch, userAgent = 'PyroCade-Frontend', gapMs = 1000, timeoutMs = 20000, name = 'The artwork site'}) {
  let chain = Promise.resolve(), last = 0;
  return function get(url, {kind = 'text', signal} = {}) {
    const run = chain.then(async () => {
      const wait = last + gapMs - Date.now();
      if (wait > 0) await pause(wait, signal);
      if (signal?.aborted) throw abortError();
      try {
        const combined = signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
        const response = await fetchImpl(url, {headers: {'User-Agent': userAgent, Accept: kind === 'json' ? 'application/json' : 'text/plain, */*'}, signal: combined});
        if (response.status === 404 || response.status === 410) return null;
        if (response.status === 429 || response.status === 503) throw new Error(`${name} asked PyroCade to slow down (HTTP ${response.status}); try again later`);
        if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
        if (kind !== 'json') return await response.text();
        try { return await response.json(); } catch { throw new Error(`${name} sent an unreadable reply`); }
      } finally { last = Date.now(); }
    });
    chain = run.catch(() => {});
    return run;
  };
}

// A small JSON file of answers, each kept for maxAge. Writes are batched.
function createDiskCache(file, maxAge) {
  let data = null, timer = null;
  const load = () => {
    if (data) return data;
    try { const parsed = JSON.parse(fs.readFileSync(file, 'utf8')); data = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}; } catch { data = {}; }
    return data;
  };
  const save = () => {
    timer = null;
    try { fs.mkdirSync(path.dirname(file), {recursive: true}); fs.writeFileSync(file + '.tmp', JSON.stringify(data)); fs.renameSync(file + '.tmp', file); } catch {}
  };
  return {
    get(key) { const entry = Object.hasOwn(load(), key) ? data[key] : null; return entry && Date.now() - entry.at < maxAge ? entry.value : undefined; },
    set(key, value) { load()[key] = {at: Date.now(), value}; if (!timer) timer = setTimeout(save, 500); timer.unref?.(); },
    flush() { if (timer) { clearTimeout(timer); save(); } },
  };
}

// Releases whose box would be some other game's: demos, prototypes, hacks, unlicensed copies.
// Only the fallback sources skip these; they match on the title alone, which a hack shares with the original.
const UNTRUSTED = /\([^)]*\b(?:demo|beta|proto|prototype|sample|kiosk|hack|modification|unl|unlicensed|pirate|aftermarket|homebrew)\b[^)]*\)|\[h\d*[^\]]*\]/i;
const trustedRelease = base => !UNTRUSTED.test(String(base || ''));

// "Pokemon Black" and "Pokemon - Black Version" are the same game: the word "version" is dropped from both sides.
const withoutVersion = key => key.replace(/version/g, '');

// Region the tags in a name say it is from: 'us', 'eu', 'jp' or ''. Only (…) and […] groups count,
// so a title word like "E" or "J" is never read as a region.
function regionOf(text) {
  const s = (String(text || '').match(/[([][^)\]]*[)\]]/g) || []).join(' ');
  if (/\b(USA?|U|NTSC-U|Canada|North America)\b|-USA\b|\(UE?\)/i.test(s)) return 'us';
  if (/\b(Europe|EUR?|E|PAL|UK|UKV|NOE|FRA|ESP|Spain|Germany|France|Italy|Australia|World)\b/i.test(s)) return 'eu';
  if (/\b(Japan|JPN?|J)\b/i.test(s)) return 'jp';
  return '';
}

module.exports = {createPoliteFetch, createDiskCache, trustedRelease, withoutVersion, regionOf, pause};
