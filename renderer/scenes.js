// More opaque scenes: Aurora, Ridges, Embers, Deep, Warp, Rain, Bokeh and Sunset. Like Loom, each is a pure function of
// time, so any single frame is a valid still for reduced motion and nothing needs resetting.
const Scenes=(()=>{
  const TAU=6.2832;
  const hash=n=>{n=Math.imul(n^(n>>>15),2246822507);n=Math.imul(n^(n>>>13),3266489909);return((n^(n>>>16))>>>0)/4294967296};
  const mix=(a,b,k)=>[a[0]+(b[0]-a[0])*k,a[1]+(b[1]-a[1])*k,a[2]+(b[2]-a[2])*k];
  const rgba=(c,a)=>`rgba(${c[0]|0},${c[1]|0},${c[2]|0},${Math.max(0,Math.min(1,a)).toFixed(3)})`;
  const wrap=v=>((v%1)+1)%1;
  function backdrop(ctx,w,h,stops){
    ctx.globalCompositeOperation='source-over';ctx.globalAlpha=1;
    const g=ctx.createLinearGradient(0,0,0,h);for(const [at,color] of stops)g.addColorStop(at,color);
    ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  }
  function vignette(ctx,w,h,strength=.5){
    ctx.globalCompositeOperation='source-over';
    const v=ctx.createRadialGradient(w/2,h/2,Math.min(w,h)*.42,w/2,h/2,Math.max(w,h)*.75);v.addColorStop(0,'rgba(0,0,0,0)');v.addColorStop(1,`rgba(0,0,4,${strength})`);
    ctx.fillStyle=v;ctx.fillRect(0,0,w,h);
  }
  function dot(ctx,x,y,r,color,a){ctx.fillStyle=rgba(color,a);ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.fill()}
  function glow(ctx,x,y,r,color,a){
    const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgba(color,a));g.addColorStop(.35,rgba(color,a*.3));g.addColorStop(1,rgba(color,0));
    ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
  }

  // Curtains of light folding slowly over a dark ridge. Green at the hem, the theme colour above.
  function aurora(ctx,w,h,t,accent,accent2){
    backdrop(ctx,w,h,[[0,'#02040c'],[.6,'#061321'],[1,'#082028']]);
    const u=h/700,GREEN=[84,232,150];
    for(let i=0;i<90;i++)dot(ctx,hash(i*2+1)*w,hash(i*2+2)*h*.72,(.5+hash(i+300)*.9)*u,[220,232,255],.2+.45*(.5+.5*Math.sin(t*(.4+hash(i+7)*1.2)+i)));
    ctx.globalCompositeOperation='lighter';
    // A whole number of pixels, so neighbouring strips meet without overlapping into bright seams.
    const step=Math.max(3,Math.ceil(w/220));
    for(let l=0;l<3;l++){
      const hem=mix(GREEN,l===1?accent:accent2,l?.4:.12),crown=l===2?accent2:accent;
      // The gradient is drawn in a unit-high space that each strip stretches to its own height.
      const g=ctx.createLinearGradient(0,0,0,-1);
      g.addColorStop(0,rgba(hem,0));g.addColorStop(.07,rgba(hem,.55));g.addColorStop(.3,rgba(mix(hem,crown,.6),.3));g.addColorStop(.62,rgba(crown,.14));g.addColorStop(1,rgba(crown,0));
      ctx.fillStyle=g;
      for(let x=0;x<w;x+=step){
        const s=x/h,fold=Math.sin(s*2.2+t*.05+l*2.1)+.5*Math.sin(s*5.1-t*.08+l);
        const rays=.5+.5*Math.sin(s*36+t*.45+l*4+3*Math.sin(s*3+t*.1));
        const y=h*(.56+.06*l+.07*fold),height=h*(.24+.15*Math.sin(s*1.7+t*.06+l*1.3)+.1*rays);
        ctx.globalAlpha=(.3+.7*(.5+.5*Math.sin(s*3.3-t*.11+l*5)))*(.5+.5*rays)*(l?.7:1);
        ctx.setTransform(1,0,0,height,x,y);ctx.fillRect(0,-1,step,1.02);
      }
      ctx.setTransform(1,0,0,1,0,0);
    }
    ctx.globalAlpha=1;
    glow(ctx,w/2,h*.9,w*.6,GREEN,.07);
    ctx.globalCompositeOperation='source-over';ctx.fillStyle='#02050a';ctx.beginPath();ctx.moveTo(0,h);
    for(let x=0;x<=w+12;x+=12){const s=x/h;ctx.lineTo(x,h*(.87+.03*Math.sin(s*3+1)+.014*Math.sin(s*9+2)+.006*Math.sin(s*23)))}
    ctx.lineTo(w,h);ctx.fill();
    vignette(ctx,w,h,.45);
  }

  // Line-drawn hills rolling towards you, with a clear valley down the middle for the shelf.
  function ridges(ctx,w,h,t,accent,accent2){
    backdrop(ctx,w,h,[[0,'#04050c'],[.42,'#0b0e1b'],[1,'#05070d']]);
    const u=h/700,horizon=h*.4,f=h*.9,cx=w/2,ROWS=34,DZ=.15,Z0=.3,CAMERA=.3,scroll=t*.05,first=Math.floor(scroll/DZ),frac=scroll/DZ-first;
    for(let i=0;i<50;i++)dot(ctx,hash(i*2+1)*w,hash(i*2+2)*horizon,(.5+hash(i+300)*.8)*u,[215,225,255],.15+.35*(.5+.5*Math.sin(t*(.3+hash(i+7))+i)));
    ctx.globalCompositeOperation='lighter';glow(ctx,cx,horizon,w*.55,accent,.2);glow(ctx,cx,horizon,w*.2,accent2,.16);
    ctx.globalCompositeOperation='source-over';ctx.lineJoin='round';
    const step=Math.max(5,w/160),far=Z0+ROWS*DZ;
    for(let k=ROWS;k>=0;k--){
      const z=Z0+(k-frac)*DZ;if(z<.2)continue;
      const zw=(k+first)*DZ,base=horizon+CAMERA/z*f;
      ctx.beginPath();ctx.moveTo(-20,h+20);
      for(let sx=-step;sx<=w+step;sx+=step){
        const X=(sx-cx)*z/f,valley=1-Math.exp(-X*X/.22);
        const n=.5*Math.sin(X*1.9+zw*.9)+.3*Math.sin(X*4.3-zw*2.1+1)+.2*Math.sin(X*8.7+zw*4.2);
        ctx.lineTo(sx,base-Math.max(0,n+.3)*.4*valley/z*f);
      }
      ctx.lineTo(w+20,h+20);ctx.closePath();
      const fade=Math.min(1,(far-z)/1.4)*Math.min(1,(z-.2)/.4),depth=Math.min(1,z/far);
      ctx.fillStyle='#070912';ctx.fill();
      ctx.strokeStyle=rgba(mix(accent2,accent,depth),(.2+.6*(1-depth))*fade);ctx.lineWidth=Math.max(1,(2.2-1.4*depth)*u);ctx.stroke();
    }
    vignette(ctx,w,h,.5);
  }

  // Sparks lifting off a fire just below the screen, cooling from white to red as they climb.
  function embers(ctx,w,h,t,accent,accent2){
    backdrop(ctx,w,h,[[0,'#060405'],[.6,'#120807'],[1,'#200c06']]);
    const u=h/700,flicker=.8+.12*Math.sin(t*2.3)+.08*Math.sin(t*5.7+1);
    const HOT=[255,228,176],WARM=mix([255,122,44],accent,.3),COOL=[150,34,14];
    ctx.globalCompositeOperation='lighter';
    glow(ctx,w/2,h*1.1,w*.62,[255,104,36],.36*flicker);glow(ctx,w/2,h*1.06,w*.3,[255,190,110],.2*flicker);
    for(let i=0;i<9;i++){
      const p=wrap(hash(i+700)+t*(.01+hash(i+710)*.012));
      glow(ctx,w*(.15+.7*hash(i+720)+.03*Math.sin(t*.2+i)),h*(1.1-1.2*p),(40+60*hash(i+730))*u,WARM,.07*Math.sin(p*Math.PI));
    }
    ctx.lineCap='round';
    for(let i=0;i<170;i++){
      const speed=.03+hash(i*5+1)*.055,p=wrap(hash(i*5+2)+t*speed),side=hash(i*5+3)-.5;
      // Sparks start close together above the fire and spread out as the air carries them.
      const at=q=>[w*(.5+side*(.35+1.1*q)+.025*Math.sin(q*9+i)+.05*q*Math.sin(t*.3+i*.7)),h*(1.05-1.12*Math.pow(Math.max(0,q),.75))];
      const color=p<.3?mix(HOT,WARM,p/.3):mix(WARM,COOL,(p-.3)/.7);
      const a=Math.pow(1-p,1.3)*Math.min(1,p*14)*(.72+.28*Math.sin(t*(5+hash(i+40)*9)+i));
      const r=(1.2+hash(i*5+4)*2.2)*u*(1-.5*p),[x,y]=at(p),[x0,y0]=at(p-.012);
      ctx.strokeStyle=rgba(color,a*.7);ctx.lineWidth=r*1.7;ctx.beginPath();ctx.moveTo(x0,y0);ctx.lineTo(x,y);ctx.stroke();
      dot(ctx,x,y,r,mix(color,[255,255,255],.3),a);
      if(i%4===0)glow(ctx,x,y,r*9,color,a*.45);
    }
    vignette(ctx,w,h,.55);
  }

  // Under water: sunlight falling in shafts, bubbles, drifting specks and a school of fish going by.
  function deep(ctx,w,h,t,accent,accent2){
    backdrop(ctx,w,h,[[0,'#0c5069'],[.45,'#062b47'],[1,'#020913']]);
    const u=h/700,LIGHT=[150,226,240];
    ctx.globalCompositeOperation='lighter';
    for(let i=0;i<8;i++){
      const x=w*(.1+.95*hash(i+11)+.04*Math.sin(t*.07+i*2)),wide=h*(.05+.1*hash(i+21)),a=.09+.08*(.5+.5*Math.sin(t*.21+i*1.9));
      ctx.save();ctx.translate(x,-h*.06);ctx.rotate(.24+.05*Math.sin(t*.05+i));
      const g=ctx.createLinearGradient(-wide,0,wide,0);g.addColorStop(0,rgba(LIGHT,0));g.addColorStop(.5,rgba(LIGHT,a));g.addColorStop(1,rgba(LIGHT,0));
      ctx.fillStyle=g;ctx.fillRect(-wide,0,wide*2,h*1.4);ctx.restore();
    }
    // The light gives out with depth.
    ctx.globalCompositeOperation='source-over';
    const dark=ctx.createLinearGradient(0,0,0,h);dark.addColorStop(0,'rgba(2,9,19,0)');dark.addColorStop(.55,'rgba(2,9,19,.5)');dark.addColorStop(1,'rgba(2,9,19,.95)');
    ctx.fillStyle=dark;ctx.fillRect(0,0,w,h);
    // A school crosses every 70 seconds, alternating direction, as silhouettes against the light.
    const lap=Math.floor(t/70),c=t/70-lap,dir=lap%2?-1:1,sx=dir>0?-.25+1.5*c:1.25-1.5*c,sy=.26+.3*hash(lap+500);
    ctx.fillStyle='rgba(2,12,24,.8)';
    for(let j=0;j<24;j++){
      const x=w*(sx-dir*hash(j+60)*.2),y=h*(sy+(hash(j+90)-.5)*.14+.012*Math.sin(t*.9+j)),size=(6+6*hash(j+120))*u,wag=Math.sin(t*7+j*1.3)*size*.3;
      ctx.beginPath();ctx.ellipse(x,y,size,size*.36,0,0,TAU);ctx.fill();
      ctx.beginPath();ctx.moveTo(x-dir*size*.8,y);ctx.lineTo(x-dir*size*1.6,y-size*.45+wag);ctx.lineTo(x-dir*size*1.6,y+size*.45+wag);ctx.fill();
    }
    ctx.globalCompositeOperation='lighter';
    const speck=mix([170,230,235],accent2,.35);
    for(let i=0;i<80;i++){
      const x=wrap(hash(i*3+1)+t*.004*(hash(i*3+2)-.3)+.008*Math.sin(t*.25+i)),y=wrap(hash(i*3+3)-t*.003*(.3+hash(i+900)));
      dot(ctx,x*w,y*h,(.6+hash(i+40)*1.2)*u,speck,.1+.3*(.5+.5*Math.sin(t*(.3+hash(i+90)*.7)+i*1.7)));
    }
    ctx.lineWidth=Math.max(1,1.1*u);
    for(let i=0;i<16;i++){
      const p=wrap(hash(i+200)+t*(.02+.03*hash(i+210))),r=(2+5*hash(i+220))*u*(.6+.4*p),a=.34*Math.min(1,p*8,(1-p)*6);
      const x=w*(hash(i+230)+.012*Math.sin(p*20+i)),y=h*(1.05-1.15*p);
      ctx.strokeStyle=rgba([190,235,245],a);ctx.beginPath();ctx.arc(x,y,r,0,TAU);ctx.stroke();
      dot(ctx,x-r*.35,y-r*.35,r*.22,[235,250,255],a*1.4);
    }
    vignette(ctx,w,h,.45);
  }
  // Stars streaming out from the middle of the screen, as if the shelf were under way.
  function warp(ctx,w,h,t,accent,accent2){
    backdrop(ctx,w,h,[[0,'#020308'],[.5,'#050715'],[1,'#020308']]);
    const u=h/700,cx=w/2,cy=h*.46,R=Math.hypot(w,h)*.6;
    ctx.globalCompositeOperation='lighter';glow(ctx,cx,cy,w*.4,accent,.13);glow(ctx,cx,cy,w*.14,accent2,.12);
    ctx.lineCap='round';
    for(let i=0;i<300;i++){
      const angle=hash(i*4+1)*TAU,p=wrap(hash(i*4+2)+t*(.035+hash(i*4+3)*.07)),near=Math.pow(p,2.3),tail=Math.pow(Math.max(0,p-.035),2.3);
      const c=Math.cos(angle),s=Math.sin(angle),r0=(.02+tail)*R,r1=(.02+near)*R,a=Math.min(1,p*5)*(.35+.65*hash(i*4+4));
      const color=mix([235,240,255],i%3?accent2:accent,.15+.5*hash(i+500));
      ctx.strokeStyle=rgba(color,a*.8);ctx.lineWidth=Math.max(.7,(.6+2.2*near)*u);
      ctx.beginPath();ctx.moveTo(cx+c*r0,cy+s*r0);ctx.lineTo(cx+c*r1,cy+s*r1);ctx.stroke();
    }
    vignette(ctx,w,h,.5);
  }

  // Rain over a city at night: lit windows far off, streaks coming down, rings where they land.
  function rain(ctx,w,h,t,accent,accent2){
    backdrop(ctx,w,h,[[0,'#05070d'],[.55,'#0a0f1a'],[1,'#06080e']]);
    const u=h/700;
    ctx.globalCompositeOperation='lighter';
    for(let i=0;i<14;i++){
      const color=i%3===0?accent:i%3===1?accent2:[120,160,230];
      glow(ctx,w*hash(i+31),h*(.62+.2*hash(i+41)),(60+110*hash(i+51))*u,color,.07+.05*Math.sin(t*(.2+hash(i+61)*.5)+i));
    }
    ctx.lineCap='round';
    for(let i=0;i<260;i++){
      const depth=hash(i*3+1),p=wrap(hash(i*3+2)+t*(.45+.75*depth)),ground=h*(.86+.14*depth),x0=w*(hash(i*3+3)*1.2-.1);
      const color=mix([170,195,235],accent2,.25);
      if(p<.86){
        const q=p/.86,y=-h*.08+(ground+h*.08)*q,x=x0+w*.07*q,len=(14+38*depth)*u;
        ctx.strokeStyle=rgba(color,.07+.3*depth);ctx.lineWidth=Math.max(.7,(.6+1.1*depth)*u);
        ctx.beginPath();ctx.moveTo(x-len*.16,y-len);ctx.lineTo(x,y);ctx.stroke();
      }else{
        const q=(p-.86)/.14,r=(3+16*depth)*u*q;
        ctx.strokeStyle=rgba(color,(.1+.3*depth)*(1-q));ctx.lineWidth=Math.max(.7,u);
        ctx.beginPath();ctx.ellipse(x0+w*.07,ground,r,r*.3,0,0,TAU);ctx.stroke();
      }
    }
    // The wet ground picks up the city's light.
    const wet=ctx.createLinearGradient(0,h*.82,0,h);wet.addColorStop(0,rgba(accent,0));wet.addColorStop(1,rgba(accent,.1));
    ctx.fillStyle=wet;ctx.fillRect(0,h*.82,w,h*.18);
    vignette(ctx,w,h,.55);
  }

  // Lights out of focus: soft discs in the theme colours drifting up past one another.
  function bokeh(ctx,w,h,t,accent,accent2){
    backdrop(ctx,w,h,[[0,'#07060c'],[.5,'#0d0a14'],[1,'#050409']]);
    const u=h/700,WARM=[255,196,128];
    ctx.globalCompositeOperation='lighter';
    for(let i=0;i<54;i++){
      const depth=hash(i*5+1),r=(16+70*depth*depth)*u;
      const x=w*wrap(hash(i*5+2)+t*.004*(hash(i*5+3)-.5)+.01*Math.sin(t*.13+i)),y=h*(1.15-1.3*wrap(hash(i*5+4)+t*(.004+.009*depth)));
      const color=i%4===0?WARM:i%2?accent:accent2,a=(.035+.09*(1-depth))*(.6+.4*Math.sin(t*(.25+hash(i+70)*.6)+i*2.3));
      // A camera's out-of-focus light: an even disc with a slightly brighter rim.
      const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,rgba(color,a*.75));g.addColorStop(.8,rgba(color,a));g.addColorStop(.93,rgba(color,a*1.5));g.addColorStop(1,rgba(color,0));
      ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
    }
    vignette(ctx,w,h,.5);
  }

  // A striped sun going down behind a grid that runs out to the horizon.
  function sunset(ctx,w,h,t,accent,accent2){
    const u=h/700,horizon=h*.6,cx=w/2,sunR=h*.24,sunY=horizon-sunR*.42,SKY=[18,8,34];
    backdrop(ctx,w,h,[[0,'#06030f'],[.45,rgba(mix(SKY,accent,.16),1)],[.6,rgba(mix(SKY,accent,.42),1)],[.6,'#07040f'],[1,'#030208']]);
    for(let i=0;i<70;i++)dot(ctx,hash(i*2+1)*w,hash(i*2+2)*horizon*.8,(.5+hash(i+300)*.9)*u,[230,225,255],.15+.4*(.5+.5*Math.sin(t*(.4+hash(i+7))+i)));
    ctx.globalCompositeOperation='lighter';glow(ctx,cx,sunY,sunR*2.6,accent,.22);
    ctx.globalCompositeOperation='source-over';ctx.save();ctx.beginPath();ctx.rect(0,0,w,horizon);ctx.clip();
    const sun=ctx.createLinearGradient(0,sunY-sunR,0,sunY+sunR);sun.addColorStop(0,rgba(mix(accent2,[255,244,200],.5),1));sun.addColorStop(.55,rgba(accent,1));sun.addColorStop(1,rgba(mix(accent,[230,40,120],.55),1));
    ctx.fillStyle=sun;ctx.beginPath();ctx.arc(cx,sunY,sunR,0,TAU);ctx.fill();
    // The gaps in the sun slide down and widen, as on the old record sleeves.
    ctx.fillStyle=rgba(mix(SKY,accent,.36),1);
    for(let j=0;j<7;j++){const q=wrap(j/7+t*.02),y=sunY-sunR*.1+sunR*1.1*q;ctx.fillRect(cx-sunR,y,sunR*2,Math.max(1,sunR*.012+sunR*.09*q))}
    ctx.restore();
    ctx.globalCompositeOperation='lighter';ctx.lineWidth=Math.max(1,1.3*u);
    const N=16,frac=wrap(t*.35);
    for(let k=0;k<=N;k++){const q=Math.pow((k+frac)/N,2.4),y=horizon+(h-horizon)*q;ctx.strokeStyle=rgba(accent,.12+.5*q);ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(w,y);ctx.stroke()}
    const fade=ctx.createLinearGradient(0,horizon,0,h);fade.addColorStop(0,rgba(accent,.08));fade.addColorStop(1,rgba(accent,.55));ctx.strokeStyle=fade;
    for(let i=-18;i<=18;i++){ctx.beginPath();ctx.moveTo(cx+i*w*.012,horizon);ctx.lineTo(cx+i*w*.16,h);ctx.stroke()}
    glow(ctx,cx,horizon,w*.5,accent2,.12);
    ctx.fillStyle=rgba(accent2,.5);ctx.fillRect(0,horizon-Math.max(1,u),w,Math.max(1,1.6*u));
    vignette(ctx,w,h,.5);
  }
  return {aurora,ridges,embers,deep,warp,rain,bokeh,sunset};
})();
