// Super Mario Wiki (mariowiki.com): box art for Mario, Yoshi, Wario, Donkey Kong and Smash Bros. games.
// The wiki's robots.txt shuts out /api.php but explicitly allows raw page text (?action=raw), one
// request a second, so that is all PyroCade reads: the game's page for its infobox picture, then that
// picture's own page, which must be filed under "<this system> game covers". Images live on mario.wiki.gallery.
const path = require('node:path');
const {createHash} = require('node:crypto');
const {createPoliteFetch, createDiskCache, trustedRelease} = require('./web-source');

// PyroCade system id -> the wiki's names for it, as used in "Category:<name> game covers".
const SYSTEMS = {
  nes:['Nintendo Entertainment System','Family Computer'], snes:['Super Nintendo Entertainment System','Super Famicom'],
  n64:['Nintendo 64'], gc:['Nintendo GameCube'], wii:['Wii'], wiiu:['Wii U'], switch:['Nintendo Switch'], switch2:['Nintendo Switch 2'],
  gb:['Game Boy'], gbc:['Game Boy Color'], gba:['Game Boy Advance'], nds:['Nintendo DS'], '3ds':['Nintendo 3DS'],
};
// Only games the wiki covers are looked up, so the rest of a library costs it nothing.
const FRANCHISE = /\b(mario|luigi|yoshi|wario|waluigi|peach|bowser|toad|donkey kong|diddy kong|smash bros|game & watch|nes remix|wrecking crew|picross)/i;
// File names that are some other picture of the game, even when filed as a cover.
const NOT_FRONT = /\b(back|rear|spine|side|cart|cartridge|disc|label|manual|logo|screenshot|sticker|card|insert)\b/i;
const MAX_AGE = 30 * 864e5, VERSION = 1;

// "Mario & Luigi - Partners in Time (Europe) (En,Fr)" -> ["Mario & Luigi - Partners in Time", "Mario & Luigi: Partners in Time"]
function pageNames(title) {
  const t = String(title || '').replace(/\s*\([^)]*\)|\s*\[[^\]]*\]|\s*\{[^}]*\}/g, '').replace(/\bv?\d+(?:\.\d+)+\b/gi, '').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  return [...new Set([t, t.replace(/ - /, ': '), t.replace(/ - /g, ': ')])].slice(0, 3);
}
// MediaWiki stores "File:Some name.png" at /images/<md5[0]>/<md5[0..1]>/Some_name.png.
function imageUrl(file, host) {
  const name = file.trim().replace(/ /g, '_').replace(/^./, c => c.toUpperCase());
  const hash = createHash('md5').update(name).digest('hex');
  return `${host}/images/${hash[0]}/${hash.slice(0, 2)}/${encodeURIComponent(name)}`;
}
const pageUrl = (wiki, name) => `${wiki}/${encodeURIComponent(name.replace(/ /g, '_')).replace(/%2F/g, '/')}?action=raw`;

// The infobox pictures of a game page, or null when the page is not a game.
function infoboxImages(text) {
  if (!/\{\{\s*game infobox/i.test(text)) return null;
  const line = text.match(/^\|\s*image\s*=(.*)$/mi)?.[1] || '';
  return [...line.matchAll(/\[\[\s*File\s*:\s*([^|\]]+)/gi)].map(m => m[1].trim()).slice(0, 3);
}
// A file page that shows the front of this system's box.
function isFrontCover(file, text, sysId) {
  if (NOT_FRONT.test(file.replace(/\.[a-z0-9]+$/i, '').replace(/[_-]/g, ' '))) return false;
  if (/\bback (cover|box|of the box)\b/i.test(text)) return false;
  const categories = [...text.matchAll(/\[\[\s*Category\s*:\s*([^\]|]+?)\s*game covers\s*[\]|]/gi)].map(m => m[1].trim().toLowerCase());
  return (SYSTEMS[sysId] || []).some(name => categories.includes(name.toLowerCase()));
}

function createMarioWiki({dataDir, fetchImpl = fetch, userAgent, gapMs = 1000, wiki = 'https://www.mariowiki.com', images = 'https://mario.wiki.gallery'}) {
  const get = createPoliteFetch({fetchImpl, userAgent, gapMs, name: 'Super Mario Wiki'});
  const cache = createDiskCache(path.join(dataDir, 'media', '_index', 'mariowiki.json'), MAX_AGE);
  const pending = new Map();
  async function page(name, signal) {
    let text = await get(pageUrl(wiki, name), {signal});
    const target = text?.match(/^\s*#REDIRECT\s*\[\[([^\]|#]+)/i)?.[1];
    if (target) text = await get(pageUrl(wiki, target.trim()), {signal});
    return text;
  }
  async function lookup(game, sysId, signal) {
    for (const name of pageNames(game.title || game.base)) {
      const text = await page(name, signal);
      const files = text ? infoboxImages(text) : null;
      if (!files) continue;
      for (const file of files) {
        const fileText = await get(pageUrl(wiki, 'File:' + file), {signal});
        if (fileText && isFrontCover(file, fileText, sysId)) return [imageUrl(file, images)];
      }
      return []; // the game's own page exists but has no cover for this system
    }
    return [];
  }
  const covers = sysId => Object.hasOwn(SYSTEMS, sysId);
  // Box art URLs for one game, best first; empty when the wiki has none for this system.
  async function find(game, sysId, {signal, refresh = false} = {}) {
    if (!covers(sysId) || !trustedRelease(game.base) || !FRANCHISE.test(game.title || game.base)) return [];
    const key = `v${VERSION}/${sysId}/${pageNames(game.title || game.base)[0] || ''}`;
    const cached = refresh ? undefined : cache.get(key);
    if (cached) return cached;
    if (!pending.has(key)) {
      const task = lookup(game, sysId, signal).then(urls => { cache.set(key, urls); return urls; });
      pending.set(key, task);
      task.finally(() => pending.delete(key)).catch(() => {});
    }
    return pending.get(key);
  }
  return {find, covers, flush: () => cache.flush()};
}

module.exports = {createMarioWiki, pageNames, imageUrl, infoboxImages, isFrontCover, SYSTEMS};
