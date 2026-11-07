// PyroCade renderer: carousel, case viewer, emulator manager, settings.
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const el = (tag, cls, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; };
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Case sizes in px: width, height, depth (roughly real-world proportions).
const CASES = { dvd: [230, 323, 24], gc: [226, 318, 24], jewel: [250, 222, 17], bluray: [230, 289, 20], umd: [178, 300, 22], ds: [213, 233, 22],
  switch: [184, 296, 18], cartbox: [238, 221, 58], bigbox: [320, 228, 62], nesbox: [232, 318, 58] };

const S = { orders: {}, config: null, games: [], list: [], sel: 0, system: 'all', query: '', sort: 'title', filter: '', demo: false, emus: [], latest: {}, progress: {}, running: new Set(), pendingGame: null };
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

function physicalSystem(game) {
  const sys=sysOf(game.system);if(!game.mediaType)return sys;
  if(game.mediaType==='disc')return {...sys,id:'physical-disc',media:'disc',caseType:'dvd'};
  const profiles={switch:'switch',switch2:'switch',gba:'cartbox',n64:'bigbox',nds:'ds'};
  return {...sys,id:game.mediaType,media:'cart',caseType:profiles[game.mediaType]||sys.caseType};
}
function art(game) {
  const sys = physicalSystem(game);
  let [W, H, D] = Packaging.profiles[sys.id]?.size || CASES[sys.caseType] || CASES.dvd;
  // Recognised systems retain their physical case proportions regardless of scan margins.
  if (game._aspect && !Packaging.profiles[sys.id]) {
    const area = W * H, a = Math.max(.55, Math.min(1.6, game._aspect));
    W = Math.round(Math.sqrt(area * a)); H = Math.round(W / a);
  }
  const m = game.media;
  const digital=eShopStyle==='enhanced'&&game._eShop?game._eShop:null;
  const cart=Cartridges.profiles[sys.id];
  const shelled = sys.media === 'cart' || !!cart?.shell;
  return {
    sys, W, H, D, digital,packshot:game._packshot,
    front: m.front || Art.front(game, sys, W, H),
    back: m.back || Art.back(game, sys, W, H),
    spine: m.spine || null,
    // No disc/cart scan? Use the real cover as the label, else generate one.
    // A photo of the whole media (a PSP UMD) is shown on its own; the drawn shell then uses the cover as its label.
    mediaPhoto: cart?.wholePhoto ? m.disc || null : null,
    disc: (cart?.wholePhoto ? null : m.disc) || m.front || (shelled ? Art.cart(game, sys, cart?W*cart.w*cart.label[2]/100:W*.7, cart?W*cart.h*cart.label[3]/100:W*.55) : Art.disc(game, sys, 300)),
  };
}

// Library chrome visibility is independent of the game-details (I) shortcut.
const LibraryChrome = (() => {
  let mode = 'shown', pinned = false, saves = Promise.resolve();
  function refresh() {
    const library = $('#view-library').classList.contains('active') && !caseShown() && !document.querySelector('dialog[open]');
    document.documentElement.dataset.chromeMode = mode;
    document.documentElement.dataset.detailsPinned = String(pinned);
    const hidden = library && mode === 'hidden';
    document.documentElement.dataset.chromeHidden = String(hidden);
    for (const node of [document.querySelector('header'), $('#libraryHints'), $('.shelf-position'), ...document.querySelectorAll('.banner'), ...document.querySelectorAll('.shelf-arrow')]) if (node) node.inert = hidden;
    $('#info').inert = hidden && !pinned;
  }
  function activity() { refresh(); }
  function persist() {
    S.config.libraryChromeMode = mode; S.config.libraryDetailsPinned = pinned;
    delete S.config.libraryChromeIdleSeconds;
    saves = saves.catch(() => {}).then(() => api.setConfig(structuredClone(S.config))).catch(() => toast('UI preference could not be saved.'));
    return saves;
  }
  function configure(next, save = true) {
    if (['shown','hidden'].includes(next.mode)) mode = next.mode;
    if (typeof next.pinned === 'boolean') pinned = next.pinned;
    $('#sChromeMode').value = mode;
    $('#sDetailsPinned').checked = pinned; $('#appearanceDetailsPinned').checked = pinned;
    Ambient.exit(); refresh(); if (save) persist();
  }
  function cycle() {
    configure({ mode: mode === 'shown' ? 'hidden' : 'shown' });
    toast(mode === 'shown' ? 'Overlay on · O: hide overlay' : 'Overlay off · O: show overlay', 3200);
  }
  function init() {
    configure({mode:S.config.libraryChromeMode === 'hidden' ? 'hidden' : 'shown',pinned:!!S.config.libraryDetailsPinned}, false);
    setInterval(refresh, 200);
    $('#sChromeMode').onchange = event => configure({mode:event.target.value});
    $('#sDetailsPinned').onchange = event => configure({pinned:event.target.checked});
    $('#appearanceDetailsPinned').onchange = event => configure({pinned:event.target.checked});
  }
  return {init,activity,refresh,configure,cycle,persist,mode:()=>mode};
})();

const DetailsResize = (() => {
  const min = 128;
  let drag = null;
  const topPadding = 22;
  const shotAspect = 16 / 10;
  const shotWidthLimit = () => Math.min(420, innerWidth * .23, (innerHeight * .36 - topPadding) * shotAspect);
  // The screenshot sets the top edge of the expanded panel, with room for the grip.
  const max = () => Math.max(min + 1, Math.ceil(shotWidthLimit() / shotAspect) + topPadding);
  function align() {
    const root=document.documentElement,view=$('#view-library'),mode=root.dataset.infoBar||'small';
    const resized=root.dataset.detailsResized==='true';
    const height = S.config.libraryDetailsHeight ?? min;
    const flow=String(!['compact','hidden'].includes(mode));if(root.dataset.detailsFlow!==flow)root.dataset.detailsFlow=flow;
    const width = resized ? Math.min(shotWidthLimit(), (height - topPadding) * shotAspect)
      : mode === 'xlarge' ? shotWidthLimit()
      : mode === 'large' ? Math.min(shotWidthLimit(), 360, innerWidth * .22)
      : Math.min(shotWidthLimit(), Math.max(145, Math.min(210, innerWidth * .16)));
    const shotHeight = width / shotAspect;
    const tight = String(shotHeight < 165);
    if (root.dataset.detailsShotTight !== tight) root.dataset.detailsShotTight = tight;
    const padding = innerWidth <= 1250 ? 44 : 60;
    const expansion = resized ? (height - min) / (max() - min) : mode === 'xlarge' ? 1 : mode === 'large' ? 0.55 : 0;
    const center = innerWidth * (0.4 + 0.1 * expansion);
    const leading=Math.max(0,center-padding-width/2-24);
    const dimensions = {
      '--details-leading': Math.round(leading * 2) / 2,
      '--details-shot-width': width,
      '--details-shot-height': shotHeight,
      '--details-title-cap': Math.max(18, shotHeight * .24),
      '--details-max-height': max(),
    };
    for (const [name, value] of Object.entries(dimensions)) {
      const pixels = value + 'px';
      if (view.style.getPropertyValue(name) !== pixels) view.style.setProperty(name, pixels);
    }
  }
  function setHeight(value) {
    const height = Math.max(min, Math.min(max(), Math.round(value)));
    const root = document.documentElement, view = $('#view-library');
    root.dataset.detailsResized = 'true';root.dataset.detailsTiny = String(height < 175);
    view.style.setProperty('--details-height',height+'px');
    view.style.setProperty('--details-title-size',Math.max(18,Math.min(58,height*.14))+'px');
    view.style.setProperty('--details-meta-size',Math.max(12,Math.min(19,height*.05))+'px');
    view.style.setProperty('--details-desc-size',Math.max(12,Math.min(20,height*.055))+'px');
    S.config.libraryDetailsHeight = height;
    const tab = $('#detailsResizeHandle');tab.setAttribute('aria-valuenow',height);tab.setAttribute('aria-valuemin',min);tab.setAttribute('aria-valuemax',max());
    resizeShelf();layout();return height;
  }
  function reset() {
    delete S.config.libraryDetailsHeight;
    delete document.documentElement.dataset.detailsResized;
    delete document.documentElement.dataset.detailsTiny;
  }
  function init() {
    const tab = $('#detailsResizeHandle');
    if (Number.isFinite(S.config.libraryDetailsHeight)) setHeight(S.config.libraryDetailsHeight);
    tab.onpointerdown = event => {
      if(event.button!==0)return;event.preventDefault();event.stopPropagation();
      drag = {y:event.clientY,height:$('#info').getBoundingClientRect().height};
      try{tab.setPointerCapture(event.pointerId);}catch{}
      setHeight(drag.height);Appearance.apply({infoBar:'xlarge'},false);LibraryChrome.configure({pinned:true},false);
      document.documentElement.classList.add('details-dragging');
    };
    tab.onpointermove = event => {if(drag){event.preventDefault();const requested=drag.height+drag.y-event.clientY,applied=setHeight(requested);if(applied!==Math.round(requested))drag={y:event.clientY,height:applied};}};
    const finish = () => {if(!drag)return;drag=null;document.documentElement.classList.remove('details-dragging');Appearance.persist();LibraryChrome.persist();};
    tab.onpointerup=finish;tab.onpointercancel=finish;tab.onlostpointercapture=finish;
    tab.onkeydown = event => {
      if(!['ArrowUp','ArrowDown','Home','End'].includes(event.key))return;
      event.preventDefault();event.stopPropagation();
      const height=$('#info').getBoundingClientRect().height;
      setHeight(event.key==='Home'?min:event.key==='End'?max():height+(event.key==='ArrowUp'?24:-24));
      Appearance.apply({infoBar:'xlarge'},false);LibraryChrome.configure({pinned:true},false);Appearance.persist();LibraryChrome.persist();
    };
    $('#infoBarOptions').addEventListener('click',event=>{if(event.target.closest('button[data-info-bar]:not([data-info-bar="hidden"])'))reset();},true);
    addEventListener('resize',()=>{if(Number.isFinite(S.config.libraryDetailsHeight))setHeight(S.config.libraryDetailsHeight);else resizeShelf();});
  }
  return {init,setHeight,reset,max,align};
})();

// ---------- boot ----------
// The header spells out PYROCADE when the app opens, then folds down to "PC" (hover to spell it out again).
function foldBrand() {
  const brand = $('.brand'); if (!brand) return;
  setTimeout(() => brand.classList.add('folded'), document.documentElement.dataset.motion === 'reduced' ? 0 : 2600);
}
async function boot() {
  S.config = await api.getConfig();
  S.orders = await (api.gameOrders?.() || Promise.resolve({})).catch(()=>({}));
  LibraryUI.init({getState:()=>S,select:setSystem});
  AudioUI.init(S.config.uiSound);
  Ambient.init({initial:S.config.ambient,canRun:()=>false&&!inGame()&&libraryActive()&&!caseShown()&&!LibraryUI.pickerOpen()&&!Appearance.panelOpen()&&!document.activeElement?.matches?.('input,select,textarea'),advance:()=>select(S.sel+1>=S.list.length?0:S.sel+1)});
  Appearance.init({getState:()=>S,toast,refresh:()=>{resizeShelf();for(const it of items.values()){const game=S.games.find(g=>g.id===it.dataset.id);if(game)fillItem(it,game)}if(S.list.length)layout();promptFamilyRendered='';renderPrompts()}});
  eShopStyle=S.config.eShopStyle==='original'?'original':'enhanced';
  promptPreference = validPromptPreference(S.config.promptFamily);
  applyMotion(S.config.motion || 'auto');
  foldBrand();
  renderPrompts();
  api.onToast(toast);
  api.onProgress(onProgress);
  applyCaseLook();
  // Reopen the library where it was left: system, selected game per system, sort and filter.
  const ui = await (api.libraryUi?.() || Promise.resolve({})).catch(() => ({})) || {};
  for (const [k, v] of Object.entries(ui.perSystem || {})) lastGame.set(k, v);
  if (typeof ui.system === 'string') S.system = ui.system;
  if (SORTS[ui.sort] !== undefined) S.sort = ui.sort;
  if (typeof ui.filter === 'string') S.filter = ui.filter;
  S.pendingGame = typeof ui.game === 'string' ? ui.game : null;
  api.onGameStarted?.(gameStarted);
  api.onGameEnded?.(gameEnded);
  ArtworkUI.init({getGames:()=>S.games,getSystems:()=>S.config.systems,getSelected:()=>S.list[S.sel],updateGame:updateArtwork});
  api.onArtMedia?.(updateArtwork); // background re-encoding of oversized images
  api.onLibraryInfo?.(list => { for (const {gameId, info} of list) { const g = S.games.find(x => x.id === gameId); if (g) g.info = info; } showInfo(); });
  await loadLibrary();
  LibraryChrome.init();
  DetailsResize.init();
  LeiaUI.init(S.config);
  initAppUpdates();
  let shelfResizeFrame=0;const scheduleShelfResize=()=>{if(shelfResizeFrame)return;shelfResizeFrame=requestAnimationFrame(()=>{shelfResizeFrame=0;resizeShelf();if(S.config&&libraryActive())layout();});};
  const shelfObserver=new ResizeObserver(scheduleShelfResize);shelfObserver.observe($('#info'));shelfObserver.observe($('#stage'));
  renderEmus();
  renderSettings();
  setInterval(() => ($('#clock').textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })), 1000);
  requestAnimationFrame(pollPad);
}

async function loadLibrary(withReport = false) {
  $('#loading').classList.remove('hidden');
  let result;
  try {
    result = await api.scan(withReport);
  } catch (error) {
    if (withReport) throw error;
    toast('Scan failed: ' + error.message);
    return;
  } finally {
    $('#loading').classList.add('hidden');
  }
  let games = withReport ? result.games : result;
  S.demo = games.length === 0;
  if (S.demo) games = DEMO.map(([system, title, year, developer, genre, players, description]) => ({
    id: `${system}:demo-${title}`, system, title, romPath: null, demo: true, media: {},
    info: { year, developer, publisher: developer, genre, players, description },
  }));
  S.games = games;
  renderHiddenGames();
  $('#demoBanner').classList.toggle('hidden', !S.demo);
  renderChips();
  renderShelfTools();
  setSystem(S.system);
  return result;
}

let lastDetailsSize = 'small', editingGameId = null;
function toggleGameDetails() {
  const current = document.documentElement.dataset.infoBar || 'small';
  const overlayHidesDetails = document.documentElement.dataset.chromeHidden === 'true' && document.documentElement.dataset.detailsPinned !== 'true';
  const show = current === 'hidden' || overlayHidesDetails;
  if (current !== 'hidden') { lastDetailsSize = current; S.config.libraryLastDetailsSize = current; }
  if (show) {
    const size = current === 'hidden' ? S.config.libraryLastDetailsSize || lastDetailsSize : current;
    LibraryChrome.configure({pinned:true},false);
    Appearance.apply({infoBar:size});
    LibraryChrome.persist();
  } else Appearance.apply({infoBar:'hidden'});
}
$('#btnToggleDetails').onclick = toggleGameDetails;
function editGameDetails(game = S.list[S.sel]) {
  if (!game || game.demo) return toast('Add your own games to edit details.');
  editingGameId = game.id;
  $('#editGameTitle').value = game.title;
  $('#editGameVersion').value = game.version || '';
  $('#editGameMediaType').value = game.mediaType || '';
  $('#gameDetailsError').textContent = '';
  $('#gameDetailsSave').disabled = false;
  $('#gameDetailsEditor').showModal();
  $('#editGameTitle').focus();
}
$('#btnEditDetails').onclick = () => editGameDetails();
$('#gameDetailsCancel').onclick = () => $('#gameDetailsEditor').close();
$('#gameDetailsForm').onsubmit = async event => {
  event.preventDefault();
  const game = S.games.find(g => g.id === editingGameId);
  if (!game) return;
  $('#gameDetailsSave').disabled = true;
  try {
    Object.assign(game, await api.setMetadata({ gameId: game.id, title: $('#editGameTitle').value, version: $('#editGameVersion').value, mediaType:$('#editGameMediaType').value }));
    $('#gameDetailsEditor').close();
    // Regenerate fallback artwork and shelf labels using the new title.
    setSystem(S.system); renderHiddenGames();
    toast('Game details saved.');
  } catch (e) { $('#gameDetailsError').textContent = e.message; }
  finally { $('#gameDetailsSave').disabled = false; }
};
$('#gameDetailsEditor').addEventListener('close', () => { editingGameId = null; $('#carousel').focus({preventScroll:true}); });

// ---------- system chips ----------
function renderChips() {
  LibraryUI.render();
}
const lastGame = new Map(); // system id -> id of the game last selected there
// Views that are not systems: favourites and recently played games.
const VIEWS = { favorites: 'Favourites', recent: 'Recently played' };
const viewName = id => id === 'all' ? 'All games' : VIEWS[id] || sysOf(id).name;
// A hidden system (Settings → Show) leaves every shelf, including All games, Favourites and Recently played.
const systemHidden = id => !!S.config?.systems.find(s => s.id === id)?.hidden;
const inView = (g, id) => !g.hidden && !systemHidden(g.system) && (id === 'all' || (id === 'favorites' ? !!g.favorite : id === 'recent' ? g.lastPlayed > 0 : g.system === id));
// Sorting and filtering, applied inside the current system or view.
const yearOf = g => parseInt(g.info?.year, 10) || 0;
const genresOf = g => String(g.info?.genre || '').split(/[;,/]|\s+&\s+/).map(x => x.trim()).filter(Boolean);
const maxPlayers = g => Math.max(0, ...(String(g.info?.players || '').match(/\d+/g) || []).map(Number));
const byTitle = (a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' });
const SORTS = {
  title: null,
  custom: null,
  'year-new': (a, b) => yearOf(b) - yearOf(a),
  'year-old': (a, b) => (yearOf(a) || 9999) - (yearOf(b) || 9999),
  played: (a, b) => (b.playMs || 0) - (a.playMs || 0),
  recent: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0),
  developer: (a, b) => !a.info?.developer - !b.info?.developer || String(a.info?.developer || '').localeCompare(String(b.info?.developer || ''), undefined, { sensitivity: 'base' }),
};
function passesFilter(g) {
  if (!S.filter) return true;
  if (S.filter === 'multi') return maxPlayers(g) >= 2;
  if (S.filter === 'unplayed') return !g.lastPlayed;
  if (S.filter.startsWith('genre:')) return genresOf(g).some(x => x.toLowerCase() === S.filter.slice(6).toLowerCase());
  return true;
}
function manualGameSort(system) {
  const ranks=new Map((S.orders[system]||[]).map((id,index)=>[id,index]));
  return (a,b)=>(ranks.get(a.id)??Number.MAX_SAFE_INTEGER)-(ranks.get(b.id)??Number.MAX_SAFE_INTEGER)||byTitle(a,b);
}
let gameDrag=null,suppressGameClickUntil=0;
function clearGameDrag(){gameDrag?.ghost?.remove();gameDrag=null;for(const node of document.querySelectorAll('.drop-before,.drop-after,.game-dragging'))node.classList.remove('drop-before','drop-after','game-dragging');}
async function dropGame(sourceId,targetId,system,after){
  if(sourceId===targetId)return;
  const games=S.games.filter(g=>g.system===system&&!g.demo).sort(S.sort==='custom'?manualGameSort(system):SORTS[S.sort]?(a,b)=>SORTS[S.sort](a,b)||byTitle(a,b):byTitle);
  const order=games.map(g=>g.id),oldOrder=S.orders[system],oldSort=S.sort;
  const index=order.indexOf(sourceId);if(index<0||!order.includes(targetId))return;
  order.splice(index,1);order.splice(order.indexOf(targetId)+(after?1:0),0,sourceId);
  S.orders[system]=order;S.sort='custom';
  const keep=new Map([...items.values()].map(node=>[node.dataset.id,node]));
  S.list.sort(manualGameSort(system));items.clear();for(let i=0;i<S.list.length;i++){const node=keep.get(S.list[i].id);if(node){node.id='shelf-game-'+i;items.set(i,node);}}
  S.sel=Math.max(0,S.list.findIndex(g=>g.id===sourceId));layout();showInfo();syncShelfTools();saveUi();
  try{S.orders[system]=await api.saveGameOrder({system,gameIds:order});toast('Game order saved.');}
  catch(error){S.orders[system]=oldOrder;S.sort=oldSort;setSystem(system);toast(error.message,5000);}
}
function setSystem(id, edge = null) {
  const previousSystem=S.system;
  S.system = (VIEWS[id] ? S.games.some(g => inView(g, id)) : !systemHidden(id) && (S.games.some(g => g.system === id) || S.config?.systems.some(s => s.id === id && (s.romDir || s.id === 'recomp')))) ? id : 'all';
  if(previousSystem!==S.system)AudioUI.play('system');
  const current = S.list[S.sel];
  // Each system remembers its selected game, so going back to it shows the same game again.
  if (previousSystem !== S.system && current) lastGame.set(previousSystem, current.id);
  const remembered = previousSystem !== S.system && S.games.find(g => g.id === lastGame.get(S.system));
  // After a restart: the game that was selected when PyroCade was closed.
  const pending = S.pendingGame && S.games.find(g => g.id === S.pendingGame);
  if (S.games.length) S.pendingGame = null;
  const keep = remembered || current || pending;
  const q = S.query.trim().toLowerCase();
  let list = S.games.filter(g => inView(g, S.system) && (!q || g.title.toLowerCase().includes(q)) && passesFilter(g));
  if (S.system === 'recent') list = list.sort(SORTS.recent).slice(0, 30);
  else if (S.sort === 'custom') list.sort(manualGameSort(S.system));
  else if (S.sort === 'title') list.sort(byTitle);
  else if (SORTS[S.sort]) list = list.sort((a, b) => SORTS[S.sort](a, b) || byTitle(a, b));
  S.list = list;
  LibraryUI.select();
  $('#carousel').innerHTML = ''; items.clear();revealNode=null;
  const k = keep ? S.list.indexOf(keep) : -1;
  S.sel = k >= 0 ? k : previousSystem !== S.system ? 0 : Math.min(S.sel, Math.max(0, S.list.length - 1));
  if (edge !== null) S.sel = edge > 0 ? 0 : Math.max(0, S.list.length - 1);
  $('#empty').textContent = q ? `No games match “${S.query}”.` : S.filter ? 'No games match this filter. Change “Show” above the shelf.' : (() => { const s = S.config.systems.find(x => x.id === S.system);
      return s?.romDir ? `No games found in ${s.romDir.split('|').map(d => d.trim()).filter(Boolean).join(' or ')}` : 'No games for this system yet.'; })();
  $('#empty').classList.toggle('hidden', S.list.length > 0);
  // An empty system can be hidden right here.
  if (!S.list.length && !q && !S.filter && !VIEWS[S.system] && S.system !== 'all') {
    const b = el('button', 'empty-hide', `Hide ${esc(viewName(S.system))}`); b.type = 'button';
    b.title = 'Show it again in Settings'; b.onclick = () => hideSystem(S.system);
    const box = el('div', 'empty-box'); box.append(el('span', '', esc($('#empty').textContent)), b);
    if (S.system === 'recomp') { const add = el('button','empty-hide','+ Add standalone game…'); add.type='button'; add.onclick=addRecompGame; box.prepend(add); }
    $('#empty').replaceChildren(box);
  }
  syncShelfTools();
  layout(); showInfo(); saveUi();
}
function renderHiddenGames() {
  const box = $('#hiddenGamesList'); box.replaceChildren();
  const games = S.games.filter(g => g.hidden);
  $('#hiddenGames summary').textContent = 'Hidden games (' + games.length + ')';
  if (!games.length) box.append(el('p', '', 'No hidden games. Right-click a game on the shelf to hide it.'));
  for (const game of games) {
    const row = el('li');
    const name = el('span'); name.textContent = game.title + ' · ' + sysOf(game.system).name;
    name.title = game.romPath || '';
    const button = el('button', '', 'Restore'); button.type = 'button';
    button.onclick = async () => {
      button.disabled = true;
      try { Object.assign(game, await api.setHidden({ gameId: game.id, hidden: false })); refreshHiddenGames(); }
      catch (e) { button.disabled = false; toast(e.message); }
    };
    row.append(name, button); box.append(row);
  }
}
function refreshHiddenGames() {
  renderChips(); renderShelfTools(); setSystem(S.system); renderHiddenGames();
}
async function hideSystem(id) {
  const c = structuredClone(S.config), sys = c.systems.find(s => s.id === id);
  if (!sys) return;
  sys.hidden = true;
  try { S.config = await api.setConfig(c); } catch (e) { return toast(e.message); }
  AudioUI.play('back');
  toast(`${sys.name} is hidden. Show it again in Settings.`, 4500);
  renderChips(); setSystem('all');
}
// The library is saved as it is left, so PyroCade opens on the same game next time.
let uiTimer;
function saveUi() {
  if (S.demo || !api.saveLibraryUi) return;
  clearTimeout(uiTimer);
  uiTimer = setTimeout(() => {
    const g = S.list[S.sel]; if (g) lastGame.set(S.system, g.id);
    api.saveLibraryUi({ system: S.system, game: g?.id || null, perSystem: Object.fromEntries(lastGame), sort: S.sort, filter: S.filter }).catch(() => {});
  }, 700);
}
// Sort, Show (filter) and Random, above the shelf.
function renderShelfTools() {
  const counts = new Map();
  for (const g of S.games.filter(g => !g.hidden)) for (const x of genresOf(g)) { const k = x.toLowerCase(); const c = counts.get(k) || { name: x, n: 0 }; c.n++; counts.set(k, c); }
  const genres = [...counts.values()].filter(c => c.n >= 2 || counts.size <= 12).sort((a, b) => a.name.localeCompare(b.name)).slice(0, 40);
  const opt = (value, label) => `<option value="${esc(value)}">${esc(label)}</option>`;
  $('#filterBy').innerHTML = opt('', 'All games') + opt('multi', 'Multiplayer (2+)') + opt('unplayed', 'Not played yet')
    + (genres.length ? `<optgroup label="Genre">${genres.map(c => opt('genre:' + c.name, c.name)).join('')}</optgroup>` : '');
  if (S.filter && ![...$('#filterBy').options].some(o => o.value === S.filter)) S.filter = '';
  syncShelfTools();
}
function syncShelfTools() {
  $('#sortBy').value = S.sort; $('#filterBy').value = S.filter;
  $('#sortBy').disabled = S.system === 'recent';
  $('#sortBy').title = S.system === 'recent' ? 'Recently played is always newest first' : 'Sort the shelf';
  $('#btnRandom').disabled = S.list.length < 2;
}
function randomGame() {
  if (S.list.length < 2) return;
  let n = S.sel; while (n === S.sel) n = Math.floor(Math.random() * S.list.length);
  AudioUI.play('confirm'); select(n);
}
$('#sortBy').addEventListener('change', e => { S.sort = SORTS[e.target.value] !== undefined ? e.target.value : 'title'; e.target.blur(); setSystem(S.system); });
$('#filterBy').addEventListener('change', e => { S.filter = e.target.value; e.target.blur(); setSystem(S.system); });
$('#btnRandom').onclick = randomGame;
function cycleSystem(dir) {
  const ids = $$('#systems button').map(b => b.dataset.id);
  const i = (ids.indexOf(S.system) + dir + ids.length) % ids.length;
  setSystem(ids[i]);
}

// ---------- 3D carousel ----------
const shelfModels=new Map();
const items = new Map(); // list index -> element
let revealTimer, revealNode, revealId = null, announceTimer;
// Discs and cartridges; a PSP UMD is a disc inside a plastic shell, so it is built like a cartridge.
const hasShell = sys => sys.media === 'cart' || !!Cartridges.profiles[sys.id]?.shell;
function createMedia(game, a) {
  const cart = hasShell(a.sys);
  // GameCube games came on 8 cm mini discs instead of 12 cm ones.
  const mini = !cart && a.sys.id === 'gc';
  const media = el('div', `physical-media ${cart ? 'cartridge-model cartridge-' + a.sys.id : 'disc-model disc-' + a.sys.id + (mini ? ' disc-mini' : '')}`);
  media.setAttribute('aria-hidden','true');
  if (a.mediaPhoto) {
    // Keep whole-UMD photography intact on the face, with a physical shell behind
    // it so turning the media over still reveals the UMD window and solid edge.
    const label=Cartridges.build(media,a.sys.id,a.W);label.remove();
    media.querySelector('.cartridge-label-well')?.remove();
    const img = el('img', 'cartridge-whole-photo'); img.src = a.mediaPhoto; img.alt = ''; img.draggable = false;
    media.querySelector('.cartridge-front').append(img);
  } else if (cart) {
    const label=Cartridges.build(media,a.sys.id,a.W);label.style.backgroundImage = `url("${a.disc}")`;
    const shell=Cartridges.shellColor(game,a.sys.id);if(shell)media.style.setProperty('--shell-color',shell);
    if(a.digital&&!game.media.disc)label.append(EshopCovers.sleeve(game,a.digital,true));
    else if(a.packshot&&!game.media.disc)EshopCovers.background(label,a.front,a.packshot);
  } else {
    const size = Math.min(a.W,a.H) * .94 * (mini ? 8/12 : 1);
    media.style.cssText = `--mw:${size}px;--mh:${size}px`;
    const rotor = el('div','disc-rotor');
    const surface = el('div','disc-surface'); surface.style.backgroundImage = `url("${a.disc}")`;
    rotor.append(el('div','disc-metal'),surface,el('div','disc-hub'));
    media.append(rotor);
  }
  return media;
}

function resizeShelf() {
  DetailsResize.align();
  $('#view-library').style.setProperty('--info-clearance', `${$('#info').offsetHeight + 114}px`);
}
function revealSelection(delay = 720) {
  clearTimeout(revealTimer);
  for (const [i,e] of items) if (i !== S.sel) e.classList.remove('media-revealed');
  const game = S.list[S.sel];
  revealId = game?.id || null;
  if (!game) return;
  const selected = revealNode = items.get(S.sel);
  const reveal = () => { if (S.list[S.sel]?.id === game.id && selected?.isConnected) selected.classList.add('media-revealed'); };
  if ($('#carousel').classList.contains('shelf-transfer') || shelfTransition) return;
  if (document.documentElement.dataset.motion === 'reduced') reveal();
  else revealTimer = setTimeout(reveal,delay);
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
  // Cases are normally shown at a similar size; "real sizes" keeps their true proportions to each other.
  it.dataset.displayScale = S.config?.realCaseSizes ? .95 : Math.min(1.5,323/a.H,300/a.W);
  it.style.setProperty('--w',a.W+'px'); it.style.setProperty('--h',a.H+'px'); it.style.setProperty('--d',a.D+'px');
  const sway = el('div', 'sway'); sway.append(createMedia(game,a),box);
  const reflection=el('div','ground-reflection');reflection.setAttribute('aria-hidden','true');reflection.append(EshopCovers.face(game,a,'reflection-cover'));sway.append(reflection);
  const sh = el('div', 'shadow'); sh.style.top = a.H + 'px';
  it.replaceChildren(sway, sh);
  if(Appearance.mode()==='swatches')it.append(Appearance.card(game,a));
}

function makeItem(i) {
  const game = S.list[i];
  const signature=JSON.stringify([game.title,game.media,game.mediaType,game._aspect,game._eShop,S.config?.realCaseSizes,Appearance.mode()]);
  const cached=shelfModels.get(game.id);
  if(cached&&cached.game===game&&cached.signature===signature){const node=cached.node;node.id='shelf-game-'+i;node.classList.remove('sel','media-revealed','console-arrival');node.draggable=!game.demo&&S.system!=='all'&&!VIEWS[S.system];$('#carousel').append(node);return node;}
  const it = el('div', 'item far');
  shelfModels.delete(game.id);shelfModels.set(game.id,{node:it,signature,game});if(shelfModels.size>96)shelfModels.delete(shelfModels.keys().next().value);
  it.dataset.id = game.id;
  it.id = `shelf-game-${i}`;
  it.setAttribute('role','option'); it.setAttribute('aria-label',`${game.title}, ${sysOf(game.system).name}`);
  fillItem(it, game);
  it.oncontextmenu = async event => {
    event.preventDefault();
    if (game.demo) return toast('Add your own games to hide library entries.');
    try {
      const state = await api.gameContextMenu(game.id);
      if (state?.action === 'addRecomp') return await addRecompGame();
      if (state?.action === 'artwork') {
        const result = await api.artImport({gameId:game.id,kind:'front'});
        if (result) { updateArtwork(result); toast('Cover artwork updated.'); }
        return;
      }
      if (state?.action === 'executable') return await chooseRecompExecutable(game);
      if (state?.action === 'folder') return await api.openGameFolder(game.id);
      if (state?.action === 'mediaType') {editGameDetails(game);$('#editGameMediaType').focus();return;}
      if (state?.action === 'edit') return editGameDetails(game);
      if (state) { Object.assign(game, state); refreshHiddenGames(); toast('Game hidden. Restore it in Settings → Hidden games.', 4500); }
    } catch (e) { toast(e.message); }
  };
  it.draggable = !game.demo && S.system !== 'all' && !VIEWS[S.system];
  it.ondragstart = event => {
    if(!it.draggable)return event.preventDefault();
    gameDrag={id:game.id,system:game.system};event.dataTransfer.setData('text/plain',game.id);event.dataTransfer.effectAllowed='move';
    const front=art(game).front,ghost=el('div','cover-drag-preview');ghost.setAttribute('data-leia-ignore','');ghost.style.backgroundImage='url("'+front+'")';document.body.append(ghost);gameDrag.ghost=ghost;event.dataTransfer.setDragImage?.(ghost,52,72);setTimeout(()=>ghost.remove(),0);
    it.classList.add('game-dragging');suppressGameClickUntil=performance.now()+600;
  };
  it.ondragover = event => {
    if(!gameDrag||gameDrag.system!==game.system||gameDrag.id===game.id)return;event.preventDefault();event.dataTransfer.dropEffect='move';
    const after=event.clientX>it.getBoundingClientRect().x+it.getBoundingClientRect().width/2;
    for(const node of document.querySelectorAll('.drop-before,.drop-after'))node.classList.remove('drop-before','drop-after');it.classList.add(after?'drop-after':'drop-before');
  };
  it.ondrop = async event => {
    if(!gameDrag||gameDrag.system!==game.system)return;event.preventDefault();event.stopPropagation();
    const source=gameDrag.id,after=it.classList.contains('drop-after');clearGameDrag();suppressGameClickUntil=performance.now()+400;await dropGame(source,game.id,game.system,after);
  };
  it.ondragend = () => {clearGameDrag();suppressGameClickUntil=performance.now()+400;};
  it.onclick = () => { if(performance.now()<suppressGameClickUntil)return; if (S.list[S.sel] === game) openCase(); else select(S.list.indexOf(game)); };
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
  if(result.shell)game.shell=result.shell;
  if('shellCustom' in result)game.shellCustom=result.shellCustom||undefined;
  if(game.media.front!==previous||game.media.frontHQ!==previousHQ){delete game._aspect;delete game._measuring;delete game._eShop;delete game._packshot;}
  measure(game);refreshGame(game);
}

// Physical case size of the game at a list position (no artwork work, unlike art()).
function caseSize(i) {
  const g = S.list[i]; if (!g) return [230, 323, 24];
  const sys = physicalSystem(g);
  return Packaging.profiles[sys.id]?.size || CASES[sys.caseType] || CASES.dvd;
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
    const placement=Appearance.position(i,S.sel,scale,itemScale,stage,view,caseSize),t=placement.transform;
    e.style.setProperty('--rack-shade',placement.shade||0);
    e.style.width=(placement.width||caseSize(i)[0])+'px';e.style.height=(placement.height||caseSize(i)[1])+'px';
    if (fresh && !$('#carousel').classList.contains('shelf-transfer')) { e.style.transition = 'none'; e.style.transform = t + ' translateY(40px)'; e.offsetWidth; e.style.transition = ''; }
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
  $('#shelfPrev').disabled = !S.list.length;
  $('#shelfNext').disabled = !S.list.length;
  $('#shelfLabel').textContent = viewName(S.system)+' / '+Appearance.layouts[Appearance.mode()].name;
  if (S.list.length) $('#carousel').setAttribute('aria-activedescendant',`shelf-game-${S.sel}`);
  else $('#carousel').removeAttribute('aria-activedescendant');
  if (!S.list.length) $('#mediaType').textContent = '';
  renderConsolePreviews();
  if (revealId !== (S.list[S.sel]?.id || null) || items.get(S.sel)!==revealNode) revealSelection();
}

let shelfTransition = null;
function nextConsole(dir) {
  const q = S.query.trim().toLowerCase();
  const ids = S.config.systems.filter(sys => !sys.hidden && S.games.some(g => !g.hidden && g.system === sys.id && (!q || g.title.toLowerCase().includes(q)) && passesFilter(g))).map(sys => sys.id);
  const index = ids.indexOf(S.system);
  return index < 0 || !ids.length ? S.system : ids[(index + dir + ids.length) % ids.length];
}
function renderConsolePreviews(force = false) {
  const stage = $('#stage');
  // Keep the outgoing previews intact until their fade has finished.
  if (stage.classList.contains('console-moving') && !force) return;
  for (const dir of [-1, 1]) {
    const cls = dir > 0 ? 'next' : 'previous';
    let preview = stage.querySelector('.console-preview.' + cls + ':not(.preview-departing)');
    const remaining = dir > 0 ? S.list.length - 1 - S.sel : S.sel;
    const target = S.list.length && remaining < Math.min(5, S.list.length) ? nextConsole(dir) : S.system;
    if (target === S.system || !S.list.length || remaining >= Math.min(5, S.list.length)) { preview?.remove(); continue; }
    const q = S.query.trim().toLowerCase();
    let games = S.games.filter(g => inView(g, target) && (!q || g.title.toLowerCase().includes(q)) && passesFilter(g));
    games.sort(S.sort==='custom'?manualGameSort(target):SORTS[S.sort] ? (a,b) => SORTS[S.sort](a,b) || byTitle(a,b) : byTitle);
    games = dir > 0 ? games.slice(0, 3) : games.slice(-3).reverse();
    if (!games.length) { preview?.remove(); continue; }
    if (!preview) {
      preview = el('div', 'console-preview ' + cls);
      preview.setAttribute('aria-hidden', 'true'); preview.inert = true;
      stage.append(preview);
    }
    const key = JSON.stringify([target, ...games.map(g => [g.id, g.title, g.media.front])]);
    if (preview._key !== key) {
      preview._key = key; preview.replaceChildren();
      const name = el('div', 'console-preview-name'); name.textContent = viewName(target);
      const covers = el('div', 'console-preview-covers');
      for (const game of games) {
        const card = el('div', 'console-preview-cover'); card.dataset.gameId = game.id;
        card.title = game.title;
        card.append(EshopCovers.face(game, art(game), 'console-preview-face'));
        covers.append(card); ensureArt(game);
      }
      preview.append(name, covers);
    }
    preview.style.opacity = .65 * (1 - remaining / Math.min(5, S.list.length));
  }
}
function navigateGame(dir) {
  if (!S.list.length || shelfTransition) return;
  const index = S.sel + dir;
  if (index >= 0 && index < S.list.length) return select(index);
  const carousel = $('#carousel');
  const peek = $('#stage').querySelector('.console-preview.' + (dir > 0 ? 'next' : 'previous') + ' .console-preview-cover')?.getBoundingClientRect();
  const reduced = document.documentElement.dataset.motion === 'reduced';
  clearTimeout(revealTimer);revealId=null;for(const node of items.values())node.classList.remove('media-revealed');
  const outgoing = reduced ? null : carousel.cloneNode(true);
  if (outgoing) {
    const originals = carousel.querySelectorAll('.item, .sway');
    outgoing.querySelectorAll('.item, .sway').forEach((node, i) => {
      node.style.transform = getComputedStyle(originals[i]).transform;
      node.style.animation = 'none';
      node.style.transition = 'none';
    });
    outgoing.removeAttribute('id'); outgoing.classList.add('shelf-continuation');
    outgoing.removeAttribute('role'); outgoing.removeAttribute('tabindex'); outgoing.removeAttribute('aria-activedescendant');
    outgoing.setAttribute('aria-hidden', 'true'); outgoing.inert = true;
    for (const node of outgoing.querySelectorAll('[id]')) node.removeAttribute('id');
    carousel.parentElement.append(outgoing);
  }
  const target = nextConsole(dir);
  const oldPreviews = reduced ? [] : [...$('#stage').querySelectorAll('.console-preview')];
  if (!reduced) { carousel.classList.add('shelf-transfer'); $('#stage').classList.add('console-moving'); }
  setSystem(target, dir);
  // Resolve the new details-bar height before animating the shelf.
  if (!reduced) { resizeShelf(); layout(); }
  AudioUI.play('scroll', dir);
  if (reduced) return;
  // Grow the incoming shelf from the adjacent console's peeking cover.
  const distance = Math.max(500, $('#stage').clientWidth * .65);
  const options = { duration: 580, easing: 'cubic-bezier(.2,.75,.2,1)' };
  const exit = outgoing.animate([
    { transform: 'translateX(0)' },
    { transform: 'translateX(' + (-dir * distance) + 'px)' }
  ], options);
  const selected = items.get(S.sel);
  const face = selected.querySelector('.swatch-cover, .f-front') || selected;
  let startScale = .25, startX = dir * distance, startY = 0;
  carousel.style.transformOrigin = '0 0';
  if (peek?.width && peek.height) {
    const restingWidth = face.getBoundingClientRect().width;
    startScale = Math.max(.12, Math.min(.45, peek.width / restingWidth));
    // Fit the projected front face to the preview on either side of the shelf.
    carousel.style.transform = `scale(${startScale})`;
    const projected = face.getBoundingClientRect();
    startX = peek.x + peek.width / 2 - projected.x - projected.width / 2;
    startY = peek.y + peek.height / 2 - projected.y - projected.height / 2;
    carousel.style.transform = '';
  }
  const enter = carousel.animate([
    { transform: 'translate3d(' + startX + 'px,' + startY + 'px,0) scale(' + startScale + ')' },
    { transform: 'translate3d(0,0,0) scale(1)' }
  ], options);
  // Build the destination previews before the shared animation starts.
  for (const node of oldPreviews) node.classList.add('preview-departing');
  renderConsolePreviews(true);
  // Preview labels stay near the edge: only the actual game shelf makes
  // the large zoom from its peeking cover into the active position.
  const previewFades = oldPreviews.map(node => node.animate([
    { transform:'translateY(-50%) translate3d(0,0,0) scale(1)', opacity:Number(getComputedStyle(node).opacity) },
    { transform:'translateY(-50%) translate3d(' + (-dir * 72) + 'px,0,0) scale(1.025)', opacity:0 }
  ], {...options,fill:'forwards'}));
  const incomingPreviews = [...$('#stage').querySelectorAll('.console-preview:not(.preview-departing)')];
  for (const node of incomingPreviews) previewFades.push(node.animate([
    { transform:'translateY(-50%) translate3d(' + (dir * 72) + 'px,0,0) scale(.975)', opacity:0 },
    { transform:'translateY(-50%) translate3d(0,0,0) scale(1)', opacity:Number(node.style.opacity) }
  ], options));
  for (const node of items.values()) node.classList.add('console-arrival');
  shelfTransition = { exit, enter, outgoing, previewFades };
  Promise.allSettled([exit.finished, enter.finished, ...previewFades.map(animation => animation.finished)]).then(() => {
    outgoing.remove();
    for (const node of oldPreviews) node.remove();
    $('#stage').classList.remove('console-moving');
    layout(); carousel.offsetWidth;
    carousel.classList.remove('shelf-transfer'); shelfTransition = null;revealSelection(60);
  });
}
function select(i) {
  if (!S.list.length) return;
  const n = Math.max(0, Math.min(S.list.length - 1, i));
  if (n === S.sel) return;
  if(!Ambient.active())AudioUI.play('scroll',Math.sign(n-S.sel));
  for (const node of items.values()) node.classList.remove('console-arrival');
  S.sel = n; layout(); showInfo(); saveUi();
}

// "12 h played", "Last played yesterday".
const relTime = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });
function playSummary(g) {
  const out = [], ms = g.playMs || 0;
  if (ms >= 60000) out.push(ms < 3600000 ? `${Math.round(ms / 60000)} min played` : `${(ms / 3600000).toFixed(ms < 36e6 ? 1 : 0).replace(/\.0$/, '')} h played`);
  if (g.lastPlayed) {
    const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(g.lastPlayed).setHours(0, 0, 0, 0)) / 864e5);
    out.push(days < 1 ? 'Played today' : `Last played ${days < 30 ? relTime.format(-days, 'day') : days < 365 ? relTime.format(-Math.round(days / 30), 'month') : relTime.format(-Math.round(days / 365), 'year')}`);
  }
  return out;
}

// ---------- favourites ----------
function updateFavButton() {
  const g = S.list[S.sel], b = $('#btnFavorite'); if (!g || !b) return;
  b.setAttribute('aria-pressed', String(!!g.favorite));
  b.textContent = (g.favorite ? '★' : '☆') + ' Favourite';
  b.title = g.favorite ? 'Remove from Favourites (F)' : 'Add to Favourites (F)';
}
async function toggleFavorite(g = S.list[S.sel]) {
  if (!g) return;
  if (g.demo || !api.setFavorite) return toast('Favourites work with your own games. Add your ROM folders in Settings.');
  const want = !g.favorite;
  try { g.favorite = (await api.setFavorite({ gameId: g.id, favorite: want })).favorite; } catch (e) { return toast(e.message); }
  AudioUI.play(want ? 'confirm' : 'back');
  toast(want ? `${g.title} added to Favourites.` : `${g.title} removed from Favourites.`);
  renderChips();
  if (S.system === 'favorites') setSystem('favorites'); else { LibraryUI.select(); updateFavButton(); }
}

// ---------- play time ----------
function applyStats(p) {
  const g = S.games.find(x => x.id === p.gameId); if (!g) return;
  Object.assign(g, { playMs: p.playMs, lastPlayed: p.lastPlayed, plays: p.plays });
  renderChips();
  if (S.system === 'recent' || ['recent', 'played'].includes(S.sort) || S.filter === 'unplayed') setSystem(S.system);
  else { LibraryUI.select(); if (S.list[S.sel] === g) showInfo(true); }
}
function gameStarted(p) { if (!p.untracked) S.running.add(p.gameId); applyStats(p); setInGame(); }
function gameEnded(p) { S.running.delete(p.gameId); applyStats(p); setInGame(); }
// While a game is running and PyroCade is behind it, PyroCade stands still: no animations and no
// shelf movement from the controller. Only "hold Select + Start" is listened for.
const inGame = () => S.running.size > 0 && !document.hasFocus();
function setInGame() { document.documentElement.classList.toggle('in-game', inGame()); }
addEventListener('focus', setInGame); addEventListener('blur', () => setTimeout(setInGame, 50));

let bgFlip = false;
const REGIONS = { u: 'USA', us: 'USA', usa: 'USA', e: 'Europe', eu: 'Europe', europe: 'Europe', j: 'Japan', jp: 'Japan', japan: 'Japan', w: 'World', world: 'World', ue: 'USA / Europe' };
function regionOf(g) {
  const tags = [...(g.base || '').matchAll(/[\(\[]([^\)\]]+)[\)\]]/g)].map(m => m[1].trim());
  for (const t of tags) { const r = REGIONS[t.toLowerCase()] || (/^(usa|europe|japan|world)/i.test(t) && t.split(',')[0]); if (r) return r; }
  return null;
}
function renderGameScreenshot(game) {
  const shot = $('#gShot'), image = game.media.screenshot || game.media.title;
  const video = !image && game.media.video;
  const key = JSON.stringify([game.id,image,video]);
  if (shot._mediaKey === key) return;
  shot._mediaKey = key; shot.replaceChildren(); shot.style.display = '';
  shot.style.backgroundImage = image ? 'url("' + image + '")' : '';
  shot.classList.toggle('shot-empty', !image && !video);
  shot.title = 'Right-click to add or change the screenshot image';
  if (video) { const node = el('video');Object.assign(node,{src:video,muted:true,autoplay:true,loop:true});shot.append(node); }
  else if (!image) shot.append(el('span','screenshot-placeholder','Right-click to add screenshot'));
}
async function chooseGameScreenshot() {
  const game = S.list[S.sel];if (!game || game.demo) return;
  try {
    if (!await api.screenshotContextMenu(game.id)) return;
    const result = await api.artImport({gameId:game.id,kind:'screenshot'});
    if (result) { updateArtwork(result);if(S.list[S.sel]===game)renderGameScreenshot(game);toast('Screenshot updated.'); }
  } catch(e) { toast(e.message,5000); }
}
$('#gShot').oncontextmenu = event => {event.preventDefault();return chooseGameScreenshot();};
$('#gShot').onkeydown = event => {if(['ContextMenu','Enter',' '].includes(event.key)||event.shiftKey&&event.key==='F10'){event.preventDefault();event.stopPropagation();chooseGameScreenshot();}};
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
  // A clear logo replaces the title text when there is one; the text stays for screen readers.
  const titleEl = $('#gTitle');
  titleEl.textContent = g.title;
  titleEl.classList.toggle('has-logo', !!g.media.logo && !g.customTitle);
  titleEl.style.setProperty('--logo', g.media.logo ? `url("${g.media.logo}")` : 'none');
  const ext = !g.romPath ? null : /[\\/]exefs[\\/]main$/i.test(g.romPath) ? 'FOLDER DUMP' : g.romPath.split('.').pop().toUpperCase();
  $('#gMeta').innerHTML = [g.info.year, g.info.developer, g.info.genre, g.version && `Version ${g.version}`, g.info.players && `${g.info.players} player${g.info.players === '1' ? '' : 's'}`, regionOf(g), ext,
    g.discs?.length > 1 && `${g.discs.length} discs`, ...playSummary(g)]
    .filter(Boolean).map(x => `<span>${esc(x)}</span>`).join('');
  $('#btnManual').disabled = !g.media.manual;
  updateEmuButton(); updateFavButton();
  renderGameScreenshot(g);
  if (quiet) {
    const bg=$(bgFlip ? '#bgB' : '#bgA');setGameBackground(bg,g,a);
    const tint = await Art.tint(a.digital?.source||a.front,a.digital?.crop||a.packshot);
    if (S.list[S.sel] === g) document.documentElement.style.setProperty('--tint', tint);
    return;
  }
  $('#gDesc').textContent = g.info.description || '';
  $('#gDesc').classList.toggle('hidden',!g.info.description);
  $('#btnManual').disabled = !g.media.manual;
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
// Start animation: the disc spins into a drive slot, or the cartridge is pushed into its slot.
// The emulator starts as the media enters the slot (fx.ready), so the window minimising for the
// game never cuts it short. Off in Settings or with reduced motion: no animation and no wait.
const LAUNCH_SLOT_MS = 2500;
function launchFx(g) {
  if (S.config.launchAnimation === false || document.documentElement.dataset.motion === 'reduced') return null;
  $('.launch-fx')?.remove();
  const a = art(g), cart = hasShell(a.sys);
  const media = createMedia(g, { ...a, W: a.W * (cart ? 1.35 : 1.2), H: a.H * 1.2 });
  const fx = el('div', `launch-fx ${cart ? 'is-cart' : 'is-disc'}`);
  fx.setAttribute('aria-hidden', 'true');
  const view = el('div', 'launch-window'), mover = el('div', 'launch-mover'), deck = el('div', 'launch-console');
  mover.append(media); view.append(mover);
  // Cartridges stop half-way, sticking out of the slot like the real thing.
  if (cart) mover.style.setProperty('--cart-h', media.style.getPropertyValue('--mh') || '160px');
  deck.append(el('div', 'launch-slot'), el('i', 'launch-led'), el('span', 'launch-title', esc(g.title)));
  fx.append(view, deck);
  document.body.append(fx);
  fx.ready = new Promise(resolve => setTimeout(resolve, LAUNCH_SLOT_MS));
  fx.finish = ok => {
    if (!ok) return fx.remove();
    fx.classList.add('powered');                       // power light on
    setTimeout(() => fx.classList.add('out'), 900);
    setTimeout(() => fx.remove(), 1400);
  };
  return fx;
}
let launching = false;
async function play(g = S.list[S.sel]) {
  if (!g) return;
  if (g.demo) return toast('This is a demo game — add your ROM folders in Settings to play for real.');
  if (launching) return;
  launching = true;
  const fx = launchFx(g);
  try {
    if (fx) await fx.ready;
    const multi = g.discs?.length > 1;
    await api.launch(g.id, multi ? { disc: g.disc || 0 } : undefined); fx?.finish(true); AudioUI.play('launch');
    toast(`Launching ${g.title}${multi ? ` (disc ${g.discs[g.disc || 0]})` : ''}…${pad.name ? ' Hold Select + Start to quit it.' : ''}`, 4500);
  }
  catch (e) { fx?.finish(false); AudioUI.play('error'); toast(e.message, 5000); }
  finally { launching = false; }
}
// Manuals open full screen inside PyroCade (Chromium's PDF viewer: zoom, pages, search).
async function manual(g = S.list[S.sel]) {
  if (!g?.media.manual) return toast('No manual yet. Add one in Artwork → Change an image → Manual (PDF), or with Find manuals in a folder.');
  let url;
  try { url = await api.manualUrl(g.media.manual); } catch (e) { return toast(e.message, 5000); }
  const viewer = $('#manualViewer');
  $('#manualViewerTitle').textContent = `${g.title} · Manual`;
  $('#manualFrame').src = url + '#view=FitH';
  $('#manualExternal').onclick = () => api.openManual(g.media.manual).catch(e => toast(e.message, 5000));
  AudioUI.play('open');
  viewer.showModal();
  $('#manualClose').focus();
}
const manualOpen = () => $('#manualViewer').open;
function closeManual() { const v = $('#manualViewer'); if (!v.open) return; v.close(); }
$('#manualViewer').addEventListener('close', () => { $('#manualFrame').src = 'about:blank'; });
$('#manualClose').onclick = closeManual;

// ---------- case viewer ----------
const CV = { open: false, rx: 8, ry: 32, tx: 0, z: 0, game: null, anim: null, token:0, timer:null };
function rig() {
  $('#caseRig').style.transform = `translateX(${CV.tx}px) translateZ(${CV.z}px) rotateX(${CV.rx}deg) rotateY(${CV.ry}deg)`;
  const c=$('#caseRig .case');
  if(c)c.style.setProperty('--light-x',(30+Math.sin(CV.ry*Math.PI/180)*35)+'%');
  // Flat captions turn into stray lines when seen edge-on; hide them while the case faces sideways.
  if(c){const a=Math.abs(((CV.ry%360)+540)%360-180);c.classList.toggle('side-view',a<130&&a>50);}
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
  // A real booklet has thickness: back cover, stapled spine and a stack of page edges, so it never
  // turns into a floating hairline when the case is viewed from the side.
  man.append(el('div', 'manual-back'), el('div', 'manual-edge manual-edge-fore'), el('div', 'manual-edge manual-edge-spine'), el('div', 'manual-edge manual-edge-top'), el('div', 'manual-edge manual-edge-bottom'));
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
  renderDiscChoice(g);
  renderCaseShots(g, token);
  $('#caseView').classList.remove('hidden');
  $('#view-library').inert = true; $('header').inert = true;
  $('#caseView').setAttribute('role','dialog'); $('#caseView').setAttribute('aria-modal','true'); $('#caseView').setAttribute('aria-labelledby','cvTitle');
  $('#cvBack').focus({preventScroll:true});
  Object.assign(CV, { rx: 14, ry: 48, tx: 0, z: -400, open: false }); rig();
  tween({ rx: 6, ry: 18, z: 0 }, 800);
  renderPrompts();
  CV.timer = setTimeout(() => { if (CV.token === token) setOpen(true); },document.documentElement.dataset.motion === 'reduced' ? 0 : 650);
}
// Multi-disc games: choose the disc to start with.
function renderDiscChoice(g) {
  const box = $('#cvDiscs'); box.replaceChildren();
  box.classList.toggle('hidden', !(g.discs?.length > 1));
  if (!(g.discs?.length > 1)) return;
  box.append(el('span', 'disc-choice-label', 'Start with'));
  g.discs.forEach((n, i) => {
    const b = el('button', 'disc-choice-option', `Disc ${n}`); b.type = 'button';
    b.setAttribute('aria-pressed', String((g.disc || 0) === i));
    b.onclick = () => chooseDisc(g, i);
    box.append(b);
  });
}
function chooseDisc(g, i) {
  if (!(g.discs?.length > 1)) return;
  g.disc = (i + g.discs.length) % g.discs.length;
  AudioUI.play('scroll', 1); renderDiscChoice(g);
  if (S.list[S.sel] === g) showInfo(true);
}
// Screenshots you took in the emulator, under the case.
const SV = { shots: [], i: 0 };
async function renderCaseShots(g, token) {
  const box = $('#cvShots'), row = box.querySelector('.case-shots-row');
  box.classList.add('hidden'); row.replaceChildren();
  if (g.demo || !api.screenshots) return;
  let shots = [];
  try { shots = await api.screenshots(g.id); } catch {}
  if (CV.token !== token || !shots.length) return;
  shots.forEach((shot, i) => {
    const b = el('button', 'case-shot'); b.type = 'button';
    b.style.backgroundImage = `url("${shot.url}")`;
    b.setAttribute('aria-label', `Screenshot ${i + 1} of ${shots.length}`);
    b.onclick = () => openShot(shots, i);
    row.append(b);
  });
  box.querySelector('.case-shots-count').textContent = shots.length === 12 ? 'newest 12' : String(shots.length);
  box.classList.remove('hidden');
}
function openShot(shots, i) { SV.shots = shots; SV.i = i; showShot(); AudioUI.play('open'); $('#shotViewer').showModal(); $('#shotClose').focus(); }
function showShot() {
  const shot = SV.shots[SV.i]; if (!shot) return;
  $('#shotImage').src = shot.url;
  $('#shotCaption').textContent = `${SV.i + 1} / ${SV.shots.length} · ${new Date(shot.time).toLocaleString()}`;
}
function stepShot(d) { if (!SV.shots.length) return; SV.i = (SV.i + d + SV.shots.length) % SV.shots.length; AudioUI.play('scroll', d); showShot(); }
const shotOpen = () => $('#shotViewer').open;
$('#shotClose').onclick = () => $('#shotViewer').close();
$('#shotPrev').onclick = () => stepShot(-1);
$('#shotNext').onclick = () => stepShot(1);
$('#shotViewer').addEventListener('close', () => { $('#shotImage').removeAttribute('src'); });

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
      <h3>${esc(e.name)} <span class="tag ${state[0]}">${state[1]}</span>${e.forked ? '<span class="fork">FORK</span>' : ''}</h3>
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
    btn(e.exe && !e.installed ? 'Change .exe…' : 'Use existing .exe…', async () => { if (await api.emuPickExe(e.id)) { S.config = await api.getConfig(); renderEmus(); } });
    if (e.installed) btn('Uninstall', async () => { if (confirm(`Remove ${e.name} and its files from PyroCade’s emulators folder?`)) { await api.emuUninstall(e.id); delete S.latest[e.id]; renderEmus(); } });
    if (e.officialRepo || e.managed) btn(S.sourceOpen === e.id ? 'Close source' : 'Source…', () => { if (S.sourceOpen === e.id) delete S.sourceDraft?.[e.id]; S.sourceOpen = S.sourceOpen === e.id ? null : e.id; renderEmus(); });
    if (e.custom) btn('Remove', async () => { if (confirm(`Remove ${e.name} from PyroCade? Downloaded files stay in the emulators folder until you uninstall them.`)) { await api.emuRemove(e.id); S.config = await api.getConfig(); renderEmus(); } });
    if (S.sourceOpen === e.id) card.append(sourceEditor(e));
    grid.append(card);
  }
}
// Choose where an emulator downloads from: its official project, a fork, or any GitHub repository.
function sourceEditor(e) {
  // The page redraws during installs; what was typed is kept in S.sourceDraft until saved or closed.
  S.sourceDraft ||= {};
  const d = S.sourceDraft[e.id] || { repo: e.forked || e.custom ? e.repo || '' : '', prerelease: e.prerelease, assetPattern: e.assetPattern || '', exePattern: e.exePattern || '' };
  const box = el('form', 'emu-source', `
    <label>GitHub repository<input name="repo" spellcheck="false" placeholder="${esc(e.officialRepo || 'owner/name')}" value="${esc(d.repo)}" /></label>
    <label class="emu-check"><input type="checkbox" name="prerelease" ${d.prerelease ? 'checked' : ''} /> Include dev builds (pre-releases)</label>
    <details ${d.assetPattern || d.exePattern ? 'open' : ''}><summary>File patterns (optional)</summary>
      <label>Download file pattern<input name="assetPattern" spellcheck="false" placeholder="Guessed automatically" value="${esc(d.assetPattern)}" /></label>
      <label>Program pattern<input name="exePattern" spellcheck="false" placeholder="Guessed automatically" value="${esc(d.exePattern)}" /></label>
    </details>
    <div class="result" role="status" aria-live="polite">${e.officialRepo ? `Official: github.com/${esc(e.officialRepo)}. Leave empty to use it.` : ''}</div>
    <div class="actions"><button type="button" data-act="test">Check repo</button><button class="primary" type="submit">Save source</button>${e.forked ? '<button type="button" data-act="official">Use official</button>' : ''}</div>`);
  const result = box.querySelector('.result');
  const values = () => { const f = new FormData(box); return { id: e.id, repo: String(f.get('repo') || '').trim(), prerelease: !!f.get('prerelease'), assetPattern: String(f.get('assetPattern') || '').trim(), exePattern: String(f.get('exePattern') || '').trim() }; };
  const say = (text, bad = false) => { result.textContent = text; result.classList.toggle('bad', bad); };
  box.oninput = () => { S.sourceDraft[e.id] = values(); };
  box.querySelector('[data-act=test]').onclick = async () => {
    const v = values(), repo = v.repo || e.officialRepo || e.repo;
    say('Looking up releases…');
    try { const r = await api.emuTestSource({ ...v, repo }); say(`Would install ${r.releaseName}: ${r.assetName} (${(r.size / 1048576).toFixed(0)} MB)`); }
    catch (err) { say(err.message, true); }
  };
  const official = box.querySelector('[data-act=official]');
  if (official) official.onclick = async () => { await api.emuSetSource({ id: e.id, repo: '' }); delete S.latest[e.id]; delete S.sourceDraft[e.id]; S.sourceOpen = null; toast(`${e.name} downloads from the official project again.`); renderEmus(); };
  box.onsubmit = async ev => {
    ev.preventDefault();
    try {
      await api.emuSetSource(values());
      delete S.latest[e.id]; delete S.sourceDraft[e.id]; S.sourceOpen = null;
      toast(`${e.name} source saved. Use Check for update to install from it.`);
      renderEmus();
    } catch (err) { say(err.message, true); }
  };
  return box;
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
$('#customForm').oninput = () => { $('#customSubmit').textContent = $('#customForm').elements.repo.value.trim() ? 'Add from GitHub' : 'Choose .exe…'; };
$('#customForm').onsubmit = async ev => {
  ev.preventDefault();
  const f = new FormData(ev.target), repo = String(f.get('repo') || '').trim();
  const details = { name: f.get('name'), args: f.get('args'), systems: String(f.get('systems')).split(',').map(s => s.trim()).filter(Boolean) };
  let r;
  try { r = repo ? await api.emuAddRepo({ ...details, repo, prerelease: !!f.get('prerelease') }) : await api.emuAddCustom(details); }
  catch (e) { return toast(e.message, 6000); }
  if (r) {
    ev.target.reset(); ev.target.classList.add('hidden'); $('#customSubmit').textContent = 'Choose .exe…';
    S.config = await api.getConfig(); renderEmus(); renderSettings();
    if (repo) toast(`${r.name} added. Press Install to download it.`);
  }
};

// ---------- PyroCade updates ----------
let appUpdate = null;
async function checkAppUpdate(quiet) {
  try {
    appUpdate = await api.appCheckUpdate();
    if (appUpdate.available) showUpdateBanner();
    else if (!quiet) toast(`PyroCade ${appUpdate.current} is the latest version.`);
  } catch (e) { if (!quiet) toast(`Couldn't check for updates: ${e.message}`, 5000); }
  renderAppVersion();
}
function renderAppVersion() {
  const v = appUpdate?.current || S.appVersion || '';
  $('#sVersion').textContent = appUpdate?.available ? `Version ${v} · ${appUpdate.latest} available` : v ? `Version ${v}` : '';
}
function showUpdateBanner() {
  const b = $('#updateBanner');
  b.classList.remove('busy', 'hidden');
  $('#updateText').textContent = appUpdate.canInstall
    ? `PyroCade ${appUpdate.latest} is available (you have ${appUpdate.current}).`
    : `PyroCade ${appUpdate.latest} is available. ${appUpdate.manualHint}`;
  $('#updateNow').classList.toggle('hidden', !appUpdate.canInstall);
}
async function installAppUpdate() {
  const b = $('#updateBanner');
  b.classList.add('busy');
  try {
    const r = await api.appInstallUpdate();
    $('#updateText').textContent = r.needsNpmInstall
      ? `PyroCade ${r.version} is installed. Run "npm install" in the PyroCade folder, then start it again.`
      : r.mode === 'installer' ? `Installing PyroCade ${r.version}… it will start again by itself.`
      : `PyroCade ${r.version} is installed. Restarting…`;
  } catch (e) {
    b.classList.remove('busy');
    toast(`Update failed: ${e.message}`, 6000);
    showUpdateBanner();
  }
}
function initAppUpdates() {
  api.appVersion().then(v => { S.appVersion = v; renderAppVersion(); }).catch(() => {});
  api.onAppUpdateProgress(p => {
    $('#updateText').textContent = p.total ? `${p.stage} ${(p.got / 1048576).toFixed(1)} / ${(p.total / 1048576).toFixed(1)} MB` : p.stage;
  });
  $('#updateNow').onclick = installAppUpdate;
  $('#updateNotes').onclick = () => appUpdate && api.appOpenRelease(appUpdate.url).catch(e => toast(e.message));
  $('#updateLater').onclick = () => $('#updateBanner').classList.add('hidden');
  $('#btnCheckApp').onclick = () => checkAppUpdate(false);
  if (S.config.checkUpdates !== false) checkAppUpdate(true);
}

// ---------- settings ----------
const expandedSystemGames = new Set();
const systemSettingsDrafts = new Map();
function renderSettings() {
  const c = S.config;
  $('#sPrompts').value = promptPreference;
  $('#sMotion').value = motionPreference;
  $('#sChromeMode').value = S.config.libraryChromeMode === 'hidden' ? 'hidden' : 'shown';
  $('#sDetailsPinned').checked = !!S.config.libraryDetailsPinned;
  $('#sEshop').value = eShopStyle;
  $('#sAmbient').value = String(c.ambient?.idleMinutes ?? 2);
  $('#sBackground').value = c.ambient?.background || (c.ambient?.ribbon === false ? 'off' : 'ribbon');
  $('#sMedia').value = c.mediaRoot || '';
  $('#sLaunchFx').checked = c.launchAnimation !== false;
  $('#sRealSizes').checked = !!c.realCaseSizes;
  $('#sWear').checked = !!c.wornCases;
  $('#sCheckUpdates').checked = c.checkUpdates !== false;
  const body = $('#sysTable tbody'); body.innerHTML = '';
  // Always offer "None" and keep an unknown/removed emulator id as-is, so saving never
  // silently assigns the first emulator in the list.
  const emuOpts = (sel, direct) => {
    const opt = (id, name) => `<option value="${esc(id)}" ${id === (direct ? '__direct' : sel || '') ? 'selected' : ''}>${esc(name)}</option>`;
    const known = S.emus.some(e => e.id === sel);
    return opt('', 'None') + opt('__direct', 'Run the file itself') + (sel && !known ? opt(sel, `${sel} (not found)`) : '') + S.emus.map(e => opt(e.id, e.name)).join('');
  };
  c.systems.forEach((s, i) => {
    const draft = systemSettingsDrafts.get(s.id) || {};
    const hidden = draft.hidden ?? !!s.hidden;
    const tr = el('tr', hidden ? 'sys-hidden' : '', `
      <td class="show"><input type="checkbox" data-k="show" ${hidden ? '' : 'checked'} aria-label="Show ${esc(s.name)} in the library"/></td>
      <td class="name"><i style="background:${esc(s.color)}"></i>${esc(s.name)}${s.custom ? ` <button class="sys-remove" data-remove-system="${esc(s.id)}" title="Remove this system">Remove</button>` : ''}</td>
      <td><input data-k="romDir" value="${esc(draft.romDir ?? s.romDir)}" placeholder="Not set" id="rom${i}"/></td>
      <td><button data-browse="rom${i}">Browse…</button> <button data-browse="rom${i}" data-add="1" title="Add another ROM folder">+ Add</button></td>
      <td><select data-k="emulator">${emuOpts(s.emulator, s.direct)}</select></td>
      <td><input data-k="extensions" value="${esc(s.extensions.join(' '))}"/></td>
      <td><input data-k="args" value="${esc(s.args || '')}" placeholder="emulator default"/></td>`);
    tr.dataset.i = i; body.append(tr);
    const show = tr.querySelector('[data-k="show"]');
    const hiddenLabel = el('span', 'system-hidden-label', 'Hidden');
    hiddenLabel.hidden = show.checked;
    const folder = tr.querySelector('[data-k="romDir"]');
    folder.oninput = () => {
      draft.romDir = folder.value;
      systemSettingsDrafts.set(s.id, draft);
    };
    show.onchange = () => {
      draft.hidden = !show.checked;
      systemSettingsDrafts.set(s.id, draft);
      tr.classList.toggle('sys-hidden', !show.checked);
      hiddenLabel.hidden = show.checked;
    };
    const games = S.games.filter(g => g.system === s.id && !g.demo);
    const toggle = el('button','system-games-toggle'); toggle.type='button';
    toggle.textContent = '▸ ' + s.name + ' · ' + games.length + ' games';
    toggle.setAttribute('aria-expanded',String(expandedSystemGames.has(s.id)));
    toggle.setAttribute('aria-controls','system-games-' + i);
    const name = tr.querySelector('.name');
    for (const node of [...name.childNodes]) if (node.nodeType === Node.TEXT_NODE) node.remove();
    name.querySelector('i').after(toggle, hiddenLabel);
    const row = el('tr','system-games-row');row.classList.toggle('hidden',!expandedSystemGames.has(s.id));
    const cell = el('td');cell.colSpan=7;const group=el('div','system-games-panel');group.id='system-games-'+i;cell.append(group);row.append(cell);body.append(row);
    const populate = () => renderSystemGameGroup(s.id,group,toggle);
    toggle.onclick = () => {
      const open = row.classList.contains('hidden');row.classList.toggle('hidden',!open);
      if(open)expandedSystemGames.add(s.id);else expandedSystemGames.delete(s.id);
      toggle.setAttribute('aria-expanded',String(open));populate();
    };
    populate();
  });
  const recompRow = [...body.querySelectorAll('tr')].find(row => c.systems[Number(row.dataset.i)]?.id === 'recomp');
  if (recompRow) {
    for (const node of recompRow.querySelectorAll('[data-k]:not([data-k="show"]),[data-browse]')) node.disabled = true;
    recompRow.querySelector('[data-k="romDir"]').placeholder = 'Use + Recomp game to add folders';
  }
  renderAddedGames();
}
function renderSystemGameGroup(systemId, box, toggle) {
  const games = S.games.filter(g => g.system === systemId && !g.demo).sort(manualGameSort(systemId));
  const system = sysOf(systemId), expanded = toggle.getAttribute('aria-expanded') === 'true';
  const arrow=el('span','system-games-chevron','›');arrow.setAttribute('aria-hidden','true');
  const caption=el('span','system-games-caption');caption.textContent=system.name+' · '+games.length+' games';
  toggle.replaceChildren(arrow,caption);
  box.replaceChildren();
  if (!games.length) {box.append(el('p','sub','No games found. Set a folder and rescan, or add a standalone game.'));return;}
  const controls = el('div','system-games-controls');
  const count = el('span','sub',games.filter(g=>!g.hidden).length + ' of ' + games.length + ' games shown');
  controls.append(count);
  const refresh = () => {refreshHiddenGames();renderSystemGameGroup(systemId,box,toggle);};
  for (const [text,hidden] of [['Show all games',false],['Hide all games',true]]) {
    const button=el('button','',text);button.type='button';
    button.onclick=async()=>{button.disabled=true;try{const states=await api.setSystemGamesHidden({system:systemId,hidden});for(const state of states){const game=S.games.find(g=>g.id===state.gameId);if(game)Object.assign(game,state);}refresh();}catch(e){button.disabled=false;toast(e.message);}};
    controls.append(button);
  }
  box.append(controls);
  for (const game of games) {
    const label=el('label','system-game-entry'),check=el('input');check.type='checkbox';check.checked=!game.hidden;
    check.setAttribute('aria-label','Show '+game.title);
    const text=el('span');text.textContent=game.title;text.title=game.romPath||'';
    label.append(check,text);
    check.onchange=async()=>{check.disabled=true;try{Object.assign(game,await api.setHidden({gameId:game.id,hidden:!check.checked}));refresh();}catch(e){check.disabled=false;check.checked=!game.hidden;toast(e.message);}};
    box.append(label);
  }
}
// ---- Your own systems and games ----
async function renderAddedGames() {
  let list = [];
  try { list = await api.gameList(); } catch {}
  const box = $('#addedGames');
  box.classList.toggle('hidden', !list.length);
  box.querySelector('summary').textContent = `Games you added (${list.length})`;
  const sysName = id => S.config.systems.find(s => s.id === id)?.name || id;
  box.querySelector('ul').replaceChildren(...list.map(x => {
    const li = el('li', x.missing ? 'missing' : '', `<span><b>${esc(x.title)}</b> · ${esc(sysName(x.system))}<small>${esc(x.path)}${x.missing ? ' (file not found)' : ''}</small></span>`);
    const b = el('button', '', 'Remove'); b.type = 'button';
    b.onclick = async () => { await api.gameRemove(x.id); await loadLibrary(); renderAddedGames(); toast(`${x.title} removed from your library.`); };
    li.append(b); return li;
  }));
}
const toggleForm = (form, show) => { $$('.add-form').forEach(f => f.classList.add('hidden')); if (show) { form.classList.remove('hidden'); form.querySelector('input,select')?.focus(); } };
$('#btnAddSystem').onclick = () => toggleForm($('#addSystemForm'), $('#addSystemForm').classList.contains('hidden'));
async function chooseRecompExecutable(game) {
  try { const result = await api.chooseGameExecutable(game.id); if (result) toast('Game executable saved. Press Play to launch it.'); }
  catch (e) { toast(e.message,5000); }
}
async function addRecompGame() {
  try {
    const entry = await api.gameAdd({system:'recomp',title:''}); if (!entry) return;
    await loadLibrary(); setSystem('recomp'); const addedIndex=S.list.findIndex(g=>g.added===entry.id);if(addedIndex>=0)select(addedIndex);renderAddedGames();
    toast('Recomp game added. Right-click its cover to choose the .exe.', 5500);
  } catch (e) { toast(e.message,5000); }
}
$('#btnAddRecomp').onclick = addRecompGame;
$('#stage').addEventListener('contextmenu', async event => {
  if (S.system !== 'recomp' || event.target.closest('.item')) return;
  event.preventDefault();
  try { if (await api.recompContextMenu()) await addRecompGame(); }
  catch (e) { toast(e.message,5000); }
});
$('#addGameForm').elements.system.onchange = () => {
  $('#addGameForm button[type="submit"]').textContent = $('#addGameForm').elements.system.value === 'recomp' ? 'Choose game folder…' : 'Choose file…';
};
$('#btnAddGame').onclick = () => {
  const form = $('#addGameForm'), pick = form.elements.system;
  pick.replaceChildren(...S.config.systems.map(s => { const o = el('option', '', esc(s.name)); o.value = s.id; return o; }));
  pick.value = S.config.systems.some(s => s.id === S.system) ? S.system : 'pc';
  $('#addGameForm').elements.system.onchange();
  toggleForm(form, form.classList.contains('hidden'));
};
$$('.add-form [data-cancel]').forEach(b => { b.onclick = () => toggleForm(null, false); });
$('#addSystemForm').onsubmit = async ev => {
  ev.preventDefault();
  const f = new FormData(ev.target), name = String(f.get('name')).trim();
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'system';
  let id = 'custom-' + slug, n = 2; while (S.config.systems.some(s => s.id === id)) id = `custom-${slug}-${n++}`;
  const caseType = String(f.get('caseType')), media = ['dvd', 'jewel', 'bluray', 'umd'].includes(caseType) ? 'disc' : 'cart';
  const extensions = String(f.get('extensions')).split(/[\s,]+/).filter(Boolean).map(x => (x.startsWith('.') ? x : '.' + x).toLowerCase());
  const c = structuredClone(S.config);
  c.systems.push({ id, name, caseType, media, color: String(f.get('color')), extensions: extensions.length ? extensions : ['.zip'], emulator: '', romDir: '', custom: true });
  S.config = await api.setConfig(c);
  ev.target.reset(); toggleForm(null, false); renderSettings(); LibraryUI.render?.();
  toast(`${name} added. Set its ROM folder and emulator, then Save & rescan.`, 5000);
};
$('#addGameForm').onsubmit = async ev => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  try {
    const entry = await api.gameAdd({ system: f.get('system'), title: f.get('title') });
    if (!entry) return;
    ev.target.reset(); toggleForm(null, false);
    await loadLibrary(); renderAddedGames();
    toast(`${entry.title} added to your library.`);
  } catch (e) { toast(e.message, 5000); }
};
document.addEventListener('click', async e => {
  const r = e.target.closest('[data-remove-system]');
  if (!r) return;
  const sys = S.config.systems.find(s => s.id === r.dataset.removeSystem);
  if (!sys || !confirm(`Remove ${sys.name}? Your game files and artwork stay where they are.`)) return;
  const c = structuredClone(S.config); c.systems = c.systems.filter(s => s.id !== sys.id);
  S.config = await api.setConfig(c); renderSettings(); await loadLibrary();
});
document.addEventListener('click', async e => {
  const b = e.target.closest('[data-browse]');
  if (b) {
    const input = document.getElementById(b.dataset.browse);
    if (!input) return;
    const system = S.config.systems[b.closest('tr')?.dataset.i];
    b.disabled = true;
    try {
      const folder = await api.pickFolder(system ? 'Choose ' + system.name + ' ROM folder' : 'Choose artwork folder');
      if (folder && input.isConnected) {
        const current = input.value.trim();
        input.value = b.dataset.add && current ? current + ' | ' + folder : folder;
        input.dispatchEvent(new Event('input', { bubbles: true }));
        $('#settingsScanStatus').textContent = 'Folder selected. Click Save & rescan to apply it.';
      }
    } catch (error) {
      $('#settingsScanStatus').textContent = 'Could not choose folder: ' + error.message;
    } finally {
      b.disabled = false;
    }
  }
  const g = e.target.closest('[data-goto]');
  if (g) { e.preventDefault(); showView(g.dataset.goto); }
});
$('#btnSave').onclick = async () => {
  const c = structuredClone(S.config);
  c.mediaRoot = $('#sMedia').value.trim();
  c.launchAnimation = $('#sLaunchFx').checked;
  c.realCaseSizes = $('#sRealSizes').checked;
  c.wornCases = $('#sWear').checked;
  c.checkUpdates = $('#sCheckUpdates').checked;
  c.promptFamily = promptPreference;
  c.motion = motionPreference;
  c.eShopStyle = eShopStyle;
  c.ambient = { idleMinutes: Number($('#sAmbient').value) || 0, background: $('#sBackground').value };
  $$('#sysTable tbody tr[data-i]').forEach(tr => {
    const s = c.systems[tr.dataset.i];
    tr.querySelectorAll('[data-k]').forEach(inp => {
      const v = inp.value.trim();
      if (inp.dataset.k === 'show') { if (inp.checked) delete s.hidden; else s.hidden = true; }
      else if (inp.dataset.k === 'extensions') s.extensions = v.split(/[\s,]+/).filter(Boolean).map(x => (x.startsWith('.') ? x : '.' + x).toLowerCase());
      else if (inp.dataset.k === 'args') { if (v) s.args = v; else delete s.args; }
      else if (inp.dataset.k === 'emulator') { s.direct = v === '__direct'; s.emulator = s.direct ? '' : v; }
      else s[inp.dataset.k] = v;
    });
  });
  const button = $('#btnSave');
  const status = $('#settingsScanStatus');
  if (button.disabled) return;
  button.disabled = true;
  button.textContent = 'Saving…';
  status.textContent = 'Saving folder and visibility changes…';
  let saved = false;
  try {
    S.config = await api.setConfig(c);
    systemSettingsDrafts.clear();
    saved = true;
    applyCaseLook();
    button.textContent = 'Scanning…';
    status.textContent = 'Scanning configured game folders…';
    const { games, folders } = await loadLibrary(true);
    renderSettings();
    const visibleGames = games.filter(game => !game.hidden && !systemHidden(game.system)).length;
    const summary = el('p', '', 'Settings saved. ' + visibleGames + ' visible games after scanning.');
    status.replaceChildren(summary);
    if (folders.length) {
      const results = el('ul');
      for (const entry of folders) {
        const outcome = entry.problem || (entry.count ? entry.count + ' matching files'
          : 'No matching games. Expected ' + (entry.extensions.join(', ') || 'an enabled file extension'));
        results.append(el('li', '', entry.system + ' — ' + entry.folder + ' — ' + outcome));
      }
      status.append(results);
    }
    toast(summary.textContent);
  } catch (error) {
    status.textContent = (saved ? 'Settings saved, but the scan failed: ' : 'Could not save settings: ') + error.message;
    toast(status.textContent, 6000);
  } finally {
    button.disabled = false;
    button.textContent = 'Save & rescan';
  }
};

// ---------- views & input ----------
function showView(v) {
  if(!$('#view-'+v)?.classList.contains('active'))AudioUI.play('confirm');
  $$('#tabs button').forEach(b => b.classList.toggle('active', b.dataset.view === v));
  $$('#tabs button').forEach(b=>{if(b.dataset.view===v)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  $$('.view').forEach(x => x.classList.toggle('active', x.id === 'view-' + v));
  document.documentElement.dataset.view = v;
  LibraryChrome.activity();
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
$('#btnEmulator').onclick = () => S.list[S.sel]?.system === 'recomp' ? chooseRecompExecutable(S.list[S.sel]) : openEmuChoice();
$('#btnFavorite').onclick = () => toggleFavorite();
$('#closeEmuChoice').onclick = () => $('#emuChoice').close();
// One game can use its own emulator, for example a fork made for that game.
const emuChoiceOpen = () => $('#emuChoice').open;
function emuLabel(g) {
  const sys = S.config.systems.find(s => s.id === g.system);
  const name = id => id === '__direct' ? 'Run the file itself' : S.emus?.find(e => e.id === id)?.name || id;
  return { own: g.emulator ? name(g.emulator) : null, system: sys?.direct ? 'Run the file itself' : sys?.emulator ? name(sys.emulator) : 'None set', sys };
}
async function openEmuChoice(g = S.list[S.sel]) {
  if (!g) return;
  if (!S.emus) try { S.emus = await api.emuList(); } catch (e) { return toast(e.message); }
  const { system, sys } = emuLabel(g);
  $('#emuChoiceGame').textContent = g.title;
  const list = $('#emuChoiceList'); list.innerHTML = '';
  const add = (id, title, note) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'emu-choice-option';
    b.setAttribute('aria-pressed', String((g.emulator || '') === id));
    b.innerHTML = `<span>${esc(title)}</span>${note ? `<small>${esc(note)}</small>` : ''}`;
    b.onclick = () => chooseEmulator(g, id);
    list.append(b);
  };
  add('', `Same as ${sys?.name || 'the system'}`, system);
  // Emulators made for this system first, then ones you added or installed (a fork may not list its systems).
  const fits = e => (e.systems || []).includes(g.system);
  for (const e of [...S.emus.filter(fits), ...S.emus.filter(e => !fits(e) && (e.custom || e.exe || e.id === g.emulator))]) add(e.id, e.name, e.exe ? '' : 'not installed');
  add('__direct', 'Run the file itself', 'no emulator');
  AudioUI.play('open');
  $('#emuChoice').showModal();
  (list.querySelector('[aria-pressed=true]') || list.firstChild).focus();
}
async function chooseEmulator(g, id) {
  try { await api.gameSetEmulator({ gameId: g.id, emulator: id || null }); }
  catch (e) { return toast(e.message); }
  for (const x of S.games) if (x.id === g.id) x.emulator = id || undefined;
  $('#emuChoice').close();
  updateEmuButton();
  const { own, system } = emuLabel(g);
  toast(own ? `${g.title} now starts with ${own}.` : `${g.title} uses the system's emulator again (${system}).`);
}
function updateEmuButton() {
  const g = S.list[S.sel], b = $('#btnEmulator');
  if (!g) return;
  const { own } = emuLabel(g);
  b.textContent = g.system === 'recomp' ? 'Choose .exe' : own ? `Emulator: ${own}` : 'Emulator';
  b.classList.toggle('has-own', !!own);
}
$('#cvPlay').onclick = () => play(CV.game);
$('#cvBack').onclick = closeCase;
$('#cvToggle').onclick = () => setOpen(!CV.open);
$('#cvFlip').onclick = () => tween({ ry: CV.ry + 180 }, 900);
$('#shelfPrev').onclick = () => navigateGame(-1);
$('#shelfNext').onclick = () => navigateGame(1);
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
  LibraryChrome.activity();
  if(document.querySelector('.launch-fx'))return; // a game is starting
  if(manualOpen()){if(action==='back'||action==='manual')closeManual();return;}
  if(shotOpen()){if(action==='back')$('#shotViewer').close();else if(action==='left'||action==='right')stepShot(action==='left'?-1:1);return;}
  if ($('#gameDetailsEditor').open) return;
  if(emuChoiceOpen()){
    const opts=[...$$('#emuChoiceList button')],i=opts.indexOf(document.activeElement);
    if(action==='back')$('#emuChoice').close();
    else if(action==='play')document.activeElement?.click();
    else if(['up','left','down','right'].includes(action))opts[Math.max(0,Math.min(opts.length-1,i+(['up','left'].includes(action)?-1:1)))]?.focus();
    return;
  }
  if(Appearance.panelOpen()){Appearance.controller(action);return;}
  if(LibraryUI.pickerOpen()){LibraryUI.controller(action);return;}
  if(action==='systems'&&libraryActive()&&!caseShown()){LibraryUI.openPicker();return;}
  if (caseShown()) {
    if (action === 'back') closeCase();
    else if (action === 'case') setOpen(!CV.open);
    else if (action === 'play') play(CV.game);
    else if (action === 'manual') manual(CV.game);
    else if (action === 'favorite') toggleFavorite(CV.game);
    else if (action === 'sysprev' || action === 'sysnext') chooseDisc(CV.game, (CV.game.disc || 0) + (action === 'sysprev' ? -1 : 1));
    else if (action === 'left') tween({ ry: CV.ry - 45 }, 500);
    else if (action === 'right') tween({ ry: CV.ry + 45 }, 500);
    else if (action === 'pgup') tween({ z: Math.max(-700, CV.z - 80) }, 180);
    else if (action === 'pgdn') tween({ z: Math.min(450, CV.z + 80) }, 180);
    return;
  }
  if (!libraryActive()) return;
  if(action==='sysprev'||action==='sysnext'){cycleSystem(action==='sysprev'?-1:1);return;}
  if(['up','down'].includes(action)&&['vertical','swatches'].includes(Appearance.mode())){const delta=Appearance.mode()==='swatches'?Appearance.geometry($('#stage'),S.sel,S.list.length).columns:1;select(S.sel+(action==='up'?-delta:delta));return;}
  ({ left: () => navigateGame(-1), right: () => navigateGame(1), up: () => cycleSystem(-1), down: () => cycleSystem(1),
     play: () => play(), case: openCase, manual: () => manual(), favorite: () => toggleFavorite(), random: randomGame, pgup: () => select(S.sel - 10), pgdn: () => select(S.sel + 10) }[action] || (() => {}))();
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
// Mouse clicks leave focus on the clicked button, which would then swallow Enter, Space and the arrow keys.
// Drop that focus in the library; Tab brings back normal keyboard focus.
let pointerFocus = false;
document.addEventListener('pointerdown', () => { pointerFocus = true; }, true);
document.addEventListener('keydown', e => { if (e.key === 'Tab') pointerFocus = false; }, true);
document.addEventListener('click', e => {
  const b = e.target.closest?.('button,a');
  if (!b || e.detail === 0 || !libraryActive() || caseShown() || b.closest('dialog')) return;
  setTimeout(() => { if (document.activeElement === b) b.blur(); });
});
document.addEventListener('keydown', e => {
  usePromptInput('keyboard');
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='k'&&libraryActive()&&!caseShown()){e.preventDefault();LibraryUI.openPicker();return;}
  if ($('#gameDetailsEditor').open) return;
  if(LibraryUI.pickerOpen()||Appearance.panelOpen()||emuChoiceOpen())return;
  if(shotOpen()&&e.key==='Tab')return;
  if (caseShown() && e.key === 'Tab') {
    const focusable = $$('#caseView button:not(:disabled)');
    const first=focusable[0],last=focusable[focusable.length-1];
    if (e.shiftKey && document.activeElement===first) {e.preventDefault();last.focus();}
    else if (!e.shiftKey && document.activeElement===last) {e.preventDefault();first.focus();}
    return;
  }
  if (e.target.matches?.('input, select, textarea')) return;
  if (libraryActive() && !caseShown() && e.key.toLowerCase() === 'o' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); if (!e.repeat) LibraryChrome.cycle(); return; }
  if (libraryActive() && !caseShown() && e.key.toLowerCase() === 'i' && !e.ctrlKey && !e.altKey && !e.metaKey) { e.preventDefault(); if (!e.repeat) toggleGameDetails(); return; }
  if (e.target.matches?.('button,a') && (e.key === 'Enter' || e.key === ' ')) {
    // A button that only has focus because it was clicked keeps Enter/Space for the library, not for itself.
    if (!(pointerFocus && libraryActive() && !caseShown() && !e.target.closest('dialog'))) return;
    e.target.blur();
  }
  const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down', Enter: 'play', ' ': 'case', Escape: 'back', m: 'manual', M: 'manual', f: 'favorite', F: 'favorite', PageUp: 'pgup', PageDown: 'pgdn' };
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

// "Used copies": scuffed cases and faded labels. Real case sizes are applied when the shelf is built.
function applyCaseLook() { document.documentElement.dataset.wear = S.config?.wornCases ? 'on' : 'off'; }
['sRealSizes', 'sWear'].forEach(id => $('#' + id).addEventListener('change', () => {
  S.config = { ...S.config, realCaseSizes: $('#sRealSizes').checked, wornCases: $('#sWear').checked };
  applyCaseLook(); for (const it of items.values()) { const g = S.games.find(x => x.id === it.dataset.id); if (g) fillItem(it, g); } if (S.list.length) layout();
}));
const motionQuery = matchMedia('(prefers-reduced-motion: reduce)');
let motionPreference = 'auto';
function applyMotion(value) {
  motionPreference = ['auto','full','reduced'].includes(value) ? value : 'auto';
  document.documentElement.dataset.motion = motionPreference === 'reduced' || (motionPreference === 'auto' && motionQuery.matches) ? 'reduced' : 'full';
  if (S.config) revealSelection();
}
motionQuery.addEventListener('change',() => applyMotion(motionPreference));
$('#sMotion').addEventListener('change',e => applyMotion(e.target.value));
const applyAmbient=()=>{Ambient.configure({idleMinutes:Number($('#sAmbient').value)||0,background:$('#sBackground').value});Appearance.syncBackground()};
$('#sAmbient').addEventListener('change',applyAmbient);$('#sBackground').addEventListener('change',applyAmbient);
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
  const playing = inGame();
  const woke = gp && active(gp) && !playing ? Ambient.activity() : false;
  if (gp && active(gp)) LibraryChrome.activity();
  if (gp && active(gp)) usePromptInput(Prompts.detect(gp.id));
  if (gp) {
    const ax = gp.axes[0] || 0, ay = gp.axes[1] || 0, b = i => gp.buttons[i]?.pressed;
    const st = { left: b(14) || ax < -.5, right: b(15) || ax > .5, up: b(12) || ay < -.6, down: b(13) || ay > .6,sysprev:b(4),sysnext:b(5),
      play: b(0), back: b(1), manual: b(2), case: b(3), pgup: b(6), pgdn: b(7),systems:b(9),
      favorite: b(8) && !S.running.size, random: b(10) };
    // Hold Select + Start (View + Menu, Share + Options, - and +) for 1.5 s to close the running game.
    const quitCombo = b(8) && b(9);
    if (S.running.size && quitCombo) {
      pad.quitSince ||= now;
      if (now - pad.quitSince > 1500 && !pad.quitSent) { pad.quitSent = true; api.quitGame?.().then(ok => { if (ok) toast('Closing the game…'); }).catch(() => {}); }
    } else { pad.quitSince = 0; pad.quitSent = false; }
    for (const [k, v] of Object.entries(st)) {
      if (playing || quitCombo) { pad.held[k] = v; continue; }
      const repeat = ['left', 'right'].includes(k)||(['up','down'].includes(k)&&(LibraryUI.pickerOpen()||Appearance.panelOpen()||['vertical','swatches'].includes(Appearance.mode())));
      if (v && !woke && (!pad.held[k] || (repeat && now > pad.next[k]))) { input(k); pad.next[k] = now + (pad.held[k] ? 90 : 380); }
      pad.held[k] = v;
    }
  }
  requestAnimationFrame(pollPad);
}

boot();
