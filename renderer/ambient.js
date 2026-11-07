// XMB-style ambient layer: a slow flowing ribbon background, quieting of on-screen hints, and an
// idle "screensaver" mode that hides the interface and drifts through the collection.
const Ambient=(()=>{
  const root=document.documentElement,$=s=>document.querySelector(s);
  const ADVANCE_MS=11000,QUIET_MS=7000,MOVE_PX=14;
  let canvas,ctx,raf=0,last=0,t=0,w=0,h=0,rgb=[255,117,46],rgb2=[255,192,116],colorAt=0;
  let lastDt=0,idleMinutes=2,background='ribbon',active=false,idleTimer=0,quietTimer=0,advanceTimer=0,context,originX=null,originY=null,lastPoke=0;
  const backgrounds=['off','ribbon','xbox','codex','towers','loom','day','night','pixel-auto'];
  const motes=Array.from({length:46},(_,i)=>({x:Math.random(),y:Math.random(),r:.6+Math.random()*1.8,v:.004+Math.random()*.012,p:Math.random()*6.28,s:.4+Math.random()*1.4,i}));

  function parse(hex,fallback){
    const m=/^#?([0-9a-f]{6})$/i.exec((hex||'').trim());if(!m)return fallback;
    const n=parseInt(m[1],16);return [n>>16,(n>>8)&255,n&255];
  }
  function readColors(now){
    if(now-colorAt<1500)return;colorAt=now;
    const cs=getComputedStyle(root);
    rgb=parse(cs.getPropertyValue('--accent'),rgb);rgb2=parse(cs.getPropertyValue('--accent2'),rgb2);
  }
  function resize(){
    if(!canvas)return;
    if(isPixel()){h=PixelScenes.height;w=Math.min(520,Math.max(2,Math.round(h*innerWidth/innerHeight)))}
    else{const k=(background==='towers'||background==='loom'?.75:.5)*(context?.renderScale||1);w=Math.max(2,Math.round(innerWidth*k));h=Math.max(2,Math.round(innerHeight*k))}
    canvas.width=w;canvas.height=h;
  }
  const rgba=(c,a)=>`rgba(${c[0]},${c[1]},${c[2]},${a})`;
  const isPixel=()=>background==='day'||background==='night'||background==='pixel-auto';
  // Automatic pixel scene follows the clock: daylight 06:00-19:00.
  const pixelKind=()=>background==='pixel-auto'?(new Date().getHours()>=6&&new Date().getHours()<19?'day':'night'):background;
  function paint(now){
    if(isPixel()){ctx.imageSmoothingEnabled=false;PixelScenes.draw(ctx,w,t,pixelKind());return}
    if(background==='xbox')paintOrbit();
    else if(background==='codex')paintConstellation();
    else if(background==='towers')Ps2Scene.draw(ctx,w,h,t,lastDt);
    else if(background==='loom'){readColors(now);Loom.draw(ctx,w,h,t,rgb,rgb2)}
    else paintRibbon(now);
  }
  function halo(x,y,r,color,alpha){
    const g=ctx.createRadialGradient(x,y,0,x,y,r);
    g.addColorStop(0,rgba(color,alpha));g.addColorStop(1,rgba(color,0));
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  }
  // A distant green reactor and long orbital sweeps, inspired by the original Xbox dashboard.
  function paintOrbit(){
    ctx.clearRect(0,0,w,h);
    const x=w*(.5+.045*Math.sin(t*.035)),y=h*(.55+.035*Math.cos(t*.045)),r=Math.min(w,h)*.24;
    halo(x,y,Math.max(w,h)*.65,[38,142,32],.2);
    halo(x,y,r*1.7,[129,224,64],.13+.015*Math.sin(t*.12));
    ctx.save();ctx.translate(x,y);ctx.rotate(-.3+Math.sin(t*.025)*.12);
    for(let i=0;i<7;i++){
      const radius=r*(1.1+i*.36),tilt=t*.035+i*.48;
      ctx.beginPath();ctx.ellipse(0,0,radius,radius*(.28+.035*i),Math.sin(tilt)*.32,0,Math.PI*2);
      ctx.strokeStyle=rgba(i%2?[153,220,91]:[78,169,55],.12-i*.009);ctx.lineWidth=i===0?1.3:.65;ctx.stroke();
      const a=t*(.025+i*.003)+i*2.4;
      const px=Math.cos(a)*radius,py=Math.sin(a)*radius*(.28+.035*i),rot=Math.sin(tilt)*.32;
      ctx.beginPath();ctx.arc(px*Math.cos(rot)-py*Math.sin(rot),px*Math.sin(rot)+py*Math.cos(rot),1.3,0,Math.PI*2);ctx.fillStyle='rgba(190,239,139,.35)';ctx.fill();
    }
    const core=ctx.createRadialGradient(-r*.23,-r*.25,r*.03,0,0,r);
    core.addColorStop(0,'rgba(184,238,116,.24)');core.addColorStop(.48,'rgba(73,156,38,.17)');core.addColorStop(.88,'rgba(23,61,20,.12)');core.addColorStop(1,'rgba(116,209,65,.22)');
    ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fillStyle=core;ctx.fill();ctx.restore();
  }
  // A small, patient network: connections that gently emerge as its lights drift.
  function paintConstellation(){
    ctx.clearRect(0,0,w,h);
    halo(w*.32,h*.5,w*.58,[40,149,147],.13);
    halo(w*.76,h*.6,w*.46,[79,100,193],.12);
    const points=motes.slice(0,32).map(m=>({
      x:(.06+.88*((m.i*.61803398875)%1)+Math.sin(t*.035+m.p)*.025)*w,
      y:(.12+.76*((m.i*.38196601125+m.p*.1)%1)+Math.cos(t*.03+m.p)*.035)*h,
      a:.22+.13*Math.sin(t*.16+m.p),r:m.r
    }));
    const reach=Math.min(w,h)*.29;
    for(let i=0;i<points.length;i++){
      const p=points[i];
      for(let j=i+1;j<points.length;j++){
        const q=points[j],d=Math.hypot(p.x-q.x,p.y-q.y);if(d>=reach)continue;
        ctx.beginPath();ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);ctx.lineWidth=.6;ctx.strokeStyle=rgba([116,194,202],.09*(1-d/reach));ctx.stroke();
      }
      halo(p.x,p.y,p.r*7,[112,210,206],p.a*.2);
      ctx.beginPath();ctx.arc(p.x,p.y,p.r*.65,0,Math.PI*2);ctx.fillStyle=rgba([169,225,228],p.a);ctx.fill();
    }
  }
  function paintRibbon(now){
    readColors(now);
    ctx.clearRect(0,0,w,h);ctx.globalCompositeOperation='lighter';
    // Soft horizon glow the ribbons rise out of.
    const glow=ctx.createRadialGradient(w*.5,h*.62,0,w*.5,h*.62,w*.6);
    glow.addColorStop(0,rgba(rgb,.16));glow.addColorStop(1,rgba(rgb,0));ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    const bands=5;
    for(let i=0;i<bands;i++){
      const phase=t*.16*(1+i*.11)+i*1.7,amp=h*(.06+.016*i),base=h*(.5+.045*Math.sin(t*.05+i*.9))+(i-2)*h*.05;
      const top=[],bottom=[];
      for(let x=0;x<=w+16;x+=16){
        const u=x/w,y=base+Math.sin(u*3.1+phase)*amp+Math.sin(u*5.4-phase*1.35+i)*amp*.42+Math.sin(u*1.4+t*.07+i)*amp*.6;
        const thick=h*(.05+.045*(Math.sin(u*2.3-phase*.7+i*2)+1));
        top.push([x,y]);bottom.push([x,y+thick]);
      }
      ctx.beginPath();top.forEach(([x,y],k)=>k?ctx.lineTo(x,y):ctx.moveTo(x,y));
      for(let k=bottom.length-1;k>=0;k--)ctx.lineTo(bottom[k][0],bottom[k][1]);
      ctx.closePath();
      const g=ctx.createLinearGradient(0,0,w,0);
      g.addColorStop(0,rgba(rgb,0));g.addColorStop(.3,rgba(i%2?rgb2:rgb,.09));g.addColorStop(.7,rgba(i%2?rgb:rgb2,.09));g.addColorStop(1,rgba(rgb2,0));
      ctx.fillStyle=g;ctx.fill();
      ctx.lineWidth=1.2;ctx.strokeStyle=rgba(rgb2,.1);ctx.beginPath();top.forEach(([x,y],k)=>k?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();
    }
    for(const m of motes){
      m.y-=m.v*(1/30)*(active?1.6:1);m.x+=Math.sin(t*.2+m.p)*.00025;if(m.y<-.02){m.y=1.02;m.x=Math.random()}
      const a=(.16+.34*(.5+.5*Math.sin(t*m.s+m.p)))*Math.min(1,m.y*3);
      ctx.beginPath();ctx.arc(m.x*w,m.y*h,m.r,0,6.3);ctx.fillStyle=rgba(rgb2,a);ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';
  }
  function frame(now){
    raf=requestAnimationFrame(frame);
    if(document.hidden||root.classList.contains('in-game')||now-last<(isPixel()?45:33))return;
    lastDt=Math.min(.1,(now-last)/1000)*(active?1.5:1);t+=lastDt;last=now;paint(now);
  }
  function run(){
    cancelAnimationFrame(raf);raf=0;
    const reduced=root.dataset.motion==='reduced';
    canvas.hidden=background==='off';if(background==='off')return;
    canvas.dataset.scene=isPixel()?'pixel':background;
    const wanted=isPixel()?PixelScenes.height:Math.round(innerHeight*(background==='towers'||background==='loom'?.75:.5)*(context?.renderScale||1));if(canvas.height!==wanted)resize();
    if(reduced){paint(performance.now());return}
    last=performance.now();raf=requestAnimationFrame(frame);
  }

  // ---- idle screensaver ----
  function eligible(){return !!context?.canRun()}
  function arm(){
    clearTimeout(idleTimer);if(!idleMinutes||active)return;
    idleTimer=setTimeout(()=>eligible()?enter():arm(),idleMinutes*60000);
  }
  function enter(){
    if(active)return;active=true;originX=originY=null;root.classList.add('ambient');
    document.activeElement?.blur?.();
    clearInterval(advanceTimer);advanceTimer=setInterval(()=>{if(!eligible())return exit();context.advance()},ADVANCE_MS);
  }
  function exit(){
    if(!active)return false;
    active=false;root.classList.remove('ambient');clearInterval(advanceTimer);poke(true);return true;
  }
  function poke(force){
    const now=performance.now();
    root.classList.remove('quiet');clearTimeout(quietTimer);quietTimer=setTimeout(()=>root.classList.add('quiet'),QUIET_MS);
    if(!active&&(force||now-lastPoke>400)){lastPoke=now;arm()}
  }
  // Called for controller activity. Returns true when the input only woke the screensaver.
  function activity(){if(active){exit();return true}poke();return false}

  function init(options){
    context=options;canvas=$('#xmb');ctx=canvas.getContext('2d');
    resize();addEventListener('resize',resize);
    const swallow=e=>{if(active){e.preventDefault();e.stopImmediatePropagation();exit()}else poke()};
    for(const type of ['keydown','pointerdown','touchstart','wheel'])addEventListener(type,swallow,{capture:true,passive:false});
    addEventListener('pointermove',e=>{
      if(!active)return poke();
      if(originX==null){originX=e.clientX;originY=e.clientY;return}
      if(Math.hypot(e.clientX-originX,e.clientY-originY)>MOVE_PX)exit();
    },{capture:true,passive:true});
    document.addEventListener('visibilitychange',()=>{if(document.hidden)return;last=performance.now()});
    new MutationObserver(run).observe(root,{attributes:true,attributeFilter:['data-motion']});
    configure(options.initial||{});
    poke(true);
  }
  function configure(next={}){
    if('idleMinutes' in next)idleMinutes=Math.max(0,Number(next.idleMinutes)||0);
    if('background' in next&&backgrounds.includes(next.background))background=next.background;
    else if('ribbon' in next&&!('background' in next))background=next.ribbon===false?'off':'ribbon';
    if(active&&!idleMinutes)exit();
    arm();run();
  }
  return {init,configure,activity,exit,poke,active:()=>active,settings:()=>({idleMinutes,background}),backgrounds:()=>backgrounds};
})();
