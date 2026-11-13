// "Fable": a story told as a tree of light. A line sets out from one edge of the screen and forks
// wherever the tale could have gone another way. One path through the forks is the one that gets
// told: it burns warm and carries a light at its tip, while the paths not taken grow a little way
// in the theme colour and fade. When the telling reaches its last leaf it blooms, rests, and the
// next story sets out from the other side. Stateless: a pure function of time.
const Fable=(()=>{
  const EPOCH=44,LIFE=56,DEPTH=6,PTS=9,DUST=54;
  const CLAY=[217,119,87],CREAM=[255,236,214];
  const hash=n=>{n=Math.imul(n^(n>>>15),2246822507);n=Math.imul(n^(n>>>13),3266489909);return((n^(n>>>16))>>>0)/4294967296};
  const mix=(a,b,k)=>[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k];
  const rgba=(c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${Math.max(0,a).toFixed(3)})`;
  const ease=k=>k<=0?0:k>=1?1:k*k*(3-2*k);
  const stories=new Map();

  // Lays out one story in units of screen height: x runs 0..aspect, y runs 0..1.
  function build(epoch,aspect){
    let n=epoch*7919+13;const R=()=>hash(n++);
    const dir=epoch%2?-1:1,branches=[];
    let end=0,leaf=null;
    (function grow(x,y,angle,depth,t0,told){
      const length=(told?.4:.27)*aspect/1.78*Math.pow(.8,depth)*(.8+R()*.4);
      const bend=(R()-.5)*(told?.55:.9),pts=[[x,y]];
      for(let i=1;i<=PTS;i++){
        angle+=bend/PTS+(R()-.5)*.1;
        // Lean back towards the middle of the screen, so the story stays in frame.
        angle+=(.5-y)*(told?.3:.05)*Math.cos(angle);
        x+=Math.cos(angle)*length/PTS*dir;y+=Math.sin(angle)*length/PTS;pts.push([x,y]);
      }
      const dur=length*(told?16:22)+.4,branch={pts,t0,dur,told,depth,forks:false};branches.push(branch);
      const off=x<-.1||x>aspect+.1||y<-.1||y>1.1;
      if(depth>=DEPTH||off||(!told&&depth>2&&R()<.35)){if(told&&t0+dur>end){end=t0+dur;leaf=[x,y]}return}
      branch.forks=true;
      const kids=R()<.22?3:2,toldKid=told?Math.floor(R()*kids):-1,fan=.34+R()*.3;
      for(let k=0;k<kids;k++){
        const turn=(k-(kids-1)/2)*fan*2/(kids-1||1)+(R()-.5)*.16;
        grow(x,y,angle*.72+turn,depth+1,t0+dur,k===toldKid);
      }
    })(dir>0?-.03:aspect+.03,.3+R()*.4,(R()-.5)*.3,0,1.5,true);
    return {branches,end,leaf,dir};
  }
  function story(epoch,aspect){
    const key=epoch+':'+aspect.toFixed(2);let s=stories.get(key);
    if(!s){if(stories.size>5)stories.clear();s=build(epoch,aspect);stories.set(key,s)}
    return s;
  }
  // Point a fraction k (0..1) of the way along a branch.
  function along(pts,k){
    const f=Math.min(PTS-1e-6,Math.max(0,k)*PTS),i=Math.floor(f),u=f-i;
    return [pts[i][0]+(pts[i+1][0]-pts[i][0])*u,pts[i][1]+(pts[i+1][1]-pts[i][1])*u];
  }
  function trace(ctx,pts,k,h){
    const f=Math.min(PTS,k*PTS),whole=Math.floor(f);
    ctx.beginPath();ctx.moveTo(pts[0][0]*h,pts[0][1]*h);
    for(let i=1;i<=whole;i++)ctx.lineTo(pts[i][0]*h,pts[i][1]*h);
    if(whole<PTS){const p=along(pts,k);ctx.lineTo(p[0]*h,p[1]*h)}
    ctx.stroke();
  }
  function glow(ctx,x,y,r,color,alpha){
    if(alpha<=.004)return;
    const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgba(color,alpha));g.addColorStop(.3,rgba(color,alpha*.3));g.addColorStop(1,rgba(color,0));
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }
  function drawStory(ctx,s,tau,h,accent,accent2,still){
    // The whole story fades away once it has been told and rested.
    const fade=still?1:ease(tau/2.5)*(1-ease((tau-(LIFE-9))/9));
    if(fade<=0)return;
    const u=h/700,ink=mix(CLAY,CREAM,.42),hot=mix(CREAM,[255,255,255],.5);
    ctx.lineCap='round';ctx.lineJoin='round';
    // Paths not taken first, so the told path is drawn over its own forks.
    for(const b of s.branches){
      if(b.told||tau<=b.t0)continue;
      const age=tau-b.t0,k=Math.min(1,age/b.dur),wither=.45+.55*(1-ease((age-b.dur-1)/12));
      ctx.strokeStyle=rgba(mix(accent,accent2,.25+b.depth*.08),(.55-b.depth*.03)*wither*fade);
      ctx.lineWidth=Math.max(.7,(1.5-b.depth*.14)*u);trace(ctx,b.pts,k,h);
      if(k>=1&&!b.forks){const [x,y]=b.pts[PTS];ctx.fillStyle=rgba(accent2,.5*wither*fade);ctx.beginPath();ctx.arc(x*h,y*h,1.5*u,0,6.3);ctx.fill()}
    }
    let tip=null;
    for(const b of s.branches){
      if(!b.told||tau<=b.t0)continue;
      const k=Math.min(1,(tau-b.t0)/b.dur),width=Math.max(1,(2.5-b.depth*.16)*u);
      ctx.strokeStyle=rgba(CLAY,.18*fade);ctx.lineWidth=width*4.5;trace(ctx,b.pts,k,h);
      ctx.strokeStyle=rgba(ink,.78*fade);ctx.lineWidth=width;trace(ctx,b.pts,k,h);
      if(k>=1&&b.forks){const [x,y]=b.pts[PTS];glow(ctx,x*h,y*h,11*u,CLAY,.5*fade);ctx.fillStyle=rgba(CREAM,.9*fade);ctx.beginPath();ctx.arc(x*h,y*h,2.1*u,0,6.3);ctx.fill()}
      if(k<1)tip=along(b.pts,k);
    }
    if(tip&&!still){
      const [x,y]=tip,pulse=.85+.15*Math.sin(tau*5.1);
      glow(ctx,x*h,y*h,34*u,CLAY,.75*fade*pulse);glow(ctx,x*h,y*h,12*u,CREAM,.9*fade);
      ctx.fillStyle=rgba(hot,fade);ctx.beginPath();ctx.arc(x*h,y*h,2.4*u,0,6.3);ctx.fill();
    }
    // The ending: the last leaf opens into a small star and settles.
    if(s.leaf&&tau>s.end){
      const since=tau-s.end,open=still?1:ease(since/1.6),settle=still?.6:.45+.55*(1-ease((since-1.6)/5)),[x,y]=s.leaf;
      glow(ctx,x*h,y*h,(26+64*open)*u,CLAY,.55*settle*fade);glow(ctx,x*h,y*h,18*u,CREAM,.9*settle*fade);
      ctx.strokeStyle=rgba(CREAM,.6*settle*fade);ctx.lineWidth=Math.max(.8,1.1*u);
      for(let i=0;i<4;i++){
        const a=i*Math.PI/4+.2,r=(i%2?9:19)*open*u;
        ctx.beginPath();ctx.moveTo(x*h-Math.cos(a)*r,y*h-Math.sin(a)*r);ctx.lineTo(x*h+Math.cos(a)*r,y*h+Math.sin(a)*r);ctx.stroke();
      }
      ctx.fillStyle=rgba(hot,settle*fade);ctx.beginPath();ctx.arc(x*h,y*h,2.6*u,0,6.3);ctx.fill();
    }
  }
  // still: paint one finished story with no growing tip, for reduced motion.
  function draw(ctx,w,h,t,accent,accent2,still=false){
    ctx.globalCompositeOperation='source-over';
    const bg=ctx.createLinearGradient(0,0,0,h);bg.addColorStop(0,'#08060a');bg.addColorStop(.55,'#150d0d');bg.addColorStop(1,'#07050a');
    ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    const aspect=w/h,epoch=Math.floor(t/EPOCH),tau=t-epoch*EPOCH;
    const now=story(epoch,aspect);
    // A low hearth glow that leans towards the side the story is being told from.
    const hx=w*(.5-.16*now.dir*(1-ease(tau/EPOCH))+.16*now.dir*ease(tau/EPOCH)),hearth=ctx.createRadialGradient(hx,h*.6,0,hx,h*.6,w*.62);
    hearth.addColorStop(0,rgba(CLAY,.17));hearth.addColorStop(.5,rgba(mix(CLAY,accent,.5),.06));hearth.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle=hearth;ctx.fillRect(0,0,w,h);
    ctx.globalCompositeOperation='lighter';
    const u=h/700;
    for(let i=0;i<DUST;i++){
      const speed=.004+hash(i*3+1)*.01,y=1.05-((hash(i*3+2)+t*speed)%1)*1.1,x=hash(i*3+3)+Math.sin(t*.11+i)*.012;
      const a=(.1+.3*(.5+.5*Math.sin(t*(.3+hash(i+90)*.8)+i*1.7)))*Math.min(1,(1.05-y)*5,(y+.05)*5);
      ctx.fillStyle=rgba(i%3?CREAM:accent2,a);ctx.beginPath();ctx.arc(x*w,y*h,(.6+hash(i+40)*1.3)*u,0,6.3);ctx.fill();
    }
    if(still)drawStory(ctx,now,LIFE-12,h,accent,accent2,true);
    else{
      // The previous story is still fading as the next one sets out.
      if(tau<LIFE-EPOCH&&epoch>0)drawStory(ctx,story(epoch-1,aspect),tau+EPOCH,h,accent,accent2,false);
      drawStory(ctx,now,tau,h,accent,accent2,false);
    }
    ctx.globalCompositeOperation='source-over';
    const v=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.42,w/2,h/2,Math.max(w,h)*.75);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,'rgba(4,0,0,.55)');
    ctx.fillStyle=v;ctx.fillRect(0,0,w,h);
  }
  return {draw};
})();
