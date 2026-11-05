// Uses the existing Electron runtime to rasterize every SVG with transparent alpha.
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../renderer/assets/prompts');
const output = path.resolve(__dirname, '../output');
app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false,width:1280,height:1000,webPreferences:{contextIsolation:true,nodeIntegration:false}});
  try {
    const manifest = JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
    await win.loadFile(path.join(root,'preview.html'));
    const images = manifest.assets.map(a => ({file:a.file,svg:fs.readFileSync(path.join(root,a.file),'utf8')}));
    const rendered = await win.webContents.executeJavaScript(`(async () => {
      const results = [];
      for (const item of ${JSON.stringify(images)}) {
        const img = new Image(); img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(item.svg);
        await img.decode();
        for (const size of [64,128]) {
          const c = document.createElement('canvas'); c.width = c.height = size;
          const ctx = c.getContext('2d'); ctx.drawImage(img,0,0,size,size);
          const pixels = ctx.getImageData(0,0,size,size).data;
          if (pixels[3] !== 0 || !pixels.some((v,i)=>i%4===3 && v>0)) throw new Error('Invalid transparency or empty icon: '+item.file);
          results.push({file:item.file.replace('.svg','.png'),size,data:c.toDataURL('image/png').split(',')[1]});
        }
      }
      return results;
    })()`);
    for (const item of rendered) {
      const dest = path.join(root, 'png',String(item.size),item.file);
      fs.mkdirSync(path.dirname(dest),{recursive:true}); fs.writeFileSync(dest,Buffer.from(item.data,'base64'));
    }
    fs.mkdirSync(output,{recursive:true});
    // Load all lazy thumbnails before capturing the full sheet.
    const height = await win.webContents.executeJavaScript(`(async()=>{
      const imgs=[...document.images]; imgs.forEach(i=>i.loading='eager');
      await Promise.all(imgs.map(i=>i.decode())); await document.fonts.ready;
      return document.documentElement.scrollHeight;
    })()`);
    win.setContentSize(1280,height);
    await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    fs.writeFileSync(path.join(output,'controller-prompts-full.png'),(await win.webContents.capturePage()).toPNG());
    // Compact overview: representative controls from every family.
    await win.webContents.executeJavaScript(`{
      const keep = {
        xbox:['south','east','west','north','lb','rb','lt','rt','dpad-all','left-stick','select','start'],
        playstation:['south','east','west','north','lb','rb','lt','rt','dpad-all','left-stick','select','start'],
        nintendo:['south','east','west','north','lb','rb','lt','rt','dpad-all','left-stick','select','start'],
        generic:['south','east','west','north','lb','rb','lt','rt','dpad-all','left-stick','select','start'],
        keyboard:['enter','space','escape','tab','shift','ctrl','m','f11','left','right','pageup','pagedown'],
        mouse:['mouse','left','right','middle','scroll','scroll-up','scroll-down','move','drag-left']
      };
      document.querySelectorAll('figure').forEach(f=>{if(!keep[f.dataset.family].includes(f.querySelector('figcaption').textContent))f.remove()});
      const style=document.createElement('style');style.textContent='header{padding:24px 36px}h1{font-size:34px}header p{margin:0}nav{display:none}main{padding:12px 36px}section{margin-bottom:12px}h2{margin:10px 0 8px;font-size:17px}.grid{grid-template-columns:repeat(12,1fr);gap:6px}figure{padding:4px 2px 6px}img{width:44px;height:44px}figcaption{font-size:9px;margin:0}';document.head.append(style);
    }`);
    const compactHeight = await win.webContents.executeJavaScript('document.body.scrollHeight');
    win.setContentSize(1280,compactHeight);
    await win.webContents.executeJavaScript('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    fs.writeFileSync(path.join(output,'controller-prompts-overview.png'),(await win.webContents.capturePage()).toPNG());
    console.log(`Exported ${rendered.length} PNGs; validated nonempty artwork and transparent corners. Preview: ${output}`);
    app.exit(0);
  } catch(error) { console.error(error); app.exit(1); }
});
