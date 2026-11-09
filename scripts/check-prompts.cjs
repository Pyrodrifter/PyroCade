const {app,BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
app.setPath('sessionData',path.join(os.tmpdir(),'PyroCade-prompts-check-'+process.pid));
app.whenReady().then(async()=>{
  const errors=[];
  const win=new BrowserWindow({show:false,width:1600,height:900,webPreferences:{preload:path.join(__dirname,'check-prompts-preload.cjs'),contextIsolation:true,sandbox:false,backgroundThrottling:false}});
  const watchdog = setTimeout(()=>{console.error('Prompt check timed out');app.exit(1)},30000);
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
  try {
    await win.loadFile(path.resolve(__dirname,'../renderer/index.html'));
    const result=await win.webContents.executeJavaScript(`(async()=>{
      const assert=(v,m)=>{if(!v)throw new Error(m)};
      // Drive the input poll explicitly: hidden windows may suspend compositor frames.
      const frame=()=>new Promise(r=>setTimeout(()=>{pollPad(performance.now());r()},20));
      await frame();
      const loaded=await Promise.all([...document.querySelectorAll('.button-prompt')].map(i=>i.decode().then(()=>true)));
      assert(loaded.length>0,'No prompts rendered');
      assert(document.querySelector('#btnPlay img').alt==='Enter','Keyboard prompts at boot');
      // Replace browser gamepads with a controllable standard-mapped device.
      window.testPads=[];
      Object.defineProperty(navigator,'getGamepads',{configurable:true,value:()=>window.testPads});
      const controller=(id,index=0)=>({id,index,mapping:'standard',axes:[0,0],buttons:Array.from({length:18},()=>({pressed:false,value:0}))});
      const press=async(gp,index)=>{gp.buttons[index].pressed=true;await frame();gp.buttons[index].pressed=false;await frame()};
      const xbox=controller('Xbox Wireless Controller'); window.testPads=[xbox]; await frame();
      assert(document.querySelector('#btnPlay img').alt==='Enter','Idle pad stole prompts');
      await press(xbox,15);
      assert(document.querySelector('#btnPlay img').alt==='A','Xbox detection');
      const before=S.sel; await press(xbox,7);
      assert(S.sel!==before,'Trigger did not jump library');
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));await frame();
      assert(document.querySelector('#btnPlay img').alt==='Enter','Keyboard did not reclaim prompts');
      const ps=controller('DualSense Wireless Controller',1);window.testPads=[xbox,ps];await press(ps,15);
      assert(document.querySelector('#btnPlay img').alt==='cross','Second active pad / PlayStation detection');
      const ns=controller('Nintendo Switch Pro Controller',2);window.testPads=[ns];await press(ns,15);
      assert(document.querySelector('#btnPlay img').alt==='A','Nintendo Play is A (east)');
      assert(document.querySelector('#cvBack img').alt==='B','Nintendo Back is B (south)');
      // Override preview, then persist through the ordinary Save flow (mock API).
      showView('settings'); const selector=document.querySelector('#sPrompts');
      selector.value='playstation';selector.dispatchEvent(new Event('change'));
      await document.querySelector('#btnSave').onclick();
      assert(S.config.promptFamily==='playstation','Preference was not saved');
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));await frame();
      assert(document.querySelector('#btnPlay img').alt==='cross','Override changed with input');
      selector.value='auto';selector.dispatchEvent(new Event('change'));
      await openCase();await new Promise(r=>setTimeout(r,750));
      await press(ns,3);assert(!CV.open,'North did not toggle case closed');
      await press(ns,3);assert(CV.open,'North did not toggle case open');
      await press(ns,0);assert(!caseShown(),'South (B) did not go back');
      window.testPads=[];await frame();
      assert(document.querySelector('#btnPlay img').alt==='Enter','Disconnect did not reset prompts');
      window.testPads=[xbox];await press(xbox,15);
      assert(document.querySelector('#btnPlay img').alt==='A','Reconnect did not reset held state');
      const generic=controller('USB Gamepad',3);generic.mapping='';window.testPads=[generic];await press(generic,15);
      assert(document.querySelector('#btnPlay img').alt==='1','Generic adapter prompts');
      document.body.dispatchEvent(new Event('pointerdown',{bubbles:true}));await frame();
      assert(document.querySelector('#btnPlay img').alt==='Enter','Mouse did not reclaim prompts');
      generic.axes[0]=.55;await frame();generic.axes[0]=0;await frame();
      assert(document.querySelector('#btnPlay img').alt==='1','Stick input near threshold did not switch prompts');
      window.testPads=[];await frame();
      await Promise.all([...document.querySelectorAll('.button-prompt')].map(i=>i.decode()));
      const bar=document.querySelector('#libraryHints').getBoundingClientRect(),info=document.querySelector('#info').getBoundingClientRect();
      assert(bar.top>=info.bottom,'Prompt bar overlaps game info');
      return {checks:'All six families, mouse/stick input switching, second controller, overrides, saving, case toggle/back, triggers, disconnect/reconnect, image loading and layout',prompts:PromptManifest.assets.length};
    })()`);
    if(errors.length)throw new Error(errors.join('\n'));
    fs.mkdirSync(path.resolve(__dirname,'../output'),{recursive:true});
    fs.writeFileSync(path.resolve(__dirname,'../output/controller-prompts-in-app.png'),(await win.webContents.capturePage()).toPNG());
    win.setContentSize(1100,650);
    await new Promise(r=>setTimeout(r,100));
    await win.webContents.executeJavaScript(`{
      const bar=document.querySelector('#libraryHints').getBoundingClientRect(),info=document.querySelector('#info').getBoundingClientRect();
      if(bar.top<info.bottom || bar.bottom>innerHeight)throw new Error('Prompt bar does not fit minimum window size');
    }`);
    console.log(JSON.stringify(result));
    app.exit(0);
  }catch(e){console.error(e);app.exit(1)}
});
