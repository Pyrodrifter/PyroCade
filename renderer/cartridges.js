// Shell outlines are normalized; dimensions are W/H/D in mm, then scaled for the
// viewer. Reference measurements and CAD research: docs/physical-models.md.
const Cartridges=(()=>{
  const rect='2,0 98,0 100,3 100,97 97,100 3,100 0,97 0,3';
  const card='8,0 97,0 100,3 100,76 96,76 96,94 91,100 3,100 0,97 0,8';
  const profiles={
    switch:{w:.38,h:.56,color:'#292a2b',depth:3,outline:card,label:[7,6,86,85],details:'M5 91H88 M92 9V70 M4 14V82'},
    switch2:{w:.38,h:.56,color:'#c52232',depth:3,outline:card,label:[7,6,86,85],details:'M5 91H88 M92 9V70 M4 14V82'},
    nds:{w:.46,h:.49,color:'#292b2c',depth:4,outline:'8,0 97,0 100,3 100,95 95,100 3,100 0,97 0,8',label:[10,9,80,78],details:'M5 18V88 M94 7V86 M12 93H86'},
    '3ds':{w:.49,h:.49,color:'#e4e3de',depth:4,outline:'3,0 98,0 100,2 100,14 92,14 92,96 88,100 3,100 0,97 0,3',label:[9,9,75,78],details:'M5 18V89 M87 18V89 M12 94H79'},
    gb:{w:.59,h:.66,color:'#a8a9a0',depth:7,outline:'3,0 86,0 86,8 100,8 100,95 95,100 3,100 0,97 0,3',label:[12,28,76,54],brand:'Nintendo GAME BOY',brandY:17,details:'M8 7H79 M8 23H91 M9 86H91 M10 91H87 M10 95H77 M4 34V78 M96 34V78'},
    gbc:{w:.59,h:.66,color:'#484650',depth:7,outline:'0,11 6,5 19,1 38,0 65,0 82,2 94,7 100,13 100,95 95,100 3,100 0,97',label:[12,29,76,52],brand:'GAME BOY COLOR',brandY:19,details:'M12 24H88 M9 86H91 M10 91H87 M10 95H77 M5 35V77 M95 35V77'},
    gba:{w:.76,h:.43,color:'#55506f',depth:6,outline:'3,0 97,0 100,5 100,23 94,23 94,91 87,100 13,100 6,91 6,23 0,23 0,5',label:[14,31,72,55],brand:'GAME BOY ADVANCE',brandY:20,details:'M8 6H92 M9 25H91 M10 31V78 M90 31V78 M16 92H84'},
    nes:{w:.64,color:'#999b96',outline:'1,0 15,0 15,1 37,1 37,0 86,0 86,1 97,1 97,0 100,0 100,81 95,81 95,100 6,100 6,81 0,81 0,1',label:[40,2,46,65],details:'M15 1V99 M37 1V99 M39 1V68H87V1'},
    snes:{w:.86,color:'#a5a6a2',outline:'2,3 16,3 16,1 18,0 82,0 84,1 84,3 98,3 100,6 100,97 98,100 2,100 0,97 0,6',label:[19.5,3,61,44],details:'M40 63V97 M60 63V97'},
    // Standard N64 shell: curved crown, inset wings, tall central label.
    n64:{w:.94,h:.65,color:'#8f9097',depth:10,outline:'0,19 0.3,16.5 1,14.8 2.2,13.4 4,12.4 6,11.8 10,9.8 15,7.5 20,5.5 25,3.8 30,2.4 35,1.4 40,0.6 45,0.2 50,0 55,0.2 60,0.6 65,1.4 70,2.4 75,3.8 80,5.5 85,7.5 90,9.8 94,11.8 96,12.4 97.8,13.4 99,14.8 99.7,16.5 100,19 100,99.4 99.4,100 0.6,100 0,99.4',label:[24,9,52,80],details:'M18.5 6V100 M81.5 6V100 M0 69L5 71.5V100 M100 69L95 71.5V100'},
    genesis:{w:.78,h:.56,color:'#252526',depth:9,outline:'0,15 9,7 27,1 73,1 91,7 100,15 100,95 95,100 5,100 0,95',label:[14.5,4,71,84],details:'M7 24V83 M11 19V83 M89 19V83 M93 24V83 M15 82H85 M44 88L50 94L56 88'},
    a2600:{w:.70,h:.80,color:'#302f2c',depth:10,outline:rect,label:[7,13,86,63],details:'M5 7H95 M4 82H96 M8 87H92 M8 92H92 M8 97H92'},
    // PSP UMD: a 6 cm disc in a glossy shell with one big curved top. The label follows that curve; the
    // back has the round window where the disc shows, as on the real thing.
    // Downloaded PSP "disc" pictures are photos of the whole UMD, so they are shown as they are (wholePhoto).
    psp:{shell:true,wholePhoto:true,w:.6,h:.62,color:'#d6d8d3',depth:5,
      outline:'0,24 0.4,21.6 1.6,19.6 4,17.06 8,14 12,11.36 16,9.07 20,7.1 24,5.42 28,4.02 32,2.87 36,1.96 40,1.29 44,0.85 48,0.63 52,0.63 56,0.85 60,1.29 64,1.96 68,2.87 72,4.02 76,5.42 80,7.1 84,9.07 88,11.36 92,14 96,17.06 98.4,19.6 99.6,21.6 100,24 100,97 97,100 3,100 0,97',
      label:[8,6,84,65],
      labelClip:'0% 20.62%,4.76% 16.55%,9.52% 13.03%,14.29% 10%,19.05% 7.42%,23.81% 5.26%,28.57% 3.49%,33.33% 2.1%,38.1% 1.07%,42.86% 0.38%,47.62% 0.04%,52.38% 0.04%,57.14% 0.38%,61.9% 1.07%,66.67% 2.1%,71.43% 3.49%,76.19% 5.26%,80.95% 7.42%,85.71% 10%,90.48% 13.03%,95.24% 16.55%,100% 20.62%,100% 100%,0% 100%',
      details:'M3 30V90 M97 30V90',
      art:id=>`<defs><linearGradient id="${id}g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".35" stop-color="#fff" stop-opacity=".03"/><stop offset=".7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#fff" stop-opacity=".07"/></linearGradient></defs>
        <rect x="16" y="77" width="68" height="15" rx="2.5" fill="#0000004d" stroke="#ffffff1a" stroke-width=".6"/>
        <path d="M46 88.5 50 81.5 54 88.5Z" fill="#ffffff2e"/>
        <rect x="0" y="0" width="100" height="100" fill="url(#${id}g)"/>`,
      backArt:id=>`<defs><radialGradient id="${id}d"><stop offset=".2" stop-color="#2a2d36"/><stop offset=".23" stop-color="#c9d2dc"/><stop offset=".5" stop-color="#8c96a8"/><stop offset=".62" stop-color="#d9e1ea"/><stop offset=".8" stop-color="#7d889c"/><stop offset=".97" stop-color="#c3ccd8"/><stop offset="1" stop-color="#5b6372"/></radialGradient>
        <linearGradient id="${id}s" x1="0" y1="0" x2="1" y2="1"><stop offset=".25" stop-color="#fff" stop-opacity="0"/><stop offset=".45" stop-color="#f3d9ff" stop-opacity=".35"/><stop offset=".55" stop-color="#bdf7ff" stop-opacity=".3"/><stop offset=".75" stop-color="#fff" stop-opacity="0"/></linearGradient></defs>
        <circle cx="50" cy="49" r="33.5" fill="#0006" stroke="#ffffff22" stroke-width=".8"/>
        <circle cx="50" cy="49" r="31" fill="url(#${id}d)"/>
        <circle cx="50" cy="49" r="31" fill="url(#${id}s)"/>
        <circle cx="50" cy="49" r="7.5" fill="#1d1f26" stroke="#ffffff30" stroke-width=".6"/>
        <circle cx="50" cy="49" r="3" fill="#0b0c0f"/>
        <rect x="20" y="86" width="60" height="7" rx="1.5" fill="#0000004d" stroke="#ffffff14" stroke-width=".5"/>`}
  };
  const dimensions={switch:[21,31,3],switch2:[21,31,3],nds:[33,35,3.8],'3ds':[35,35,3.8],gb:[57,65,7.8],gbc:[57,65.5,9],gba:[60,35,8],nes:[120,134,17],snes:[135.85,87.7,19.7],n64:[116,76.6,18.5],genesis:[109,70,17],a2600:[82,98,20],psp:[65,64,4.2]};
  for(const [id,mm] of Object.entries(dimensions)){
    const p=profiles[id];p.mm=mm;p.h=p.w*mm[1]/mm[0];p.depth=mm[2];
  }
  Object.assign(profiles.gb,{label:[12,29,76,57],brandY:18,details:'M4 38V78 M96 38V78'});
  Object.assign(profiles.gbc,{label:[12,30,76,56],brand:'Nintendo GAME BOY',brandY:19,details:'M5 38V78 M95 38V78'});
  Object.assign(profiles.gba,{label:[14,30,72,63],brandY:20,details:'M8 26H92 M11 32V77 M89 32V77'});
  Object.assign(profiles.n64,{w:.78,label:[26.5,9,47,81.5],details:'M18.5 9V98 M81.5 9V98 M0 69L5 71.5V100 M100 69L95 71.5V100'});
  profiles.n64.h=profiles.n64.w*dimensions.n64[1]/dimensions.n64[0];
  Object.assign(profiles.genesis,{outline:'8,0 92,0 97,4 100,12 100,67 97,77 94,80 94,98 92,100 8,100 6,98 6,80 3,77 0,67 0,12 3,4',label:[16,4,68,84],details:'M9 8V72 M12 6V73 M88 6V73 M91 8V72 M16 92H84'});
  Object.assign(profiles.a2600,{label:[8,8,84,68],details:'M5 3H95 M5 80H95'});
  const screw=(x,y,r=1.8)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="#0008"/><circle cx="${x}" cy="${y}" r="${r*.69}" fill="#6b6c66" stroke="#ffffff36" stroke-width=".3"/><path d="M${x-r*.4} ${y}h${r*.8}" stroke="#171915" stroke-width=".5"/>`;
  const arrow=(x,y)=>`<path d="M${x-5} ${y}h10l-5 5Z" fill="#00000016" stroke="#ffffff30" stroke-width=".55"/>`;
  profiles.nes.art=()=>arrow(50,74);
  profiles.snes.art=()=>screw(8.7,92,1.75)+screw(91.3,92,1.75);
  profiles.gb.art=profiles.gbc.art=()=>arrow(50,91);
  const warning=(x,y,w,h)=>`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="1" fill="#33342f" stroke="#0004" stroke-width=".5"/><g fill="#a9a99b"><text x="50" y="${y+6}" text-anchor="middle" font-size="3.4" font-family="Arial">CAUTION</text>${Array.from({length:5},(_,i)=>`<rect x="${x+4}" y="${y+10+i*3.2}" width="${w-8-(i%2)*5}" height=".65"/>`).join('')}</g>`;
  profiles.nes.backArt=()=>warning(40,12,46,32)+screw(8,8)+screw(92,8)+screw(50,73)+`<path d="M16 1V99 M37 1V99" fill="none" stroke="#0004" stroke-width=".6"/>`;
  profiles.snes.backArt=()=>warning(27,19,46,34)+'<path d="M17 4V98 M83 4V98 M4 63H96 M4 78H96" stroke="#0003" stroke-width=".6" fill="none"/>';
  profiles.n64.backArt=()=>warning(25,20,50,42)+screw(12,78)+screw(88,78);
  for(const id of ['gb','gbc','gba'])profiles[id].backArt=()=>`<rect x="12" y="18" width="76" height="54" rx="3" fill="#00000008" stroke="#0003" stroke-width=".5"/><text x="50" y="35" text-anchor="middle" font-family="Arial" font-size="5" fill="#0005">Nintendo</text><text x="50" y="44" text-anchor="middle" font-family="Arial" font-size="3" fill="#0004">MADE IN JAPAN</text>${screw(50,id==='gba'?67:77,2.1)}<path d="M8 88H92 M8 92H92" stroke="#0004" stroke-width=".6"/>`;
  profiles.genesis.backArt=()=>`<text x="50" y="31" text-anchor="middle" font-family="Arial" font-size="10" font-weight="bold" fill="#ffffff20">SEGA</text>${screw(22,55)}${screw(78,55)}<path d="M12 8V78 M88 8V78 M12 83H88" stroke="#ffffff16" fill="none"/>`;
  profiles.a2600.backArt=()=>`<rect x="8" y="8" width="84" height="67" rx="1" fill="#0002" stroke="#ffffff12" stroke-width=".7"/>${screw(50,48,2.1)}`;
  for(const id of ['switch','switch2','nds','3ds'])profiles[id].backArt=()=>`<rect x="12" y="10" width="73" height="44" rx="2" fill="#00000010" stroke="#0004" stroke-width=".7"/><text x="49" y="27" text-anchor="middle" font-family="Arial" font-size="5.5" fill="#ffffff30">Nintendo</text><path d="M18 35H78 M18 40H63" stroke="#ffffff20" stroke-width=".8"/>`;
  // Cartridges that shipped in their own plastic colour. Used when there is no photo of the real cartridge
  // and no colour chosen by hand.
  const special=[
    ['n64',/ocarina of time|majora'?s mask/i,'#c9a227'],['n64',/donkey kong 64/i,'#f1c232'],['n64',/pok[eé]mon stadium/i,'#9aa0a6'],
    ['nes',/^(the )?legend of zelda|zelda ii|adventure of link/i,'#c9a227'],
    ['gbc',/pok[eé]mon.*gold/i,'#c9a227'],['gbc',/pok[eé]mon.*silver/i,'#b9bec7'],['gbc',/pok[eé]mon.*crystal/i,'#7cc6e3'],
    ['gba',/pok[eé]mon.*ruby/i,'#c62d3e'],['gba',/pok[eé]mon.*sapphire/i,'#2c5bc4'],['gba',/pok[eé]mon.*emerald/i,'#2e9e5c'],
    ['gba',/pok[eé]mon.*fire ?red/i,'#d9542e'],['gba',/pok[eé]mon.*leaf ?green/i,'#58b947'],
    ['gb',/pok[eé]mon.*(red|blue|yellow)/i,'#9a9c93'],
  ];
  // Colour order: chosen by hand, then read from a real cartridge photo, then the list above.
  function shellColor(game,system){
    if(game?.shellCustom)return game.shellCustom;
    if(game?.shell)return game.shell;
    const title=game?.title||'';
    return special.find(([s,re])=>s===system&&re.test(title))?.[2]||null;
  }
  const fallback={w:.65,h:.62,color:'#5c6170',depth:7,outline:rect,label:[12,13,76,69],details:'M10 89H90'};
  let shellIds=0;
  function shell(p,back=false){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.classList.add('cartridge-molding');
    // All markup here is static model data, never game metadata.
    svg.innerHTML='';
    const relief=document.createElementNS(ns,'g');
    relief.innerHTML=back?'':`<path d="${p.details||''}" fill="none" stroke="#0003" stroke-width=".55"/><path d="${p.details||''}" transform="translate(0 .45)" fill="none" stroke="#ffffff30" stroke-width=".35"/>`;
    const uid='m'+(++shellIds);
    if(p.art&&!back)relief.innerHTML+=p.art(uid);
    if(p.backArt&&back)relief.innerHTML+=p.backArt(uid);
    else if(back)relief.innerHTML+='<rect x="22" y="22" width="56" height="44" rx="3" fill="#0001" stroke="#0003" stroke-width=".7"/><circle cx="50" cy="83" r="2.4" fill="#0005"/><path d="M48.5 83H51.5" stroke="#ffffff40" stroke-width=".7"/>';
    if(p.brand&&!back){const text=document.createElementNS(ns,'text');text.setAttribute('x','50');text.setAttribute('y',p.brandY);text.setAttribute('text-anchor','middle');text.setAttribute('font-size',p.brand==='Nintendo'?'7':'5.4');text.setAttribute('font-family','Arial,sans-serif');text.setAttribute('font-weight','bold');text.setAttribute('fill','#0005');text.setAttribute('stroke','#ffffff18');text.setAttribute('stroke-width','.25');text.textContent=p.brand;relief.append(text)}
    svg.append(relief);return svg;
  }
  function build(media,system,W){
    const p=profiles[system]||fallback;
    const width=W*p.w,height=W*p.h,depth=p.mm?width*p.mm[2]/p.mm[0]:p.depth;
    media.style.cssText=`--mw:${width}px;--mh:${height}px;--shell-color:${p.color};--cd:${depth}px`;
    const bevel=Math.min(1.2,width*.008);
    const solid=PhysicalGeometry.prism({width,height,depth,outline:p.outline,bevel,className:'cartridge-body'});
    const {root:body,front,back}=solid;
    front.classList.add('cartridge-front');back.classList.add('cartridge-back');front.append(shell(p));back.append(shell(p,true));
    // Raised molding belongs to the 3D body, never inside a clipped cap. It is also kept inside the
    // bevelled face: a panel or rib written flush with the outline (0% or 100%) would otherwise hang
    // over the shell's rounded edge and show up as a second, ragged silhouette.
    const relief=(x,y,w,h,d=1,outline)=>{
      const left=Math.max(width*x/100,bevel),top=Math.max(height*y/100,bevel);
      const pw=Math.max(.5,Math.min(width*(x+w)/100,width-bevel)-left),ph=Math.max(.5,Math.min(height*(y+h)/100,height-bevel)-top);
      const part=PhysicalGeometry.prism({width:pw,height:ph,depth:d,outline,bevel:d>2?.5:0,className:'cartridge-relief'});
      part.root.style.transform=`translate3d(${left}px,${top}px,${depth/2+d/2-.1}px)`;body.append(part.root);return part;
    };
    const rib=(...args)=>{const part=relief(...args);part.root.classList.add('cartridge-rib');return part};
    // The label and its well stand a little clear of the face (.6px and .3px). At a tenth of a
    // pixel the browser could not tell them from the face at an angle and drew the plain face over
    // them, so labels went blank as cartridges turned (most visibly in the media carousel).
    let labelZ=depth/2+.6;
    if(system==='nes'){
      relief(16,1,20,98,.6);
      for(let i=0;i<37;i++)rib(16.5,2+i*2.57,19,1.55,.95);
    }else if(system==='snes'){
      const d=depth*.16;
      relief(16,0,68,100,d,'2,0 98,0 100,2 100,99 97,100 96,98 96,64 94,62 6,62 4,64 4,98 3,100 0,99 0,2');
      labelZ+=d;
      // Set in from the edge: a rib that reaches it hides the side wall in slivers, which reads as a
      // second, broken outline rather than as moulding on the face.
      for(const x of [2.5,84])for(let i=0;i<5;i++)rib(x,5+i*16,13.5,14.9,.8);
    }else if(['gb','gbc'].includes(system)){
      for(const x of [2.5,83.5])for(let i=0;i<5;i++)rib(x,8+i*3.4,14,2.1,1.1);
      // The capsule header has its own embossed wordmark above the raised face.
      const part=relief(12,7,76,18,1.2,PhysicalGeometry.rounded(45,6));
      const svg=shell({...p,details:'',art:null,brandY:63});svg.querySelector('text')?.setAttribute('font-size','8');part.front.append(svg);
      front.querySelector('text')?.remove();
    }else if(system==='gba'){
      relief(2,1,96,5,1.2);relief(2,22,96,4,.9);
    }else if(system==='n64'){
      // Nothing raised on the face. A real cartridge is smooth either side of the label; the two
      // panels that used to sit there read as rectangles stuck on the front. The moulding seams in
      // p.details still draw the lines that are actually there.
    }else if(system==='genesis'){
      for(const x of [3,93])for(let i=0;i<9;i++)rib(x,15+i*5,4,2,.75);
    }else if(system==='a2600'){
      for(let i=0;i<6;i++)rib(5,83+i*2.6,90,1.5,.65);
    }
    const label=document.createElement('div');label.className='cartridge-label';const [x,y,w,h]=p.label;
    label.style.cssText=`left:${x}%;top:${y}%;width:${w}%;height:${h}%`+(p.labelClip?`;clip-path:polygon(${p.labelClip});border-radius:0`:'');
    const well=document.createElement('div');well.className='cartridge-label-well';well.style.cssText=`left:${x-.8}%;top:${y-.7}%;width:${w+1.6}%;height:${h+1.4}%;transform:translateZ(${labelZ-.3}px)`;
    if(p.labelClip)well.style.clipPath=`polygon(${p.labelClip})`;
    label.style.transform=`translateZ(${labelZ}px)`;label.style.backfaceVisibility='hidden';well.style.backfaceVisibility='hidden';
    body.append(well,label);
    if(['switch','switch2','nds','3ds'].includes(system)){
      const contacts=document.createElement('div');contacts.className='cartridge-contacts';
      const pins=system.startsWith('switch')?16:17;
      contacts.style.cssText=`left:10%;top:64%;width:80%;height:33%;--pin-pitch:${width*.8/pins}px`;back.append(contacts);
    }else if(system!=='psp'){
      // Recessed connector mouth on the bottom edge; pins remain inside the shell.
      const sw=width*(system==='nes'?.74:.72),sh=depth*.48;
      const socket=PhysicalGeometry.prism({width:sw,height:sh,depth:.6,bevel:0,className:'cartridge-socket'});
      socket.root.style.transformOrigin='0 0';
      socket.root.style.transform=`translate3d(${(width-sw)/2}px,${height+.1}px,${sh/2}px) rotateX(-90deg)`;
      const pcb=document.createElement('div');pcb.className='cartridge-pcb';pcb.style.cssText=`left:5%;top:42%;width:90%;height:26%;--pin-pitch:${sw*.9/(system==='gb'||system==='gbc'||system==='gba'?32:36)}px`;
      socket.front.append(pcb);body.append(socket.root);
    }
    media.append(body);return label;
  }
  return {build,shellColor,profiles};
})();
