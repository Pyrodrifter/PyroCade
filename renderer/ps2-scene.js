// A dark navy void of drifting towers and glass cubes with glowing orbs trailing comet streaks.
const Ps2Scene=(()=>{
  const NEAR=.2,FAR=2.3,TRAIL=80;
  let seed=11;const R=()=>((seed=Math.imul(seed^(seed>>>15),2246822507)+0x9e3779b9>>>0)/4294967296);
  let boxes=null,orbs=null,blobs=null,fog=null,W=0,H=0,sim=0;
  const ORB_COLORS=[[255,90,220],[70,255,110],[255,50,60],[110,120,255],[80,220,255],[255,190,80]];
  const FACE={near:[142,166,214],top:[170,192,232],bottom:[56,70,110],left:[96,116,168],right:[74,92,140]};

  function makeBox(far){
    const r=R(),tower=r<.45,glass=r>.8,side=R()<.5?-1:1;
    const sx=tower?.16+R()*.2:.1+R()*.17,sy=tower?.16+R()*.2:sx,sz=tower?.5+R()*1.1:sx;
    const lateral=tower?.5+R()*.9:.1+R()*1.2;
    return {x:(tower||R()<.6?side:(R()<.5?-1:1))*lateral,y:(R()*2-1)*(tower?.95:.85),z:far?FAR*(.8+R()*.2):NEAR+sz/2+R()*(FAR-NEAR-.2),sx,sy,sz,glass,speed:0,shade:.9+R()*.18};
  }
  function spawnOrb(o={}){
    const edge=R(),a=R()*6.283;
    o.x=W*(.1+R()*.8);o.y=H*(.1+R()*.8);o.ang=a;o.curv=(R()<.5?-1:1)*(.18+R()*.4);o.speed=H*(.14+R()*.1);
    o.max=7+R()*6;o.life=0;o.trail=[];o.color=ORB_COLORS[Math.floor(R()*ORB_COLORS.length)];o.wob=R()*6.28;return o;
  }
  function init(w,h){
    W=w;H=h;seed=11;
    boxes=Array.from({length:30},()=>makeBox(false));
    orbs=Array.from({length:6},(_,i)=>{const o=spawnOrb();o.life=i*1.7;return o});
    blobs=Array.from({length:6},()=>({x:.2+R()*.6,y:.2+R()*.6,r:.35+R()*.25,p:R()*6.28,s:.03+R()*.03}));
    fog=Array.from({length:9},()=>({x:R(),y:.25+R()*.7,r:.28+R()*.3,p:R()*6.28,s:.018+R()*.025,a:.06+R()*.06}));
    sim=0;for(let i=0;i<240;i++)step(1/30);
  }
  function step(dt){
    for(const o of orbs){
      o.life+=dt;o.ang+=(o.curv+Math.sin(o.life*.7+o.wob)*.12)*dt;
      o.x+=Math.cos(o.ang)*o.speed*dt;o.y+=Math.sin(o.ang)*o.speed*dt;
      o.trail.push([o.x,o.y]);if(o.trail.length>TRAIL)o.trail.shift();
      if(o.life>o.max||o.x<-60||o.x>W+60||o.y<-60||o.y>H+60)spawnOrb(o);
    }
    sim+=dt;
  }
  function project(x,y,z,f,ox,oy){return [W/2+ox+x/z*f,H/2+oy+y/z*f]}
  const rgba=(c,a,k=1)=>`rgba(${c[0]*k|0},${c[1]*k|0},${c[2]*k|0},${a})`;
  function drawBox(ctx,b,f,ox,oy){
    const x0=b.x-b.sx/2,x1=b.x+b.sx/2,y0=b.y-b.sy/2,y1=b.y+b.sy/2,z0=b.z-b.sz/2,z1=b.z+b.sz/2;
    const fade=Math.min(1,(FAR-b.z)/.45)*Math.min(1,(z0-NEAR)/.18);
    if(fade<=0)return;
    const P=(x,y,z)=>project(x,y,z,f,ox,oy);
    const c={nnn:P(x0,y0,z0),pnn:P(x1,y0,z0),npn:P(x0,y1,z0),ppn:P(x1,y1,z0),nnp:P(x0,y0,z1),pnp:P(x1,y0,z1),npp:P(x0,y1,z1),ppp:P(x1,y1,z1)};
    const faces=[['near',[c.nnn,c.pnn,c.ppn,c.npn],-1,'z',z0],['top',[c.nnn,c.pnn,c.pnp,c.nnp],y0,'y',-1],['bottom',[c.npn,c.ppn,c.ppp,c.npp],y1,'y',1],['left',[c.nnn,c.nnp,c.npp,c.npn],x0,'x',-1],['right',[c.pnn,c.pnp,c.ppp,c.ppn],x1,'x',1]];
    const dist=Math.min(1,.8+.2*(1-b.z/FAR));
    for(const [name,pts,coord,axis,sign] of faces){
      // A face is visible when the camera (origin) is on its outward side.
      const visible=axis==='z'?true:axis==='x'?(sign<0?x0>0:x1<0):(sign<0?y0>0:y1<0);
      if(!visible)continue;
      ctx.beginPath();pts.forEach(([px,py],i)=>i?ctx.lineTo(px,py):ctx.moveTo(px,py));ctx.closePath();
      if(b.glass){ctx.fillStyle=`rgba(170,205,255,${.07*fade})`;ctx.fill();ctx.strokeStyle=`rgba(205,225,255,${.4*fade})`;ctx.lineWidth=Math.max(1,H/700*1.4);ctx.stroke()}
      else{ctx.fillStyle=rgba(FACE[name],fade*dist,b.shade);ctx.fill()}
    }
    if(b.glass){
      ctx.strokeStyle=`rgba(190,215,255,${.22*fade})`;ctx.lineWidth=1;ctx.beginPath();
      for(const [a,d] of [[c.nnn,c.nnp],[c.pnn,c.pnp],[c.npn,c.npp],[c.ppn,c.ppp]]){ctx.moveTo(a[0],a[1]);ctx.lineTo(d[0],d[1])}ctx.stroke();
    }
  }
  function drawOrb(ctx,o){
    const u=H/700,fadeIn=Math.min(1,o.life/1.2),fadeOut=Math.min(1,(o.max-o.life)/1.5),k=Math.max(0,Math.min(fadeIn,fadeOut)),n=o.trail.length;
    if(n<2||k<=0)return;
    ctx.lineCap='round';
    for(let i=1;i<n;i++){
      const t=i/n;ctx.beginPath();ctx.moveTo(o.trail[i-1][0],o.trail[i-1][1]);ctx.lineTo(o.trail[i][0],o.trail[i][1]);
      ctx.strokeStyle=rgba(o.color,(.2+t*.8)*k);ctx.lineWidth=(.6+t*3.4)*u;ctx.stroke();
    }
    const [x,y]=o.trail[n-1],g=ctx.createRadialGradient(x,y,0,x,y,26*u);
    g.addColorStop(0,rgba(o.color,1*k));g.addColorStop(.18,rgba(o.color,.45*k));g.addColorStop(1,rgba(o.color,0));
    ctx.fillStyle=g;ctx.fillRect(x-26*u,y-26*u,52*u,52*u);
    ctx.fillStyle=`rgba(255,255,255,${.95*k})`;ctx.beginPath();ctx.arc(x,y,2.6*u,0,6.3);ctx.fill();
  }
  function draw(ctx,w,h,t,dt){
    if(!boxes||w!==W||h!==H)init(w,h);
    if(dt>0)step(Math.min(dt,.1));
    ctx.globalCompositeOperation='source-over';
    ctx.fillStyle='#02050f';ctx.fillRect(0,0,w,h);
    for(const b of blobs){
      const cx=w*(b.x+Math.sin(sim*b.s+b.p)*.08),cy=h*(b.y+Math.cos(sim*b.s*1.3+b.p)*.08),r=Math.max(w,h)*b.r;
      const g=ctx.createRadialGradient(cx,cy,0,cx,cy,r);g.addColorStop(0,'rgba(20,64,180,.5)');g.addColorStop(.6,'rgba(8,28,90,.16)');g.addColorStop(1,'rgba(2,5,15,0)');
      ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
    }
    const f=h*.62,ox=0,oy=0,sorted=[...boxes].sort((a,c)=>c.z-a.z);
    const haze=amount=>{for(const g of fog){
      const cx=w*(g.x+Math.sin(sim*g.s+g.p)*.14),cy=h*(g.y+Math.cos(sim*g.s*1.2+g.p)*.07),r=Math.max(w,h)*g.r;
      const grad=ctx.createRadialGradient(cx,cy,0,cx,cy,r);grad.addColorStop(0,`rgba(70,115,215,${g.a*amount})`);grad.addColorStop(.55,`rgba(30,60,150,${g.a*amount*.5})`);grad.addColorStop(1,'rgba(10,25,80,0)');
      ctx.fillStyle=grad;ctx.fillRect(0,0,w,h);
    }};
    // Fog sits between the far and near blocks so depth reads through it.
    for(const b of sorted)if(b.z>1.25)drawBox(ctx,b,f,ox,oy);
    haze(1);
    for(const b of sorted)if(b.z<=1.25)drawBox(ctx,b,f,ox,oy);
    haze(.4);
    // Dark fall-off toward the corners, like the original.
    const v=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.35,w/2,h/2,Math.max(w,h)*.75);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,6,.55)');ctx.fillStyle=v;ctx.fillRect(0,0,w,h);
    ctx.globalCompositeOperation='lighter';for(const o of orbs)drawOrb(ctx,o);ctx.globalCompositeOperation='source-over';
  }
  return {draw};
})();
