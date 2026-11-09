// This fixture targets shared-renderer behavior only; Electron is not the Tauri host.
// Treating a passing result as Tauri validation tests the wrong WebView.
const {app,BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root=path.resolve(__dirname,'..');
const scratchDir=path.join(root,'localTmp');
const sessionDataDir=path.join(scratchDir,'PyroCade-carousel-check-'+process.pid);
fs.mkdirSync(sessionDataDir,{recursive:true});
app.setPath('sessionData',sessionDataDir);
const output=path.join(scratchDir,'carousel-check');
app.whenReady().then(async()=>{
  const errors=[];
  const win=new BrowserWindow({show:false,width:1600,height:900,webPreferences:{preload:path.join(__dirname,'check-prompts-preload.cjs'),contextIsolation:true,sandbox:false,backgroundThrottling:false,offscreen:true}});
  const watchdog=setTimeout(()=>{console.error('Carousel check timed out');app.exit(1)},45000);
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
  const run=code=>win.webContents.executeJavaScript(`(async()=>{const assert=(v,m)=>{if(!v)throw new Error(m)}; const pause=ms=>new Promise(r=>setTimeout(r,ms)); const until=async(fn,msg)=>{const start=Date.now();for(;;){let value;try{value=await fn();}catch{}if(value)return value;if(Date.now()-start>8000)throw new Error(msg||'Timed out waiting for condition');await pause(30);}}; const finish=()=>document.getAnimations().forEach(a=>{if(Number.isFinite(a.effect.getComputedTiming().endTime))a.finish()}); ${code}})()`);
  async function snap(name){
    await run('await Promise.all([...document.images].map(i=>i.decode().catch(()=>{})));');
    win.webContents.invalidate();
    await new Promise(r=>setTimeout(r,120));
    const shot=await win.webContents.capturePage();
    if(shot.isEmpty())throw new Error('Empty screenshot: '+name);
    fs.writeFileSync(path.join(output,name),shot.toPNG());
  }
  try {
    fs.mkdirSync(output,{recursive:true});
    await win.loadFile(path.resolve(__dirname,'../renderer/index.html'));
    await run(`
      await pause(100);
      assert(S.games.length===12,'Fixture library failed');
      assert(typeof play==='function'&&play.toString().includes('launching'),'play() is missing its re-entrancy guard');
      assert(document.querySelector('#xmb'),'Ambient canvas is missing');
      assert(Ambient.backgrounds().includes('loom'),'Ambient scenes are unavailable');
      Appearance.apply({infoBar:'compact'},false);
      assert(document.documentElement.dataset.infoBar==='compact','Info bar setting did not apply');
      Appearance.apply({infoBar:'small'},false);
      assert(Appearance.layouts.bookshelf&&Appearance.layouts['page-turn']&&Appearance.layouts.media,'Bookshelf, Page turn and Media carousel layouts are unavailable');
      assert(!Appearance.layouts.spinner&&!Appearance.layouts.swatches,'Retired layouts remain in the picker');
      Appearance.apply({layout:'bookshelf'},false);layout();
      assert(document.querySelector('#layoutOptions [data-layout="bookshelf"]'),'Bookshelf option is missing');
      assert([...document.querySelectorAll('.item')].some(item=>item.style.transform.includes('rotateY(90deg)')),'Bookshelf cases are not displayed spine-out');
      Appearance.apply({layout:'page-turn'},false);layout();
      assert([...document.querySelectorAll('.item')].some(item=>item.style.transform.includes('rotateY(')),'Page turn cases are not arranged around a spine');
      Appearance.apply({layout:'carousel'},false);layout();
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
      const r=shell.getBoundingClientRect();document.querySelector('#stage').dispatchEvent(new PointerEvent('pointermove',{clientX:r.left+r.width*.75,clientY:r.top+r.height*.25}));await pause(40);
      assert(shell.style.getPropertyValue('--light-x'),'Surface light did not respond');
      assert(new DOMMatrix(getComputedStyle(selected.querySelector('.physical-media')).transform).m41>0,'Disc did not slide out');
      document.querySelector('#shelfNext').click(); select(2); await pause(1700);finish();
      assert(document.querySelector('.item.sel .cartridge-gba'),'GBA system must have a GBA cartridge');
      assert(document.querySelectorAll('.item.media-revealed').length===1,'Only selected media should be out');
      const cart=document.querySelector('.item.sel .physical-media');
      assert(new DOMMatrix(getComputedStyle(cart).transform).m42<0,'Cartridge did not lift out');
    `);
    await snap('carousel-cartridge-demo.png');
    await run(`select(0);await pause(1700);finish();`);
    await snap('carousel-disc-demo.png');
    await run(`await openCase();await pause(1900);finish();`);
    await snap('carousel-case-viewer.png');
    await run(`closeCase();`);
    await run(`
      for(const [retired,replacement] of [['spinner','page-turn'],['swatches','media'],['top-flip','media']]){
        assert(!document.querySelector('#layoutOptions [data-layout="'+retired+'"]'),'Retired layout remains in the picker');
        Appearance.apply({layout:retired},false);
        assert(Appearance.mode()===replacement,'Saved layout did not migrate to '+replacement);
      }
      Appearance.apply({layout:'media'},false);layout();
      const mediaSel=document.querySelector('.item.sel');
      assert(getComputedStyle(mediaSel.querySelector('.box')).display==='none','Media carousel still shows the case');
      const media=mediaSel.querySelector('.physical-media');
      assert(media&&getComputedStyle(media).visibility==='visible','Media carousel does not show the disc or cartridge');
      for(const item of document.querySelectorAll('.item:not(.far)'))assert(getComputedStyle(item.querySelector('.physical-media')).visibility==='visible','A neighbouring disc or cartridge is hidden');
      const oldMediaSel=S.sel;
      input('right');assert(S.sel===oldMediaSel+1,'Media carousel did not move right');input('left');assert(S.sel===oldMediaSel,'Media carousel did not move left');
      Appearance.apply({layout:'page-turn'},false);layout();
      const oldPageSel=S.sel,outgoing=items.get(oldPageSel);
      input('right');
      assert(S.sel===oldPageSel+1,'Page turn did not advance to the next case');
      let pose;
      for(let i=0;i<60;i++){
        pose=new DOMMatrix(getComputedStyle(outgoing).transform);
        if(pose.m11<0)break;
        await pause(16);
      }
      assert(pose.m11<0,'Page turn did not swing the outgoing case across the spine: '+outgoing.style.transform);
      input('left');await pause(40);
      Appearance.apply({layout:'carousel'},false);layout();
    `);
    await run(`
      Appearance.apply({layout:'bookshelf'},false);
      await until(()=>document.querySelector('.item.sel.media-revealed .disc-rotor'),'Bookshelf disc did not reveal');
      const disc=document.querySelector('.item.sel .disc-model');
      const discStyle=getComputedStyle(disc);
      const box=disc.closest('.item').querySelector('.box');
      const peek=new DOMMatrix(discStyle.transform).m41-(box.offsetWidth-disc.offsetWidth)/2;
      assert(discStyle.visibility==='visible'&&peek>=47,'Bookshelf disc does not extend far enough past the case');
      assert(getComputedStyle(disc.firstChild).animationDuration==='120s','Bookshelf disc should take two minutes per turn');
      applyMotion('reduced');
      assert(getComputedStyle(document.querySelector('.item.sel .disc-rotor')).animationName==='none','Bookshelf disc spins in reduced motion');
      Appearance.apply({layout:'carousel'},false);layout();applyMotion('full');
    `);
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
    await run('await pause(3300);');
    await snap('carousel-minimum-window.png');
    if(errors.length)throw new Error(errors.join('\n'));
    console.log('Passed: disc/cartridge reveal, Page turn and Media carousel, retired-layout migration, Bookshelf disc peek, six box faces, depth, fast navigation, case lifecycle, dialog focus, reduced motion, empty search, minimum layout, persisted motion preference.');
    clearTimeout(watchdog);app.exit(0);
  }catch(e){console.error(e);app.exit(1)}
});
