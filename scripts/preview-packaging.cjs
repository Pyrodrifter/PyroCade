// Production cases and spine inserts, isolated from the real app's settings.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');
app.setPath('sessionData',path.join(os.tmpdir(),'PyroCade-packaging-'+process.pid));
const ids=['switch','switch2','ps2','ps1','nds','3ds','wii','ps4','gb','gba','snes','n64'];
const games=ids.map(id=>{
  const dir=path.join(root,'data/media',id,'covers');let files=fs.existsSync(dir)?fs.readdirSync(dir).filter(n=>/\.(png|jpe?g)$/i.test(n)):[];
  const favorites={switch:'Mario Kart 8 Deluxe[',switch2:'Donkey Kong',ps2:'Ratchet & Clank (',ps1:'Harry Potter',nds:'New Super Mario', '3ds':'Super Mario',wii:'Super Mario',gb:'Super Mario',gba:'Metroid',snes:'Super Mario',n64:'Super Mario'};
  const name=files.find(n=>n.startsWith(favorites[id]))||files[0];
  return {id:'packaging:'+id,system:id,title:name?name.replace(/\[[^\]]*\]|\([^)]*\)|\.(png|jpe?g)$/gi,'').trim():'Pyro Quest',base:name?.replace(/\.(png|jpe?g)$/i,'')||'Pyro Quest',media:name?{front:pathToFileURL(path.join(dir,name)).href}:{},info:{}};
});
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1760,height:1390,webPreferences:{preload:path.join(__dirname,'check-prompts-preload.cjs'),contextIsolation:true,sandbox:false,offscreen:true,backgroundThrottling:false}});
  win.setContentSize(1760,1390);
  const watchdog=setTimeout(()=>app.exit(1),30000);
  try{
    await win.loadFile(path.join(root,'renderer/index.html'));
    await win.webContents.executeJavaScript(`(async()=>{
      const assert=(v,m)=>{if(!v)throw new Error(m)};await new Promise(r=>setTimeout(r,100));
      S.config.systems=Object.entries(Packaging.profiles).map(([id,p])=>({id,name:p.brand,caseType:['ps1','dreamcast'].includes(id)?'jewel':['switch','switch2'].includes(id)?'switch':['nds','3ds'].includes(id)?'ds':['gb','gbc','gba'].includes(id)?'cartbox':['snes','n64'].includes(id)?'bigbox':'dvd',media:Cartridges.profiles[id]?'cart':'disc',color:p.accent}));S.games=${JSON.stringify(games)};
      for(const game of S.games)measure(game);
      for(let i=0;i<100&&S.games.some(g=>g.media.front&&!g._aspect);i++)await new Promise(r=>setTimeout(r,30));
      S.demo=false;document.querySelector('#demoBanner').classList.add('hidden');renderChips();setSystem('gba');applyMotion('reduced');
      await openCase();setOpen(true);await new Promise(r=>setTimeout(r,60));
      const c=document.querySelector('#caseRig .case'),lid=c.querySelector('.lid');
      assert(c.dataset.material==='cardboard'&&c.querySelector(':scope > .f-front'),'Cardboard front is missing');
      assert(Math.abs(lid.offsetHeight-art(S.list[S.sel]).D)<1,'Cardboard must open a top flap');
      assert(new DOMMatrix(getComputedStyle(lid).transform).m22<0,'Top flap did not open');
      assert(new DOMMatrix(getComputedStyle(c.querySelector('.physical-media')).transform).m42<0,'Cartridge did not lift through the top');
      assert(c.querySelector('.f-left .spine-game-title'),'Case viewer has no matching spine');
    })()`);
    win.webContents.invalidate();await new Promise(r=>setTimeout(r,150));fs.writeFileSync(path.join(root,'output/packaging-cardboard-open.png'),(await win.webContents.capturePage()).toPNG());
    const checks=await win.webContents.executeJavaScript(`(async()=>{
      const assert=(v,m)=>{if(!v)throw new Error(m)};closeCase();
      document.body.innerHTML='<div class="pack-gallery"><header><span>PYROCADE / SYSTEM PACKAGING</span><h1>Cases and spines.</h1><p>Original cover artwork · system-specific materials · matching spine layouts</p></header><main></main></div>';
      const style=document.createElement('style');style.textContent='body{overflow:auto;background:#101116}.pack-gallery{padding:30px 40px;font-family:Segoe UI,sans-serif}header{position:static;display:block;height:auto;padding:0 0 25px;border:0;background:none}header span{font-size:11px;letter-spacing:.2em;color:#ff993d}h1{margin:9px 0 5px;font-size:29px}header p{color:#969ba9;font-size:12px;margin:0}main{display:grid;grid-template-columns:repeat(4,1fr);gap:16px}.sample{height:390px;background:linear-gradient(140deg,#22242b,#181a20);border:1px solid #ffffff0c;border-radius:14px;padding:17px}.sample h2{font-size:14px;font-weight:600;margin:0}.sample small{color:#8d94a3;font-size:11px}.sample-stage{position:relative;perspective:1000px;height:310px}.sample-case{position:absolute;left:39%;top:49%;transform-style:preserve-3d}.sample-spine{position:absolute;left:87%;top:50%;transform:translate(-50%,-50%)}.sample-spine .f-left{position:relative;left:auto;transform:none;width:var(--d);height:var(--h)}';document.head.append(style);
      let count=0;
      for(const game of S.games){
        const {box,a}=buildBox(game),v=Packaging.profile(a.sys),tile=el('section','sample'),stage=el('div','sample-stage');tile.append(el('h2','',a.sys.name),el('small','',v.material+' · '+(game.media.spine?'scanned':'generated')+' spine'),stage);document.querySelector('main').append(tile);
        const scale=Math.min(240/a.H,220/a.W),holder=el('div','sample-case');holder.style.transform='scale('+scale+') rotateY(42deg) rotateX(-6deg)';box.style.left=-a.W/2+'px';box.style.top=-a.H/2+'px';holder.append(box);stage.append(holder);
        const spineHolder=el('div','sample-spine box');spineHolder.style.cssText='--d:'+a.D+'px;--h:'+a.H+'px;transform:translate(-50%,-50%) scale('+scale+')';Packaging.decorate(spineHolder,a);spineHolder.append(Packaging.spine(game,a));stage.append(spineHolder);
        assert(box.querySelectorAll(':scope > .face').length===6,'Missing faces');assert(box.dataset.material===v.material,'Wrong material');
        const title=box.querySelector('.spine-game-title');assert(title&&title.textContent,'Missing title');assert(parseFloat(title.style.fontSize)>=4.5,'Spine text became too small: '+game.system);
        const fit=title.getBoundingClientRect(),area=box.querySelector('.spine-title-area').getBoundingClientRect();assert(fit.height<=area.height+3,'Spine title spills into branding: '+game.system);
        assert(getComputedStyle(box).transformStyle==='preserve-3d','Case depth flattened');count++;
      }
      // User scans must bypass every generated mark and title.
      const g={...S.games[0],media:{...S.games[0].media,spine:S.games[0].media.front}};const face=Packaging.spine(g,art(g));
      assert(face.dataset.spine==='scan'&&!face.children.length&&face.style.backgroundImage,'Original spine scan was replaced');
      await new Promise(r=>setTimeout(r,250));return count;
    })()`);
    win.webContents.invalidate();await new Promise(r=>setTimeout(r,150));fs.writeFileSync(path.join(root,'output/packaging-models.png'),(await win.webContents.capturePage()).toPNG());
    console.log('Passed '+checks+' packaging profiles: six faces, materials, fitted spine titles, depth and original spine priority.');clearTimeout(watchdog);app.exit(0);
  }catch(e){console.error(e);app.exit(1)}
});
