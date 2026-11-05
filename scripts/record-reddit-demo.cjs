// Capture an isolated instance of the real app; never records the desktop.
process.env.PYROCADE_RECORD='1';
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{once}=require('node:events');
const root=path.resolve(__dirname,'..'),out=path.join(root,'output/reddit-demo');fs.mkdirSync(out,{recursive:true});
app.commandLine.appendSwitch('force-device-scale-factor','1');
require('../main.js');
const pause=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
  let encoder;
  try{
    const win=BrowserWindow.getAllWindows()[0],web=win.webContents;win.setContentSize(1920,1080);web.setZoomFactor(1.2);web.setFrameRate(30);
    const deadline=Date.now()+90000;
    while(Date.now()<deadline){if(await web.executeJavaScript('!!document.querySelector("#loading.hidden")&&!!S.games.length').catch(()=>false))break;await pause(200)}
    web.setZoomFactor(1.25);await pause(200);
    const ready=await web.executeJavaScript(fs.readFileSync(path.join(__dirname,'reddit-demo-timeline.js'),'utf8'));
    if(!ready.audioRecorder)throw new Error('UI audio recorder did not initialize');console.log('Ready: '+JSON.stringify(ready));
    const first=await web.capturePage();fs.writeFileSync(path.join(out,'poster.png'),first.toPNG());let latest=first.toBitmap();
    const width=1920,height=1080,bytes=width*height*4;if(latest.length!==bytes)throw new Error('Unexpected capture pixel size: '+latest.length);
    let paintCount=0;
    web.on('paint',(_event,_dirty,image)=>{const bitmap=image.toBitmap();if(bitmap.length===bytes){latest=bitmap;paintCount++}});
    const video=path.join(out,'capture.mp4'),log=fs.openSync(path.join(out,'encode.log'),'w');
    encoder=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-y','-f','rawvideo','-pixel_format','bgra','-video_size',`${width}x${height}`,'-framerate','30','-i','pipe:0','-an','-vf','fade=t=in:st=0:d=0.3,fade=t=out:st=34.5:d=0.5','-c:v','libx264','-preset','veryfast','-crf','19','-threads','4','-pix_fmt','yuv420p',video],{windowsHide:true,stdio:['pipe','ignore',log]});
    let encoderError;encoder.on('error',e=>{encoderError=e});encoder.stdin.on('error',e=>{encoderError=e});
    const finished=once(encoder,'close'),start=performance.now();let frames=0;
    const recording=web.executeJavaScript('window.demoRun()');
    while(frames<1050){
      if(encoderError)throw encoderError;
      const wait=start+frames*1000/30-performance.now();if(wait>0)await pause(wait);
      if(!encoder.stdin.write(latest))await once(encoder.stdin,'drain');frames++;
      if(frames%300===0)console.log(`Recorded ${frames/30}s (${paintCount} rendered frames)`);
    }
    encoder.stdin.end();const [exitCode]=await finished;fs.closeSync(log);if(exitCode!==0)throw new Error('Video encoder failed: '+exitCode);
    const result=await recording;fs.writeFileSync(path.join(out,'ui-audio.webm'),Buffer.from(result.audio,'base64'));
    fs.writeFileSync(path.join(out,'capture-info.json'),JSON.stringify({frames,paintCount,elapsedMs:result.elapsed,resolution:[width,height],fps:30,scenes:['Carousel and cartridge reveal','Open and rotate a Switch 2 case','Vertical stack / Glacier','Flipbook / Violet','Colour cards / Mint','Themes and sound controls','Feedback end card']},null,2));
    console.log(`Captured ${frames} frames and UI audio. Encoding upload file…`);
    const final=path.join(root,'output/PyroCade-Reddit-Demo.mp4');
    const mux=spawn('ffmpeg',['-hide_banner','-loglevel','warning','-y','-i',video,'-i',path.join(out,'ui-audio.webm'),'-map','0:v:0','-map','1:a:0','-c:v','copy','-c:a','aac','-b:a','128k','-af','aresample=async=1:first_pts=0,apad,volume=2.4,afade=t=in:st=0:d=0.15,afade=t=out:st=34.3:d=0.7','-t','35','-movflags','+faststart','-metadata','title=PyroCade — emulator frontend showcase',final],{windowsHide:true,stdio:'ignore'});
    const [muxCode]=await once(mux,'close');if(muxCode!==0)throw new Error('Audio mux failed: '+muxCode);
    console.log('Exported '+final+' ('+(fs.statSync(final).size/1024/1024).toFixed(1)+' MB)');app.exit(0);
  }catch(e){console.error(e);encoder?.kill();app.exit(1)}
});
