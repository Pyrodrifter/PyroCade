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
    arcade:p([318,225,52],'#b8ad98','cardboard','#28262c','#fff','ARCADE','#bc8b29'),
    pc:p([230,323,24],'#141518','plastic','#f2f3f5','#111','PC','#1f6feb')
  };
  // Generated spines follow each system's retail layout: a logo band at the top in the system's
  // colours, the title running down the spine, the publisher at the foot. Real scans always win.
  const spines={
    ps1:{band:'#0d0d0f',ink:'#fff',body:'#0d0d0f',text:'#fff',mark:['PlayStation'],style:'ps',vertical:true},
    ps2:{band:'#0d0d0f',ink:'#fff',body:'#0d0d0f',text:'#fff',mark:['PlayStation 2'],style:'ps',vertical:true},
    ps3:{band:'#0d0d0f',ink:'#fff',body:'#0d0d0f',text:'#fff',mark:['PS3'],style:'ps'},
    ps4:{band:'#003791',ink:'#fff',body:'#0d0d0f',text:'#fff',mark:['PS4'],style:'ps'},
    psp:{band:'#0d0d0f',ink:'#fff',body:'#0d0d0f',text:'#fff',mark:['PSP'],style:'ps'},
    switch:{band:'#e60012',ink:'#fff',body:'#f4f4f2',text:'#151515',mark:['NINTENDO','SWITCH'],style:'switch'},
    switch2:{band:'#e60012',ink:'#fff',body:'#f4f4f2',text:'#151515',mark:['NINTENDO','SWITCH 2'],style:'switch'},
    nds:{band:'#f4f4f2',ink:'#2b2b2b',body:'#f4f4f2',text:'#151515',mark:['NINTENDO','DS'],style:'nintendo',rule:'#2b2b2b'},
    '3ds':{band:'#f4f4f2',ink:'#ce1a2a',body:'#f4f4f2',text:'#151515',mark:['NINTENDO','3DS'],style:'nintendo',rule:'#ce1a2a'},
    wii:{band:'#f4f4f2',ink:'#8d9298',body:'#f4f4f2',text:'#2d3035',mark:['Wii'],style:'wii',rule:'#c5c9cc'},
    wiiu:{band:'#009ac7',ink:'#fff',body:'#f4f4f2',text:'#2d3035',mark:['Wii U'],style:'wii'},
    gc:{band:'#0d0d0f',ink:'#fff',body:'#0d0d0f',text:'#fff',mark:['NINTENDO','GAMECUBE'],style:'nintendo',accent:'#6a5acd'},
    dreamcast:{band:'#f4f4f2',ink:'#e8591a',body:'#f4f4f2',text:'#151515',mark:['Dreamcast'],style:'dc'},
    xbox:{band:'#5aa02c',ink:'#fff',body:'#0d0d0f',text:'#fff',mark:['XBOX'],style:'xbox'},
    x360:{band:'#5aa02c',ink:'#fff',body:'#f4f4f2',text:'#151515',mark:['XBOX','360'],style:'xbox'},
    genesis:{band:'#0d0d0f',ink:'#e41b23',body:'#0d0d0f',text:'#fff',mark:['GENESIS'],style:'sega'},
    gb:{band:'#e9e6dc',ink:'#33337a',body:'#e9e6dc',text:'#1d1d1d',mark:['GAME BOY'],style:'gb',rule:'#33337a'},
    gbc:{band:'#e9e6dc',ink:'#33337a',body:'#e9e6dc',text:'#1d1d1d',mark:['GAME BOY','COLOR'],style:'gb',rule:'#f3b62c'},
    gba:{band:'#f2f2ee',ink:'#4b3f8f',body:'#f2f2ee',text:'#1d1d1d',mark:['GAME BOY','ADVANCE'],style:'gb',rule:'#4b3f8f'},
    nes:{band:'#0d0d0f',ink:'#e4002b',body:'#0d0d0f',text:'#fff',mark:['Nintendo'],style:'nintendo'},
    snes:{band:'#2b2b30',ink:'#fff',body:'#2b2b30',text:'#fff',mark:['SUPER','NINTENDO'],style:'nintendo',rule:'#7b5aa6'},
    n64:{band:'#0d0d0f',ink:'#fff',body:'#0d0d0f',text:'#fff',mark:['NINTENDO','64'],style:'nintendo',accent:'#1aa34a'},
    a2600:{band:'#a94123',ink:'#fff',body:'#151515',text:'#fff',mark:['ATARI','2600'],style:'sega'},
    arcade:{band:'#28262c',ink:'#ffcc33',body:'#28262c',text:'#fff',mark:['ARCADE'],style:'sega'},
    pc:{band:'#111216',ink:'#fff',body:'#f2f3f5',text:'#111',mark:['PC','DVD-ROM'],style:'xbox',rule:'#1f6feb'},
  };
  const spineDesign=sys=>spines[sys.id]||{band:sys.color||'#333',ink:'#fff',body:'#151515',text:'#fff',mark:[sys.name],style:'plain'};
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
    const n=node('spine-brand'),v=profile(sys),design=spineDesign(sys);
    n.dataset.style=design.style;
    if(sys.id==='switch'||sys.id==='switch2'){
      const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 60 76');
      svg.innerHTML='<path d="M26 5H17C9 5 6 9 6 16V42C6 49 10 53 17 53H26Z" fill="none" stroke="currentColor" stroke-width="4"/><path d="M34 3H43C51 3 55 8 55 16V42C55 50 51 55 43 55H34Z" fill="currentColor"/><circle cx="17" cy="19" r="5" fill="currentColor"/><circle cx="44" cy="37" r="5" fill="'+v.bg+'"/><text x="30" y="69" fill="currentColor" text-anchor="middle" font-family="Arial" font-size="8" font-weight="bold">SWITCH'+(sys.id==='switch2'?' 2':'')+'</text>';
      n.append(svg);
    }else{
      // The system's wordmark, one line per word group, each sized to the spine's width.
      const lines=design.mark,lineHeight=Math.min(height*.8/lines.length,D*.62);
      if(design.vertical){
        // PlayStation spines print the logo running down the spine.
        const line=node('spine-brand-mark vertical',lines[0]);line.style.fontSize=fitText(lines[0],height*.86,D*.5,900)+'px';n.append(line);return n;
      }
      for(const [i,text] of lines.entries()){
        const line=node('spine-brand-mark',text);
        // The last line of a two-line mark (DS, 64, COLOR…) is the emphasised part.
        const emphasis=lines.length>1&&i===lines.length-1;
        line.style.fontSize=fitText(text,D*.8,lineHeight*(emphasis?1:.62),900)+'px';
        if(emphasis)line.classList.add('emphasis');
        n.append(line);
      }
      if(design.accent){const dot=node('spine-brand-accent');n.prepend(dot)}
    }return n;
  }
  function fitText(text,maxWidth,fontSize,weight=600){
    // Measured at the heaviest weight used, with room for letter spacing, so marks never spill over.
    const ctx=document.createElement('canvas').getContext('2d');ctx.font=`${weight} ${fontSize}px Arial`;
    return Math.min(fontSize,fontSize*maxWidth/Math.max(1,ctx.measureText(text).width*(weight>600?1.1:1)));
  }
  function spine(game,a){
    const face=node('face f-left');
    if(game.media.spine){face.style.backgroundImage=`url("${game.media.spine}")`;face.dataset.spine='scan';return face}
    face.dataset.spine='generated';const v=profile(a.sys),design=spineDesign(a.sys);const insert=node('spine-insert');
    const header=design.vertical?a.H*.22:Math.min(a.D*(design.mark.length>1?2.2:1.8),a.H*.2),footerHeight=Math.min(a.D*1.8,a.H*.12);
    insert.style.cssText=`--spine-paper:${design.body};--spine-ink:${design.text};--spine-band:${design.band};--spine-band-ink:${design.ink};--spine-rule:${design.rule||'transparent'};--spine-brand-accent:${design.accent||'transparent'};--spine-header:${header}px;--spine-footer:${footerHeight}px`;
    const title=node('spine-game-title',game.title.replace(/\bv?\d+(?:\.\d+)+\b/gi,'').replace(/\s+/g,' ').trim());
    title.style.fontSize=fitText(title.textContent,a.H-header-footerHeight-a.D*.6,a.D*(v.material==='cardboard'?.43:.47))+'px';
    const titleArea=node('spine-title-area');titleArea.append(title);
    const footer=node('spine-footer',game.info?.publisher||game.info?.developer||'');
    footer.style.fontSize=fitText(footer.textContent,footerHeight*.9,a.D*.24)+'px';
    insert.append(brand(a.sys,a.D,header),titleArea,footer);face.append(insert);return face;
  }
  return {profiles,profile,decorate,spine,finish};
})();
