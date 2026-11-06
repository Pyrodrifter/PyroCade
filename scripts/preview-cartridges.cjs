// Render the production models as a contact sheet without touching user settings.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');const path=require('node:path');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1500,height:1020,webPreferences:{preload:path.join(__dirname,'check-prompts-preload.cjs'),contextIsolation:true,sandbox:false,offscreen:true,backgroundThrottling:false}});
  try{
    await win.loadFile(path.resolve(__dirname,'../renderer/index.html'));
    await win.webContents.executeJavaScript(`(async()=>{
      await new Promise(r=>setTimeout(r,150));
      document.body.innerHTML='<div class="cart-gallery"><header><span>PYROCADE / PHYSICAL MEDIA</span><h1>Cartridges with character.</h1><p>System-specific shells · molded details · no gold contacts</p></header><main></main></div>';
      const style=document.createElement('style');style.textContent='body{overflow:auto;background:#101116}.cart-gallery{padding:35px 45px;font-family:Segoe UI,sans-serif}header{position:static;height:auto;display:block;padding:0 0 25px;border:0;background:none}header span{font-size:11px;letter-spacing:.2em;color:#ff993d}h1{margin:12px 0 6px;font-size:29px}header p{color:#969ba9;font-size:13px;margin:0}main{display:grid;grid-template-columns:repeat(6,1fr);gap:18px}.sample{height:350px;background:linear-gradient(145deg,#21232a,#18191f);border:1px solid #ffffff0d;border-radius:16px;padding:20px 12px;display:flex;align-items:center;flex-direction:column}.sample h2{font-size:13px;font-weight:600;margin:0 0 6px}.sample small{color:#818895;font-size:11px}.sample-stage{position:relative;margin:auto;perspective:750px;display:grid;place-items:center;width:100%;height:250px}.sample .physical-media{position:relative;left:auto;top:auto;transform:rotateX(8deg) rotateY(-15deg) rotateZ(-4deg)}';document.head.append(style);
      const names={switch:'Nintendo Switch',switch2:'Nintendo Switch 2',nds:'Nintendo DS','3ds':'Nintendo 3DS',gb:'Game Boy',gbc:'Game Boy Color',gba:'Game Boy Advance',nes:'NES',snes:'Super Nintendo',n64:'Nintendo 64',genesis:'Sega Genesis',a2600:'Atari 2600'};
      const subtitles={switch:'Black game card',switch2:'Red game card',nds:'Clipped corner', '3ds':'White shell & upper tab',gb:'Classic gray & grip grooves',gbc:'Curved upper shell',gba:'Wide shoulders & short shell',nes:'Tall shell & recessed grips',snes:'Wide shell & side grooves',n64:'Arched top & inset label',genesis:'Rounded shoulders & ribs',a2600:'Tall shell & lower grip'};
      for(const [id,name] of Object.entries(names)){
        const sys={id,name,media:'cart'},game={id:'preview:'+id,title:id==='switch2'?'Bananza':id==='switch'?'Super Mario':'Pyro Quest',media:{},info:{}};
        const tile=el('section','sample'),stage=el('div','sample-stage');tile.append(el('h2','',name),el('small','',subtitles[id]),stage);document.querySelector('main').append(tile);
        const p=Cartridges.profiles[id],model=createMedia(game,{sys,W:210,H:300,disc:Art.cart(game,sys,420*p.w*p.label[2]/100,420*p.h*p.label[3]/100)});stage.append(model);
        const face=model.querySelector('.cartridge-front');if(getComputedStyle(face).clipPath==='none')throw new Error('Missing shell contour for '+id);
        if(model.querySelector('.cartridge-front .cartridge-contacts'))throw new Error('Contacts must not cover the front label');
      }
      await new Promise(r=>setTimeout(r,200));
    })()`);
    win.webContents.invalidate();await new Promise(r=>setTimeout(r,150));
    fs.writeFileSync(path.resolve(__dirname,'../output/cartridge-models.png'),(await win.webContents.capturePage()).toPNG());
    console.log('Rendered 12 cartridge models; all contours active and contacts kept off the front.');app.exit(0);
  }catch(e){console.error(e);app.exit(1)}
});
