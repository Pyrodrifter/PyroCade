// Molded front shells, in normalized coordinates. Labels remain separate artwork.
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
    nes:{w:.64,h:.72,color:'#9a9b97',depth:9,outline:'3,0 97,0 100,3 100,100 0,100 0,3',label:[40,1,46.5,67],details:'M24 1V71H96 M7 33H20 M7 39H20 M7 45H20 M7 51H20 M7 57H20 M7 63H20 M5 76H95 M8 81H92 M8 86H92 M43 94L50 98L57 94'},
    snes:{w:.86,h:.55,color:'#acaab0',depth:10,outline:'4,0 96,0 100,7 100,88 95,88 95,100 5,100 5,88 0,88 0,7',label:[17,6,66,49],brand:'SUPER NINTENDO',brandY:70,details:'M4 20H12 M4 28H12 M4 36H12 M4 44H12 M88 20H96 M88 28H96 M88 36H96 M88 44H96 M12 60H88 M12 78H88 M6 89H94 M43 87L50 93L57 87'},
    // N64: wide body with a raised centre panel, recessed side wings with notched lower corners, near-square label.
    // N64, measured from a retail cartridge: one gently curved top, wings a little lower than the middle,
    // seams between wings and middle, a small notch at each bottom corner, a tall rounded label.
    n64:{w:.94,h:.65,color:'#8f9097',depth:10,outline:'0,19 0.3,16.5 1,14.8 2.2,13.4 4,12.4 6,11.8 10,9.8 15,7.5 20,5.5 25,3.8 30,2.4 35,1.4 40,0.6 45,0.2 50,0 55,0.2 60,0.6 65,1.4 70,2.4 75,3.8 80,5.5 85,7.5 90,9.8 94,11.8 96,12.4 97.8,13.4 99,14.8 99.7,16.5 100,19 100,99.4 99.4,100 0.6,100 0,99.4',label:[24,9,52,80],details:'M18.5 6V100 M81.5 6V100 M0 69L5 71.5V100 M100 69L95 71.5V100'},
    genesis:{w:.78,h:.56,color:'#252526',depth:9,outline:'0,15 9,7 27,1 73,1 91,7 100,15 100,95 95,100 5,100 0,95',label:[14.5,4,71,84],details:'M7 24V83 M11 19V83 M89 19V83 M93 24V83 M15 82H85 M44 88L50 94L56 88'},
    a2600:{w:.70,h:.80,color:'#302f2c',depth:10,outline:rect,label:[7,13,86,63],details:'M5 7H95 M4 82H96 M8 87H92 M8 92H92 M8 97H92'},
    // PSP UMD: a 6 cm disc in a glossy shell with one big curved top. The label follows that curve; the
    // back has the round window where the disc shows, as on the real thing.
    // Downloaded PSP "disc" pictures are photos of the whole UMD, so they are shown as they are (wholePhoto).
    psp:{shell:true,wholePhoto:true,w:.6,h:.62,color:'#16171b',depth:5,
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
    svg.innerHTML=`<polygon points="${p.outline}" fill="var(--shell-color)"/><polygon points="${p.outline}" fill="none" stroke="#ffffff26" stroke-width="1.8"/>`;
    const relief=document.createElementNS(ns,'g');
    relief.innerHTML=`<path d="${p.details}" fill="none" stroke="#0006" stroke-width="1.5"/><path d="${p.details}" transform="translate(0 .7)" fill="none" stroke="#ffffff24" stroke-width=".65"/>`;
    const uid='m'+(++shellIds);
    if(p.art&&!back)relief.innerHTML+=p.art(uid);
    if(p.backArt&&back)relief.innerHTML+=p.backArt(uid);
    else if(back)relief.innerHTML+='<rect x="22" y="22" width="56" height="44" rx="3" fill="#0001" stroke="#0003" stroke-width=".7"/><circle cx="50" cy="83" r="2.4" fill="#0005"/><path d="M48.5 83H51.5" stroke="#ffffff40" stroke-width=".7"/>';
    if(p.brand&&!back){const text=document.createElementNS(ns,'text');text.setAttribute('x','50');text.setAttribute('y',p.brandY);text.setAttribute('text-anchor','middle');text.setAttribute('font-size',p.brand==='Nintendo'?'7':'5.4');text.setAttribute('font-family','Arial,sans-serif');text.setAttribute('font-weight','bold');text.setAttribute('fill','#0005');text.setAttribute('stroke','#ffffff18');text.setAttribute('stroke-width','.25');text.textContent=p.brand;relief.append(text)}
    svg.append(relief);return svg;
  }
  function build(media,system,W){
    const p=profiles[system]||fallback;
    media.style.cssText=`--mw:${W*p.w}px;--mh:${W*p.h}px;--shell-color:${p.color};--cd:${p.depth}px;--cart-outline:polygon(${p.outline.split(' ').map(v=>v.split(',').map(n=>n+'%').join(' ')).join(',')})`;
    const body=document.createElement('div');body.className='cartridge-body';
    // Stacked silhouettes follow the cutouts around the shell's entire depth.
    for(let i=0;i<7;i++){const edge=document.createElement('div');edge.className='cartridge-shell-layer';edge.style.transform=`translateZ(${p.depth*(i/6-.5)}px)`;body.append(edge)}
    const front=document.createElement('div');front.className='cartridge-front';front.append(shell(p));
    const back=document.createElement('div');back.className='cartridge-back';back.append(shell(p,true));
    const label=document.createElement('div');label.className='cartridge-label';const [x,y,w,h]=p.label;
    label.style.cssText=`left:${x}%;top:${y}%;width:${w}%;height:${h}%`+(p.labelClip?`;clip-path:polygon(${p.labelClip});border-radius:0`:'');
    front.append(label);body.append(back,front);media.append(body);return label;
  }
  return {build,shellColor,profiles};
})();
