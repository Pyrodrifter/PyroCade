// Real renderer with fixture API; never writes user settings or launches games.
const {app,BrowserWindow}=require('electron');
const path=require('node:path'),os=require('node:os'),fs=require('node:fs');
app.setPath('sessionData',path.join(os.tmpdir(),'PyroCade-performance-'+process.pid));
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1400,height:900,webPreferences:{preload:path.join(__dirname,'check-prompts-preload.cjs'),contextIsolation:true,sandbox:false,offscreen:true,backgroundThrottling:false}});
  const watchdog=setTimeout(()=>app.exit(1),45000);
  try{
    await win.loadFile(path.resolve(__dirname,'../renderer/index.html'));
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const assert=(v,m)=>{if(!v)throw Error(m)},pause=ms=>new Promise(r=>setTimeout(r,ms));await pause(250);
      const toggle=(id,on)=>{const b=document.querySelector('#'+id);b.checked=on;b.dispatchEvent(new Event('change'))};
      renderSettings();assert(modelsEnabled(),'Models should default on');
      const fullNodes=document.querySelector('#carousel').querySelectorAll('*').length;
      toggle('sDisableModels',true);await performanceSave;
      assert((await api.getConfig()).modelsEnabled===false,'Model preference not saved');
      assert(!document.querySelector('#carousel .physical-media,#carousel .case-bevel,#carousel .physical-solid'),'Heavy models still constructed');
      assert(document.querySelector('#carousel .flat-cover .f-front'),'No flat cover');
      const flatNodes=document.querySelector('#carousel').querySelectorAll('*').length;assert(flatNodes<fullNodes,'Flat mode did not reduce DOM');
      for(const layoutName of Object.keys(Appearance.layouts)){
        Appearance.apply({layout:layoutName},false);select(1);
        const s=document.querySelector('.item.sel .sway');assert(getComputedStyle(s).display!=='none','Hidden cover in '+layoutName);
        assert(getComputedStyle(s).transform==='none','Rotated cover in '+layoutName);
      }
      await openCase();assert(document.querySelector('.flat-case'),'Flat viewer missing');
      assert(!document.querySelector('#caseRig .physical-solid,#caseRig .physical-media,#caseRig .lid'),'Viewer still builds models');
      document.querySelector('#cvFlip').click();assert(document.querySelector('.flat-case.flat-back'),'Flat back cover unavailable');closeCase();
      applyMotion('full');toggle('sDisableAnimations',true);await performanceSave;
      assert((await api.getConfig()).animationsEnabled===false,'Animation preference not saved');
      assert(document.documentElement.dataset.motion==='reduced','Animation preference not effective');
      assert(getComputedStyle(document.querySelector('.spinner')).animationName==='none','Spinner still animated');
      const canvas=document.querySelector('#xmb');await pause(100);const before=canvas.toDataURL();await pause(350);assert(canvas.toDataURL()===before,'Background continues drawing');
      toggle('sDisableModels',false);assert(document.querySelector('#carousel .physical-media'),'Models did not return');
      toggle('sDisableAnimations',false);await performanceSave;assert(document.documentElement.dataset.motion==='full','Motion preference not restored');
      toggle('sDisableModels',true);toggle('sDisableAnimations',true);await performanceSave;
      showView('library');return {fullNodes,flatNodes};
    })()`);
    await new Promise(r=>setTimeout(r,600));win.webContents.invalidate();
    fs.mkdirSync(path.resolve(__dirname,'../output'),{recursive:true});fs.writeFileSync(path.resolve(__dirname,'../output/performance-flat-library.png'),(await win.webContents.capturePage()).toPNG());
    console.log('Passed performance toggles, saved settings, all layouts, flat viewer/back cover, stopped animations/background, and restoration.',result);
    clearTimeout(watchdog);app.exit(0);
  }catch(e){console.error(e);clearTimeout(watchdog);app.exit(1)}
});
