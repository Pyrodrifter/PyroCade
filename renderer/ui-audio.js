// Small synthesized UI cues: no downloads, audio files or background playback.
const AudioUI=(()=>{
  let enabled=true,volume=.25,ctx,master,last={},voiceCount=0;
  const cues={scroll:[[620,.035,0,.10],[920,.024,.01,.025]],system:[[420,.08,0,.10],[630,.11,.045,.075]],confirm:[[660,.08,0,.09],[880,.09,.045,.06]],open:[[330,.12,0,.08],[495,.13,.05,.055]],back:[[480,.07,0,.08],[340,.09,.035,.05]],launch:[[440,.12,0,.08],[660,.14,.08,.07],[880,.20,.17,.05]],error:[[180,.10,0,.07],[150,.12,.07,.05]]};
  function configure(options={}){if(typeof options.enabled==='boolean')enabled=options.enabled;if(Number.isFinite(options.volume))volume=Math.max(0,Math.min(1,options.volume));if(master&&ctx)master.gain.setTargetAtTime(enabled?volume:0,ctx.currentTime,.02)}
  function settings(){return {enabled,volume}}
  function engine(){
    if(!ctx){const Context=window.AudioContext||window.webkitAudioContext;if(!Context)return null;ctx=new Context();master=ctx.createGain();master.gain.value=enabled?volume:0;master.connect(ctx.destination)}
    if(ctx.state==='suspended')ctx.resume().catch(()=>{});return ctx;
  }
  function play(name,variant=0){
    if(!enabled||volume===0||!cues[name]||voiceCount>14)return false;
    const now=performance.now(),spacing=name==='scroll'?65:90;if(now-(last[name]??-Infinity)<spacing)return false;last[name]=now;
    try{const c=engine();if(!c||c.state==='closed')return false;const time=c.currentTime+.004;
      for(const [freq,duration,offset,gain]of cues[name]){
        const tone=c.createOscillator(),envelope=c.createGain();tone.type=name==='scroll'?'sine':'triangle';tone.frequency.setValueAtTime(freq*(name==='scroll'?1+Math.max(-2,Math.min(2,variant))*.025:1),time+offset);
        tone.frequency.exponentialRampToValueAtTime(freq*.80,time+offset+duration);envelope.gain.setValueAtTime(.0001,time+offset);envelope.gain.exponentialRampToValueAtTime(gain,time+offset+.004);envelope.gain.exponentialRampToValueAtTime(.0001,time+offset+duration);
        tone.connect(envelope);envelope.connect(master);voiceCount++;tone.onended=()=>{voiceCount--;tone.disconnect();envelope.disconnect()};tone.start(time+offset);tone.stop(time+offset+duration+.01);
      }return true;
    }catch{return false}
  }
  function init(config){configure(config||{});for(const event of ['pointerdown','keydown'])document.addEventListener(event,()=>{if(enabled)engine()},{once:true,capture:true});document.addEventListener('visibilitychange',()=>{if(document.hidden&&ctx?.state==='running')ctx.suspend().catch(()=>{})})}
  return {init,configure,settings,play,diagnostics:()=>({state:ctx?.state||'idle',voices:voiceCount})};
})();
