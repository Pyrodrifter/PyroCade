const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
app.setPath('sessionData',path.join(os.tmpdir(),'PyroCade-eshop-check-'+process.pid));
const {pathToFileURL}=require('node:url');
const {createHash}=require('node:crypto');
const root=path.resolve(__dirname,'..');
const coverDir=path.join(root,'data/media/switch/covers');
const files=fs.readdirSync(coverDir).filter(f=>f.endsWith('.png'));
const expected=['Asterix','Cato Buttered Cat','Neko Bento','Suika Game [','Suika Game Planet','Suika Game v'];
const fixtures=files.map((name,i)=>{
  const hq=path.join(root,'data/media/switch/cover-hq',name);
  return {id:`switch:cover-${i}`,system:'switch',base:name.slice(0,-4),title:name.replace(/\[[^\]]*\]|\([^)]*\)|\.png$/g,'').trim(),media:{front:pathToFileURL(path.join(coverDir,name)).href,...(fs.existsSync(hq)?{frontHQ:pathToFileURL(hq).href}:{})},info:{}};
});
const packshotDir=path.join(root,'data/media/switch2/covers');
for(const name of fs.readdirSync(packshotDir).filter(f=>f.endsWith('.png')))fixtures.push({id:`switch2:${name}`,system:'switch2',base:name.slice(0,-4),title:name.replace(/\[[^\]]*\]|\.png$/g,'').trim(),media:{front:pathToFileURL(path.join(packshotDir,name)).href},info:{}});
const digest=()=>createHash('sha256').update(Buffer.concat(files.map(f=>fs.readFileSync(path.join(coverDir,f))))).digest('hex');
const before=digest();
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1584,height:861,webPreferences:{preload:path.join(__dirname,'check-prompts-preload.cjs'),sandbox:false,contextIsolation:true,offscreen:true,backgroundThrottling:false}});
  const watchdog=setTimeout(()=>{console.error('eShop check timed out');app.exit(1)},30000);
  const errors=[];win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});
  const run=code=>win.webContents.executeJavaScript(`(async()=>{const assert=(v,m)=>{if(!v)throw new Error(m)};const pause=ms=>new Promise(r=>setTimeout(r,ms));${code}})()`);
  const snap=async name=>{win.webContents.invalidate();await new Promise(r=>setTimeout(r,200));const image=await win.webContents.capturePage();if(image.isEmpty())throw new Error('Empty screenshot');fs.writeFileSync(path.join(root,'output',name),image.toPNG())};
  try {
    await win.loadFile(path.join(root,'renderer/index.html'));
    const summary=await run(`
      await pause(100);window.coverFixtures=${JSON.stringify(fixtures)};
      S.config.systems.push({id:'switch',name:'Nintendo Switch',caseType:'switch',media:'cart',color:'#e60012',extensions:[]}, {id:'switch2',name:'Nintendo Switch 2',caseType:'switch',media:'cart',color:'#d0021b',extensions:[]});
      S.games=coverFixtures;S.demo=false;document.querySelector('#demoBanner').classList.add('hidden');renderChips();setSystem('switch');
      for(const game of S.games)measure(game);
      for(let i=0;i<100&&S.games.some(g=>!g._aspect);i++)await pause(40);
      assert(S.games.every(g=>g._aspect),'Not all source images loaded');
      const enhanced=S.games.filter(g=>g._eShop);
      assert(enhanced.length===6,'Expected six eShop templates, got '+enhanced.length);
      for(const prefix of ${JSON.stringify(expected)})assert(enhanced.some(g=>g.base.startsWith(prefix)),'Template not detected: '+prefix);
      const retail=S.games.find(g=>g.base.startsWith('Mario Kart 8 Deluxe['));assert(!retail._eShop,'Retail cover falsely classified');
      const packs=S.games.filter(g=>g.system==='switch2');assert(packs.length===2&&packs.every(g=>g._packshot&&g._aspect<.7),'Switch 2 white margins were not fitted');
      setSystem('switch');select(0);applyMotion('reduced');await pause(100);
      assert(document.querySelector('.item.sel .digital-sleeve'),'Shelf did not use the improved eShop sleeve');
      assert(document.querySelector('.item.sel .cartridge-label .digital-sleeve--compact'),'Cartridge fallback still uses the red template');
      assert(document.querySelector('.digital-sleeve-title').textContent.includes('Asterix'),'Title missing');
      const title=document.querySelector('.item.sel .digital-sleeve-title').getBoundingClientRect();
      const cover=document.querySelector('.item.sel .f-front').getBoundingClientRect();
      assert(title.bottom<=cover.bottom,'eShop title overflows');
      return enhanced.map(g=>({title:g.title,hq:!!g.media.frontHQ}));
    `);
    await snap('eshop-improved-shelf.png');
    await run(`await openCase();await pause(50);assert(document.querySelector('#caseRig .l-front .digital-sleeve'),'Case viewer still shows original template');`);
    await snap('eshop-improved-case.png');
    await run(`
      closeCase();showView('settings');document.querySelector('#sEshop').value='original';document.querySelector('#sEshop').dispatchEvent(new Event('change'));
      showView('library');assert(!document.querySelector('.item.sel .f-front .digital-sleeve'),'Original option did not restore the download');
      showView('settings');await document.querySelector('#btnSave').onclick();assert(S.config.eShopStyle==='original','eShop style was not saved');
      document.querySelector('#sEshop').value='enhanced';document.querySelector('#sEshop').dispatchEvent(new Event('change'));
      S.games=coverFixtures;S.demo=false;document.querySelector('#demoBanner').classList.add('hidden');document.querySelector('#toast').classList.remove('on');renderChips();setSystem('switch2');select(0);await pause(100);
      assert(!document.querySelector('.item.sel .digital-sleeve'),'Switch 2 physical cover was restyled as eShop');
      const bg=getComputedStyle(document.querySelector('.item.sel .f-front'));assert(bg.backgroundSize!=='100% 100%','White packshot margins still on cover face');const pos=bg.backgroundPosition.split(' ').map(parseFloat);assert(pos.length===2&&Math.abs(pos[0]-50)<4&&pos[1]===50,'Packshot crop is not centered: '+bg.backgroundPosition);
    `);
    await snap('switch2-covers.png');
    if(errors.length)throw new Error(errors.join('\n'));
    if(digest()!==before)throw new Error('Original downloads changed');
    console.log(JSON.stringify({checks:'Six eShop templates, retail preservation, titles, cartridge fallback, case viewer, original-style option, saved preference, two Switch 2 covers, unmodified source files',enhanced:summary}));
    clearTimeout(watchdog);app.exit(0);
  }catch(e){console.error(e);app.exit(1)}
});
