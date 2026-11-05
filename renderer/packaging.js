// System packaging profiles. Existing cover/back/spine scans always win.
const Packaging=(()=>{
  let finishId=0;
  const p=(size,shell,material,bg,ink,brand,accent=shell)=>({size,shell,material,bg,ink,brand,accent});
  const profiles={
    ps1:p([244,216,19],'#b9c4cb','jewel','#f3f1eb','#16171b','PlayStation','#151619'),
    ps2:p([230,323,24],'#161719','plastic','#eeeae2','#141416','PlayStation 2','#17181b'),
    ps3:p([230,284,22],'#a5b3bc','clear','#17181b','#f4f4f4','PS3','#151619'),
    ps4:p([230,284,22],'#1761a7','clear','#174884','#fff','PS4','#1761a7'),
    psp:p([178,300,23],'#b7c3c6','clear','#f0efe9','#121316','PSP','#161719'),
    switch:p([184,300,19],'#b9c5c8','clear','#df001b','#fff','Nintendo Switch','#df001b'),
    switch2:p([184,300,19],'#c31b30','clear','#b7192c','#fff','Nintendo Switch 2','#df001b'),
    nds:p([238,215,27],'#28282b','plastic','#f3f1ec','#141518','Nintendo DS','#e9e7e2'),
    '3ds':p([238,215,25],'#e8e7e1','plastic','#f3f1ec','#141518','Nintendo 3DS','#e9e7e2'),
    wii:p([230,323,24],'#e5e8e7','plastic','#f2f2ee','#454951','Wii','#e5e8e7'),
    wiiu:p([230,323,24],'#1487ab','plastic','#f4f1e8','#2c3339','Wii U','#1487ab'),
    gc:p([230,323,24],'#17171b','plastic','#17171b','#fff','NINTENDO GAMECUBE','#504282'),
    dreamcast:p([244,216,19],'#b7c4c9','jewel','#f1efea','#23282c','Dreamcast','#ed6b30'),
    xbox:p([230,323,24],'#236e28','clear','#243a25','#fff','XBOX','#75b83d'),
    x360:p([230,323,24],'#71a630','clear','#f1f1e7','#353a32','XBOX 360','#75aa3d'),
    genesis:p([235,302,33],'#191b1c','clamshell','#252326','#fff','GENESIS','#b61822'),
    gb:p([235,235,47],'#c7bdac','cardboard','#e9e5d8','#333b68','GAME BOY','#515879'),
    gbc:p([235,235,47],'#bdb4a0','cardboard','#e8e3d4','#303642','GAME BOY COLOR','#f3b62c'),
    gba:p([235,235,44],'#c6c1ba','cardboard','#e4e4df','#36335b','GAME BOY ADVANCE','#56507f'),
    nes:p([230,320,43],'#c4bbab','cardboard','#181b1c','#fff','Nintendo','#bb252d'),
    snes:p([318,225,52],'#bdb4a3','cardboard','#242428','#fff','SUPER NINTENDO','#b62a30'),
    n64:p([318,225,52],'#bdb4a3','cardboard','#202228','#fff','NINTENDO 64','#257847'),
    a2600:p([230,310,42],'#bdb09d','cardboard','#a94123','#fff','ATARI 2600','#eb9d39'),
    arcade:p([318,225,52],'#b8ad98','cardboard','#28262c','#fff','ARCADE','#bc8b29')
  };
  function profile(sys){return profiles[sys.id]||p([230,323,24],'#292a31','plastic','#252631','#fff',sys.name,sys.color||'#444')}
  // Corners describe the moulded shell, not a rounded card laid over the cover.
  function geometry(v,sys){
    if(v.material==='cardboard')return {radius:.25,rim:0,bevel:.45};
    if(v.material==='jewel')return {radius:.6,rim:1.2,bevel:.7};
    if(sys.id==='switch'||sys.id==='switch2')return {radius:2,rim:1.5,bevel:.9};
    if(v.material==='clamshell')return {radius:2,rim:1.5,bevel:1};
    return {radius:1.5,rim:1.2,bevel:.8};
  }
  function decorate(box,a){
    const v=profile(a.sys),shape=geometry(v,a.sys);box.dataset.packaging=a.sys.id;box.dataset.material=v.material;box.dataset.media=a.sys.media;
    box.style.setProperty('--case-shell',v.shell);box.style.setProperty('--case-rim',shape.rim+'px');
    box.style.setProperty('--case-print',v.bg);
    box.style.setProperty('--case-ink',v.ink);
    box.style.setProperty('--case-radius',shape.radius+'px');
  }
  function node(cls,text){const n=document.createElement('div');n.className=cls;if(text)n.textContent=text;return n}
  function finish(box,a){
    const v=profile(a.sys),shape=geometry(v,a.sys),paper=v.material==='cardboard',glass=['clear','jewel'].includes(v.material);
    box.style.setProperty('--bevel-width',shape.bevel+'px');
    box.style.setProperty('--surface-gloss',paper?'.035':glass?'.10':'.065');
    const radius=shape.radius;
    for(const face of box.querySelectorAll(':scope > .f-front,:scope > .f-back,:scope > .lid > .l-front')){
      if(paper&&face.classList.contains('l-front'))continue;
      const id='case-finish-'+(++finishId),frame=node('case-bezel');frame.setAttribute('aria-hidden','true');
      const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');svg.setAttribute('viewBox',`0 0 ${a.W} ${a.H}`);svg.setAttribute('preserveAspectRatio','none');
      const stroke=paper?.5:glass?.85:1;
      svg.innerHTML=`<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2=".7"><stop stop-color="${paper?'#ede6d07a':'#ffffffc0'}"/><stop offset=".18" stop-color="${v.shell}"/><stop offset=".48" stop-color="${paper?'#35322b66':'#ffffff3b'}"/><stop offset=".72" stop-color="${v.shell}"/><stop offset="1" stop-color="#050709a0"/></linearGradient></defs><rect x="1.5" y="1.5" width="${a.W-3}" height="${a.H-3}" rx="${radius}" fill="none" stroke="url(#${id})" stroke-width="${stroke}"/><rect x="${paper?2.5:4}" y="${paper?2.5:4}" width="${a.W-(paper?5:8)}" height="${a.H-(paper?5:8)}" rx="${Math.max(0,radius-1)}" fill="none" stroke="#00000040" stroke-width="${paper?.5:.8}"/>`;
      const surface=node('case-surface-finish');surface.setAttribute('aria-hidden','true');frame.append(svg);face.append(surface,frame);
    }
    const lid=box.querySelector(':scope > .lid');
    const edges=node('case-edge-set');edges.setAttribute('aria-hidden','true');
    const bevelDepth=shape.bevel/Math.SQRT2+.15;
    edges.style.setProperty('--bevel-z',lid&&!paper?(.5+bevelDepth)+'px':`calc(var(--d) / 2 + ${bevelDepth}px)`);
    for(const side of ['top','bottom','left','right'])edges.append(node('case-bevel case-bevel-'+side));
    (lid&&!paper?lid:box).append(edges);
    if(!paper&&lid){
      const inner=lid.querySelector('.l-inner');
      for(const corner of ['tl','tr','bl','br'])inner.append(node('case-booklet-tab case-booklet-tab-'+corner));
      const right=box.querySelector(':scope > .f-right');right?.append(node('case-latch'));
    }
  }
  function brand(sys,D,height){
    const n=node('spine-brand'),v=profile(sys);
    if(sys.id==='switch'||sys.id==='switch2'){
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 60 76');
      svg.innerHTML='<path d="M26 5H17C9 5 6 9 6 16V42C6 49 10 53 17 53H26Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M34 3H43C51 3 55 8 55 16V42C55 50 51 55 43 55H34Z" fill="currentColor"/><circle cx="17" cy="19" r="5" fill="currentColor"/><circle cx="44" cy="37" r="5" fill="'+v.bg+'"/><text x="30" y="69" fill="currentColor" text-anchor="middle" font-family="Arial" font-size="8" font-weight="bold">SWITCH'+(sys.id==='switch2'?' 2':'')+'</text>';
      n.append(svg);
    }else{
      const short={ps1:'PS',ps2:'PS2',ps3:'PS3',ps4:'PS4',psp:'PSP',nds:'DS','3ds':'3DS',wii:'Wii',wiiu:'Wii U',gc:'GC',dreamcast:'◉',xbox:'X',x360:'XBOX',genesis:'SEGA',gb:'GB',gbc:'GBC',gba:'GBA',nes:'NES',snes:'SNES',n64:'N64',a2600:'ATARI',arcade:'ARCADE'};
      const mark=node('spine-brand-mark',short[sys.id]||v.brand);mark.style.fontSize=fitText(mark.textContent,D*.83,Math.min(D*.60,height*.43))+'px';
      n.append(mark,node('spine-brand-caption',v.brand));
    }return n;
  }
  function fitText(text,maxWidth,fontSize){
    const ctx=document.createElement('canvas').getContext('2d');ctx.font=`600 ${fontSize}px Arial`;
    return Math.min(fontSize,fontSize*maxWidth/Math.max(1,ctx.measureText(text).width));
  }
  function spine(game,a){
    const face=node('face f-left');
    if(game.media.spine){face.style.backgroundImage=`url("${game.media.spine}")`;face.dataset.spine='scan';return face}
    face.dataset.spine='generated';let v=profile(a.sys);const insert=node('spine-insert');
    if(a.sys.id==='ps2'&&/\((USA|Japan)\)|\[(US|JP)\]/i.test(game.base||''))v={...v,bg:'#18191d',ink:'#fff'};
    const header=Math.min(a.D*1.8,a.H*.18),footerHeight=Math.min(a.D*1.8,a.H*.12);
    insert.style.cssText=`--spine-paper:${v.bg};--spine-ink:${v.ink};--spine-accent:${v.accent};--spine-header:${header}px;--spine-footer:${footerHeight}px`;
    if(a.sys.id==='switch2'&&game.media.front){
      const art=node('spine-wrap-art');EshopCovers.background(art,a.front,a.packshot||{x:0,y:0,w:1,h:1});insert.append(art);
    }
    else if(game.media.front&&!a.digital){
      // No spine scan: wrap the cover's edge colours around the spine so it belongs to this game.
      const dark=v.ink==='#fff'||v.ink==='#f4f4f4';
      if(dark){const art=node('spine-wrap-art spine-wrap-cover');EshopCovers.background(art,a.front,a.packshot||{x:0,y:0,w:.14,h:1});insert.append(art)}
      Art.tint(a.front,a.packshot).then(color=>insert.style.setProperty('--spine-tint',color));
    }
    const title=node('spine-game-title',game.title.replace(/\bv?\d+(?:\.\d+)+\b/gi,'').replace(/\s+/g,' ').trim());
    title.style.fontSize=fitText(title.textContent,a.H-header-footerHeight-a.D*.6,a.D*(v.material==='cardboard'?.43:.47))+'px';
    const titleArea=node('spine-title-area');titleArea.append(title);
    const footer=node('spine-footer',game.info?.publisher||game.info?.developer||'');
    footer.style.fontSize=fitText(footer.textContent,footerHeight*.9,a.D*.24)+'px';
    insert.append(brand(a.sys,a.D,header),titleArea,footer);face.append(insert);return face;
  }
  return {profiles,profile,decorate,spine,finish};
})();
