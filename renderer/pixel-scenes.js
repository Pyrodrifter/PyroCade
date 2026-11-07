// Procedural 16-bit style backgrounds (day and night), drawn with whole-pixel rectangles and fixed palettes.
const PixelScenes=(()=>{
  const H=180;
  const hash=n=>{n=Math.imul(n^(n>>>15),2246822507);n=Math.imul(n^(n>>>13),3266489909);return((n^(n>>>16))>>>0)/4294967296};
  const palettes={
    day:{
      sky:['#3f9be0','#52aae8','#66b9ee','#7cc7f3','#93d3f6','#aadef9','#c2e9fb','#dcf4fd'],
      sun:['#fff6b8','#ffe36e','#ffc93c'],cloud:['#ffffff','#e3f1fb','#c6def2'],
      hills:[['#9ccfb8','#86bfa5'],['#6fb48f','#5aa17c'],['#3f8d62','#2f7a52']],tree:['#1f5e3f','#2c7a50'],
      grass:['#2f7a3d','#3f9a4a','#58b45a'],bird:'#27406b'
    },
    night:{
      sky:['#070b22','#0a1030','#0e1740','#131f4f','#1a2860','#223472','#2c4084','#394e94'],
      sun:['#f7f4dc','#dcd8bd','#bfbba0'],cloud:['#2b3a78','#223066','#1b2756'],
      hills:[['#27346e','#202b5c'],['#1c2552','#161e46'],['#111836','#0c1229']],tree:['#080d22','#0e1630'],
      grass:['#0a1a22','#0f2a2a','#173c35'],bird:'#0000'
    }
  };
  let clouds=null,skyline=null,stars=null,flies=null,shooting=null;
  function seed(w){
    clouds=Array.from({length:7},(_,i)=>({x:hash(i*7+1)*w*1.3,y:10+hash(i*7+2)*60,w:22+hash(i*7+3)*34,v:.5+hash(i*7+4)*1.3}));
    stars=Array.from({length:90},(_,i)=>({x:Math.floor(hash(i*5+11)*w),y:Math.floor(hash(i*5+12)*H*.55),p:hash(i*5+13)*6.28,b:hash(i*5+14)>.85}));
    flies=Array.from({length:16},(_,i)=>({x:hash(i*3+21)*w,y:H*.6+hash(i*3+22)*H*.33,p:hash(i*3+23)*6.28,s:.3+hash(i*3+24)}));
    skyline=[];let x=0,k=0;while(x<w+40){const bw=10+Math.floor(hash(k*9+31)*16),bh=14+Math.floor(hash(k*9+32)*30);skyline.push({x,w:bw,h:bh,k});x+=bw+1+Math.floor(hash(k*9+33)*3);k++}
    shooting={at:6,x:0,y:0,life:0};
  }
  const rect=(c,col,x,y,w,h)=>{c.fillStyle=col;c.fillRect(Math.round(x),Math.round(y),Math.round(w),Math.round(h))};
  function sky(c,w,p,horizon){
    const n=p.sky.length,band=horizon/n;
    for(let y=0;y<horizon;y++){
      const b=Math.min(n-1,Math.floor(y/band)),pos=y-b*band;
      rect(c,p.sky[b],0,y,w,1);
      // Checkerboard dither on the last rows of each band, as old hardware did.
      if(b<n-1&&pos>band-2){c.fillStyle=p.sky[b+1];for(let x=(y&1);x<w;x+=2)c.fillRect(x,y,1,1)}
    }
  }
  function disc(c,cx,cy,r,cols){
    for(let y=-r;y<=r;y++)for(let x=-r;x<=r;x++){
      const d=Math.hypot(x,y);if(d>r)continue;
      c.fillStyle=d>r-1.6?cols[2]:d>r-4?cols[1]:cols[0];c.fillRect(Math.round(cx+x),Math.round(cy+y),1,1);
    }
  }
  function cloud(c,p,cl,w){
    const x=((cl.x%(w+80))+w+80)%(w+80)-60,y=cl.y,u=cl.w;
    const rows=[[.18,.5],[.06,.88],[0,1],[.05,.9]];
    rows.forEach(([off,len],i)=>{rect(c,i===3?p.cloud[1]:p.cloud[0],x+u*off,y+i*4,u*len,4);});
    rect(c,p.cloud[2],x+u*.05,y+16,u*.9,2);
  }
  function ridge(x,l,t,amp){
    const u=x+t;return Math.round(Math.sin(u*.021+l*2.1)*amp+Math.sin(u*.047+l*5.3)*amp*.45+Math.sin(u*.0083+l)*amp*.8);
  }
  function hills(c,w,p,t,horizon,night){
    p.hills.forEach(([top,body],l)=>{
      const speed=[.9,2.2,4.6][l],base=horizon-10+l*16,amp=[16,13,10][l],off=night?0:t*speed;
      for(let x=0;x<w;x++){
        const y=base+ridge(x,l,off,amp);
        rect(c,top,x,y,1,2);rect(c,body,x,y+2,1,H-y);
        // light speckle texture
        {const wx=Math.floor(x+off);if(((wx*7)%11+11)%11===0)rect(c,top,x,y+5+((((wx>>2)%4)+4)%4)*3,1,1)}
      }
      if(l===2){
        // pine trees on the nearest ridge, scrolling with it
        const step=14,first=Math.floor(off/step)-1;
        for(let k=first;k<first+w/step+3;k++){
          if(hash(k*13+5)<.45)continue;
          const x=Math.round(k*step-off+hash(k*13+6)*8),y=base+ridge(x,l,off,amp)+3,h=10+Math.floor(hash(k*13+7)*10);
          for(let r=0;r<h;r+=3){const half=Math.max(1,Math.floor((r+3)/3));rect(c,p.tree[r%2],x-half,y-h+r,half*2+1,3)}
          rect(c,p.tree[1],x,y,1,3);
        }
      }
    });
  }
  function city(c,w,p,t,horizon){
    const off=0;
    for(const b of skyline){
      const x=((b.x-off)%(w+60)+w+60)%(w+60)-30,y=horizon+8-b.h;
      rect(c,'#0d1330',x,y,b.w,b.h+24);rect(c,'#141c42',x,y,1,b.h+24);
      for(let wy=y+3;wy<y+b.h;wy+=4)for(let wx=x+2;wx<x+b.w-1;wx+=3){
        const col=Math.floor((wx-x)/3),row=Math.floor((wy-y)/4),k=hash(b.k*97+col*13+row*7),on=k>.55&&(k>.93?Math.floor(t/30+k*50)%2===0:true);
        if(on)rect(c,k>.8?'#ffd36a':'#f5b94d',wx,wy,1,2);
      }
    }
  }
  function grass(c,w,p,t){
    const gy=H-12;rect(c,p.grass[0],0,gy,w,12);rect(c,p.grass[1],0,gy,w,2);
    for(let x=0;x<w;x+=3){
      const hh=3+Math.floor(hash(x*3+9)*5),sway=Math.round(Math.sin(t*1.7+x*.3)*1);
      rect(c,p.grass[(x/3|0)%2?1:2],x+sway,gy-hh,1,hh+1);
    }
  }
  const BIRD=[['X.....X','.X...X.','..XXX..'],['..XXX..','.X...X.','X.....X']];
  function birds(c,w,t,col){
    for(let i=0;i<3;i++){
      const x=((t*9+i*130)%(w+60))-30,y=30+i*17+Math.round(Math.sin(t*.35+i*2)*3),frame=BIRD[Math.floor(t*2.2+i)%2];
      c.fillStyle=col;frame.forEach((row,ry)=>{for(let rx=0;rx<row.length;rx++)if(row[rx]==='X')c.fillRect(Math.round(x)+rx,y+ry,1,1)});
    }
  }
  function draw(ctx,w,t,kind){
    if(!clouds||clouds.w!==w){seed(w);clouds.w=w}
    const night=kind==='night',p=palettes[kind],horizon=Math.round(H*.62);
    ctx.globalCompositeOperation='source-over';
    sky(ctx,w,p,horizon+20);
    if(night){
      for(const s of stars){
        const tw=Math.sin(t*.7+s.p);
        rect(ctx,s.b||(s.p>4.7&&tw>.6)?'#ffffff':'#8d9fdc',s.x,s.y,1,1);
        if(s.b){rect(ctx,'#6f82c7',s.x-1,s.y,1,1);rect(ctx,'#6f82c7',s.x+1,s.y,1,1);rect(ctx,'#6f82c7',s.x,s.y-1,1,1);rect(ctx,'#6f82c7',s.x,s.y+1,1,1)}
      }
      if(t>shooting.at){if(!shooting.life){shooting.x=hash(Math.floor(t))*w*.7+20;shooting.y=8+hash(Math.floor(t)+1)*40;shooting.life=1}
        shooting.life+=.05;for(let i=0;i<8;i++)rect(ctx,i<2?'#ffffff':'#8fa4e6',shooting.x+shooting.life*60-i*2.5,shooting.y+shooting.life*30-i*1.2,2,1);
        if(shooting.life>2.2){shooting.life=0;shooting.at=t+9+hash(Math.floor(t)+2)*14}}
      const mx=w*.78,my=36+Math.sin(t*.05)*3;disc(ctx,mx,my,15,p.sun);
      for(const [dx,dy,r] of [[-5,-4,3],[4,3,4],[-3,6,2]])disc(ctx,mx+dx,my+dy,r,['#c9c5aa','#c9c5aa','#b3af95']);
    }else{
      const sx=w*.22,sy=34+Math.sin(t*.05)*2;disc(ctx,sx,sy,13,p.sun);
      ctx.fillStyle='#ffe36e55';for(let a=0;a<8;a++){const an=a*.785+t*.1;rect(ctx,'#fff3a0',sx+Math.cos(an)*21,sy+Math.sin(an)*21,2,2)}
    }
    for(const cl of clouds)cloud(ctx,p,{...cl,x:cl.x+t*cl.v*(night?.1:1)},w);
    if(!night)birds(ctx,w,t,p.bird);
    hills(ctx,w,p,t,horizon,night);
    if(night)city(ctx,w,p,t,horizon+4);
    // hills drawn first for the city silhouette? keep the nearest ridge above the skyline
    if(night){const [top,body]=p.hills[2],base=horizon-10+32,off=0;for(let x=0;x<w;x++){const y=base+ridge(x,2,off,10);rect(ctx,top,x,y,1,2);rect(ctx,body,x,y+2,1,H-y)}}
    grass(ctx,w,p,t);
    if(night)for(const f of flies){
      const x=f.x+Math.sin(t*.25*f.s+f.p)*14,y=f.y+Math.cos(t*.3*f.s+f.p)*7,on=Math.sin(t*.45*f.s+f.p*3)>-.3;
      if(on){rect(ctx,'#d9ff7a',x,y,1,1);rect(ctx,'#d9ff7a55',x-1,y,3,1)}
    }
  }
  return {draw,height:H};
})();
