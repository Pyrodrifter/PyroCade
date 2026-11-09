// Direct app footage and native interface sounds. No captions or end card.
(async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...rest){
    if(destination===this.context.destination){
      if(!window.demoAudioDestination){
        window.demoAudioDestination=this.context.createMediaStreamDestination();
        window.demoAudioChunks=[];
        window.demoAudioRecorder=new MediaRecorder(window.demoAudioDestination.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:128000});
        window.demoAudioRecorder.ondataavailable=e=>{if(e.data.size)window.demoAudioChunks.push(e.data)};
        const clock=this.context.createConstantSource();clock.offset.value=.000001;connect.call(clock,window.demoAudioDestination);clock.start();
      }
      return connect.call(this,window.demoAudioDestination,...rest);
    }
    return connect.call(this,destination,...rest);
  };
  AudioUI.configure({enabled:true,volume:.28});AudioUI.play('confirm');await pause(250);
  const pick=(system,re)=>{closeCase();setSystem(system);select(Math.max(0,S.list.findIndex(g=>re.test(g.title))));};
  const view=(layout,theme='ember')=>{Appearance.apply({layout,theme},false);AudioUI.play('confirm')};
  const toggle=(id,on)=>{const b=document.querySelector('#'+id);b.checked=on;b.dispatchEvent(new Event('change'));AudioUI.play('confirm')};
  const search=async text=>{const input=document.querySelector('#search');input.focus();input.value='';for(const c of text){input.value+=c;input.dispatchEvent(new Event('input'));await pause(150)}await pause(250);input.blur()};
  window.demo20=async()=>{
    window.demoAudioRecorder.start(1000);const start=performance.now();
    const at=async(t,fn)=>{await pause(Math.max(0,start+t*1000-performance.now()));await fn()};
    await at(1.8,()=>select((S.sel+1)%S.list.length));
    await at(4,()=>select((S.sel+1)%S.list.length));
    await at(6.2,()=>openCase());
    await at(8.8,()=>tween({rx:-9,ry:26,tx:20,z:260},1400));
    await at(11.5,()=>setOpen(false));
    await at(13,()=>document.querySelector('#cvFlip').click());
    await at(15.5,()=>pick('snes',/Super Mario World/i));
    await at(17.3,()=>openCase());
    await at(20,()=>tween({rx:-12,ry:29,tx:0,z:220},1500));
    await at(23,()=>pick('gb',/Super Mario Land/i));
    await at(24.7,()=>openCase());
    await at(27.5,()=>tween({rx:-10,ry:27,tx:0,z:250},1300));
    await at(30,()=>{closeCase();setSystem('all');});
    await at(31,()=>search('Mario'));
    await at(34,()=>select(Math.min(2,S.list.length-1)));
    await at(36,()=>{const s=document.querySelector('#search');s.value='';s.dispatchEvent(new Event('input'));});
    await at(37,()=>document.querySelector('#btnAppearance').click());
    await at(38.5,()=>view('bookshelf','glacier'));
    await at(39.8,()=>document.querySelector('#appearancePicker').close());
    await at(41,()=>select(Math.min(S.sel+2,S.list.length-1)));
    await at(43,()=>view('page-turn','glacier'));
    await at(45,()=>select(Math.min(S.sel+3,S.list.length-1)));
    await at(47,()=>view('vertical','glacier'));
    await at(48.5,()=>select(Math.min(S.sel+1,S.list.length-1)));
    await at(50,()=>view('flipbook','glacier'));
    await at(51.5,()=>select(Math.min(S.sel+1,S.list.length-1)));
    await at(53,()=>view('media','glacier'));
    await at(54.5,()=>select(Math.min(S.sel+2,S.list.length-1)));
    await at(56,()=>{showView('settings');document.querySelector('#sDisableModels').scrollIntoView({block:'center',behavior:'smooth'});});
    await at(58,()=>toggle('sDisableAnimations',true));
    await at(59,()=>toggle('sDisableModels',true));
    await at(60.5,()=>{showView('library');view('carousel','ember');});
    await at(62,()=>select(Math.min(S.sel+1,S.list.length-1)));
    await at(63,()=>select(Math.min(S.sel+1,S.list.length-1)));
    await at(64.5,()=>{showView('settings');document.querySelector('#sDisableModels').scrollIntoView({block:'center'});});
    await at(65.3,()=>toggle('sDisableModels',false));
    await at(66,()=>toggle('sDisableAnimations',false));
    await at(67,()=>{showView('library');pick('switch2',/Donkey Kong/i);});
    await at(68.5,()=>openCase());
    await at(71,()=>tween({rx:-9,ry:24,tx:10,z:250},1400));
    await at(74.7,()=>{});
    const audio=await new Promise(resolve=>{window.demoAudioRecorder.onstop=async()=>{const data=new Uint8Array(await new Blob(window.demoAudioChunks,{type:'audio/webm'}).arrayBuffer());let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));resolve(btoa(binary))};window.demoAudioRecorder.stop()});
    return {elapsed:performance.now()-start,audio};
  };
  return true;
})();
