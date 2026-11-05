// PyroCade renderer: carousel, case viewer, emulator manager, settings.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Case sizes in px: width, height, depth (roughly real-world proportions).
const CASES = { dvd: [230, 323, 24], gc: [226, 318, 24], jewel: [250, 222, 17], bluray: [230, 289, 20], umd: [178, 300, 22], ds: [213, 233, 22],
  switch: [184, 296, 18], cartbox: [238, 221, 58], bigbox: [320, 228, 62], nesbox: [232, 318, 58] };

const S = { config: null, games: [], list: [], sel: 0, system: 'all', query: '', demo: false, emus: [], latest: {}, progress: {} };
let eShopStyle='enhanced';

const DEMO = [
  ['ps2', 'Neon Drift', 2003, 'Halcyon Works', 'Racing', '1-2', 'Tear through a rain-soaked megacity in tuned street machines. Master the drift, outrun the syndicate, and own the night.'],
  ['ps1', 'Crimson Blade', 1998, 'Kurogane', 'Action', '1', 'A wandering swordsman returns to a burning homeland. Fast, brutal combat with a parry system that rewards nerve.'],
  ['gba', 'Pixel Knights', 2002, 'Tiny Forge', 'RPG', '1', 'Gather a party of pint-sized heroes and crawl through 40 hand-drawn dungeons in this charming handheld quest.'],
  ['xbox', 'Shadow Protocol', 2004, 'Grey Owl', 'Stealth', '1', 'Infiltrate. Observe. Vanish. A tense spy thriller where every guard has a routine — and every routine has a gap.'],
  ['dreamcast', 'Sky Garden', 2000, 'Breeze', 'Adventure', '1', 'Glide between floating islands, restore lost gardens and uncover the secret of the sky-whales.'],
  ['nds', 'Lunar Lullaby', 2007, 'Moonlit', 'Puzzle', '1', 'Draw constellations with your stylus to guide a sleepy moon home before dawn.'],
  ['ps3', 'Abyssal Depths', 2011, 'Deepwater', 'Survival', '1', 'A research station at the bottom of the ocean has gone dark. Something down there is still listening.'],
  ['wiiu', 'Turbo Kart Heroes', 2014, 'Sparkplug', 'Racing', '1-4', 'Sixteen heroes, thirty-two tracks and an unhealthy amount of banana-flavoured rockets.'],
  ['psp', 'Echoes of Aether', 2008, 'Lantern', 'RPG', '1', 'An airship crew chases a melody that can rewrite the world. A sweeping pocket-sized epic.'],
  ['3ds', 'Mecha Frontier', 2015, 'Iron Lotus', 'Strategy', '1', 'Command squads of customisable mechs across a fractured frontier in tactical, turn-based battles.'],
  ['ps4', 'Starfall Odyssey', 2018, 'Northlight', 'Action RPG', '1', 'Chart a dying galaxy, forge alliances, and decide which stars are worth saving.'],
  ['gbc', 'Wildfire Rally', 2000, 'Ember', 'Racing', '1-2', 'Top-down rally racing across volcanoes, glaciers and the occasional haunted forest.'],
];

const sysOf = id => S.config.systems.find(s => s.id === id) || { id, name: id, caseType: 'dvd', media: 'disc', color: '#333' };
const toast = (m, ms = 3200) => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('on'), ms); };

function art(game) {
  const sys = sysOf(game.system);
  let [W, H, D] = Packaging.profiles[sys.id]?.size || CASES[sys.caseType] || CASES.dvd;
  // Real box art: shape the box to the scan so nothing is stretched.
  if (game._aspect) {
    const area = W * H, a = Math.max(.55, Math.min(1.6, game._aspect));
    W = Math.round(Math.sqrt(area * a)); H = Math.round(W / a);
  }
  const m = game.media;
  const digital=eShopStyle==='enhanced'&&game._eShop?game._eShop:null;
  const cart=Cartridges.profiles[sys.id];
  return {
    sys, W, H, D, digital,packshot:game._packshot,
    front: m.front || Art.front(game, sys, W, H),
    back: m.back || Art.back(game, sys, W, H),
    spine: m.spine || null,
    // No disc/cart scan? Use the real cover as the label, else generate one.
    disc: m.disc || m.front || (sys.media === 'cart' ? Art.cart(game, sys, cart?W*cart.w*cart.label[2]/100:W*.7, cart?W*cart.h*cart.label[3]/100:W*.55) : Art.disc(game, sys, 300)),
  };
}

// ---------- boot ----------
async function boot() {
  S.config = await api.getConfig();
  LibraryUI.init({getState:()=>S,select:setSystem});
  AudioUI.init(S.config.uiSound);
  Appearance.init({getState:()=>S,toast,refresh:()=>{for(const it of items.values()){const game=S.games.find(g=>g.id===it.dataset.id);if(game)fillItem(it,game)}if(S.list.length)layout();promptFamilyRendered='';renderPrompts()}});
  eShopStyle=S.config.eShopStyle==='original'?'original':'enhanced';
  promptPreference = validPromptPreference(S.config.promptFamily);
  applyMotion(S.config.motion || 'auto');
  renderPrompts();
  api.onToast(toast);
  api.onProgress(onProgress);
  ArtworkUI.init({getGames:()=>S.games,getSystems:()=>S.config.systems,getSelected:()=>S.list[S.sel],updateGame:updateArtwork});
  await loadLibrary();
  new ResizeObserver(resizeShelf).observe($('#info'));
  new ResizeObserver(() => { if (S.config && libraryActive()) layout(); }).observe($('#stage'));
  renderEmus();
  renderSettings();
  setInterval(() => ($('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), 1000);
  requestAnimationFrame(pollPad);
}

async function loadLibrary() {
  let games = [];
  $('#loading').classList.remove('hidden');
  try { games = await api.scan(); } catch (e) { toast('Scan failed: ' + e.message); }
  $('#loading').classList.add('hidden');
  S.demo = games.length === 0;
  if (S.demo) games = DEMO.map(([system, title, year, developer, genre, players, description]) => ({
    id: `${system}:demo-${title}`, system, title, romPath: null, demo: true, media: {},
    info: { year, developer, publisher: developer, genre, players, description },
  }));
  S.games = games;
  $('#demoBanner').classList.toggle('hidden', !S.demo);
  renderChips();
  setSystem(S.system);
}

// ---------- system chips ----------
function renderChips() {
  LibraryUI.render();
}
function setSystem(id) {
  const previousSystem=S.system;
  S.system = S.games.some(g => g.system === id) || S.config?.systems.some(s => s.id === id && s.romDir) ? id : 'all';
  if(previousSystem!==S.system)AudioUI.play('system');
  const keep = S.list[S.sel];
  const q = S.query.trim().toLowerCase();
  S.list = S.games.filter(g => (S.system === 'all' || g.system === S.system) && (!q || g.title.toLowerCase().includes(q)));
  LibraryUI.select();
  $('#carousel').innerHTML = ''; items.clear();
  const k = keep ? S.list.indexOf(keep) : -1;
  S.sel = k >= 0 ? k : Math.min(S.sel, Math.max(0, S.list.length - 1));
  $('#empty').textContent = q ? `No games match “${S.query}”.` : (() => { const s = S.config.systems.find(x => x.id === S.system);
      return s?.romDir ? `No games yet — add them to ${s.romDir}` : 'No games for this system yet.'; })();
  $('#empty').classList.toggle('hidden', S.list.length > 0);
  layout(); showInfo();
}
function cycleSystem(dir) {
  const ids = $$('#systems button').map(b => b.dataset.id);
  const i = (ids.indexOf(S.system) + dir + ids.length) % ids.length;
  S.sel = 0; setSystem(ids[i]);
}

// ---------- 3D carousel ----------
const items = new Map(); // list index -> element
let revealTimer, revealId = null, announceTimer;
function createMedia(game, a) {
  const cart = a.sys.media === 'cart';
  const media = el('div', `physical-media ${cart ? 'cartridge-model cartridge-' + a.sys.id : 'disc-model'}`);
  media.setAttribute('aria-hidden','true');
  if (cart) {
    const label=Cartridges.build(media,a.sys.id,a.W);label.style.backgroundImage = `url("${a.disc}")`;
    if(a.digital&&!game.media.disc)label.append(EshopCovers.sleeve(game,a.digital,true));
    else if(a.packshot&&!game.media.disc)EshopCovers.background(label,a.front,a.packshot);
  } else {
    const size = Math.min(a.W,a.H) * .94;
    media.style.cssText = `--mw:${size}px;--mh:${size}px`;
    const rotor = el('div','disc-rotor');
    const surface = el('div','disc-surface'); surface.style.backgroundImage = `url("${a.disc}")`;
    rotor.append(el('div','disc-metal'),surface,el('div','disc-hub'));
    media.append(rotor);
  }
  return media;
}

function resizeShelf() {
  $('#view-library').style.setProperty('--info-clearance', `${$('#info').offsetHeight + 114}px`);
}
function revealSelection() {
  clearTimeout(revealTimer);
  for (const [i,e] of items) if (i !== S.sel) e.classList.remove('media-revealed');
  const game = S.list[S.sel];
  revealId = game?.id || null;
  if (!game) return;
  const selected = items.get(S.sel);
  const reveal = () => { if (S.list[S.sel]?.id === game.id && selected?.isConnected) selected.classList.add('media-revealed'); };
  if (document.documentElement.dataset.motion === 'reduced') reveal();
  else revealTimer = setTimeout(reveal,420);
}

function buildBox(game, cls = '') {
  const a = art(game);
  const box = el('div', `box ${a.sys.caseType} ${cls}`);
  box.style.cssText = `--w:${a.W}px;--h:${a.H}px;--d:${a.D}px`;
  Packaging.decorate(box,a);
  const face = (c, img) => { const f = el('div', 'face ' + c); if (img) f.style.backgroundImage = `url("${img}")`; return f; };
  box.append(EshopCovers.face(game,a,'f-front'), face('f-back', a.back), Packaging.spine(game,a), face('f-right'), face('f-top'), face('f-bottom'));
  Packaging.finish(box,a);
  return { box, a };
}

function fillItem(it, game) {
  const { box, a } = buildBox(game);
  it.style.left = -a.W / 2 + 'px'; it.style.top = -a.H / 2 + 'px';
  it.dataset.displayScale = Math.min(1.5,323/a.H,300/a.W);
  it.style.setProperty('--w',a.W+'px'); it.style.setProperty('--h',a.H+'px'); it.style.setProperty('--d',a.D+'px');
  const sway = el('div', 'sway'); sway.append(createMedia(game,a),box);
  const reflection=el('div','ground-reflection');reflection.setAttribute('aria-hidden','true');reflection.append(EshopCovers.face(game,a,'reflection-cover'));sway.append(reflection);
  const sh = el('div', 'shadow'); sh.style.top = a.H + 'px';
  it.replaceChildren(sway, sh);
  if(Appearance.mode()==='swatches')it.append(Appearance.card(game,a));
}

function makeItem(i) {
  const game = S.list[i];
  const it = el('div', 'item far');
  it.dataset.id = game.id;
  it.id = `shelf-game-${i}`;
  it.setAttribute('role','option'); it.setAttribute('aria-label',`${game.title}, ${sysOf(game.system).name}`);
  fillItem(it, game);
  it.onclick = () => { if (S.list[S.sel] === game) openCase(); else select(S.list.indexOf(game)); };
  $('#carousel').append(it);
  ensureArt(game);
  return it;
}

// Measure real covers once, then rebuild the box at the right shape.
function measure(game) {
  if (!game.media.front || game._aspect || game._measuring) return;
  game._measuring = true;
  const img = new Image();
  const source=game.media.front;
  img.onload = async () => {
    if(game.media.front!==source)return;
    game._packshot=game.system==='switch2'?EshopCovers.packshot(img):null;
    game._aspect=img.naturalWidth/img.naturalHeight*(game._packshot?.w||1);
    game._eShop=['switch','switch2'].includes(game.system)?EshopCovers.analyze(img):null;
    if(game._eShop) {
      game._eShop.source=source;
      if(game.media.frontHQ) {
        try {
          const hq=new Image();hq.src=game.media.frontHQ;await hq.decode();
          const analysis=EshopCovers.analyze(hq);
          if(game.media.front!==source)return;
          if(analysis)game._eShop={...analysis,source:game.media.frontHQ};
        }catch{}
      } else if(img.naturalWidth<600&&!game._eShopHqTried) {
        game._eShopHqTried=true;
        api.fetchArt(game.system,game.base,{hq:true}).then(media=>{if(media)updateArtwork({gameId:game.id,media})}).catch(()=>{});
      }
    }
    game._measuring=false;refreshGame(game);
  };
  img.onerror = () => {if(game.media.front===source)game._measuring=false;};
  img.src = source;
}
function refreshGame(game) {
  const it = [...items.values()].find(e => e.dataset.id === game.id);
  if (it) { fillItem(it, game); layout(); }
  if (S.list[S.sel] === game) showInfo(true);
}
// Download box art + screenshot for games that have none (cached on disk afterwards).
function ensureArt(game) {
  measure(game);
  const sys=sysOf(game.system);
  if ((game.media.front && (game.media.screenshot || sys.artworkProvider==='gametdb-switch')) || game._artTried || game.demo || (!sys.libretro && sys.artworkProvider!=='gametdb-switch')) return;
  game._artTried = true;
  api.fetchArt(game.system, game.base).then(r => {
    if (!r) return;
    updateArtwork({gameId:game.id,media:r});
  }).catch(() => {});
}
function updateArtwork(result) {
  const game=S.games.find(g=>g.id===result.gameId);if(!game)return;
  const previous=game.media.front;
  const previousHQ=game.media.frontHQ;
  for(const [kind,url]of Object.entries(result.media))if(url&&(result.replace||!game.media[kind]))game.media[kind]=url;
  if(game.media.front!==previous||game.media.frontHQ!==previousHQ){delete game._aspect;delete game._measuring;delete game._eShop;delete game._packshot;}
  measure(game);refreshGame(game);
}

function layout() {
  const stage = $('#stage');
  const scale = Math.max(.35,Math.min(1.16,(stage.clientHeight - 66) / 350, (innerWidth - 240) / 900));
  const view=Appearance.geometry(stage,S.sel,S.list.length),lo=view.lo,hi=view.hi;
  for (const [i, e] of items) if (i < lo - 2 || i > hi + 2) { e.remove(); items.delete(i); }
  for (let i = Math.max(0, lo); i <= Math.min(S.list.length - 1, hi); i++) {
    let e = items.get(i);
    const fresh = !e;
    if (fresh) { e = makeItem(i); items.set(i, e); }
    const d = i - S.sel, a = Math.abs(d);
    const itemScale = scale * Number(e.dataset.displayScale || 1);
    const placement=Appearance.position(i,S.sel,scale,itemScale,stage,view),t=placement.transform;
    if(placement.width){e.style.width=placement.width+'px';e.style.height=placement.height+'px'}else{e.style.removeProperty('width');e.style.removeProperty('height')}
    if (fresh) { e.style.transition = 'none'; e.style.transform = t + ' translateY(40px)'; e.offsetWidth; e.style.transition = ''; }
    e.style.transform = t;
    e.style.zIndex = 100 - a;
    e.classList.toggle('sel', d === 0);
    e.classList.toggle('far', placement.hidden);
    e.setAttribute('aria-selected',String(d === 0));
    e.setAttribute('aria-hidden',String(placement.hidden));
  }
  $('#counter').textContent = S.list.length ? `${(S.sel + 1).toLocaleString()} / ${S.list.length.toLocaleString()}` : '';
  $('#shelfPosition').textContent = S.list.length ? `${String(S.sel+1).padStart(2,'0')} / ${S.list.length.toLocaleString()}` : '0 games';
  $('#shelfProgress').style.width = `${S.list.length ? (S.sel+1)/S.list.length*100 : 0}%`;
  $('#shelfPrev').disabled = !S.list.length || S.sel === 0;
  $('#shelfNext').disabled = !S.list.length || S.sel === S.list.length-1;
  $('#shelfLabel').textContent = (S.system === 'all' ? 'Your collection' : sysOf(S.system).name)+' / '+Appearance.layouts[Appearance.mode()].name;
  if (S.list.length) $('#carousel').setAttribute('aria-activedescendant',`shelf-game-${S.sel}`);
  else $('#carousel').removeAttribute('aria-activedescendant');
  if (!S.list.length) $('#mediaType').textContent = '';
  if (revealId !== (S.list[S.sel]?.id || null) || !items.get(S.sel)?.classList.contains('media-revealed')) revealSelection();
}

function select(i) {
  if (!S.list.length) return;
  const n = Math.max(0, Math.min(S.list.length - 1, i));
  if (n === S.sel) return;
  AudioUI.play('scroll',Math.sign(n-S.sel));
  S.sel = n; layout(); showInfo();
}

let bgFlip = false;
const REGIONS = { u: 'USA', us: 'USA', usa: 'USA', e: 'Europe', eu: 'Europe', europe: 'Europe', j: 'Japan', jp: 'Japan', japan: 'Japan', w: 'World', world: 'World', ue: 'USA / Europe' };
function regionOf(g) {
  const tags = [...(g.base || '').matchAll(/[\(\[]([^\)\]]+)[\)\]]/g)].map(m => m[1].trim());
  for (const t of tags) { const r = REGIONS[t.toLowerCase()] || (/^(usa|europe|japan|world)/i.test(t) && t.split(',')[0]); if (r) return r; }
  return null;
}
async function showInfo(quiet) {
  const g = S.list[S.sel];
  const info = $('#info');
  info.style.visibility = g ? '' : 'hidden';
  if (!g) return;
  const a = art(g);
  const format = a.sys.media === 'cart' ? 'Cartridge' : 'Disc';
  $('#gFormat').textContent = format;
  $('#mediaType').textContent = `${format} collection`;
  $('#gSystem').textContent = a.sys.name;
  $('#gTitle').textContent = g.title;
  const ext = !g.romPath ? null : /[\\/]exefs[\\/]main$/i.test(g.romPath) ? 'FOLDER DUMP' : g.romPath.split('.').pop().toUpperCase();
  $('#gMeta').innerHTML = [g.info.year, g.info.developer, g.info.genre, g.info.players && `${g.info.players} player${g.info.players === '1' ? '' : 's'}`, regionOf(g), ext]
    .filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('');
  if (quiet) {
    const shot = $('#gShot');
    if (g.media.screenshot || g.media.title) { shot.style.backgroundImage = `url("${g.media.screenshot || g.media.title}")`; shot.style.display = ''; }
    const bg=$(bgFlip ? '#bgB' : '#bgA');setGameBackground(bg,g,a);
    const tint = await Art.tint(a.digital?.source||a.front,a.digital?.crop||a.packshot);
    if (S.list[S.sel] === g) document.documentElement.style.setProperty('--tint', tint);
    return;
  }
  $('#gDesc').textContent = g.info.description || '';
  $('#gDesc').classList.toggle('hidden',!g.info.description);
  $('#btnManual').disabled = !g.media.manual;
  const shot = $('#gShot');
  shot.innerHTML = ''; shot.style.backgroundImage = g.media.screenshot || g.media.title ? `url("${g.media.screenshot || g.media.title}")` : '';
  if (g.media.video) { const v = el('video'); Object.assign(v, { src: g.media.video, muted: true, autoplay: true, loop: true }); shot.append(v); }
  shot.style.display = g.media.screenshot || g.media.title || g.media.video ? '' : 'none';
  info.classList.remove('swap'); info.offsetWidth; info.classList.add('swap');
  resizeShelf();
  clearTimeout(announceTimer);
  announceTimer = setTimeout(() => { if (S.list[S.sel] === g) $('#selectionStatus').textContent = `${g.title}, ${a.sys.name}, ${format}, ${S.sel+1} of ${S.list.length}`; },450);

  // ambient background crossfade
  const [on, off] = bgFlip ? [$('#bgA'), $('#bgB')] : [$('#bgB'), $('#bgA')];
  bgFlip = !bgFlip;
  setGameBackground(on,g,a);on.classList.add('on'); off.classList.remove('on');
  const tint = await Art.tint(a.digital?.source||a.front,a.digital?.crop||a.packshot);
  if (S.list[S.sel] === g) document.documentElement.style.setProperty('--tint', tint);
}
function setGameBackground(layer,game,a) {
  if(a.digital&&!game.media.fanart&&!game.media.screenshot)EshopCovers.background(layer,a.digital.source,a.digital.crop);
  else if(a.packshot&&!game.media.fanart&&!game.media.screenshot)EshopCovers.background(layer,a.front,a.packshot);
  else {layer.style.backgroundImage=`url("${game.media.fanart||game.media.screenshot||a.front}")`;layer.style.backgroundSize='cover';layer.style.backgroundPosition='center';}
}

// ---------- actions ----------
async function play(g = S.list[S.sel]) {
  if (!g) return;
  if (g.demo) return toast('This is a demo game — add your ROM folders in Settings to play for real.');
  try { await api.launch(g.id, g.romPath);AudioUI.play('launch'); toast(`Launching ${g.title}…`); }
  catch (e) {AudioUI.play('error');toast(e.message, 5000); }
}
function manual(g = S.list[S.sel]) {
  if (g?.media.manual) api.openManual(g.media.manual);
  else toast('No manual found. Put a manual.pdf in this game’s artwork folder.');
}

// ---------- case viewer ----------
const CV = { open: false, rx: 8, ry: 32, tx: 0, z: 0, game: null, anim: null, token:0, timer:null };
function rig() {
  $('#caseRig').style.transform = `translateX(${CV.tx}px) translateZ(${CV.z}px) rotateX(${CV.rx}deg) rotateY(${CV.ry}deg)`;
  const c=$('#caseRig .case');
  if(c)c.style.setProperty('--light-x',(30+Math.sin(CV.ry*Math.PI/180)*35)+'%');
}
function tween(to, ms = 900) {
  cancelAnimationFrame(CV.anim);
  if (document.documentElement.dataset.motion === 'reduced') { Object.assign(CV,to); rig(); return; }
  const from = { rx: CV.rx, ry: CV.ry, tx: CV.tx, z: CV.z }, t0 = performance.now();
  const step = now => {
    const k = Math.min(1, (now - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    for (const key in to) CV[key] = from[key] + (to[key] - from[key]) * e;
    rig(); if (k < 1) CV.anim = requestAnimationFrame(step);
  };
  CV.anim = requestAnimationFrame(step);
}

async function openCase() {
  const g = S.list[S.sel]; if (!g) return;
  AudioUI.play('open');
  clearTimeout(CV.timer);
  const token = ++CV.token;
  cancelAnimationFrame(CV.anim);
  CV.returnFocus = document.activeElement;
  CV.game = g;
  const a = art(g);
  const r = $('#caseRig'); r.innerHTML = '';
  const c = el('div', `case box ${a.sys.caseType}`);
  const cardboard=Packaging.profile(a.sys).material==='cardboard';
  c.style.cssText = `--w:${a.W}px;--h:${a.H}px;--d:${a.D}px;left:${-a.W / 2}px;top:${-a.H / 2}px`;
  Packaging.decorate(c,a);
  const face = (cl, img) => { const f = el('div', 'face ' + cl); if (img) f.style.backgroundImage = `url("${img}")`; return f; };
  c.append(face('f-back', a.back), Packaging.spine(g,a), face('f-right'), face('f-top'), face('f-bottom'), el('div', 'face tray'));
  if(cardboard){c.querySelector('.f-top').remove();c.append(EshopCovers.face(g,a,'f-front'));}

  c.append(createMedia(g,a));
  const man = el('div', 'manual'), page = el('div', 'page');
  page.style.backgroundImage = `url("${await Art.manual(g, a.sys, a.front, a.W, a.H)}")`;
  if (CV.token !== token) return;
  if(a.digital||a.packshot) {
    page.style.backgroundImage='none';page.classList.add('manual-custom-cover');
    const cover=a.digital?EshopCovers.sleeve(g,a.digital):el('div','manual-packshot');
    if(a.packshot)EshopCovers.background(cover,a.front,a.packshot);
    cover.style.inset='5% 6% 14%';cover.style.setProperty('--w',a.W*.92*.88+'px');page.append(cover);
    page.append(el('div','manual-cover-caption','Instruction booklet'));
  }
  man.append(page, el('div', 'tag', g.media.manual ? 'Click to read the manual' : 'No manual file found'));
  man.onclick = e => { e.stopPropagation(); if (c.classList.contains('open')) manual(g); };
  c.append(man);

  const lid = el('div', 'lid');
  if(cardboard){const flap=face('l-front');flap.append(el('div','box-flap-title',esc(g.title)));lid.append(flap,face('l-inner'));}
  else lid.append(EshopCovers.face(g,a,'l-front'), face('l-inner'));
  c.append(lid);
  Packaging.finish(c,a);
  r.append(c);

  $('#cvSystem').textContent = a.sys.name; $('#cvTitle').textContent = g.title;
  $('#caseView').classList.remove('hidden');
  $('#view-library').inert = true; $('header').inert = true;
  $('#caseView').setAttribute('role','dialog'); $('#caseView').setAttribute('aria-modal','true'); $('#caseView').setAttribute('aria-labelledby','cvTitle');
  $('#cvBack').focus({preventScroll:true});
  Object.assign(CV, { rx: 14, ry: 48, tx: 0, z: -400, open: false }); rig();
  tween({ rx: 6, ry: 18, z: 0 }, 800);
  renderPrompts();
  CV.timer = setTimeout(() => { if (CV.token === token) setOpen(true); },document.documentElement.dataset.motion === 'reduced' ? 0 : 650);
}
function setOpen(v) {
  const c = $('#caseRig .case'); if (!c) return;
  if(CV.open!==v)AudioUI.play(v?'open':'back');
  CV.open = v; c.classList.toggle('open', v);
  renderPrompts();
  const W = c.offsetWidth;
  tween(v ? { rx: 4, ry: 0, tx: -W * .2, z: -60 } : { rx: 6, ry: 18, tx: 0, z: 0 }, 1200);
}
function closeCase() {
  if(caseShown())AudioUI.play('back');
  ++CV.token; clearTimeout(CV.timer); cancelAnimationFrame(CV.anim);
  $('#caseView').classList.add('hidden'); $('#caseRig').innerHTML = ''; CV.game = null;
  $('#view-library').inert = false; $('header').inert = false;
  CV.returnFocus?.focus({preventScroll:true});
}
const caseShown = () => !$('#caseView').classList.contains('hidden');

(() => {
  const scene = $('#caseScene'); let drag = null;
  scene.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY, rx: CV.rx, ry: CV.ry }; cancelAnimationFrame(CV.anim); scene.setPointerCapture(e.pointerId); });
  scene.addEventListener('pointermove', e => { if (!drag) return; CV.ry = drag.ry + (e.clientX - drag.x) * .35; CV.rx = Math.max(-60, Math.min(60, drag.rx - (e.clientY - drag.y) * .25)); rig(); });
  scene.addEventListener('pointerup', () => (drag = null));
  scene.addEventListener('wheel', e => { CV.z = Math.max(-700, Math.min(450, CV.z - e.deltaY * .6)); rig(); }, { passive: true });
})();

// ---------- emulators ----------
async function renderEmus() {
  try { S.emus = await api.emuList(); } catch (e) { return toast(e.message); }
  const grid = $('#emuGrid'); grid.innerHTML = '';
  const sysNames = id => S.config.systems.find(s => s.id === id)?.name || id;
  for (const e of S.emus) {
    const L = S.latest[e.id], P = S.progress[e.id];
    const upd = L && !L.error && L.updateAvailable && e.installed;
    const state = e.installed ? (upd ? ['up', 'UPDATE'] : ['ok', 'INSTALLED']) : e.exe ? ['ok', 'LINKED'] : ['no', 'NOT INSTALLED'];
    const card = el('div', 'emu', `
      <h3>${esc(e.name)} <span class="tag ${state[0]}">${state[1]}</span></h3>
      <div class="sys">${e.systems.map(s => `<span>${esc(sysNames(s))}</span>`).join('')}</div>
      ${e.installed ? `<div class="line">Installed: <b>${esc(e.installed.name)}</b> · ${new Date(e.installed.date).toLocaleDateString()}</div>` : ''}
      ${e.exe && !e.installed ? `<div class="line">Program: <b>${esc(e.exe)}</b></div>` : ''}
      ${L ? (L.error ? `<div class="line" style="color:#ff8a8a">${esc(L.error)}</div>` :
        `<div class="line">Latest: <b>${esc(L.latest.releaseName)}</b> · ${(L.latest.size / 1048576).toFixed(0)} MB${e.prerelease ? ' · dev build' : ''}</div>`) :
        e.managed ? `<div class="line">From <b>github.com/${esc(e.repo)}</b>${e.prerelease ? ' (dev builds)' : ''}</div>` : ''}
      ${P && !P.done ? `<div class="bar"><i style="width:${(P.pct * 100).toFixed(1)}%"></i></div><div class="stage">${esc(P.stage)}${P.total ? ` — ${(P.got / 1048576).toFixed(1)} / ${(P.total / 1048576).toFixed(1)} MB` : ''}</div>` : ''}
      <div class="actions"></div>`);
    const act = card.querySelector('.actions');
    const btn = (label, fn, cls = '') => { const b = el('button', cls, label); b.onclick = fn; b.disabled = !!(P && !P.done); act.append(b); };
    if (e.managed) {
      if (!e.installed) btn('⬇ Install', () => install(e.id), 'primary');
      else if (upd) btn(`⬆ Update`, () => install(e.id), 'primary');
      else btn('Check for update', () => check(e.id));
    }
    if (e.exe) btn('Open folder', () => api.emuOpenFolder(e.id));
    btn(e.exe && !e.installed ? 'Change .exe…' : 'Use existing .exe…', async () => { if (await api.emuPickExe(e.id)) renderEmus(); });
    if (e.installed) btn('Uninstall', async () => { if (confirm(`Remove ${e.name} and its files from PyroCade’s emulators folder?`)) { await api.emuUninstall(e.id); delete S.latest[e.id]; renderEmus(); } });
    grid.append(card);
  }
}
async function check(id) {
  try { S.latest[id] = await api.emuCheck(id); } catch (e) { S.latest[id] = { error: e.message }; }
  renderEmus();
}
async function install(id) {
  S.progress[id] = { pct: 0, stage: 'Starting…' }; renderEmus();
  try { await api.emuInstall(id); const e = S.emus.find(x => x.id === id); toast(`${e?.name || id} is ready.`); S.latest[id] = { ...(S.latest[id] || {}), updateAvailable: false }; }
  catch (e) { toast(e.message, 6000); }
  delete S.progress[id]; renderEmus();
}
let progressRender = 0;
function onProgress(p) {
  S.progress[p.id] = p;
  if (Date.now() - progressRender > 150 || p.done) { progressRender = Date.now(); renderEmus(); }
}
$('#btnCheckAll').onclick = async () => {
  const b = $('#btnCheckAll'); b.disabled = true; b.textContent = 'Checking…';
  for (const e of S.emus.filter(e => e.managed)) await check(e.id);
  b.disabled = false; b.textContent = 'Check all for updates';
  const n = S.emus.filter(e => S.latest[e.id]?.updateAvailable && e.installed).length;
  toast(n ? `${n} update${n > 1 ? 's' : ''} available` : 'Everything installed is up to date');
};
$('#btnAddCustom').onclick = () => $('#customForm').classList.toggle('hidden');
$('#customCancel').onclick = () => $('#customForm').classList.add('hidden');
$('#customForm').onsubmit = async ev => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const r = await api.emuAddCustom({ name: f.get('name'), args: f.get('args'), systems: String(f.get('systems')).split(',').map(s => s.trim()).filter(Boolean) });
  if (r) { ev.target.reset(); ev.target.classList.add('hidden'); S.config = await api.getConfig(); renderEmus(); renderSettings(); }
};

// ---------- settings ----------
function renderSettings() {
  const c = S.config;
  $('#sPrompts').value = promptPreference;
  $('#sMotion').value = motionPreference;
  $('#sEshop').value = eShopStyle;
  $('#sMedia').value = c.mediaRoot || '';
  $('#sHide').checked = !!c.hideWhilePlaying;
  const body = $('#sysTable tbody'); body.innerHTML = '';
  const emuOpts = sel => [...(S.emus.length ? S.emus : [])].map(e => `<option value="${e.id}" ${e.id === sel ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  c.systems.forEach((s, i) => {
    const tr = el('tr', '', `
      <td class="name"><i style="background:${s.color}"></i>${esc(s.name)}</td>
      <td><input data-k="romDir" value="${esc(s.romDir)}" placeholder="Not set" id="rom${i}"/></td>
      <td><button data-browse="rom${i}">Browse…</button></td>
      <td><select data-k="emulator">${emuOpts(s.emulator)}</select></td>
      <td><input data-k="extensions" value="${esc(s.extensions.join(' '))}"/></td>
      <td><input data-k="args" value="${esc(s.args || '')}" placeholder="emulator default"/></td>`);
    tr.dataset.i = i; body.append(tr);
  });
}
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-browse]');
  if (b) { const p = await api.pickFolder('Choose folder'); if (p) $('#' + b.dataset.browse).value = p; }
  const g = e.target.closest('[data-goto]');
  if (g) { e.preventDefault(); showView(g.dataset.goto); }
});
$('#btnSave').onclick = async () => {
  const c = structuredClone(S.config);
  c.mediaRoot = $('#sMedia').value.trim();
  c.hideWhilePlaying = $('#sHide').checked;
  c.promptFamily = promptPreference;
  c.motion = motionPreference;
  c.eShopStyle = eShopStyle;
  $$('#sysTable tbody tr').forEach(tr => {
    const s = c.systems[tr.dataset.i];
    tr.querySelectorAll('[data-k]').forEach(inp => {
      const v = inp.value.trim();
      if (inp.dataset.k === 'extensions') s.extensions = v.split(/[\s,]+/).filter(Boolean).map(x => (x.startsWith('.') ? x : '.' + x).toLowerCase());
      else if (inp.dataset.k === 'args') { if (v) s.args = v; else delete s.args; }
      else s[inp.dataset.k] = v;
    });
  });
  S.config = await api.setConfig(c);
  await loadLibrary();
  toast(S.demo ? 'Saved — no games found yet in those folders.' : `Saved — ${S.games.length} games loaded.`);
  showView('library');
};

// ---------- views & input ----------
function showView(v) {
  if(!$('#view-'+v)?.classList.contains('active'))AudioUI.play('confirm');
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $$('#tabs button').forEach(b=>{if(b.dataset.view===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  $$('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  if (v === 'emus') renderEmus();
  if (v === 'settings') renderSettings();
  if (v === 'artwork') ArtworkUI.open('system');
  if (v === 'library') { resizeShelf(); layout(); }
}
$$('#tabs button').forEach(b => (b.onclick = () => showView(b.dataset.view)));
$('#btnPlay').onclick = () => play();
$('#btnCase').onclick = openCase;
$('#btnManual').onclick = () => manual();
$('#btnArtwork').onclick = () => {showView('artwork');ArtworkUI.open('game');};
$('#cvPlay').onclick = () => play(CV.game);
$('#cvBack').onclick = closeCase;
$('#cvToggle').onclick = () => setOpen(!CV.open);
$('#cvFlip').onclick = () => tween({ ry: CV.ry + 180 }, 900);
$('#shelfPrev').onclick = () => select(S.sel-1);
$('#shelfNext').onclick = () => select(S.sel+1);
let surfaceLightFrame=null;
$('#stage').addEventListener('pointermove',e=>{
  if(surfaceLightFrame!==null||document.documentElement.dataset.motion==='reduced')return;
  const box=document.querySelector('.item.sel .box');if(!box)return;
  const x=e.clientX,y=e.clientY;
  surfaceLightFrame=requestAnimationFrame(()=>{
    surfaceLightFrame=null;if(!box.isConnected)return;
    const r=box.getBoundingClientRect();
    box.style.setProperty('--light-x',Math.max(0,Math.min(100,100*(x-r.left)/r.width))+'%');
    box.style.setProperty('--light-y',Math.max(0,Math.min(100,100*(y-r.top)/r.height))+'%');
  });
});
$('#stage').addEventListener('pointerleave',()=>{
  cancelAnimationFrame(surfaceLightFrame);surfaceLightFrame=null;
  const box=document.querySelector('.item.sel .box');box?.style.removeProperty('--light-x');box?.style.removeProperty('--light-y');
});
let wheelAt = 0;
$('#stage').addEventListener('wheel', e => {
  const delta = Math.abs(e.deltaX)>Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
  if (Math.abs(delta)>12 && performance.now()-wheelAt>170) { const step=Appearance.mode()==='swatches'?Appearance.geometry($('#stage'),S.sel,S.list.length).columns:1;select(S.sel+Math.sign(delta)*step); wheelAt=performance.now(); }
}, { passive: true });

const libraryActive = () => $('#view-library').classList.contains('active');
function input(action) {
  if(Appearance.panelOpen()){Appearance.controller(action);return;}
  if(LibraryUI.pickerOpen()){LibraryUI.controller(action);return;}
  if(action==='systems'&&libraryActive()&&!caseShown()){LibraryUI.openPicker();return;}
  if (caseShown()) {
    if (action === 'back') closeCase();
    else if (action === 'case') setOpen(!CV.open);
    else if (action === 'play') play(CV.game);
    else if (action === 'manual') manual(CV.game);
    else if (action === 'left') tween({ ry: CV.ry - 45 }, 500);
    else if (action === 'right') tween({ ry: CV.ry + 45 }, 500);
    else if (action === 'pgup') tween({ z: Math.max(-700, CV.z - 80) }, 180);
    else if (action === 'pgdn') tween({ z: Math.min(450, CV.z + 80) }, 180);
    return;
  }
  if (!libraryActive()) return;
  if(action==='sysprev'||action==='sysnext'){cycleSystem(action==='sysprev'?-1:1);return;}
  if(['up','down'].includes(action)&&['vertical','swatches'].includes(Appearance.mode())){const delta=Appearance.mode()==='swatches'?Appearance.geometry($('#stage'),S.sel,S.list.length).columns:1;select(S.sel+(action==='up'?-delta:delta));return;}
  ({ left: () => select(S.sel - 1), right: () => select(S.sel + 1), up: () => cycleSystem(-1), down: () => cycleSystem(1),
     play: () => play(), case: openCase, manual: () => manual(), pgup: () => select(S.sel - 10), pgdn: () => select(S.sel + 10) }[action] || (() => {}))();
}
// Search: start typing anywhere in the library to filter.
let searchT;
$('#search').addEventListener('input', e => {
  clearTimeout(searchT);
  searchT = setTimeout(() => { S.query = e.target.value; S.sel = 0; setSystem(S.system); }, 140);
});
$('#search').addEventListener('keydown', e => {
  if (e.key === 'Escape') { e.target.value = ''; S.query = ''; setSystem(S.system); e.target.blur(); }
  else if (e.key === 'Enter' || e.key === 'ArrowDown') { e.preventDefault(); e.target.blur(); }
  e.stopPropagation();
});
document.addEventListener('keydown', e => {
  usePromptInput('keyboard');
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&libraryActive()&&!caseShown()){e.preventDefault();LibraryUI.openPicker();return;}
  if(LibraryUI.pickerOpen()||Appearance.panelOpen())return;
  if(e.key==='/'&&libraryActive()&&!caseShown()&&!e.target.matches?.('input,select,textarea')){e.preventDefault();$('#search').focus();return;}
  if (caseShown() && e.key === 'Tab') {
    const focusable = $$('#caseView button:not(:disabled)');
    const first=focusable[0],last=focusable[focusable.length-1];
    if (e.shiftKey && document.activeElement===first) {e.preventDefault();last.focus();}
    else if (!e.shiftKey && document.activeElement===last) {e.preventDefault();first.focus();}
    return;
  }
  if (e.target.matches?.('input, select, textarea')) return;
  if (e.target.matches?.('button,a') && (e.key === 'Enter' || e.key === ' ')) return;
  if (libraryActive() && !caseShown() && e.key.length === 1 && e.key !== ' ' && !e.ctrlKey && !e.altKey && !(e.key.toLowerCase() === 'm' && !$('#search').value)) {
    $('#search').focus(); return; // the key lands in the search box
  }
  const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'play', ' ': 'case', Escape: 'back', m: 'manual', M: 'manual', PageUp: 'pgup', PageDown: 'pgdn' };
  if (map[e.key]) { e.preventDefault(); input(caseShown() && e.key === ' ' ? 'back' : map[e.key]); }
});

// Prompts switch only when input is used, so an idle connected pad never steals them.
const validPromptPreference = value => ['auto','keyboard',...Prompts.families].includes(value) ? value : 'auto';
let promptPreference = 'auto', promptInput = 'keyboard', promptFamilyRendered = '';
function usePromptInput(family) {
  if (promptInput === family) return;
  promptInput = family; renderPrompts();
}
function renderPrompts() {
  const family = promptPreference === 'auto' ? promptInput : promptPreference;
  if (family !== promptFamilyRendered) {
    $('#libraryHints').innerHTML = Prompts.library(family,Appearance.mode());
    $('#caseHints').innerHTML = Prompts.caseHints(family);
    promptFamilyRendered = family;
  }
  const key = family === 'keyboard';
  $('#inputBadge').textContent = Prompts.labels[family];
  const vertical=Appearance.mode()==='vertical';
  $('#shelfPrev').innerHTML = Prompts.icon(key ? 'keyboard' : family,key ? (vertical?'up':'left'):(vertical?'dpad-up':'dpad-left'));
  $('#shelfNext').innerHTML = Prompts.icon(key ? 'keyboard' : family,key ? (vertical?'down':'right'):(vertical?'dpad-down':'dpad-right'));
  for (const [id, icon, label] of [
    ['btnPlay',key ? 'enter':'south','Play'],['btnCase',key ? 'space':'north','Open case'],
    ['btnManual',key ? 'm':'west','Manual'],['cvPlay',key ? 'enter':'south','Play'],
    ['cvBack',key ? 'escape':'east','Back'],['cvToggle',key ? null:'north',CV.open ? 'Close case':'Open case']
  ]) $('#' + id).innerHTML = (icon ? Prompts.icon(family,icon) : '') + label;
  $('#promptStatus').textContent = `Showing ${Prompts.labels[family]} prompts${pad.name ? ` · ${pad.name}` : ' · No controller connected'}`;
}
$('#sPrompts').addEventListener('change', e => {
  promptPreference = validPromptPreference(e.target.value); renderPrompts();
});
document.addEventListener('pointerdown', () => usePromptInput('keyboard'));
document.addEventListener('wheel', () => usePromptInput('keyboard'), {passive:true});

const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let motionPreference = 'auto';
function applyMotion(value) {
  motionPreference = ['auto','full','reduced'].includes(value) ? value : 'auto';
  document.documentElement.dataset.motion = motionPreference === 'reduced' || (motionPreference === 'auto' && motionQuery.matches) ? 'reduced' : 'full';
  if (S.config) revealSelection();
}
motionQuery.addEventListener('change',() => applyMotion(motionPreference));
$('#sMotion').addEventListener('change',e => applyMotion(e.target.value));
$('#sEshop').addEventListener('change',e=>{
  eShopStyle=e.target.value==='original'?'original':'enhanced';
  for(const item of items.values()){const game=S.games.find(g=>g.id===item.dataset.id);if(game)fillItem(item,game);}
  layout();if(S.list.length)showInfo(true);
});

// Standard Gamepad positions: south=play, east=back, west=manual, north=case.
const pad = { held: {}, next: {}, index: null, name: '' };
function pollPad(now) {
  const pads = [...(navigator.getGamepads?.() || [])].filter(Boolean);
  const active = gp => gp.buttons.some(b => b.pressed) || Math.abs(gp.axes[0] || 0) > .5 || Math.abs(gp.axes[1] || 0) > .6;
  const gp = pads.find(g => g.index === pad.index && active(g)) || pads.find(active) || pads.find(g => g.index === pad.index) || pads[0];
  if ((gp?.index ?? null) !== pad.index || (gp?.id || '') !== pad.name) {
    pad.held = {}; pad.next = {}; pad.index = gp?.index ?? null; pad.name = gp?.id || '';
    if (!gp || !active(gp)) promptInput = 'keyboard';
    renderPrompts();
  }
  if (gp && active(gp)) usePromptInput(Prompts.detect(gp.id));
  if (gp) {
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, b = i => gp.buttons[i]?.pressed;
    const st = { left: b(14) || ax < -.5, right: b(15) || ax > .5, up: b(12) || ay < -.6, down: b(13) || ay > .6,sysprev:b(4),sysnext:b(5),
      play: b(0), back: b(1), manual: b(2), case: b(3), pgup: b(6), pgdn: b(7),systems:b(9) };
    for (const [k, v] of Object.entries(st)) {
      const repeat = ['left', 'right'].includes(k)||(['up','down'].includes(k)&&(LibraryUI.pickerOpen()||Appearance.panelOpen()||['vertical','swatches'].includes(Appearance.mode())));
      if (v && (!pad.held[k] || (repeat && now > pad.next[k]))) { input(k); pad.next[k] = now + (pad.held[k] ? 90 : 380); }
      pad.held[k] = v;
    }
  }
  requestAnimationFrame(pollPad);
}

boot();
