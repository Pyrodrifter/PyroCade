const {BrowserWindow,app,screen}=require('electron');
const {spawn}=require('node:child_process');
const fs=require('node:fs'),path=require('node:path');
class LeiaOutput {
 constructor(host,onStatus){this.host=host;this.onStatus=onStatus;this.pending=new Map();this.id=0;this.enabled=false;this.starting=false;this.mirrorReady=false;this.backlog=[];this.completed=0;this.sampleTime=Date.now();this.sampleFrames=0;this.lastActive=null;}
 executable(){return app.isPackaged?path.join(process.resourcesPath,'leia','PyroCadeLeia.exe'):path.join(__dirname,'native','bin','PyroCadeLeia.exe');}
 status(){return {enabled:this.enabled,pending:this.starting,available:process.platform==='win32'&&fs.existsSync(this.executable()),message:this.message||''};}
 notify(message=''){this.message=message;this.onStatus(this.status());}
 async enable(){
  if(this.enabled)return this.status();if(this.starting)throw Error('Leia SR is still starting.');
  if(!this.status().available)throw Error('Leia SR is only available in the Windows build with the native presenter.');
  this.cadence=null;this.starting=true;this.notify();
  const owner=this.host.getNativeWindowHandle().readBigUInt64LE(0).toString();
  const child=this.child=spawn(this.executable(),[owner,String(process.pid)],{windowsHide:true,stdio:['pipe','pipe','pipe']});
  const bounds=this.host.getContentBounds();this.renderSize=this.renderBounds(bounds.width,bounds.height);this.expectedPixels=null;this.renderEpoch=1;
  this.mirror=new BrowserWindow({x:bounds.x,y:bounds.y,width:this.renderSize.width,height:this.renderSize.height,show:false,frame:false,webPreferences:{preload:path.join(__dirname,'leia-mirror-preload.js'),contextIsolation:true,sandbox:false,offscreen:{useSharedTexture:true},backgroundThrottling:false}});
  this.targetFPS=Math.max(60,Math.min(120,Math.round(screen.getDisplayMatching(bounds).displayFrequency||60)));this.mirror.webContents.setFrameRate(this.targetFPS);
  this.mirror.webContents.on('ipc-message',(_,channel,value,size)=>{if(channel==='leia:mirrorStats')this.sceneStats=value;if(channel==='leia:mirrorReady'&&value===this.renderEpoch){this.expectedPixels=size;this.mirror.webContents.invalidate();}});
  this.painting=()=>{if(!this.mirror||this.mirror.isDestroyed())return;const paint=!this.enabled||!!(this.lastSnapshot?.active&&this.host.isFocused()&&!this.host.isMinimized());if(paint)this.mirror.webContents.startPainting();else this.mirror.webContents.stopPainting();};
  this.focusListener=()=>this.painting();this.host.on('focus',this.focusListener);this.host.on('blur',this.focusListener);
  this.mirror.webContents.on('paint',(event)=>{
   const texture=event.texture;if(!texture)return;
   const handle=texture.textureInfo?.handle?.ntHandle;
   if(!this.hasSnapshot||!handle||this.pending.size>=2||!this.child||texture.textureInfo.widgetType==='popup'){texture.release();return;}
   const size=texture.textureInfo.codedSize;if(!this.expectedPixels||Math.abs(size.width-this.expectedPixels.width)>2||Math.abs(size.height-this.expectedPixels.height)>2||size.width>4096||size.height>2304){texture.release();return;}this.textureSize=size;
   const id=++this.id;this.pending.set(id,texture);
   child.stdin.write('FRAME '+id+' '+handle.readBigUInt64LE(0).toString()+'\n',error=>{if(error)this.fail('The SR presenter connection closed.');});
  });
  this.mirror.webContents.once('did-finish-load',()=>{this.mirrorReady=true;const pending=this.backlog;this.backlog=[];for(const packet of pending)this.push(packet);});
  this.mirror.loadFile(path.join(__dirname,'renderer','leia-mirror.html')).catch(()=>this.fail('Could not load the stereo scene.'));
  this.host.webContents.send('leia:status',this.status());
  return await new Promise((resolve,reject)=>{
   this.resolve=resolve;this.reject=reject;this.timeout=setTimeout(()=>this.fail('Leia SR did not receive a stereo frame. The launcher is back in 2D.'),25000);
   let output='';child.stdout.on('data',data=>{output+=data.toString();const lines=output.split('\n');output=lines.pop();for(const line of lines){let event;try{event=JSON.parse(line)}catch{continue;}
    if(event.type==='release'){this.pending.get(event.id)?.release();this.pending.delete(event.id);if(event.copied!==false)this.completed++;}
    if(event.type==='cadence')this.cadence=event;
    if(event.type==='gpu')this.nativeGPU=event.name;
    if(event.type==='ready'){clearTimeout(this.timeout);this.enabled=true;this.starting=false;this.notify();this.painting();this.resolve?.(this.status());this.resolve=null;this.reject=null;}
    if(event.type==='error')this.fail(event.message);
   }});
   child.on('error',()=>this.fail('Could not start the native SR presenter.'));
   child.on('exit',()=>{if(this.child===child)this.fail('Leia SR presenter closed. The launcher is back in 2D.');});
   child.stderr.on('data',()=>{});
  });
 }
 push(snapshot){
  if(!this.child)return;this.lastSnapshot=snapshot;
  const active=!!snapshot.active;if(this.lastActive!==active){this.child.stdin.write('ACTIVE '+(active?1:0)+'\n',()=>{});this.lastActive=active;}
  if(!this.mirrorReady){if(typeof snapshot.html==='string')this.backlog=[snapshot];else this.backlog.push(snapshot);return;}
  const desired=this.renderBounds(snapshot.width,snapshot.height),size=this.renderSize;if(size.width!==desired.width||size.height!==desired.height||size.displayId!==desired.displayId){if(size.displayId!==desired.displayId){const bounds=this.host.getContentBounds();this.mirror.setPosition(bounds.x,bounds.y);}this.renderSize=desired;this.expectedPixels=null;this.renderEpoch++;this.mirror.setContentSize(desired.width,desired.height);}
  if(typeof snapshot.html==='string')this.hasSnapshot=true;this.mirror.webContents.send('leia:mirror',{...snapshot,renderEpoch:this.renderEpoch});this.painting();
 }
 renderBounds(width,height){const display=screen.getDisplayMatching(this.host.getContentBounds()),dpi=display.scaleFactor||1;const scale=Math.min(1,1280/(width*dpi),720/(height*dpi));return{displayId:display.id,width:Math.max(200,Math.floor(width*scale)*2),height:Math.max(100,Math.floor(height*scale))};}
 diagnostics(){const now=Date.now(),elapsed=now-this.sampleTime;const fps=elapsed>0?(this.completed-this.sampleFrames)*1000/elapsed:0;this.sampleFrames=this.completed;this.sampleTime=now;return{enabled:this.enabled,nativeGPU:this.nativeGPU||'',fps,targetFPS:this.targetFPS||60,cadence:this.cadence||null,scene:this.sceneStats||null,textureSize:this.textureSize||null};}
 fail(message){const reject=this.reject;this.reject=null;this.resolve=null;this.stop();this.notify(message);reject?.(new Error(message));}
 stop(){
  clearTimeout(this.timeout);if(this.focusListener){this.host.removeListener('focus',this.focusListener);this.host.removeListener('blur',this.focusListener);}this.focusListener=null;this.backlog=[];this.lastActive=null;const child=this.child;this.child=null;this.enabled=false;this.starting=false;this.mirrorReady=false;this.hasSnapshot=false;
  if(child){child.stdin.end('QUIT\n');const kill=setTimeout(()=>child.kill(),1000);child.once('exit',()=>clearTimeout(kill));}
  if(this.mirror&&!this.mirror.isDestroyed())this.mirror.destroy();this.mirror=null;
  for(const texture of this.pending.values())texture.release();this.pending.clear();
 }
 disable(){this.stop();this.notify();return this.status();}
}
module.exports={LeiaOutput};
