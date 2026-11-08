// Exercise the real renderer in an isolated Electron window, with no user-data writes.
const {app,BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
app.setPath('sessionData',path.join(os.tmpdir(),'PyroCade-carousel-check-'+process.pid));
const output=path.resolve(__dirname,'../output');
app.whenReady().then(async()=>{
  const errors=[];
  const win=new BrowserWindow({show:false,width:1600,height:900,webPreferences:{preload:path.join(__dirname,'check-prompts-preload.cjs'),contextIsolation:true,sandbox:false,backgroundThrottling:false,offscreen:true}});
  // A watchdog that only says "timed out" cannot be debugged from a CI log, so every stage names
  // itself and the watchdog reports the one it was stuck in, and for how long.
  let stage='loading the renderer',stageAt=Date.now();
  const step=name=>{stage=name;stageAt=Date.now()};
  const watchdog=setTimeout(()=>{console.error(`Carousel check timed out while ${stage} (${((Date.now()-stageAt)/1000).toFixed(1)}s in that stage)`);app.exit(1)},45000);
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
  const run=code=>win.webContents.executeJavaScript(`(async()=>{const assert=(v,m)=>{if(!v)throw new Error(m)}; const pause=ms=>new Promise(r=>setTimeout(r,ms)); const finish=()=>document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect.getComputedTiming().endTime))a.finish()}); const until=async(fn,m)=>{for(let i=0;i<300;i++){const v=fn();if(v)return v;await pause(10)}throw new Error(m)}; ${code}})()`);
  async function snap(name){
    step('decoding images for '+name);
    await run('await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));');
    win.webContents.invalidate();
    await new Promise(r=>setTimeout(r,120));
    step('capturing '+name);
    const shot=await win.webContents.capturePage();
    if(shot.isEmpty())throw new Error('Empty screenshot: '+name);
    fs.writeFileSync(path.join(output,name),shot.toPNG());
  }
  try {
    fs.mkdirSync(output,{recursive:true});
    await win.loadFile(path.resolve(__dirname,'../renderer/index.html'));
    step('checking the disc and cartridge reveal');
    await run(`
      await until(()=>S.games.length===12,'Fixture library failed');
      applyMotion('full'); select(0); await pause(1700);finish();
      const selected=document.querySelector('.item.sel');
      assert(selected.classList.contains('media-revealed'),'Disc did not reveal after selection');
      assert(selected.querySelector('.disc-model'),'Disc system does not have a disc');
      assert(selected.querySelectorAll('.box > .face').length===6,'Box must have six faces');
      assert(getComputedStyle(selected).filter==='none','A filter is flattening the box');
      assert(getComputedStyle(selected).transformStyle==='preserve-3d','Missing preserved depth');
      const shell=selected.querySelector('.box');
      assert(getComputedStyle(shell).transformStyle==='preserve-3d'&&getComputedStyle(shell).filter==='none','Finish flattened the case');
      assert(shell.querySelectorAll('.case-bevel').length===4,'Missing physical bevels');
      assert(selected.querySelector('.ground-reflection[aria-hidden="true"]'),'Reflection must remain decorative');
      const r=shell.getBoundingClientRect();document.querySelector('#stage').dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+r.width*.75,clientY:r.top+r.height*.25}));
      // The light is set inside a requestAnimationFrame, so wait for the value rather than for a
      // fixed 40ms: on a runner whose GPU process died at start-up that frame lands much later.
      await until(()=>shell.style.getPropertyValue('--light-x'),'Surface light did not respond');
      assert(new DOMMatrix(getComputedStyle(selected.querySelector('.physical-media')).transform).m41>0,'Disc did not slide out');
      document.querySelector('#shelfNext').click(); select(2); await pause(1700);finish();
      assert(document.querySelector('.item.sel .cartridge-gba'),'GBA system must have a GBA cartridge');
      assert(document.querySelectorAll('.item.media-revealed').length===1,'Only selected media should be out');
      const cart=document.querySelector('.item.sel .physical-media');
      assert(new DOMMatrix(getComputedStyle(cart).transform).m42<0,'Cartridge did not lift out');
    `);
    await snap('carousel-cartridge-demo.png');
    step('returning to the disc');
    await run(`select(0);await pause(1700);finish();`);
    await snap('carousel-disc-demo.png');
    step('opening the case viewer');
    await run(`
      await openCase();await pause(1900);finish();
      const spine = document.querySelector('#caseRig .case-spine');
      const lid = document.querySelector('#caseRig .lid');
      assert(spine?.querySelector('.f-left[data-spine]') && spine.querySelector('.case-spine-inner'), 'Case hinge lost its printed spine or inner panel');
      const spineMatrix = new DOMMatrix(getComputedStyle(spine).transform);
      const edge = spineMatrix.transformPoint({x:spine.offsetWidth});
      const hinge = new DOMMatrix(getComputedStyle(lid).transform).transformPoint({});
      assert(Math.hypot(edge.x-hinge.x, edge.z-hinge.z)<.1, 'Opened lid disconnected from the spine');
    `);
    await snap('carousel-case-viewer.png');
    step('closing the case viewer');
    await run(`closeCase();`);
    step('checking the Bookshelf disc and hover');
    const hover = await run(`
      Appearance.apply({layout:'bookshelf'},false);
      await until(()=>document.querySelector('.item.sel.media-revealed .disc-rotor'),'Bookshelf disc did not reveal');
      finish();
      const disc = document.querySelector('.item.sel .disc-model');
      const discStyle = getComputedStyle(disc);
      const box = disc.closest('.item').querySelector('.box');
      const peek = new DOMMatrix(discStyle.transform).m41 - (box.offsetWidth-disc.offsetWidth)/2;
      assert(discStyle.visibility==='visible' && peek>=47,'Bookshelf disc does not extend far enough past the case');
      assert(getComputedStyle(disc.firstChild).animationDuration==='120s','Bookshelf disc should take two minutes per turn');
      for(const spine of document.querySelectorAll('.item:not(.sel,.far) .f-left')){
        const bounds = spine.getBoundingClientRect();
        const x = Math.round(bounds.x+bounds.width/2), y = Math.round(bounds.y+bounds.height/2);
        const item = spine.closest('.item');
        if(document.elementFromPoint(x,y)?.closest('.item')===item) return {x,y,id:item.id};
      }
      throw new Error('No Bookshelf spine could be hit-tested');
    `);
    win.webContents.sendInputEvent({type:'mouseMove',x:hover.x,y:hover.y});
    await run(`
      const {x,y,id} = ${JSON.stringify(hover)};
      const item = document.getElementById(id);
      await until(()=>item.matches(':hover'),'Bookshelf spine did not receive mouse hover');
      assert(getComputedStyle(item).filter==='none','Hover flattens the Bookshelf case');
      for(let frame=0;frame<4;frame++){
        await new Promise(requestAnimationFrame);
        assert(document.elementFromPoint(x,y)?.closest('.item')===item,'Hover changed the Bookshelf hit target');
      }
      applyMotion('reduced');
      assert(getComputedStyle(document.querySelector('.item.sel .disc-rotor')).animationName==='none','Bookshelf disc spins in reduced motion');
      Appearance.apply({layout:'carousel'},false);
      applyMotion('full');
    `);
    step('checking Super Famicom cover proportions');
    await run(`
      const originalGames = S.games;
      const system = {id:'snes',name:'Super Nintendo',caseType:'bigbox',media:'cart'};
      S.config.systems.push(system);
      const cover = (width,height) => {
        const canvas = document.createElement('canvas');
        canvas.width=width;canvas.height=height;
        return canvas.toDataURL();
      };
      const fixture = (id,base,width,height) => ({id,base,title:id,system:'snes',media:{front:cover(width,height)},info:{},demo:true});
      S.games=[fixture('Tall','Tall (Japan)',55,100),fixture('Wide','Wide',183,100),fixture('Standard','Standard (USA)',141,100)];
      setSystem('snes');
      await until(()=>S.games.every(game=>game._aspect),'SNES covers were not measured');
      for(const [game,expected] of S.games.map((game,i)=>[game,['superfamicom-tall','superfamicom-wide','snes'][i]])){
        const box = [...items.values()].find(node=>node.dataset.id===game.id).querySelector('.box');
        assert(box.dataset.packaging===expected,'Wrong box shape for '+game.title);
        assert(getComputedStyle(box.querySelector('.f-front')).backgroundSize==='contain','Cover is stretched for '+game.title);
      }
      S.config.systems.pop();
      S.games=originalGames;
      setSystem('all');select(0);
    `);
    step('checking navigation, focus, motion and empty search');
    await run(`
      // Browse quickly: pending media from earlier selections must never pop out later.
      select(1); select(2); select(3); await pause(550);
      assert([...document.querySelectorAll('.media-revealed')].every(e=>e.classList.contains('sel')),'Stale selection timer');
      document.querySelector('#btnCase').focus();
      await openCase();await pause(750);
      assert(document.querySelector('#view-library').inert,'Dialog did not isolate library focus');
      assert(document.activeElement.id==='cvBack','Back should receive dialog focus');
      assert(document.querySelector('#caseRig .physical-media'),'Case viewer missing media');
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));
      assert(document.activeElement.id==='cvPlay','Dialog focus did not wrap');
      closeCase();
      assert(!document.querySelector('#view-library').inert,'Library stayed inert');
      assert(document.activeElement.id==='btnCase','Dialog did not restore focus');
      // Cancel pending case construction and its auto-open timeout.
      const pending=openCase();closeCase();await pending;await pause(750);
      assert(!caseShown()&&!document.querySelector('#caseRig .case'),'Closed dialog reopened after async artwork');
      applyMotion('reduced');select(2);
      assert(document.querySelector('.item.sel').classList.contains('media-revealed'),'Reduced-motion preview must be instant');
      assert(getComputedStyle(document.querySelector('.item.sel .sway')).animationName==='none','Reduced-motion sway still running');
      // Empty search must remove preview and disable navigation.
      S.query='no-match-8d5d6d';setSystem('all');
      assert(!document.querySelector('.item.sel'),'Stale selected game in empty search');
      assert(document.querySelector('#shelfPrev').disabled&&document.querySelector('#shelfNext').disabled,'Empty shelf navigation enabled');
      S.query='';setSystem('all');select(0);resizeShelf();await pause(100);
    `);
    win.setContentSize(1100,650);
    step('checking the minimum window layout');
    await run(`
      await pause(100);resizeShelf();layout();await pause(100);
      const info=document.querySelector('#info').getBoundingClientRect();
      const hints=document.querySelector('#libraryHints').getBoundingClientRect();
      const shelf=document.querySelector('#stage').getBoundingClientRect();
      assert(info.bottom<=hints.top,'Info overlaps prompts at minimum size');
      assert(shelf.bottom<info.top,'Shelf overlaps game information');
      assert(getComputedStyle(document.querySelector('#stage')).perspective!=='none','Stage missing perspective');
      showView('settings');document.querySelector('#sMotion').value='reduced';document.querySelector('#sMotion').dispatchEvent(new Event('change'));
      await document.querySelector('#btnSave').onclick();assert(S.config.motion==='reduced','Motion preference did not persist');
    `);
    step('waiting before the minimum-window capture');
    await run('await pause(3300);');
    await snap('carousel-minimum-window.png');
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('Passed: disc/cartridge reveal, Bookshelf hover, case depth and hinge, Super Famicom proportions, fast navigation, case lifecycle, dialog focus, reduced motion, empty search and minimum layout.');
    clearTimeout(watchdog);app.exit(0);
  }catch(e){console.error(e);app.exit(1)}
});
