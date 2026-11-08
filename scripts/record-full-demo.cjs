// Record only the current renderer, with local artwork and a fixture API.
// No desktop capture, config writes, ROM scans, downloads or game launches.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {pathToFileURL}=require('node:url'),{spawn}=require('node:child_process'),{once}=require('node:events');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/full-demo');
fs.mkdirSync(out,{recursive:true});
app.setPath('sessionData',path.join(os.tmpdir(),'PyroCade-full-demo-'+process.pid));
app.commandLine.appendSwitch('force-device-scale-factor','1');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
const games=[];
for(const [system,patterns] of Object.entries({gb:[/Super Mario Land \(/i,/Tetris/i,/Zelda/i],switch2:[/Donkey Kong Bananza/i,/Mario Kart World/i],n64:[/Super Mario 64/i,/Zelda/i,/Banjo/i],ps2:[/Jak 3 /i,/Ratchet.*Clank/i,/Gran Turismo 4/i,/Final Fantasy X /i],snes:[/Super Mario World \(/i,/Super Metroid/i,/Donkey Kong Country \(/i,/Zelda.*Past/i],switch:[/Super Mario Bros.*Wonder/i,/Mario Kart 8/i,/Mario.*Donkey Kong/i,/Zelda/i]})){
  const dir=path.join(root,'data/media',system,'covers');if(!fs.existsSync(dir))continue;
  const files=fs.readdirSync(dir).filter(n=>/\.(png|jpe?g)$/i.test(n)),chosen=new Set();
  for(const re of patterns){const name=files.find(n=>re.test(n));if(name)chosen.add(name)}
  for(const name of files){if(chosen.size>=5)break;chosen.add(name)}
  for(const name of chosen)games.push({id:'demo20:'+system+':'+name,system,title:name.replace(/\.(png|jpe?g)$/i,'').replace(/\s*[\[(].*$/,'').replace(/\s+v\d.*$/i,'').trim(),media:{front:pathToFileURL(path.join(dir,name)).href},info:{},demo:true});
}
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,width:1920,height:1080,webPreferences:{preload:path.join(__dirname,'readme-preload.cjs'),contextIsolation:true,sandbox:false,offscreen:true,backgroundThrottling:false}});
  const watchdog=setTimeout(()=>{console.error('Recording timed out');app.exit(1)},150000);let encoder;
  try{
    win.setContentSize(1920,1080);const web=win.webContents;web.setZoomFactor(1.2);web.setFrameRate(30);
    await win.loadFile(path.join(root,'renderer/index.html'));
    const setup=await web.executeJavaScript(`(async()=>{
      const pause=ms=>new Promise(r=>setTimeout(r,ms));while(!S.config||!S.games.length)await pause(50);
      AudioUI.configure({enabled:false});S.config.modelsEnabled=true;S.config.animationsEnabled=true;
      S.games=${JSON.stringify(games)};S.demo=false;document.querySelector('#demoBanner').classList.add('hidden');
      S.query='';S.filter='';S.sort='title';applyMotion('full');applyPerformance();
      Appearance.apply({layout:'carousel',theme:'ember'},false);Ambient.configure({background:'ribbon',idleMinutes:0});
      const style=document.createElement('style');style.textContent='#clock,.manual .tag{visibility:hidden}';document.head.append(style);
      for(const g of S.games)measure(g);
      await Promise.all(S.games.map(g=>{const i=new Image();i.src=g.media.front;return i.decode().catch(()=>{})}));
      const pick=(sys,title)=>{closeCase();setSystem(sys);select(Math.max(0,S.list.findIndex(g=>title.test(g.title))));};
      pick('ps2',/Jak 3/i);await pause(2800);
      window.demo20=async()=>{
        const start=performance.now(),at=async(t,fn)=>{await pause(Math.max(0,start+t*1000-performance.now()));await fn()};
        await at(1.5,()=>select((S.sel+1)%S.list.length));
        await at(3,()=>select((S.sel+1)%S.list.length));
        await at(4.5,()=>openCase());
        await at(7,()=>tween({rx:-9,ry:27,tx:20,z:260},1400));
        await at(9.5,()=>pick('snes',/Super Mario World/i));
        await at(11,()=>openCase());
        await at(13,()=>tween({rx:-12,ry:28,tx:0,z:240},1500));
        await at(16,()=>pick('switch',/Wonder/i));
        await at(17.3,()=>select((S.sel+1)%S.list.length));
        await at(18.7,()=>select((S.sel+1)%S.list.length));
        await at(20,()=>{});return performance.now()-start;
      };
      return {games:S.games.length,version:await api.appVersion()};
    })()`);
    await web.executeJavaScript(fs.readFileSync(path.join(__dirname,'full-demo-timeline.js'),'utf8'));
    if(setup.games<9)throw Error('Not enough local artwork for recording');
    const first=await web.capturePage(),width=1920,height=1080,bytes=width*height*4;let latest=first.toBitmap(),paints=0;
    if(latest.length!==bytes)throw Error('Unexpected capture size');
    fs.writeFileSync(path.join(out,'poster.png'),first.toPNG());
    web.on('paint',(_e,_rect,img)=>{const frame=img.toBitmap();if(frame.length===bytes){latest=frame;paints++}});
    const final=process.env.PYROCADE_DEMO_OUTPUT||path.join(root,'output/PyroCade-Full-Demo-silent.mp4');
    encoder=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-y','-f','rawvideo','-pixel_format','bgra','-video_size','1920x1080','-framerate','30','-i','pipe:0','-an','-c:v','libx264','-preset','veryfast','-crf','18','-threads','4','-pix_fmt','yuv420p','-movflags','+faststart',final],{windowsHide:true,stdio:['pipe','ignore','pipe']});
    let error;encoder.on('error',e=>{error=e});encoder.stdin.on('error',e=>{error=e});encoder.stderr.on('data',d=>fs.appendFileSync(path.join(out,'encode.log'),d));
    const finished=once(encoder,'close'),start=performance.now(),timeline=web.executeJavaScript('demo20()');
    for(let i=0;i<2250;i++){
      if(error)throw error;await pause(Math.max(0,start+i*1000/30-performance.now()));
      if(!encoder.stdin.write(latest))await once(encoder.stdin,'drain');
    }
    encoder.stdin.end();const [code]=await finished;if(code)throw Error('Encoder failed '+code);
    const result=await timeline,elapsed=result.elapsed;
    const audioFile=path.join(out,'interface-audio.webm');fs.writeFileSync(audioFile,Buffer.from(result.audio,'base64'));
    const delivered=path.join(root,'output/PyroCade-Full-Demo.mp4');
    const mux=spawn('ffmpeg',['-hide_banner','-loglevel','error','-y','-i',final,'-i',audioFile,'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','128k','-af','volume=5,apad','-t','75','-movflags','+faststart',delivered],{windowsHide:true,stdio:'ignore'});
    const [muxCode]=await once(mux,'close');if(muxCode)throw Error('Audio export failed');
    console.log('Full demo: '+delivered);
    fs.writeFileSync(path.join(out,'info.json'),JSON.stringify({...setup,frames:2250,fps:30,paints,elapsed,final},null,2));
    console.log('Exported '+final+'; '+paints+' rendered frames; '+(fs.statSync(final).size/1048576).toFixed(1)+' MB');
    clearTimeout(watchdog);app.exit(0);
  }catch(e){console.error(e);encoder?.kill();clearTimeout(watchdog);app.exit(1)}
});
