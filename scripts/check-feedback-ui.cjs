// Exercise the actual form and report service without opening a browser, changing
// the user's clipboard, reading their library or submitting anything to GitHub.
const {app,BrowserWindow,ipcMain}=require('electron');
const path=require('node:path'),fs=require('node:fs'),os=require('node:os');
const {createFeedbackService}=require('../feedback');
const root=path.resolve(__dirname,'..');
app.setPath('sessionData',path.join(os.tmpdir(),'PyroCade-feedback-check-'+process.pid));
const opened=[],copied=[];
let failBrowser=false,failInfo=false;
const service=createFeedbackService({diagnostics:()=>{if(failInfo)throw new Error('Device unavailable');return 'PyroCade: test\nOS: Test OS (x64)\nElectron: test\nInstallation: From source';},openExternal:async url=>{if(failBrowser)throw new Error('Browser unavailable. You can copy the report instead.');opened.push(url);},writeText:text=>copied.push(text)});
for(const action of ['info','open','copy'])ipcMain.handle('feedback:'+action,async(_event,...args)=>{try{return {ok:true,value:await service[action](...args)}}catch(error){return {ok:false,error:error.message}}});
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1100,height:650,webPreferences:{preload:path.join(__dirname,'check-prompts-preload.cjs'),sandbox:false,contextIsolation:true,offscreen:true,backgroundThrottling:false}});
  const errors=[];
  win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
  const watchdog=setTimeout(()=>{console.error('Feedback UI check timed out');app.exit(1)},45000);
  const run=code=>win.webContents.executeJavaScript(`(async()=>{const assert=(v,m)=>{if(!v)throw new Error(m)};const pause=ms=>new Promise(r=>setTimeout(r,ms));${code}})()`);
  try {
    await win.loadFile(path.join(root,'renderer/index.html'));
    await run(`
      await pause(150);showView('settings');document.querySelector('#btnFeedback').click();await pause(50);
      assert(FeedbackUI.isOpen(),'Feedback dialog did not open');assert(document.activeElement.id==='feedbackSummary','Summary did not receive focus');
      assert(document.querySelector('#feedbackDevice').textContent.includes('OS: Test OS'),'Device details missing');
      document.querySelector('#feedbackOpen').click();await pause(30);
      assert(!document.querySelector('#feedbackSummary').validity.valid,'Empty summary accepted');
      document.querySelector('#feedbackSummary').value='Case does not open';
      document.querySelector('#feedbackDescription').value='Expected the case to open, but it stayed closed.';
      document.querySelector('#feedbackSteps').value='1. Choose a game\\n2. Open case';
      document.querySelector('#feedbackCopy').click();await pause(50);
      assert(document.querySelector('#feedbackStatus').textContent.includes('Report copied'),'Copy status missing');
      document.querySelector('#feedbackOpen').click();await pause(50);
      assert(document.querySelector('#feedbackStatus').textContent.includes('GitHub opened'),'Browser status missing');
    `);
    if(opened.length!==1||copied.length!==1)throw new Error('Invalid form triggered a report action, or valid action failed');
    const report=new URL(opened[0]);
    if(copied[0]!==report.searchParams.get('title')+'\n\n'+report.searchParams.get('body'))throw new Error('Copy and browser reports differ');
    await run(`
      const kind=document.querySelector('#feedbackKind');kind.value='feedback';kind.dispatchEvent(new Event('change'));
      assert(document.querySelector('#feedbackStepsGroup').hidden,'Bug steps still visible for feedback');
      document.querySelector('#feedbackDiagnostics').click();assert(document.querySelector('#feedbackDevice').hidden,'Device preview did not hide');
      document.querySelector('#feedbackCopy').click();await pause(30);
      const before=S.sel;input('left');assert(S.sel===before,'Controller changed the shelf behind the modal');
      document.body.dispatchEvent(new KeyboardEvent('keydown',{key:'k',ctrlKey:true,bubbles:true}));assert(!LibraryUI.pickerOpen(),'Shortcut opened a dialog behind feedback');
    `);
    if(copied[1].includes('Test OS')||copied[1].includes('Steps to reproduce'))throw new Error('Feedback included opted-out device details or hidden steps');
    failBrowser=true;
    await run(`
      document.querySelector('#feedbackOpen').click();await pause(40);
      assert(document.querySelector('#feedbackStatus').textContent.includes('Browser unavailable'),'Browser failure not shown');
      assert(document.querySelector('#feedbackDescription').value.includes('stayed closed'),'Draft lost after failure');
      assert(!document.querySelector('#feedbackCopy').disabled,'Copy unavailable after failure');
      input('back');await pause(30);assert(!FeedbackUI.isOpen(),'Controller could not dismiss modal');assert(document.activeElement.id==='btnFeedback','Focus not restored');
      document.querySelector('#btnFeedback').click();await pause(20);
      assert(document.querySelector('#feedbackSummary').value==='Case does not open','Draft lost on close');
      document.querySelector('#feedbackDiagnostics').click();await pause(40);
    `);
    fs.mkdirSync(path.join(root,'output'),{recursive:true});
    fs.writeFileSync(path.join(root,'output/feedback-minimum-window.png'),(await win.webContents.capturePage()).toPNG());
    await run(`
      const modal=document.querySelector('#feedbackDialog');modal.scrollTop=modal.scrollHeight;await pause(30);
      const button=document.querySelector('#feedbackOpen').getBoundingClientRect(),bounds=modal.getBoundingClientRect();
      assert(button.bottom<=bounds.bottom&&bounds.bottom<=innerHeight,'Feedback actions are clipped at minimum size');
      document.querySelector('#feedbackClose').click();
    `);
    // Reload simulates a fresh app with a failed diagnostics request.
    failInfo=true;
    await new Promise(resolve=>{win.webContents.once('did-finish-load',resolve);win.reload();});
    await run(`
      await pause(100);showView('settings');document.querySelector('#btnFeedback').click();await pause(40);
      assert(document.querySelector('#feedbackDevice').textContent.includes('unavailable'),'Diagnostics error missing');
      assert(document.querySelector('#feedbackDiagnostics').disabled&&!document.querySelector('#feedbackDiagnostics').checked,'Unavailable diagnostics still included');
      document.querySelector('#feedbackSummary').value='Feedback without device details';document.querySelector('#feedbackDescription').value='Still works offline.';
      document.querySelector('#feedbackCopy').click();await pause(30);
      assert(document.querySelector('#feedbackStatus').textContent.includes('Report copied'),'Diagnostics failure prevented copying');
    `);
    // A copy with device details opted out must not query diagnostics again.
    if(copied.length!==3)throw new Error('Report without diagnostics could not be copied');
    if(errors.length)throw new Error(errors.join('\n'));
    clearTimeout(watchdog);console.log('Feedback UI passed: validation, both report types, copy/open, opt-out, failure recovery, draft retention, controller isolation, focus restoration and minimum window.');app.exit(0);
  }catch(error){console.error(error);app.exit(1)}
});
