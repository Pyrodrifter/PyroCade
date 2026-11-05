const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url');
const root=path.resolve(__dirname,'..');app.setPath('sessionData',path.join(os.tmpdir(),'PyroCade-library-check-'+process.pid));
const coverDir=path.join(root,'data/media/switch/covers');
// Local covers may be PNG or JPG (sharper downloads are stored as JPG).
const fixtures=fs.readdirSync(coverDir).filter(n=>/\.(png|jpe?g)$/i.test(n)).slice(0,16).map((name,i)=>({id:'fixture:'+i,system:'switch',base:name.replace(/\.(png|jpe?g)$/i,''),title:name.replace(/\[[^\]]*\]|\([^)]*\)|\.(png|jpe?g)$/gi,'').replace(/\bv?\d+(?:\.\d+)+\b/gi,'').trim(),demo:true,media:{front:pathToFileURL(path.join(coverDir,name)).href},info:{}}));
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1584,height:861,webPreferences:{preload:path.join(__dirname,'check-prompts-preload.cjs'),sandbox:false,contextIsolation:true,offscreen:true,backgroundThrottling:false}});win.setContentSize(1584,861);
  const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});
  const watchdog=setTimeout(()=>{console.error('Library UI check timed out');app.exit(1)},60000);
  const run=code=>win.webContents.executeJavaScript(`(async()=>{const assert=(v,m)=>{if(!v)throw new Error(m)};const pause=ms=>new Promise(r=>setTimeout(r,ms));${code}})()`);
  const snap=async name=>{win.webContents.invalidate();await new Promise(r=>setTimeout(r,150));fs.writeFileSync(path.join(root,'output',name),(await win.webContents.capturePage()).toPNG())};
  try{
    await win.loadFile(path.join(root,'renderer/index.html'));
    await run(`
      await pause(120);applyMotion('reduced');
      S.config.systems=Object.entries(Packaging.profiles).map(([id,p])=>({id,name:p.brand,color:p.accent,romDir:'fixture/'+id,caseType:['switch','switch2'].includes(id)?'switch':'dvd',media:Cartridges.profiles[id]?'cart':'disc'}));
      S.games=${JSON.stringify(fixtures)};S.demo=false;document.querySelector('#demoBanner').classList.add('hidden');renderChips();setSystem('switch');select(3);
      for(const g of S.games)measure(g);await pause(200);
      assert(document.querySelectorAll('#systems button').length===25,'Configured empty systems were lost');
      assert(document.querySelectorAll('#systems [aria-pressed=true]').length===1,'System selection is ambiguous');
      const rail=document.querySelector('#systems');rail.scrollLeft=0;rail.dispatchEvent(new WheelEvent('wheel',{deltaY:240,cancelable:true}));assert(rail.scrollLeft>0,'Mouse wheel does not scroll the system rail');
      const first=rail.querySelector('button');first.focus();first.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert(S.system==='ps1'&&document.activeElement.dataset.id==='ps1','Rail keyboard navigation did not move focus and selection');
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));assert(LibraryUI.pickerOpen()&&document.activeElement.id==='systemSearch','Ctrl+K did not open the system browser');
      const search=document.querySelector('#systemSearch');search.value='switch 2';search.dispatchEvent(new Event('input'));assert(document.querySelectorAll('#systemPickerGrid button').length===1,'System filter failed');
      search.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));await pause(150);assert(S.system==='switch2'&&!LibraryUI.pickerOpen(),'System picker did not select an empty configured system');assert(document.activeElement.id==='btnSystemPicker','Picker did not restore focus');
      setSystem('switch');select(3);LibraryUI.openPicker();input('right');assert(document.activeElement.matches('#systemPickerGrid button'),'Controller cannot browse the picker');input('back');await pause(20);
      LibraryUI.openPicker();input('manual');assert(Appearance.panelOpen()&&!LibraryUI.pickerOpen(),'Controller cannot open appearance from system browser');
      input('right');assert(document.activeElement.dataset.layout==='vertical','Controller cannot move among layouts');input('play');assert(Appearance.mode()==='vertical','Controller cannot select layout');input('left');input('play');
      assert(document.querySelector('.system-tile').offsetHeight<=38,'System rail is no longer compact');
    `);
    await snap('ui-appearance-panel.png');
    await run(`document.querySelector('#appearancePicker').close();await pause(30);`);
    const themes=['ember','glacier','violet','mint'];let index=0;
    for(const layout of ['carousel','vertical','flipbook','bookshelf','spinner','swatches']){
      await run(`
        setSystem('switch');select(3);Appearance.apply({layout:'${layout}',theme:'${themes[index++]}' });await Appearance.persist();await pause(100);
        assert(document.documentElement.dataset.layout==='${layout}','Layout did not apply');
        assert(S.config.libraryLayout==='${layout}','Layout was not persisted');assert(document.querySelector('.item.sel'),'Selection was lost');
        if('${layout}'==='vertical'){const old=S.sel;input('down');assert(S.sel===old+1,'Vertical input does not move down');input('up')}
        if('${layout}'==='swatches'){const old=S.sel,cols=Appearance.geometry(document.querySelector('#stage'),S.sel,S.list.length).columns;input('down');assert(S.sel===old+cols,'Grid input does not move by a row');input('up');assert(document.querySelectorAll('.item:not(.far) .swatch-card').length>1,'Colour cards did not render');}
        const p=document.querySelector('.item.sel').getBoundingClientRect(),info=document.querySelector('#info').getBoundingClientRect();assert(p.bottom<info.top+2,'Selected preview overlaps game details in ${layout}');
      `);
      await snap('ui-layout-'+layout+'.png');
    }
    await run(`
      for(const theme of Object.keys(Appearance.themes)){Appearance.apply({theme});assert(document.documentElement.dataset.theme===theme,'Theme did not apply');assert(document.documentElement.style.getPropertyValue('--accent')===Appearance.themes[theme].accent,'Theme accent did not change');}
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'/',bubbles:true}));assert(document.activeElement.id==='search','Slash did not focus search');
      const search=document.querySelector('#search');search.value='no-match-fixture';search.dispatchEvent(new Event('input'));await pause(180);assert(!S.list.length&&!document.querySelector('#clearSearch').classList.contains('hidden'),'Search clear control missing');document.querySelector('#clearSearch').click();await pause(180);assert(S.list.length===${fixtures.length},'Clear search did not restore the collection');
      await openCase();assert(caseShown()&&document.querySelector('#caseRig .case'),'Colour cards cannot open the physical case');closeCase();
    `);
    win.setContentSize(1100,650);
    for(const layout of ['carousel','vertical','flipbook','bookshelf','spinner','swatches'])await run(`
      Appearance.apply({layout:'${layout}'},false);resizeShelf();layout();await pause(60);
      const toolbar=document.querySelector('.toolbar').getBoundingClientRect(),stage=document.querySelector('#stage').getBoundingClientRect(),info=document.querySelector('#info').getBoundingClientRect();
      assert(toolbar.bottom<stage.top+10,'System bar overlaps preview at minimum size');assert(stage.bottom<info.top,'Preview overlaps details at minimum size');
      assert(document.querySelector('#btnAppearance').getBoundingClientRect().right<innerWidth,'Appearance button is offscreen');
    `);
    await snap('ui-minimum-window.png');
    await run(`document.querySelector('#btnAppearance').click();await pause(30);const panel=document.querySelector('#appearancePicker').getBoundingClientRect(),volume=document.querySelector('#soundVolume').getBoundingClientRect();assert(volume.bottom<panel.bottom,'Sound controls are clipped in a small window');`);
    await snap('ui-appearance-minimum.png');
    await run(`document.querySelector('#appearancePicker').close();await pause(30);`);
    const sound=await run(`
      assert(!AudioUI.play('unknown'),'Unknown sound should be ignored');AudioUI.configure({enabled:false});assert(!AudioUI.play('scroll'),'Muted sound played');
      window.AudioContext=class extends OfflineAudioContext{constructor(){super(2,44100,44100);window.offlineSound=this}resume(){return Promise.resolve()}};
      document.querySelector('#soundToggle').click();document.querySelector('#soundVolume').value=30;document.querySelector('#soundVolume').dispatchEvent(new Event('input'));document.querySelector('#soundPreview').click();
      assert(AudioUI.settings().enabled&&AudioUI.settings().volume===.3,'Sound controls did not update engine');
      const buffer=await window.offlineSound.startRendering(),samples=buffer.getChannelData(0);let peak=0,energy=0;for(const sample of samples){peak=Math.max(peak,Math.abs(sample));energy+=sample*sample}
      assert(peak>0.001&&peak<.3&&energy>0,'Sound engine produced silence or excessive output');
      AudioUI.configure({enabled:false,volume:0});assert(!AudioUI.play('scroll'),'Zero volume did not silence cues');await Appearance.persist();assert(!S.config.uiSound.enabled&&S.config.uiSound.volume===0,'Sound preference was not saved');
      return {peak:Number(peak.toFixed(4)),energy:Number(energy.toFixed(4))};
    `);
    if(errors.length)throw new Error(errors.join('\n'));
    clearTimeout(watchdog);console.log(JSON.stringify({passed:'System icons/counts, horizontal wheel and keyboard navigation, searchable picker, controller navigation, focus restoration, six layouts, five themes, automatic preference saving, search clear, case viewer, minimum window and rendered audio',sound}));app.exit(0);
  }catch(e){console.error(e);app.exit(1)}
});
