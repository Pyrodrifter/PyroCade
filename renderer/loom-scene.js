// "Loom": two bundles of fine light threads that slowly gather and part, with small shuttle lights
// travelling along single threads. Calm, theme-coloured, and stateless (a pure function of time).
const Loom=(()=>{
  const N=72,SHUTTLES=12;
  const hash=n=>{n=Math.imul(n^(n>>>15),2246822507);n=Math.imul(n^(n>>>13),3266489909);return((n^(n>>>16))>>>0)/4294967296};
  const TEAL=[96,206,214];
  const mix=(a,b,k)=>[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k];
  const rgba=(c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${a})`;
  // Vertical position (0..1) of thread i in a bundle at horizontal position u.
  function strand(bundle,i,u,t){
    const f=i/(N-1),dir=bundle?-1:1;
    const centre=(bundle?.6:.4)+.2*Math.sin(u*2.1+t*.06*dir+bundle*1.7)+.07*Math.sin(u*5.3-t*.035+bundle);
    const spread=(.2+.14*Math.sin(u*3+t*.045*dir+bundle*2))*(1.15+.85*Math.sin(u*4.2+t*.05+bundle*3));
    return centre+(f-.5)*spread+.016*Math.sin(u*9+f*6+t*.09*dir);
  }
  function draw(ctx,w,h,t,accent,accent2){
    ctx.globalCompositeOperation='source-over';
    const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#04060d');bg.addColorStop(.55,'#08111f');bg.addColorStop(1,'#04070e');
    ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    const glow=ctx.createRadialGradient(w*.5,h*.5,0,w*.5,h*.5,w*.6);glow.addColorStop(0,rgba(mix(accent,TEAL,.5),.16));glow.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=glow;ctx.fillRect(0,0,w,h);
    ctx.globalCompositeOperation='lighter';ctx.lineWidth=Math.max(1,h/620);
    const step=Math.max(6,w/110);
    for(let b=0;b<2;b++){
      const base=b?TEAL:accent;
      for(let i=0;i<N;i++){
        const f=i/(N-1),col=mix(base,accent2,.25+.5*Math.abs(f-.5)*2*.5);
        ctx.strokeStyle=rgba(col,.12+.12*(.5+.5*Math.sin(i*.9+b*2+t*.05)));
        ctx.beginPath();
        for(let x=0;x<=w+step;x+=step){const y=strand(b,i,x/w,t)*h;x?ctx.lineTo(x,y):ctx.moveTo(x,y)}
        ctx.stroke();
      }
    }
    // Shuttle lights: each rides one thread from left to right, then is passed to another.
    const u0=Math.min(w,h)/700;
    for(let k=0;k<SHUTTLES;k++){
      const bundle=k%2,speed=.012+hash(k*7+1)*.014,phase=hash(k*7+2)*1.2,cycle=(phase+t*speed)/1.2;
      const lap=Math.floor(cycle),u=(cycle-lap)*1.2-.1;
      if(u<-.05||u>1.05)continue;
      const i=Math.floor(hash(lap*31+k*17)*N),col=mix(bundle?TEAL:accent2,[255,255,255],.35);
      const edge=Math.min(1,(u+.05)*8,(1.05-u)*8),pos=d=>[(u-d)*w,strand(bundle,i,u-d,t)*h];
      for(let s=18;s>0;s--){
        const p=pos(s*.006),q=pos((s-1)*.006);
        ctx.strokeStyle=rgba(col,.5*edge*(1-s/19)**2);ctx.lineWidth=(.5+(1-s/19)*1.8)*u0;
        ctx.beginPath();ctx.moveTo(p[0],p[1]);ctx.lineTo(q[0],q[1]);ctx.stroke();
      }
      const [x,y]=pos(0),r=20*u0,g=ctx.createRadialGradient(x,y,0,x,y,r);
      g.addColorStop(0,rgba(col,.9*edge));g.addColorStop(.25,rgba(col,.25*edge));g.addColorStop(1,rgba(col,0));
      ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
      ctx.fillStyle=`rgba(255,255,255,${.9*edge})`;ctx.beginPath();ctx.arc(x,y,1.8*u0,0,6.3);ctx.fill();
    }
    ctx.globalCompositeOperation='source-over';
    const v=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.4,w/2,h/2,Math.max(w,h)*.75);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(0,0,5,.5)');
    ctx.fillStyle=v;ctx.fillRect(0,0,w,h);
  }
  return {draw};
})();
