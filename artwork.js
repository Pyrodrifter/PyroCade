// Shared automatic and manual artwork downloads. No account or API key required.
const fs = require('node:fs');
const path = require('node:path');
const {pathToFileURL} = require('node:url');
const {randomUUID} = require('node:crypto');
const TYPES = {
  front:{folder:'covers',remote:'Named_Boxarts'},
  frontHQ:{folder:'cover-hq'},
  screenshot:{folder:'screenshots',remote:'Named_Snaps'},
  title:{folder:'titlescreens',remote:'Named_Titles'},
  disc:{folder:'physicalmedia'},
  back:{folder:'backcovers'},
};
function createArtworkService({dataDir,getSystems,getGames,normalize,fetchImpl=fetch,onProgress=()=>{},source='https://thumbnails.libretro.com',decodeImage,
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
  async function switchImage(game,type,{signal,retryMissing,refreshed,failures}) {
    if(!['front','frontHQ','disc','back'].includes(type))return null;
    const indexKey='gametdb-switch';
    if(failures?.has(indexKey))throw new Error(failures.get(indexKey));
    const refresh=retryMissing&&refreshed&&!refreshed.has(indexKey);if(refresh)refreshed.add(indexKey);
    let idx;
    try{idx=await waitFor(switchNames(refresh),signal)}catch(e){if(!signal?.aborted)failures?.set(indexKey,e.message);throw e}
    const clean=s=>s.replace(/\bv?\d+(?:\.\d+)+\b/gi,'').replace(/\s*\([^)]*\)|\s*\[[^\]]*\]/g,'');
    const keys=[normalize(clean(game.title||'')),normalize(clean(game.base))];
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
  async function one(game,type,{signal,retryMissing=false,refreshed,failures}={}) {
    aborted(signal);
    const sys=getSystems().find(s=>s.id===game.system);
    const base=safeBase(game.base);
    const file=path.join(dataDir,'media',sys.id,TYPES[type].folder,base+'.png');
    if(game.media?.[type])return {existing:1,media:{[type]:game.media[type]}};
    if(fs.existsSync(file)&&fs.statSync(file).size>0)return {existing:1,media:{[type]:pathToFileURL(file).href}};
    const key=`${sys.id}/${base}/${type}`;
    if(!retryMissing&&unavailable.has(key))return {missing:1,media:{}};
    if(inflight.has(key)) {
      const shared=await waitFor(inflight.get(key),signal);
      return shared.downloaded ? {...shared,downloaded:0,existing:1}:shared;
    }
    const task=(async()=>{
      let bytes;
      if(sys.artworkProvider==='gametdb-switch')bytes=await switchImage(game,type,{signal,retryMissing,refreshed,failures});
      else {
        if(!TYPES[type].remote)return {missing:1,media:{}};
        const indexKey=`${sys.id}/${type}`;
        if(failures?.has(indexKey))throw new Error(failures.get(indexKey));
        const refresh=retryMissing&&refreshed&&!refreshed.has(indexKey);
        if(refresh)refreshed.add(indexKey);
        let idx;
        try{idx=await waitFor(index(sys,type,refresh),signal)}catch(e){if(!signal?.aborted)failures?.set(indexKey,e.message);throw e}
        const match=idx.exact.get((base+'.png').toLowerCase())||idx.loose.get(normalize(base));
        if(!match){unavailable.add(key);return {missing:1,media:{}}}
        bytes=await request(`${source}/${encodeURIComponent(sys.libretro)}/${TYPES[type].remote}/${encodeURIComponent(match)}`,'image',signal);
      }
      if(!bytes){unavailable.add(key);return {missing:1,media:{}}}
      aborted(signal);
      await fs.promises.mkdir(path.dirname(file),{recursive:true});
      // Exclusive creation preserves files added by another download or by the user.
      let handle;
      try {
        handle=await fs.promises.open(file,'wx');
        try {await handle.writeFile(bytes)}catch(e){await handle.close();handle=null;await fs.promises.unlink(file).catch(()=>{});throw e}
      } catch(e) {if(e.code==='EEXIST')return {existing:1,media:{[type]:pathToFileURL(file).href}};throw e}
      finally {await handle?.close()}
      unavailable.delete(key);
      return {downloaded:1,media:{[type]:pathToFileURL(file).href}};
    })();
    inflight.set(key,task);
    try{return await task}finally{if(inflight.get(key)===task)inflight.delete(key)}
  }
  async function downloadGame(game,types,options={}) {
    const result={gameId:game.id,title:game.title,media:{},downloaded:0,existing:0,missing:0,errors:[],unsupported:false};
    const sys=getSystems().find(s=>s.id===game.system);
    if(!sys?.libretro&&sys?.artworkProvider!=='gametdb-switch'){result.unsupported=true;return result}
    const outcomes=await Promise.all(types.map(async type=>{
      try {return await one(game,type,options)}catch(e){if(options.signal?.aborted)throw e;return {error:e.message}}
    }));
    for(const r of outcomes) {
      for(const k of ['downloaded','existing','missing'])result[k]+=r[k]||0;
      Object.assign(result.media,r.media);if(r.error)result.errors.push(r.error);
    }
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
    job={id:randomUUID(),seq:0,status:'running',scope,types,total:games.length,completed:0,downloaded:0,existing:0,missing:0,unsupported:0,errors:0,lastTitle:'Preparing download…',entries:[],startedAt:Date.now()};
    const refreshed=new Set(),failures=new Map();let next=0;
    emit(null,true);
    async function worker() {
      while(!signal.aborted&&next<games.length) {
        const game=games[next++];job.lastTitle=game.title;emit();
        let result;
        try {result=await downloadGame(game,types,{signal,retryMissing:!!options.retryMissing,refreshed,failures})}
        catch(e) {if(signal.aborted)return;result={gameId:game.id,title:game.title,media:{},downloaded:0,existing:0,missing:0,errors:[e.message]}}
        job.completed++;job.downloaded+=result.downloaded;job.existing+=result.existing;job.missing+=result.missing;
        job.unsupported+=result.unsupported?1:0;job.errors+=result.errors.length?1:0;
        for(const [kind,url] of Object.entries(result.media))if(!game.media[kind])game.media[kind]=url;
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
    const result=await downloadGame(game,options.hq?['frontHQ']:['front','screenshot']);
    for(const [kind,url]of Object.entries(result.media))if(!game.media[kind])game.media[kind]=url;
    return result.media;
  }
  return {fetchArt,start,cancel,status:snapshot,downloadGame};
}
module.exports={createArtworkService,TYPES};
