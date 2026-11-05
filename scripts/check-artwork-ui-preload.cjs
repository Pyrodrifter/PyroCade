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
let listener=()=>{};
const service=createArtworkService({dataDir:root,getSystems:()=>systems,getGames:()=>games,normalize:s=>s.replace(/\([^)]*\)|\[[^\]]*\]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase(),onProgress:p=>listener(p),fetchImpl:async(url,{signal})=>{
  await new Promise((resolve,reject)=>{const timer=setTimeout(resolve,140);signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'))},{once:true})});
  if(url.endsWith('/'))return new Response(games.filter(g=>g.system!=='switch'&&!g.base.includes('Unknown')).map(g=>`<a href="${encodeURIComponent(g.base+'.png')}">image</a>`).join(''));
  return new Response(png,{headers:{'content-type':'image/png'}});
}});
contextBridge.exposeInMainWorld('api',{
  appVersion:async()=>'0.0.0-test',appCheckUpdate:async()=>null,appInstallUpdate:async()=>{},appOpenRelease:async()=>{},onAppUpdateProgress:()=>{},artSources:async()=>({launchbox:{built:0},screenscraper:{user:'',devId:'',hasPassword:false,hasDevPassword:false,ready:false}}),artSetScreenScraper:async()=>({launchbox:{built:0},screenscraper:{user:'',devId:'',ready:false}}),
  getConfig:async()=>({systems,emulators:{},customEmulators:[],hideWhilePlaying:true}),scan:async()=>games,emuList:async()=>[],onToast:()=>{},onProgress:()=>{},fetchArt:async()=>null,
  setConfig:async c=>c,openManual:async()=>{},launch:async()=>{},pickFolder:async()=>null,
  artStart:async opts=>service.start(opts),artStatus:async()=>service.status(),artCancel:async()=>service.cancel(),artOpenFolder:async()=>'',onArtProgress:fn=>{listener=fn},
  artImport:async({gameId,kind})=>({gameId,media:{[kind]:pathToFileURL(front).href+'?import-test'},replace:true})
});
contextBridge.exposeInMainWorld('artworkTest',{
  cleanup:async()=>{
    service.cancel();for(let i=0;i<300&&['running','cancelling'].includes(service.status()?.status);i++)await new Promise(r=>setTimeout(r,10));
    if(path.dirname(path.resolve(root))!==path.resolve(os.tmpdir())||!path.basename(root).startsWith('pyrocade-artwork-ui-'))throw new Error('Unexpected test directory');
    await fs.promises.rm(root,{recursive:true,force:true});
  }
});
