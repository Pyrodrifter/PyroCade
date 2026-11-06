// Production renderer, fixture API, no settings/ROM writes or network downloads.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..'),output=path.join(root,'output');
app.setPath('sessionData',path.join(os.tmpdir(),'PyroCade-models-'+process.pid));
const covers={};
for(const id of ['switch','switch2','nds','3ds','gb','gbc','gba','nes','snes','n64','genesis','a2600','psp','ps1','ps2','ps4']){
  const dir=path.join(root,'data/media',id,'covers');
  if(!fs.existsSync(dir))continue;
  const names=fs.readdirSync(dir).filter(n=>/\.(png|jpe?g)$/i.test(n));
  const name=names.find(n=>/^Super Mario World|^Metroid|^Sonic the Hedgehog|^Super Mario Land|^New Super Mario Bros/i.test(n))||names.find(n=>/Super Mario|Metroid|Sonic|Zelda|Tetris|Donkey Kong/i.test(n))||names[0];
  if(name)covers[id]=pathToFileURL(path.join(dir,name)).href;
}
app.whenReady().then(async()=>{
  const errors=[],win=new BrowserWindow({show:false,width:1680,height:1200,webPreferences:{preload:path.join(__dirname,'check-prompts-preload.cjs'),contextIsolation:true,sandbox:false,offscreen:true,backgroundThrottling:false}});
  win.setContentSize(1680,1200);
  const watchdog=setTimeout(()=>{console.error('Model check timed out');app.exit(1)},120000);
  win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});
  const run=code=>win.webContents.executeJavaScript(`(async()=>{const assert=(v,m)=>{if(!v)throw Error(m)};${code}})()`);
  const snap=async (name,height=1200)=>{await run('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));');win.webContents.invalidate();await new Promise(r=>setTimeout(r,1400));const shot=await win.webContents.capturePage({x:0,y:0,width:1680,height});if(shot.isEmpty())throw Error('Empty capture');fs.writeFileSync(path.join(output,name+'.png'),shot.toPNG())};
  try{
    fs.mkdirSync(output,{recursive:true});await win.loadFile(path.join(root,'renderer/index.html'));
    await run(`
      await new Promise(r=>setTimeout(r,200));applyMotion('reduced');
      window.modelCovers=${JSON.stringify(covers)};
      S.config.systems=Object.entries(Packaging.profiles).map(([id,p])=>({id,name:p.brand,caseType:p.material==='cardboard'?'cartbox':p.material==='jewel'?'jewel':'dvd',media:Cartridges.profiles[id]&&!Cartridges.profiles[id].shell?'cart':'disc',color:p.accent}));
      window.modelGames=S.config.systems.map(s=>({id:'model:'+s.id,system:s.id,title:s.name,media:modelCovers[s.id]?{front:modelCovers[s.id]}:{},info:{},demo:true}));
      // The library measures each cover before it builds the model; do the same here, so the gallery
      // shows a square eShop packshot trimmed to its artwork rather than letterboxed on the label.
      for(const g of modelGames){
        if(!g.media.front)continue;
        const img=new Image();img.src=g.media.front;
        try{await img.decode()}catch{continue}
        g._packshot=EshopCovers.packshot(img);
        g._aspect=img.naturalWidth/img.naturalHeight*(g._packshot?.w||1);
      }
      const gallery=el('div','model-gallery');gallery.innerHTML='<h1>Physical models</h1><div class="model-grid"></div>';document.body.append(gallery);
      const style=el('style');style.textContent='body > :not(.model-gallery){display:none!important}body{background:#dfdfd9;overflow:hidden}.model-gallery{padding:24px 30px;color:#353732;font-family:Segoe UI,sans-serif}.model-gallery h1{font-size:18px;font-weight:500;margin:0 0 16px}.model-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.model-tile{height:268px;position:relative;background:#eeeeea;border:1px solid #cecec7}.model-tile h2{margin:13px 17px;font-size:12px;font-weight:500}.model-stage{position:absolute;inset:38px 0 10px;perspective:1100px;transform-style:preserve-3d}.model-stage .physical-media{left:50%;top:50%;margin-left:calc(var(--mw) / -2);margin-top:calc(var(--mh) / -2);transform:rotateX(-9deg) rotateY(-18deg)}.model-stage .case{transition:none!important}.model-stage .case > .physical-media,.model-stage .case > .manual{display:none}.model-stage .case-anchor{position:absolute;left:57%;top:53%;transform-style:preserve-3d;transform:scale(.68) rotateX(-24deg) rotateY(26deg)}.model-stage .case .lid{transition:none!important}';document.head.append(style);
      style.textContent+='.model-stage .case-anchor{top:45%;transform:scale(.56) rotateX(-24deg) rotateY(26deg)}';
      for(const [id,p] of Object.entries(Cartridges.profiles)){
        const game=modelGames.find(g=>g.system===id),a=art(game),tile=el('section','model-tile'),stage=el('div','model-stage');
        tile.append(el('h2','',a.sys.name),stage);gallery.querySelector('.model-grid').append(tile);
        const model=createMedia(game,{...a,W:265,H:270});stage.append(model);
        const body=model.querySelector('.cartridge-body'),front=body.querySelector(':scope > .cartridge-front'),back=body.querySelector(':scope > .cartridge-back');
        assert(body&&front&&back,id+': missing solid shell');
        assert(body.querySelectorAll(':scope > .solid-wall').length===p.outline.split(' ').length,id+': incomplete perimeter');
        assert(!body.querySelector('.cartridge-shell-layer'),id+': old stacked planes');
        const cs=getComputedStyle(model),w=parseFloat(cs.getPropertyValue('--mw')),h=parseFloat(cs.getPropertyValue('--mh')),d=parseFloat(cs.getPropertyValue('--cd'));
        assert(Math.abs(w/h-p.mm[0]/p.mm[1])<.001,id+': wrong aspect ratio');
        assert(Math.abs(d/w-p.mm[2]/p.mm[0])<.001,id+': wrong depth ratio');
        assert(getComputedStyle(body).transformStyle==='preserve-3d'&&getComputedStyle(body).clipPath==='none',id+': flattened shell');
        assert(getComputedStyle(front).clipPath!=='none'&&getComputedStyle(back).clipPath!=='none',id+': missing contour');
        assert(!/NaN|Infinity/.test(body.innerHTML),id+': invalid geometry');
      }
      const pg=modelGames.find(g=>g.system==='psp'),pa=art(pg),photo=createMedia(pg,{...pa,mediaPhoto:pa.front});
      assert(photo.querySelector('.cartridge-whole-photo')?.src===pa.front,'Whole UMD photo was replaced');
      assert(photo.querySelector('.cartridge-back')&&!photo.querySelector('.cartridge-label'),'Whole UMD photo lost its solid back or gained a duplicate label');
      const ng={...modelGames.find(g=>g.system==='nes'),shellCustom:'#123456'},custom=createMedia(ng,art(ng));
      document.querySelector('.model-grid').append(custom);
      assert(getComputedStyle(custom.querySelector('.cartridge-front')).backgroundColor==='rgb(18, 52, 86)','Custom shell colour was lost');custom.remove();
      const unknown=el('div');Cartridges.build(unknown,'custom-cartridge',230);assert(unknown.querySelector('.solid-wall'),'Unknown cartridge fallback failed');
      await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));
    `);
    await snap('models-front');
    await run(`document.querySelector('.model-gallery h1').textContent='Physical models — backs';document.querySelectorAll('.model-stage > .physical-media').forEach(m=>m.style.transform='rotateX(-12deg) rotateY(158deg)');`);
    await snap('models-back');
    await run(`document.querySelector('.model-gallery h1').textContent='Physical models — edges and connectors';document.querySelectorAll('.model-stage > .physical-media').forEach(m=>m.style.transform='rotateX(-28deg) rotateY(72deg)');`);
    await snap('models-edges');
    await run(`
      document.querySelector('.model-grid').replaceChildren();document.querySelector('.model-grid').style.gridTemplateColumns='repeat(3,1fr)';
      document.querySelector('.model-gallery h1').textContent='NES / Super Nintendo / Game Boy';
      for(const id of ['nes','snes','gb']){
        const game=modelGames.find(g=>g.system===id),a=art(game),tile=el('section','model-tile'),stage=el('div','model-stage');tile.style.height='560px';
        tile.append(el('h2','',a.sys.name),stage);document.querySelector('.model-grid').append(tile);
        stage.append(createMedia(game,{...a,W:520,H:540}));
      }
    `);
    await snap('models-detail',650);
    const count=await run(`
      const grid=document.querySelector('.model-grid');grid.replaceChildren();grid.style.gridTemplateColumns='repeat(3,1fr)';document.querySelector('.model-gallery h1').textContent='Opened cases — lid, tray and inserts';
      let checked=0;
      for(const game of modelGames){
        S.list=[game];S.sel=0;await openCase();clearTimeout(CV.timer);setOpen(true);
        const c=document.querySelector('#caseRig .case'),paper=c.dataset.material==='cardboard';
        assert(c.querySelector('.case-structure'),'Missing case structure: '+game.system);
        assert(c.querySelector(paper?'.box-insert':'.case-rail'),'Missing tray: '+game.system);
        assert(c.querySelector('.lid .physical-solid'),'Flat lid: '+game.system);
        if(paper)assert(c.querySelectorAll('.box-dust-flap').length===2,'Missing dust flaps');
        else {
          assert(c.querySelectorAll('.case-hinge').length===4,'Missing hinges');
          assert(c.querySelector('.case-lid-sheet > .solid-front > .l-front'),'Cover is not attached to lid cap');
          assert(getComputedStyle(c.querySelector('.l-inner')).transform==='none','Lid liner was transformed twice');
        }
        setOpen(false);assert(!c.classList.contains('open'),'Case failed to close');setOpen(true);checked++;
        if(['ps2','ps1','switch','nds','genesis','snes','gb','gba','psp'].includes(game.system)){
          const tile=el('section','model-tile'),stage=el('div','model-stage'),anchor=el('div','case-anchor');tile.style.height='350px';
          tile.append(el('h2','',sysOf(game.system).name+' · '+c.dataset.material),stage);stage.append(anchor);anchor.append(c.cloneNode(true));grid.append(tile);
        }
      }
      closeCase();return checked;
    `);
    await snap('models-cases');
    await run(`document.querySelectorAll('.case-anchor').forEach(n=>n.style.transform='scale(.56) rotateX(-28deg) rotateY(72deg)');`);
    await snap('models-case-edges');
    await run(`document.querySelector('.model-gallery h1').textContent='Closed cases — fitted rims and flaps';document.querySelectorAll('.model-gallery .case').forEach(c=>c.classList.remove('open'));document.querySelectorAll('.case-anchor').forEach(n=>n.style.transform='scale(.65) rotateX(-28deg) rotateY(36deg)');`);
    await snap('models-cases-closed');
    await run(`document.querySelector('.model-gallery').remove();document.head.querySelector('style:last-child')?.remove();document.querySelectorAll('style').forEach(s=>{if(s.textContent.includes('body > :not(.model-gallery)'))s.remove()});S.list=[modelGames.find(g=>g.system==='nds')];S.sel=0;await openCase();clearTimeout(CV.timer);setOpen(true);Object.assign(CV,{rx:-13,ry:24,tx:80,z:0});rig();`);
    await snap('models-viewer');
    await run('setOpen(false);');await snap('models-viewer-closed');
    if(errors.length)throw Error(errors.join('\n'));
    console.log('Passed 13 shell models and '+count+' case profiles; front/back/edge geometry, dimensions, photo/custom-art preservation, opening/closing, and nine visual captures.');
    clearTimeout(watchdog);app.exit(0);
  }catch(e){console.error(e);clearTimeout(watchdog);app.exit(1)}
});
