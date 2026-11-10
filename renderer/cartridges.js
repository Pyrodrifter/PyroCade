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
    nes:{w:.64,h:.72,color:'#9a9b97',depth:9,outline:'3,0 97,0 100,3 100,100 0,100 0,3',label:[29,4,61,62],details:'M24 1V71H96 M7 33H20 M7 39H20 M7 45H20 M7 51H20 M7 57H20 M7 63H20 M5 76H95 M8 81H92 M8 86H92 M43 94L50 98L57 94'},
    snes:{w:.86,h:.55,color:'#acaab0',depth:10,outline:'4,0 96,0 100,7 100,88 95,88 95,100 5,100 5,88 0,88 0,7',label:[17,6,66,49],brand:'SUPER NINTENDO',brandY:70,details:'M4 20H12 M4 28H12 M4 36H12 M4 44H12 M88 20H96 M88 28H96 M88 36H96 M88 44H96 M12 60H88 M12 78H88 M6 89H94 M43 87L50 93L57 87'},
    n64:{w:.86,h:.65,color:'#858681',depth:10,outline:'0,24 4,16 11,10 23,5 37,1 50,0 63,1 77,5 89,10 96,16 100,24 100,94 96,100 4,100 0,94',label:[20,19,60,48],brand:'Nintendo',brandY:81,details:'M8 30V86 M92 30V86 M14 72H86 M44 89L50 94L56 89'},
    genesis:{w:.78,h:.56,color:'#252526',depth:9,outline:'0,15 9,7 27,1 73,1 91,7 100,15 100,95 95,100 5,100 0,95',label:[17,14,66,60],details:'M7 24V83 M11 19V83 M89 19V83 M93 24V83 M15 82H85 M44 88L50 94L56 88'},
    a2600:{w:.70,h:.80,color:'#302f2c',depth:10,outline:rect,label:[7,13,86,63],details:'M5 7H95 M4 82H96 M8 87H92 M8 92H92 M8 97H92'},
    psp:{shell:true,wholePhoto:true,w:.6,h:.62,color:'#d6d8d3',depth:5,outline:'0,24 4,17 16,9 32,3 50,0 68,3 84,9 96,17 100,24 100,97 97,100 3,100 0,97',label:[8,12,84,59],details:'M3 30V90 M97 30V90'}
  };
  const fallback={w:.65,h:.62,color:'#5c6170',depth:7,outline:rect,label:[12,13,76,69],details:'M10 89H90'};
  // Cartridges that shipped in their own plastic colour. Used when there is no photo of the real
  // cartridge and no colour chosen by hand.
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
  function shell(p,back=false){
    const ns='http://www.w3.org/2000/svg',svg=document.createElementNS(ns,'svg');
    svg.setAttribute('viewBox','0 0 100 100');svg.setAttribute('preserveAspectRatio','none');svg.classList.add('cartridge-molding');
    // All markup here is static model data, never game metadata.
    svg.innerHTML=`<polygon points="${p.outline}" fill="var(--shell-color)"/><polygon points="${p.outline}" fill="none" stroke="#ffffff26" stroke-width="1.8"/>`;
    const relief=document.createElementNS(ns,'g');
    relief.innerHTML=`<path d="${p.details}" fill="none" stroke="#0006" stroke-width="1.5"/><path d="${p.details}" transform="translate(0 .7)" fill="none" stroke="#ffffff24" stroke-width=".65"/>`;
    if(back)relief.innerHTML+='<rect x="22" y="22" width="56" height="44" rx="3" fill="#0001" stroke="#0003" stroke-width=".7"/><circle cx="50" cy="83" r="2.4" fill="#0005"/><path d="M48.5 83H51.5" stroke="#ffffff40" stroke-width=".7"/>';
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
    // The label and its well stand a little clear of the face (.6px and .3px). At a tenth of a
    // pixel the browser could not tell them from the face at an angle and drew the plain face over
    // them, so labels went blank as cartridges turned (most visibly in the media carousel).
    // Branch adaptation: front sits at depth/2+.1, so the label's translateZ is absolute here
    // (siblings of front/back under the preserve-3d body), not relative to front.
    let labelZ=p.depth/2+.6;
    const label=document.createElement('div');label.className='cartridge-label';const [x,y,w,h]=p.label;
    label.style.cssText=`left:${x}%;top:${y}%;width:${w}%;height:${h}%;transform:translateZ(${labelZ}px)`;
    const well=document.createElement('div');well.className='cartridge-label-well';well.style.cssText=`left:${x-.8}%;top:${y-.7}%;width:${w+1.6}%;height:${h+1.4}%;transform:translateZ(${labelZ-.3}px)`;
    label.style.backfaceVisibility='hidden';well.style.backfaceVisibility='hidden';
    body.append(back,front,well,label);media.append(body);return label;
  }
  return {build,shellColor,profiles};
})();
