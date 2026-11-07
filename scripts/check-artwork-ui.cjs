const {app,BrowserWindow}=require('electron');
const path=require('node:path');
const fs=require('node:fs');
const os=require('node:os');
app.setPath('sessionData',path.join(os.tmpdir(),'PyroCade-artwork-check-'+process.pid));
app.whenReady().then(async()=>{
  const errors=[];
  const win=new BrowserWindow({show:false,width:1600,height:900,webPreferences:{preload:path.join(__dirname,'check-artwork-ui-preload.cjs'),sandbox:false,contextIsolation:true,backgroundThrottling:false,offscreen:true}});
  const watchdog=setTimeout(()=>{console.error('Artwork UI check timed out');app.exit(1)},30000);
  win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});
  const run=code=>win.webContents.executeJavaScript(`(async()=>{const assert=(v,m)=>{if(!v)throw new Error(m)}; const pause=ms=>new Promise(r=>setTimeout(r,ms)); const until=async(fn)=>{for(let i=0;i<300;i++){if(fn())return;await pause(10)}throw new Error('Artwork UI timed out')}; ${code}})()`);
  async function snap(name){win.webContents.invalidate();await new Promise(r=>setTimeout(r,300));const shot=await win.webContents.capturePage();if(shot.isEmpty())throw new Error('Empty capture');fs.writeFileSync(path.resolve(__dirname,'../output',name),shot.toPNG())}
  try {
    await win.loadFile(path.resolve(__dirname,'../renderer/index.html'));
    await run(`
      await until(()=>S.games.length===4);
      document.querySelector('#btnArtwork').click();
      assert(document.querySelector('#view-artwork').classList.contains('active'),'Artwork action did not open the downloader');
      assert(document.querySelector('#artScope').value==='game','Game action did not select one game');
      const original=S.games[0].media.front;
      await document.querySelector('#artStart').onclick();
      assert(document.querySelector('#artStart').disabled,'Start should be disabled during a download: '+document.querySelector('#artError').textContent+' / '+document.querySelector('#artJobState').textContent);
      assert(!document.querySelector('#artCancel').classList.contains('hidden'),'Cancel should be visible');
      await until(()=>document.querySelector('#artJobState').textContent==='Complete');
      assert(Number(document.querySelector('#artDownloaded').textContent)>=1,'Downloaded image count missing');
      assert(S.games[0].media.screenshot,'Fresh screenshot not applied to the library');
      assert(S.games[0].media.front===original,'Existing cover was overwritten');
      document.querySelector('#artScope').value='library';document.querySelector('#artScope').dispatchEvent(new Event('change'));
      document.querySelector('#artTypes input[value=title]').checked=true;
      await document.querySelector('#artStart').onclick();
      await document.querySelector('#artCancel').onclick();
      await until(()=>document.querySelector('#artJobState').textContent==='Cancelled');
      assert(!document.querySelector('#artStart').disabled,'Cancelled job did not allow resume');
      await document.querySelector('#artStart').onclick();
      await until(()=>document.querySelector('#artJobState').textContent==='Complete');
      assert(document.querySelector('#artCount').textContent.includes('4 / 4'),'Wrong library count');
      assert(Number(document.querySelector('#artKept').textContent)>=2,'Resume did not keep completed images');
      assert(Number(document.querySelector('#artMissing').textContent)>0,'Unavailable matches should be reported');
      assert(!document.querySelector('#artUnsupported').classList.contains('hidden'),'Unsupported system should be reported');
      assert(document.querySelectorAll('#artActivity li').length>0,'No recent activity displayed');
      document.querySelector('#artTypes').querySelectorAll('input').forEach(i=>i.checked=false);document.querySelector('#artTypes').dispatchEvent(new Event('change'));
      assert(document.querySelector('#artStart').disabled,'No-type download should be disabled');
      document.querySelector('#artTypes input[value=front]').checked=true;document.querySelector('#artTypes').dispatchEvent(new Event('change'));
    `);
    fs.mkdirSync(path.resolve(__dirname,'../output'),{recursive:true});
    await snap('artwork-downloader-verified.png');
    win.setContentSize(1100,650);
    await run(`await pause(100);const view=document.querySelector('#view-artwork');assert(view.scrollWidth<=view.clientWidth,'Artwork view overflows horizontally');const button=document.querySelector('#artStart');button.scrollIntoView();assert(button.getBoundingClientRect().bottom<=innerHeight,'Download action cannot be reached at minimum size');`);
    await snap('artwork-downloader-minimum.png');
    await run(`
      S.config.systems.find(s=>s.id==='switch').artworkProvider='gametdb-switch';
      select(3);ArtworkUI.open('game');
      assert(document.querySelector('#artSourceLabel').textContent.includes('GameTDB')&&document.querySelector('#artSourceLabel').textContent.includes('LaunchBox'),'Switch sources were not shown');
      assert(document.querySelector('#artSourceLabel').textContent.includes('Super Mario Wiki')&&document.querySelector('#artSourceLabel').textContent.includes('Internet Archive')&&document.querySelector('.art-source-list').textContent.includes('Internet Archive'),'Fallback sources were not listed');
      assert(!document.querySelector('#artStart').disabled,'Switch download must be enabled');
      assert(!document.querySelector('#artTypes input[value=screenshot]').disabled,'LaunchBox Switch screenshots should be available');
      assert(!document.querySelector('#artTypes input[value=disc]').disabled,'Switch cartridge labels should be enabled');
      const before=S.games[3].media.front;
      await document.querySelector('#artImport').onclick();
      assert(S.games[3].media.front!==before&&S.games[3].media.front.includes('import-test'),'Image import did not replace the selected artwork');
      assert(document.querySelector('#artImportStatus').textContent.includes('applied'),'Image import feedback missing');
      for(const input of document.querySelectorAll('#artTypes input'))input.checked=false;document.querySelector('#artTypes').dispatchEvent(new Event('change'));
      assert(document.querySelector('#artStart').disabled,'Switch with no chosen type should be disabled');
    `);
    await run(`await artworkTest.cleanup();`);
    if(errors.length)throw new Error(errors.join('\n'));
    clearTimeout(watchdog);console.log('Passed: one-game download, new artwork applied, custom-art preservation, whole-library scope, progress, cancellation, resume, unavailable matches, unsupported systems, no-type guard, and minimum-window layout.');app.exit(0);
  } catch(e){console.error(e);await run('await artworkTest.cleanup();').catch(()=>{});app.exit(1)}
});
