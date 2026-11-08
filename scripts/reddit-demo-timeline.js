// Runs only in the isolated recording window. Does not save preferences or launch games.
(async()=>{
  const pause=ms=>new Promise(r=>setTimeout(r,ms));
  AudioUI.configure({enabled:false});
  // Fork the real synth output into a recorder instead of the computer's speakers.
  const connect=AudioNode.prototype.connect;
  AudioNode.prototype.connect=function(destination,...rest){
    if(destination===this.context.destination){
      if(!window.demoAudioDestination){
        window.demoAudioDestination=this.context.createMediaStreamDestination();
        window.demoAudioChunks=[];window.demoAudioRecorder=new MediaRecorder(window.demoAudioDestination.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:128000});
        window.demoAudioRecorder.ondataavailable=e=>{if(e.data.size)window.demoAudioChunks.push(e.data)};
        const clock=this.context.createConstantSource();clock.offset.value=.000001;connect.call(clock,window.demoAudioDestination);clock.start();window.demoAudioClock=clock;
      }
      return connect.call(this,window.demoAudioDestination,...rest);
    }
    return connect.call(this,destination,...rest);
  };
  applyMotion('full');Appearance.apply({theme:'ember',layout:'carousel'},false);
  setSystem('switch');S.sel=Math.max(0,S.list.findIndex(g=>g.title.includes('Super Mario Bros. Wonder')));layout();showInfo();
  document.querySelector('#search').blur();
  const style=document.createElement('style');style.textContent=`
    #clock { visibility:hidden; }.manual .tag { visibility:hidden; }
    .demo-caption { position:fixed;right:40px;bottom:110px;width:355px;z-index:2147483646;padding:20px 23px;border:1px solid #ffffff1c;border-radius:15px;background:linear-gradient(135deg,#1b2535d9,#0d131de6);backdrop-filter:blur(20px);box-shadow:0 12px 45px #0003;color:#f5f6fa;pointer-events:none; }
    .demo-caption.top-left { top:153px;bottom:auto;left:40px;right:auto; }
    .demo-caption small { display:block;font:600 10px Segoe UI;letter-spacing:.2em;color:var(--accent2);text-transform:uppercase;margin-bottom:8px; }
    .demo-caption strong { display:block;font:650 29px/1.12 Segoe UI;letter-spacing:-.025em; }
    .demo-caption p { margin:10px 0 0;font:13px/1.5 Segoe UI;color:#bbc8dc; }
    .demo-caption.enter { animation:demo-in .4s ease-out both; }
    @keyframes demo-in { from { opacity:0;transform:translateY(9px) }to { opacity:1;transform:translateY(0) } }
    .demo-end { position:fixed;inset:0;z-index:2147483647;display:flex;align-items:center;justify-content:center;flex-direction:column;background:#050911c7;backdrop-filter:blur(15px);color:#f5f5f9;animation:demo-in .6s ease-out; }
    .demo-end h1 { font:300 59px Segoe UI;letter-spacing:.21em;margin:0 0 12px; }.demo-end h1 b { font-weight:800;color:#ffab67; }
    .demo-end img { width:83px;height:83px;margin-bottom:19px; }
    .demo-end p { font:400 19px Segoe UI;margin:0 0 24px;color:#d7e0ef; }.demo-end small { font:400 11px Segoe UI;letter-spacing:.12em;text-transform:uppercase;color:#8e9db5; }
  `;document.head.append(style);
  const caption=document.createElement('aside');caption.className='demo-caption';document.body.append(caption);
  function label(kicker,title,copy='',position=''){
    caption.className='demo-caption '+position;caption.replaceChildren();
    for(const [tag,text]of [['small',kicker],['strong',title],['p',copy]])if(text){const n=document.createElement(tag);n.textContent=text;caption.append(n)}
    void caption.offsetWidth;caption.classList.add('enter');
  }
  label('Meet PyroCade','A home for your game collection.','A personal emulator front end, built around the collection.');
  await pause(1700);
  AudioUI.configure({enabled:true,volume:.35});AudioUI.play('confirm');await pause(250);
  // Keep the appearance panel's temporary controls in step with the demo audio mix.
  document.querySelector('#soundToggle').textContent='Sound on';document.querySelector('#soundToggle').setAttribute('aria-pressed','true');document.querySelector('#soundVolume').value=35;document.querySelector('#soundVolumeValue').textContent='35%';document.querySelector('#soundPreview').disabled=false;
  window.demoRun=async()=>{
    window.demoAudioRecorder.start(1000);AudioUI.play('confirm');const start=performance.now();
    const at=async(seconds,fn)=>{await pause(Math.max(0,start+seconds*1000-performance.now()));await fn()};
    await at(2,()=>{label('Physical media','3D cases. Real character.','Select a game and its cartridge slides into view.');select(S.sel+1)});
    await at(3.8,()=>select(S.sel+1));
    await at(5.4,()=>{setSystem('switch2');S.sel=Math.max(0,S.list.findIndex(g=>g.title.includes('Donkey Kong Bananza')));layout();showInfo();label('A closer look','Open the case.','Rotate the packaging and explore the physical media.')});
    await at(6.3,()=>openCase());
    await at(8.3,()=>tween({rx:8,ry:-14,z:420},1200));
    await at(12,()=>{closeCase();setSystem('switch');S.sel=Math.max(0,S.list.findIndex(g=>g.title.includes('Super Mario Bros. Wonder')));Appearance.apply({theme:'glacier',layout:'vertical'},false);layout();showInfo();label('Vertical stack','Browse from top to bottom.','Same collection. A different perspective.')});
    await at(14,()=>select(S.sel+1));await at(15.5,()=>select(S.sel+1));
    await at(17,()=>{Appearance.apply({theme:'violet',layout:'flipbook'},false);label('Flipbook','Turn through your favourites.','A little shelf magic with every selection.')});
    await at(18.3,()=>select(S.sel+1));await at(19.5,()=>select(S.sel+1));await at(20.7,()=>select(S.sel+1));
    await at(22,()=>{Appearance.apply({theme:'mint',layout:'media'},false);select(4);label('Media carousel','The games themselves.','Discs and cartridges, out of their cases.')});
    await at(24,()=>select(5));await at(25.5,()=>select(6));
    await at(27,()=>{document.querySelector('#btnAppearance').click();label('Appearance','Six layouts and five themes.','Choose a layout, colours and sounds.','top-left')});
    await at(28,()=>{Appearance.apply({theme:'rose'},false);AudioUI.play('confirm')});
    await at(29.2,()=>{Appearance.apply({theme:'glacier'},false);AudioUI.play('confirm')});
    await at(30.6,()=>{document.querySelector('#appearancePicker').close();Appearance.apply({theme:'ember',layout:'carousel'},false);S.sel=Math.max(0,S.list.findIndex(g=>g.title.includes('Super Mario Bros. Wonder')));layout();showInfo();caption.remove()});
    await at(32,()=>{const end=document.createElement('div');end.className='demo-end';end.innerHTML='<img src="assets/brand/pyrocade-mark.svg" alt=""/><h1>PYRO<b>CADE</b></h1><p>Your collection. A little more alive.</p><small>Work in progress · Feedback welcome</small>';document.body.append(end);AudioUI.play('confirm')});
    await at(35,()=>{});
    const audio=await new Promise(resolve=>{window.demoAudioRecorder.onstop=async()=>{const data=new Uint8Array(await new Blob(window.demoAudioChunks,{type:'audio/webm'}).arrayBuffer());let binary='';for(let i=0;i<data.length;i+=32768)binary+=String.fromCharCode(...data.subarray(i,i+32768));resolve(btoa(binary))};window.demoAudioRecorder.stop()});
    return {audio,elapsed:performance.now()-start};
  };
  return {games:S.games.length,width:innerWidth,height:innerHeight,audioRecorder:!!window.demoAudioRecorder};
})()
