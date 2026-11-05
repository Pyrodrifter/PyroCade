// Shared automatic and manual artwork downloads. No account or API key required.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL,fileURLToPath} = require('node:url');
const {Readable} = require('node:stream');
const {pipeline} = require('node:stream/promises');
const {randomUUID} = require('node:crypto');
const TYPES = {
  front:{folder:'covers',remote:'Named_Boxarts'},
  frontHQ:{folder:'cover-hq'},
  screenshot:{folder:'screenshots',remote:'Named_Snaps'},
  title:{folder:'titlescreens',remote:'Named_Titles'},
  disc:{folder:'physicalmedia'},
  back:{folder:'backcovers'},
  spine:{folder:'spines'},
  logo:{folder:'logos'},
  fanart:{folder:'fanart'},
  manual:{folder:'manuals'},
};
const IMAGE_EXTS = ['.png','.jpg','.jpeg','.webp'];
// Kinds worth replacing when a sharper copy turns up, and the width that counts as sharp enough.
const UPGRADE_WIDTH = {front:700,frontHQ:700,back:700,spine:120};
// Width from a PNG or JPEG header, without decoding the picture.
function imageWidth(b) {
  if(!b||b.length<24)return 0;
  if(b.subarray(1,4).toString()==='PNG')return b.readUInt32BE(16);
  if(b[0]===0xff&&b[1]===0xd8) {
    for(let i=2;i+9<b.length;) {
      if(b[i]!==0xff){i++;continue}
      const marker=b[i+1];
      if(marker>=0xc0&&marker<=0xcf&&![0xc4,0xc8,0xcc].includes(marker))return b.readUInt16BE(i+7);
      i+=2+b.readUInt16BE(i+2);
    }
  }
  return 0;
}
function fileWidth(file) {
  try {const fd=fs.openSync(file,'r');try{const b=Buffer.alloc(65536);const n=fs.readSync(fd,b,0,b.length,0);return imageWidth(b.subarray(0,n))}finally{fs.closeSync(fd)}}catch{return 0}
}
function createArtworkService({dataDir,getSystems,getGames,normalize,fetchImpl=fetch,onProgress=()=>{},source='https://thumbnails.libretro.com',decodeImage,launchbox=null,screenscraper=null,cartridgeLabel=null,encodeImage=null,
  switchDatabase='https://www.gametdb.com/switchtdb.txt?LANG=EN',switchImages='https://art.gametdb.com/switch'}) {
  const indexes=new Map(), unavailable=new Set(), inflight=new Map();
  let switchIndex;
  let active=0,job=null,controller=null,lastEmit=0;
  const queue=[];
  const aborted=signal=>{if(signal?.aborted)throw new DOMException('Cancelled','AbortError')};
  function slot(fn,signal) {
    return new Promise((resolve,reject)=>{
      const run=async()=>{
        active++;
        try {aborted(signal);resolve(await fn())} catch(e){reject(e)}
        finally {active--;queue.shift()?.()}
      };
      if(active<4)run();else queue.push(run);
    });
  }
  async function waitFor(promise,signal) {
    if(!signal)return promise;
    aborted(signal);
    let listener;
    try {return await Promise.race([promise,new Promise((_,reject)=>{
      listener=()=>reject(new DOMException('Cancelled','AbortError'));
      signal.addEventListener('abort',listener,{once:true});
    })])} finally {signal.removeEventListener('abort',listener)}
  }
  async function request(url,kind,signal) {
    return slot(async()=>{
      const combined=signal ? AbortSignal.any([signal,AbortSignal.timeout(18000)]) : AbortSignal.timeout(18000);
      const response=await fetchImpl(url,{headers:{'User-Agent':'PyroCade-Frontend'},signal:combined});
      if(response.status===404)return null;
      if(!response.ok)throw new Error(`Artwork server returned HTTP ${response.status}`);
      if(kind==='text')return response.text();
      if(kind==='pdf') {
        // Manuals: PDF only, up to 150 MB.
        const chunks=[];let total=0;
        for await(const chunk of response.body){total+=chunk.length;if(total>150*1024*1024){await response.body.cancel?.().catch(()=>{});throw new Error('Manual is too large')}chunks.push(Buffer.from(chunk))}
        const bytes=Buffer.concat(chunks);
        if(bytes.subarray(0,5).toString('latin1')!=='%PDF-')throw new Error('Manual source did not return a PDF');
        return bytes;
      }
      if(Number(response.headers.get('content-length'))>20*1024*1024)throw new Error('Artwork image is too large');
      const chunks=[];let total=0;
      for await(const chunk of response.body) {
        total+=chunk.length;
        if(total>20*1024*1024){await response.body.cancel?.().catch(()=>{});throw new Error('Artwork image is too large')}
        chunks.push(Buffer.from(chunk));
      }
      let bytes=Buffer.concat(chunks);
      if(decodeImage && !(bytes.length>=8&&bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))))bytes=await decodeImage(bytes);
      if(bytes.length<24 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error('Artwork server did not return a PNG image');
      if(!bytes.readUInt32BE(16)||!bytes.readUInt32BE(20)||bytes.readUInt32BE(16)>16384||bytes.readUInt32BE(20)>16384)throw new Error('Invalid artwork dimensions');
      return bytes;
    },signal);
  }
  // Streams a large file (the LaunchBox database) straight to disk.
  async function download(url,file,onBytes=()=>{}) {
    const response=await fetchImpl(url,{headers:{'User-Agent':'PyroCade-Frontend'},signal:AbortSignal.timeout(15*60e3)});
    if(!response.ok||!response.body)throw new Error(`Database download failed (HTTP ${response.status})`);
    if(Number(response.headers.get('content-length'))>600*1024*1024)throw new Error('Database download is unexpectedly large');
    const tmp=file+'.part';
    const total=Number(response.headers.get('content-length'))||0;let got=0;
    const counter=async function*(source){for await(const chunk of source){got+=chunk.length;onBytes(got,total);yield chunk}};
    try {await pipeline(Readable.fromWeb(response.body),counter,fs.createWriteStream(tmp));await fs.promises.rename(tmp,file)}
    catch(e){await fs.promises.unlink(tmp).catch(()=>{});throw e}
  }
  function switchNames(refresh=false) {
    if(switchIndex&&!refresh)return switchIndex;
    const pending=(async()=>{
      const file=path.join(dataDir,'media','_index','gametdb-switch.txt');
      let text;
      if(!refresh)try{if(Date.now()-fs.statSync(file).mtimeMs<7*864e5)text=fs.readFileSync(file,'utf8')}catch{}
      if(!text) {
        text=await request(switchDatabase,'text');
        if(!text||!/^TITLES\s*=/m.test(text))throw new Error('Could not read the GameTDB Switch title list');
        fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);
      }
      const map=new Map();
      for(const line of text.split(/\r?\n/)) {
        const match=line.match(/^([A-Z0-9]{5}) = (.+)$/);if(!match)continue;
        const key=normalize(match[2]);if(!key)continue;
        if(!map.has(key))map.set(key,[]);map.get(key).push(match[1]);
      }
      return map;
    })();
    switchIndex=pending;pending.catch(()=>{if(switchIndex===pending)switchIndex=null});return pending;
  }
  const titleKeys=game=>{
    const clean=s=>s.replace(/\bv?\d+(?:\.\d+)+\b/gi,'').replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g,'');
    return [...new Set([normalize(clean(game.title||'')),normalize(clean(game.base)),normalize(clean(game.base).replace(/([a-z])([A-Z])/g,'$1 $2'))].filter(Boolean))];
  };
  async function firstImage(urls,signal) {
    // A single unreadable image (odd JPEG flavours, a dead link) should not hide the next candidate.
    let failure=null;
    for(const url of urls) {
      aborted(signal);
      try {const bytes=await request(url,'image',signal);if(bytes)return bytes}
      catch(e){if(signal?.aborted)throw e;failure=e}
    }
    if(failure)throw failure;
    return null;
  }
  // Tries each source in order. A source that fails is skipped for the rest of the run;
  // an error is only reported when no source could even be asked.
  async function remoteImage(game,sys,type,{signal,retryMissing,refreshed,failures=new Map(),hqOnly=false,background=false}) {
    const steps=[],refreshOnce=key=>{const r=retryMissing&&refreshed&&!refreshed.has(key);if(r)refreshed.add(key);return r};
    const gametdb=()=>switchImage(game,hqOnly&&type==='front'?'frontHQ':type,{signal,retryMissing,refreshed,failures});
    const isSwitch=sys.artworkProvider==='gametdb-switch';
    if(isSwitch&&type==='disc')steps.push(['gametdb-switch',gametdb]); // GameTDB has flat cartridge labels; keep them first
    // Photos of whole cartridges are cut down to their sticker; systems without a measured label are skipped.
    const photo=bytes=>bytes&&type==='disc'&&sys.media==='cart' ? (cartridgeLabel?.(bytes,sys.id)||null) : bytes;
    // Automatic lookups never start the large LaunchBox download; a download from the Artwork page does.
    if(launchbox&&(!background||launchbox.available()))steps.push(['launchbox',async()=>photo(await firstImage(await launchbox.find(sys.id,titleKeys(game),type,{refresh:!background&&refreshOnce('launchbox'),offline:background}),signal))]);
    if(screenscraper?.configured())steps.push(['screenscraper',async()=>photo(await firstImage(await screenscraper.find(game,type,{signal,refresh:refreshOnce('screenscraper')}),signal))]);
    if(isSwitch&&type!=='disc')steps.push(['gametdb-switch',gametdb]);
    if(!hqOnly&&sys.libretro&&TYPES[type].remote)steps.push([`${sys.id}/${type}`,()=>libretroImage(sys,type,game,{signal,retryMissing,refreshed,failures})]);
    const errors=[];let asked=0;
    for(const [key,step] of steps) {
      if(failures.has(key)){errors.push(failures.get(key));continue}
      try {asked++;const bytes=await step();if(bytes)return bytes}
      catch(e){if(signal?.aborted)throw e;asked--;errors.push(e.message);if(key==='launchbox'||key==='screenscraper')failures.set(key,e.message)}
    }
    if(!asked&&errors.length)throw new Error(errors[0]);
    return null;
  }
  async function switchImage(game,type,{signal,retryMissing,refreshed,failures}) {
    if(!['front','frontHQ','disc','back'].includes(type))return null;
    const indexKey='gametdb-switch';
    if(failures?.has(indexKey))throw new Error(failures.get(indexKey));
    const refresh=retryMissing&&refreshed&&!refreshed.has(indexKey);if(refresh)refreshed.add(indexKey);
    let idx;
    try{idx=await waitFor(switchNames(refresh),signal)}catch(e){if(!signal?.aborted)failures?.set(indexKey,e.message);throw e}
    const keys=titleKeys(game);
    const codes=[...new Set(keys.flatMap(k=>idx.get(k)||[]))].slice(0,4);
    const category=type==='frontHQ'?'coverHQ':type==='front'?'cover':type==='back'?'backHQ':'label';
    const extension=type==='disc'?'png':'jpg';
    for(const code of codes)for(const region of ['US','EN','JA']) {
      aborted(signal);
      const bytes=await request(`${switchImages}/${category}/${region}/${code}.${extension}`,'image',signal);
      if(bytes)return bytes;
    }
    return null;
  }
  function index(sys,type,refresh=false) {
    const key=`${sys.id}/${type}`;
    if(!refresh&&indexes.has(key))return indexes.get(key);
    const promise=(async()=>{
      const file=path.join(dataDir,'media','_index',`${sys.id}-${type}.json`);
      let names;
      if(!refresh) {
        for(const cached of [file,...(type==='front'?[path.join(dataDir,'media','_index',sys.id+'.json')]:[])]) {
          try {if(Date.now()-fs.statSync(cached).mtimeMs<30*864e5){names=JSON.parse(fs.readFileSync(cached,'utf8'));if(Array.isArray(names))break;names=null}}catch{}
        }
      }
      if(!names) {
        const html=await request(`${source}/${encodeURIComponent(sys.libretro)}/${TYPES[type].remote}/`,'text');
        names=html===null ? [] : [...html.matchAll(/href="([^"?]*?\.png)"/gi)].flatMap(m=>{
          try {const name=decodeURIComponent(m[1]);return path.basename(name)===name&&!name.includes('/')?[name]:[]}catch{return []}
        });
        if(html!==null&&!names.length)throw new Error(`Could not read the ${TYPES[type].remote} artwork list`);
        fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(names));
      }
      const exact=new Map(),loose=new Map();
      const rank=n=>/\(USA/.test(n)?0:/\((Europe|World)/.test(n)?1:2;
      for(const name of names.filter(n=>typeof n==='string').sort((a,b)=>rank(a)-rank(b))) {
        exact.set(name.toLowerCase(),name);
        const normalized=normalize(name.replace(/\.png$/i,''));
        if(normalized&&!loose.has(normalized))loose.set(normalized,name);
      }
      return {exact,loose};
    })();
    indexes.set(key,promise);
    promise.catch(()=>{if(indexes.get(key)===promise)indexes.delete(key)});
    return promise;
  }
  function safeBase(base) {
    if(typeof base!=='string'||!base||base==='.'||base==='..'||/[<>:"/\\|?*\x00-\x1f]/.test(base))throw new Error('Invalid game filename');
    return base;
  }
  async function libretroImage(sys,type,game,{signal,retryMissing,refreshed,failures}) {
    const indexKey=`${sys.id}/${type}`;
    const refresh=retryMissing&&refreshed&&!refreshed.has(indexKey);
    if(refresh)refreshed.add(indexKey);
    let idx;
    try{idx=await waitFor(index(sys,type,refresh),signal)}catch(e){if(!signal?.aborted)failures?.set(indexKey,e.message);throw e}
    const base=game.base,match=idx.exact.get((base+'.png').toLowerCase())||idx.loose.get(normalize(base));
    if(!match)return null;
    return request(`${source}/${encodeURIComponent(sys.libretro)}/${TYPES[type].remote}/${encodeURIComponent(match)}`,'image',signal);
  }
  // Path of an image PyroCade downloaded itself (media/<system>/<type folder>/), so it may be replaced
  // by a sharper copy. Images people chose themselves live elsewhere and are never touched.
  function ownedFile(url,sys,type) {
    if(typeof url!=='string'||!url.startsWith('file:'))return null;
    try {
      const file=fileURLToPath(url.split('?')[0]),folder=path.join(dataDir,'media',sys.id,TYPES[type].folder)+path.sep;
      return file.toLowerCase().startsWith(folder.toLowerCase())&&!file.slice(folder.length).includes(path.sep)&&IMAGE_EXTS.includes(path.extname(file).toLowerCase())&&fs.existsSync(file)?file:null;
    } catch {return null}
  }
  // A downloaded image in this game's type folder, whatever format it was saved in.
  function savedFile(sys,type,base) {
    const dir=path.join(dataDir,'media',sys.id,TYPES[type].folder);
    for(const ext of IMAGE_EXTS){const file=path.join(dir,base+ext);try{if(fs.statSync(file).size>0)return file}catch{}}
    return null;
  }
  // Large photos are scaled down and stored as JPEG; see encodeArtwork in main.js.
  const encode=async(bytes,type)=>encodeImage ? encodeImage(bytes,type) : {bytes,ext:'png'};
  // Manuals come only from ScreenScraper (when signed in) and are kept as PDF files, not images.
  async function manual(game,sys,base,signal) {
    if(game.media?.manual)return {existing:1,media:{manual:game.media.manual}};
    const file=path.join(dataDir,'media',sys.id,'manuals',base+'.pdf');
    if(fs.existsSync(file))return {existing:1,media:{manual:file}};
    if(!screenscraper?.configured())return {missing:1,media:{}};
    for(const url of await screenscraper.find(game,'manual',{signal})) {
      const bytes=await request(url,'pdf',signal).catch(e=>{if(signal?.aborted)throw e;return null});
      if(!bytes)continue;
      await fs.promises.mkdir(path.dirname(file),{recursive:true});
      await fs.promises.writeFile(file,bytes,{flag:'wx'}).catch(e=>{if(e.code!=='EEXIST')throw e});
      return {downloaded:1,media:{manual:file}};
    }
    return {missing:1,media:{}};
  }
  async function one(game,type,{signal,retryMissing=false,upgrade=false,background=false,refreshed,failures}={}) {
    aborted(signal);
    const sys=getSystems().find(s=>s.id===game.system);
    const base=safeBase(game.base);
    if(type==='manual')return manual(game,sys,base,signal);
    const kept=game.media?.[type] ? ownedFile(game.media[type],sys,type) : savedFile(sys,type,base);
    const keptUrl=game.media?.[type]||(kept&&pathToFileURL(kept).href);
    if(keptUrl) {
      const oldWidth=kept&&upgrade&&UPGRADE_WIDTH[type] ? fileWidth(kept) : 0;
      if(!oldWidth||oldWidth>=UPGRADE_WIDTH[type])return {existing:1,media:{[type]:keptUrl}};
      const key=`${sys.id}/${base}/${type}/upgrade`;
      if(inflight.has(key))return waitFor(inflight.get(key),signal);
      const task=(async()=>{
        let bytes;
        try {bytes=await remoteImage(game,sys,type,{signal,retryMissing,refreshed,failures,hqOnly:true,background})}catch(e){if(signal?.aborted)throw e;return {existing:1,media:{[type]:keptUrl}}}
        if(!bytes)return {existing:1,media:{[type]:keptUrl}};
        const saved=await encode(bytes,type);
        if(imageWidth(saved.bytes)<=oldWidth)return {existing:1,media:{[type]:keptUrl}};
        aborted(signal);
        const target=path.join(path.dirname(kept),path.basename(kept,path.extname(kept))+'.'+saved.ext);
        const tmp=`${target}.${randomUUID()}.tmp`;
        try {await fs.promises.writeFile(tmp,saved.bytes);await fs.promises.rename(tmp,target)}catch(e){await fs.promises.unlink(tmp).catch(()=>{});throw e}
        if(target!==kept)await fs.promises.unlink(kept).catch(()=>{});
        // A new query string makes the window load the new picture instead of its cached copy.
        return {downloaded:1,upgraded:1,media:{[type]:`${pathToFileURL(target).href}?v=${Date.now()}`}};
      })();
      inflight.set(key,task);
      try{return await task}finally{if(inflight.get(key)===task)inflight.delete(key)}
    }
    const key=`${sys.id}/${base}/${type}`;
    if(!retryMissing&&unavailable.has(key))return {missing:1,media:{}};
    if(inflight.has(key)) {
      const shared=await waitFor(inflight.get(key),signal);
      return shared.downloaded ? {...shared,downloaded:0,existing:1}:shared;
    }
    const task=(async()=>{
      const bytes=await remoteImage(game,sys,type,{signal,retryMissing,refreshed,failures,background});
      if(!bytes){unavailable.add(key);return {missing:1,media:{}}}
      const saved=await encode(bytes,type);
      aborted(signal);
      const file=path.join(dataDir,'media',sys.id,TYPES[type].folder,base+'.'+saved.ext);
      await fs.promises.mkdir(path.dirname(file),{recursive:true});
      // Exclusive creation preserves files added by another download or by the user.
      let handle;
      try {
        handle=await fs.promises.open(file,'wx');
        try {await handle.writeFile(saved.bytes)}catch(e){await handle.close();handle=null;await fs.promises.unlink(file).catch(()=>{});throw e}
      } catch(e) {if(e.code==='EEXIST')return {existing:1,media:{[type]:pathToFileURL(file).href}};throw e}
      finally {await handle?.close()}
      unavailable.delete(key);
      return {downloaded:1,media:{[type]:pathToFileURL(file).href}};
    })();
    inflight.set(key,task);
    try{return await task}finally{if(inflight.get(key)===task)inflight.delete(key)}
  }
  async function downloadGame(game,types,options={}) {
    const result={gameId:game.id,title:game.title,media:{},downloaded:0,upgraded:0,existing:0,missing:0,errors:[],unsupported:false};
    const sys=getSystems().find(s=>s.id===game.system);
    const supported=sys&&(sys.libretro||sys.artworkProvider==='gametdb-switch'||launchbox?.platforms[sys.id]||(screenscraper?.configured()&&screenscraper.systems[sys.id]));
    if(!supported){result.unsupported=true;return result}
    const outcomes=await Promise.all(types.map(async type=>{
      try {return await one(game,type,options)}catch(e){if(options.signal?.aborted)throw e;return {error:e.message}}
    }));
    for(const r of outcomes) {
      for(const k of ['downloaded','upgraded','existing','missing'])result[k]+=r[k]||0;
      Object.assign(result.media,r.media);if(r.error)result.errors.push(r.error);
    }
    // An upgraded image has a new file (and often a new extension): the window must swap it in,
    // not keep the old address, which now points at a deleted file.
    if(result.upgraded)result.replace=true;
    return result;
  }
  const snapshot=()=>job ? structuredClone(job):null;
  function emit(item,force=false) {
    if(!force&&!item&&Date.now()-lastEmit<100)return;
    lastEmit=Date.now();job.seq++;
    onProgress({...snapshot(),...(item?{item}: {})});
  }
  function start(options={}) {
    if(job?.status==='running'||job?.status==='cancelling')throw new Error('An artwork download is already running');
    const types=[...new Set((options.types||[]).filter(t=>Object.hasOwn(TYPES,t)))];
    if(!types.length)throw new Error('Choose at least one artwork type');
    const scope=options.scope;
    if(!['game','system','library'].includes(scope))throw new Error('Choose a download scope');
    const games=getGames().filter(g=>scope==='library'||(scope==='game'?g.id===options.gameId:g.system===options.systemId));
    if(!games.length)throw new Error('No games found. Add a ROM folder and rescan your library first.');
    controller=new AbortController();const signal=controller.signal;
    job={id:randomUUID(),seq:0,status:'running',scope,types,total:games.length,completed:0,downloaded:0,upgraded:0,existing:0,missing:0,unsupported:0,errors:0,lastTitle:'Preparing download…',entries:[],startedAt:Date.now()};
    const refreshed=new Set(),failures=new Map();let next=0;
    emit(null,true);
    async function worker() {
      while(!signal.aborted&&next<games.length) {
        const game=games[next++];job.lastTitle=game.title;emit();
        let result;
        try {result=await downloadGame(game,types,{signal,retryMissing:!!options.retryMissing,upgrade:!!options.upgrade,refreshed,failures})}
        catch(e) {if(signal.aborted)return;result={gameId:game.id,title:game.title,media:{},downloaded:0,existing:0,missing:0,errors:[e.message]}}
        job.completed++;job.downloaded+=result.downloaded;job.upgraded+=result.upgraded||0;job.existing+=result.existing;job.missing+=result.missing;
        job.unsupported+=result.unsupported?1:0;job.errors+=result.errors.length?1:0;
        for(const [kind,url] of Object.entries(result.media))if(!game.media[kind]||result.upgraded)game.media[kind]=url;
        job.entries.unshift({...result});job.entries=job.entries.slice(0,8);
        emit(Object.keys(result.media).length&&result.downloaded?result:null);
      }
    }
    Promise.all([worker(),worker()]).then(()=>{
      job.status=signal.aborted?'cancelled':'complete';job.finishedAt=Date.now();emit(null,true);
    }).catch(e=>{job.status='failed';job.error=e.message;emit(null,true)});
    return snapshot();
  }
  function cancel() {if(job?.status==='running'){job.status='cancelling';controller.abort();emit(null,true)}return snapshot()}
  async function fetchArt(systemId,base,options={}) {
    const game=getGames().find(g=>g.system===systemId&&g.base===base);
    if(!game)return null;
    const result=await downloadGame(game,options.hq?['frontHQ']:['front','screenshot'],{background:true});
    for(const [kind,url]of Object.entries(result.media))if(!game.media[kind])game.media[kind]=url;
    return result.media;
  }
  // Every version the online sources have of one image, for the "choose another" picker.
  async function candidates(game,type,{signal}={}) {
    const sys=getSystems().find(s=>s.id===game.system);
    if(!sys||!TYPES[type])return [];
    const urls=[];
    if(launchbox)try{urls.push(...await launchbox.find(sys.id,titleKeys(game),type))}catch{}
    if(screenscraper?.configured())try{urls.push(...await screenscraper.find(game,type,{signal}))}catch{}
    const found=[];
    for(const url of [...new Set(urls)].slice(0,8)) {
      try {let bytes=await request(url,'image',signal);if(bytes&&type==='disc'&&sys.media==='cart')bytes=cartridgeLabel?.(bytes,sys.id)||null;if(bytes)found.push(bytes)}
      catch(e){if(signal?.aborted)throw e}
    }
    return found;
  }
  // Saves the version someone picked, replacing what PyroCade downloaded before.
  async function choose(game,type,bytes) {
    const sys=getSystems().find(s=>s.id===game.system);
    const base=safeBase(game.base),saved=await encode(bytes,type);
    const dir=path.join(dataDir,'media',sys.id,TYPES[type].folder),target=path.join(dir,base+'.'+saved.ext);
    await fs.promises.mkdir(dir,{recursive:true});
    const tmp=`${target}.${randomUUID()}.tmp`;
    await fs.promises.writeFile(tmp,saved.bytes);await fs.promises.rename(tmp,target);
    for(const ext of IMAGE_EXTS){const other=path.join(dir,base+ext);if(other!==target)await fs.promises.unlink(other).catch(()=>{})}
    unavailable.delete(`${sys.id}/${base}/${type}`);
    const url=`${pathToFileURL(target).href}?v=${Date.now()}`;game.media[type]=url;
    return {gameId:game.id,media:{[type]:url},replace:true};
  }
  // PyroCade 0.3.0 saved full-size scans as PNG (often 10-15 MB each). Re-encode those in place.
  // Calls onChange(system, type, base, newUrl) for every file that was replaced.
  async function compact(onChange=()=>{}) {
    if(!encodeImage)return 0;
    const media=path.join(dataDir,'media');let changed=0;
    let systems=[];try{systems=fs.readdirSync(media,{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.name.startsWith('_')).map(d=>d.name)}catch{return 0}
    for(const sysId of systems)for(const [type,{folder}] of Object.entries(TYPES)) {
      const dir=path.join(media,sysId,folder);let files=[];
      try{files=fs.readdirSync(dir).filter(n=>/\.png$/i.test(n))}catch{continue}
      for(const name of files) {
        const file=path.join(dir,name);
        try {
          if(fs.statSync(file).size<2.5*1024*1024)continue;
          const saved=await encode(await fs.promises.readFile(file),type);
          const base=name.slice(0,-4),target=path.join(dir,base+'.'+saved.ext),tmp=target+'.'+randomUUID()+'.tmp';
          await fs.promises.writeFile(tmp,saved.bytes);await fs.promises.rename(tmp,target);
          if(target!==file)await fs.promises.unlink(file);
          changed++;onChange(sysId,type,base,`${pathToFileURL(target).href}?v=${Date.now()}`);
        } catch {}
        await new Promise(r=>setImmediate(r)); // keep the app responsive between files
      }
    }
    return changed;
  }
  // Lets a source show what it is doing (e.g. preparing the LaunchBox database) in the progress panel.
  function note(message) {if(job?.status==='running'){job.lastTitle=message;emit(null,true)}}
  return {fetchArt,start,cancel,status:snapshot,downloadGame,download,note,compact,titleKeys,candidates,choose};
}
module.exports={createArtworkService,TYPES};
