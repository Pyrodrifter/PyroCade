const {contextBridge}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const {pathToFileURL}=require('node:url');
const {createArtworkService}=require('../artwork');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'pyrocade-artwork-ui-'));
const systems=[
  {id:'ps1',name:'PlayStation',caseType:'jewel',media:'disc',color:'#9aa3ad',romDir:'',extensions:['.cue'],emulator:'',libretro:'Sony - PlayStation'},
  {id:'gba',name:'Game Boy Advance',caseType:'cartbox',media:'cart',color:'#4b3a9b',romDir:'',extensions:['.gba'],emulator:'',libretro:'Nintendo - Game Boy Advance'},
  {id:'switch',name:'Nintendo Switch',caseType:'switch',media:'cart',color:'#e60012',romDir:'',extensions:['.xci'],emulator:''}
];
const game=(id,title,system,base)=>({id,title,system,base,romPath:'fixture.rom',media:{},info:{}});
const games=[game('ps1:spyro','Spyro the Dragon','ps1','Spyro the Dragon (USA)'),game('gba:zelda','The Legend of Zelda: A Link to the Past','gba','Legend of Zelda, The - A Link To The Past Four Swords (U) [!]'),game('ps1:missing','Unmatched prototype','ps1','Unknown Prototype'),game('switch:game','Switch game','switch','Switch Game')];
const front=path.resolve(__dirname,'../data/media/ps1/covers/Spyro the Dragon (USA).png');
if(fs.existsSync(front))games[0].media.front=pathToFileURL(front).href;
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=','base64');
const pdf=Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\n%%EOF');
let listener=()=>{};
let ss={user:'',devId:'',password:'',devPassword:''};
const ssConfigured=()=>!!(ss.user&&ss.devId&&ss.password&&ss.devPassword);
const service=createArtworkService({dataDir:root,getSystems:()=>systems,getGames:()=>games,normalize:s=>s.replace(/\([^)]*\)|\[[^\]]*\]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase(),onProgress:p=>listener(p),screenscraper:{configured:ssConfigured,systems:{ps1:57,gba:12,switch:225},find:async(game,kind)=>kind==='manual'?['https://example.test/manual.pdf']:[]},fetchImpl:async(url,{signal})=>{
  await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,140);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'))},{once:true})});
  if(String(url).includes('.pdf'))return new Response(pdf,{headers:{'content-type':'application/pdf'}});
  if(String(url).endsWith('/'))return new Response(games.filter(g=>g.system!=='switch'&&!g.base.includes('Unknown')).map(g=>`<a href="${encodeURIComponent(g.base+'.png')}">image</a>`).join(''));
  return new Response(png,{headers:{'content-type':'image/png'}});
}});
const artSources=()=>({launchbox:{built:Date.now()},screenscraper:{user:ss.user,devId:ss.devId,hasPassword:!!ss.password,hasDevPassword:!!ss.devPassword,ready:ssConfigured()}});
contextBridge.exposeInMainWorld('api',{
  getConfig:async()=>({systems,emulators:{},customEmulators:[],hideWhilePlaying:true}),scan:async()=>games,emuList:async()=>[],onToast:()=>{},onProgress:()=>{},fetchArt:async()=>null,
  setConfig:async c=>c,openManual:async()=>{},launch:async()=>{},pickFolder:async()=>null,
  artStart:async opts=>service.start(opts),artStatus:async()=>service.status(),artCancel:async()=>service.cancel(),artOpenFolder:async()=>'',onArtProgress:fn=>{listener=fn},
  artSources:async()=>artSources(),
  artSetScreenScraper:async(details)=>{
    if(details.clear)ss={user:'',devId:'',password:'',devPassword:''};
    else {
      if(details.user!==undefined)ss.user=String(details.user||'').trim().slice(0,200);
      if(details.devId!==undefined)ss.devId=String(details.devId||'').trim().slice(0,200);
      if(details.password)ss.password=String(details.password).trim().slice(0,200);
      if(details.devPassword)ss.devPassword=String(details.devPassword).trim().slice(0,200);
    }
    return artSources();
  },
  artFindManuals:async()=>{
    const folder=path.join(root,'manual-folder');fs.mkdirSync(folder,{recursive:true});
    const target=games.find(g=>!g.media.manual);
    if(!target)return {found:0,matched:[]};
    const src=path.join(folder,target.base+'.pdf');fs.writeFileSync(src,pdf);
    const dest=path.join(root,'media',target.system,'manuals',target.base+'.pdf');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,pdf);
    target.media.manual=dest;
    return {found:1,matched:[{gameId:target.id,media:{manual:dest},replace:true}]};
  },
  manualUrl:async(p)=>{
    const known=typeof p==='string'&&/\.pdf$/i.test(p)&&games.some(g=>g.media.manual===p)&&fs.existsSync(p);
    if(!known)throw new Error('Manual not found.');
    return pathToFileURL(p).href;
  },
  artImport:async({gameId,kind})=>{
    if(kind==='manual'){
      const target=games.find(g=>g.id===gameId);if(!target)throw new Error('Select a game in your library first.');
      const dest=path.join(root,'media',target.system,'manuals',target.base+'.pdf');fs.mkdirSync(path.dirname(dest),{recursive:true});fs.writeFileSync(dest,pdf);
      target.media.manual=dest;
      return {gameId,media:{manual:dest},replace:true};
    }
    return {gameId,media:{[kind]:pathToFileURL(front).href+'?import-test'},replace:true};
  }
});
contextBridge.exposeInMainWorld('artworkTest',{
  cleanup:async()=>{
    service.cancel();for(let i=0;i<300&&['running','cancelling'].includes(service.status()?.status);i++)await new Promise(r=>setTimeout(r,10));
    if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('pyrocade-artwork-ui-'))throw new Error('Unexpected test directory');
    await fs.promises.rm(root,{recursive:true,force:true});
  }
});
