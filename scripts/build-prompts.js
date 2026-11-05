// Original PyroCade prompt artwork. Rebuild with: npm run prompts:build
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../renderer/assets/prompts');
const xml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const ink = '#f2f3f7', accent = '#ffb347';
const text = (s, size = 24, color = ink, y = 34) => `<text x="32" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI,Arial,sans-serif" font-size="${size}" font-weight="700" fill="${color}">${xml(s)}</text>`;
const line = (d, color = ink, width = 3) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle = (cx, cy, r, fill, stroke = 'none', sw = 2) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
function cap(shape = 'round') {
  const rect = shape === 'round' ? 'x="8" y="6" width="48" height="48" rx="24"' : shape === 'trigger' ? 'x="6" y="6" width="52" height="48" rx="13"' : 'x="4" y="10" width="56" height="40" rx="11"';
  return `<rect ${rect} fill="#090b11" transform="translate(0 4)"/><rect ${rect} fill="url(#shell)" stroke="#687184" stroke-width="1.5"/><path d="M19 13 Q32 7 45 13" stroke="#ffffff" stroke-opacity=".17" fill="none" stroke-width="2" stroke-linecap="round"/>`;
}
const defs = '<defs><linearGradient id="shell" x2=".25" y2="1"><stop stop-color="#343b4c"/><stop offset="1" stop-color="#181d29"/></linearGradient></defs>';
const directionAngles = {up:0, 'up-right':45, right:90, 'down-right':135, down:180, 'down-left':225, left:270, 'up-left':315};
const arrow = (direction, color = accent, small = false) => `<g transform="rotate(${directionAngles[direction]} 32 32)">${line(small ? 'M27 18 L32 13 L37 18 M32 14 V23' : 'M23 27 L32 18 L41 27 M32 19 V43',color,3)}</g>`;
const cross = (color = '#212735') => `<path d="M24 9 H40 V24 H55 V40 H40 V55 H24 V40 H9 V24 H24 Z" fill="${color}" stroke="#687184" stroke-width="1.5" stroke-linejoin="round"/>`;
function dpad(dir) {
  const base = cross();
  if (directionAngles[dir] !== undefined) return base + arrow(dir);
  if (dir === 'horizontal') return base + arrow('left', accent, true) + arrow('right', accent, true);
  if (dir === 'vertical') return base + arrow('up', accent, true) + arrow('down', accent, true);
  return base + ['up','right','down','left'].map(d => arrow(d, ink, true)).join('');
}
function stick(side, dir) {
  const base = circle(32,32,24,'#10141e','#687184') + circle(32,32,17,'url(#shell)','#8892a5',1.5);
  if (dir === 'press') return base + text(side === 'left' ? 'L3' : 'R3',19) + line('M27 5 L32 10 L37 5',accent);
  if (dir === 'rotate') return base + text(side === 'left' ? 'L' : 'R',18) + line('M13 15 A25 25 0 1 1 8 40 M8 40 L6 29 M8 40 L18 37',accent,2.5);
  if (dir === 'horizontal') return base + arrow('left',accent,true) + arrow('right',accent,true) + text(side === 'left' ? 'L' : 'R',16);
  if (dir === 'vertical') return base + arrow('up',accent,true) + arrow('down',accent,true) + text(side === 'left' ? 'L' : 'R',16);
  return base + (dir ? arrow(dir) : text(side === 'left' ? 'L' : 'R',22));
}
function symbol(name, color) {
  if (name === 'cross') return line('M23 23 L41 41 M41 23 L23 41',color,3.5);
  if (name === 'circle') return circle(32,32,12,'none',color,3);
  if (name === 'square') return `<rect x="21" y="21" width="22" height="22" rx="1" fill="none" stroke="${color}" stroke-width="3"/>`;
  return line('M32 18 L47 43 H17 Z',color,3);
}
const families = {
  xbox: {name:'Xbox', face:['A','B','X','Y'], colors:['#8fe09a','#ff8d93','#80bcff','#ffe082'], shoulders:['LB','RB','LT','RT'], menus:['View','Menu','Guide','Share']},
  playstation: {name:'PlayStation', face:['cross','circle','square','triangle'], colors:['#91bfff','#ff929b','#f0a5de','#8fe0cc'], shoulders:['L1','R1','L2','R2'], menus:['Share','Options','PS','Touch']},
  nintendo: {name:'Nintendo', face:['B','A','Y','X'], colors:[ink,ink,ink,ink], shoulders:['L','R','ZL','ZR'], menus:['−','+','Home','Capture']},
  generic: {name:'Generic gamepad', face:['1','2','3','4'], colors:[ink,ink,ink,ink], shoulders:['L1','R1','L2','R2'], menus:['Select','Start','Home','Share']},
};
const manifest = {version:1, canvas:64, style:'PyroCade graphite / amber', families:{}, assets:[]};
function add(family, id, label, body) {
  const file = `${family}/${id}.svg`;
  fs.mkdirSync(path.join(root,family),{recursive:true});
  fs.writeFileSync(path.join(root,file), `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${xml(label)}"><title>${xml(label)}</title>${defs}${body}</svg>\n`);
  manifest.assets.push({family,id,label,file});
}
for (const [family, spec] of Object.entries(families)) {
  manifest.families[family] = spec.name;
  spec.face.forEach((label,i) => add(family,['south','east','west','north'][i],label,cap() + (family === 'playstation' ? symbol(label,spec.colors[i]) : text(label,27,spec.colors[i]))));
  spec.shoulders.forEach((label,i) => add(family,['lb','rb','lt','rt'][i],label,cap(i < 2 ? 'wide':'trigger')+text(label,23)));
  spec.menus.forEach((label,i) => {
    const id = ['select','start','home','share'][i];
    const drawing = label === 'Menu' ? line('M22 24 H42 M22 32 H42 M22 40 H42')
      : label === 'View' ? line('M20 22 H36 V36 H20 Z M28 28 H44 V42 H28')
      : label === 'Home' ? line('M19 30 L32 19 L45 30 M23 28 V44 H41 V28 M29 44 V34 H35 V44')
      : label === 'Capture' ? circle(32,32,10,'none',ink,3)
      : text(label,label.length > 5 ? 11 : label.length > 3 ? 13 : 22);
    add(family,id,label,cap()+drawing);
  });
  for (const dir of ['all','horizontal','vertical',...Object.keys(directionAngles)]) add(family,`dpad-${dir}`,`D-pad ${dir}`,dpad(dir));
  for (const side of ['left','right']) for (const dir of ['', 'press','rotate','horizontal','vertical',...Object.keys(directionAngles)]) add(family,`${side}-stick${dir ? '-'+dir:''}`,`${side} stick ${dir || 'move'}`,stick(side,dir));
  add(family,'disconnected','Controller disconnected',line('M15 22 H49 L56 45 Q54 52 48 47 L40 39 H24 L16 47 Q10 52 8 45 Z','#8892a5')+line('M18 17 L47 49','#ff8d93'));
}
manifest.families.keyboard = 'Keyboard';
const keys = Object.fromEntries('ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.split('').map(x=>[x.toLowerCase(),x]));
Object.assign(keys,{enter:'Enter',space:'Space',escape:'Esc',tab:'Tab',backspace:'Bksp',shift:'Shift',ctrl:'Ctrl',alt:'Alt',delete:'Del',insert:'Ins',home:'Home',end:'End',pageup:'PgUp',pagedown:'PgDn',plus:'+',minus:'−',comma:',',period:'.',slash:'/',bracketleft:'[',bracketright:']'});
for(let i=1;i<=12;i++) keys['f'+i] = 'F'+i;
for(const [id,label] of Object.entries(keys)) add('keyboard',id,label,cap('wide')+text(label,label.length>3?14:label.length>1?19:25));
for(const dir of ['up','right','down','left']) add('keyboard',dir,`Arrow ${dir}`,cap('wide')+arrow(dir,ink));
add('keyboard','arrows','Arrow keys',cap('wide')+['up','right','down','left'].map(d=>arrow(d,ink,true)).join(''));
manifest.families.mouse = 'Mouse';
for (const id of ['mouse','left','right','middle','scroll','scroll-up','scroll-down','move','drag-left']) {
  let body = '<rect x="15" y="7" width="34" height="49" rx="17" fill="url(#shell)" stroke="#687184" stroke-width="1.5"/>';
  if (id === 'left' || id === 'drag-left') body += '<path d="M17 30 V24 Q17 9 30 9 V30 Z" fill="#ffb347"/>';
  if (id === 'right') body += '<path d="M34 9 Q47 9 47 24 V30 H34 Z" fill="#ffb347"/>';
  body += line('M16 31 H48 M32 8 V21','#687184',1.5) + '<rect x="29" y="20" width="6" height="13" rx="3" fill="'+ (id === 'middle' || id.startsWith('scroll') ? accent : '#f2f3f7') +'"/>';
  if (id === 'scroll-up') body += arrow('up',accent,true);
  if (id === 'scroll-down') body += arrow('down',accent,true);
  if (id === 'scroll') body += line('M7 23 V42 M3 27 L7 23 L11 27 M3 38 L7 42 L11 38',accent,2);
  if (id === 'move' || id === 'drag-left') body += line('M4 37 V25 M1 29 L4 25 L7 29 M1 33 L4 37 L7 33 M53 38 H63 M56 35 L53 38 L56 41 M60 35 L63 38 L60 41',accent,2);
  add('mouse',id,`Mouse ${id === 'mouse' ? '' : id.replaceAll('-',' ')}`.trim(),body);
}
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(root,'manifest.js'),'// Generated by scripts/build-prompts.js\nwindow.PromptManifest = '+JSON.stringify(manifest)+';\n');
const cards = manifest.assets.map(a=>`<figure data-family="${a.family}"><img src="${a.file}" alt="${xml(a.label)}" loading="lazy"/><figcaption>${xml(a.id)}</figcaption></figure>`);
const groups = Object.entries(manifest.families).map(([id,name])=>`<section id="${id}"><h2>${name}<span>${manifest.assets.filter(a=>a.family===id).length} prompts</span></h2><div class="grid">${cards.filter((_,i)=>manifest.assets[i].family===id).join('')}</div></section>`).join('');
fs.writeFileSync(path.join(root,'preview.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PyroCade · Button prompts</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
*{box-sizing:border-box}body{margin:0;background:#0b0e15;color:#f2f3f7;font:14px 'Segoe UI',sans-serif}header,main{max-width:1280px;margin:auto;padding:40px}header{border-bottom:1px solid #303747}small{color:#ffb347;letter-spacing:.2em}h1{font-size:42px;margin:10px 0}p{color:#abb4c8;line-height:1.6}nav{display:flex;gap:10px;flex-wrap:wrap;margin-top:24px}a{color:#f2f3f7;text-decoration:none;padding:8px 15px;border:1px solid #454f63;border-radius:20px}a:hover{border-color:#ffb347}section{margin:0 0 50px;scroll-margin-top:24px}h2{font-size:23px}h2 span{margin-left:15px;font-size:13px;color:#9aa0b4;font-weight:400}.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:10px}figure{margin:0;padding:15px 4px 10px;background:#151a25;border:1px solid #293143;border-radius:12px;text-align:center}img{width:64px;height:64px}figcaption{font:11px Consolas,monospace;color:#b8c1d3;margin-top:6px;overflow-wrap:anywhere}@media(max-width:600px){header,main{padding:22px}h1{font-size:32px}}@media(prefers-reduced-motion:no-preference){html{scroll-behavior:smooth}}
</style></head><body><header><small>PYROCADE / INPUT ASSETS</small><h1>Every button. One language.</h1><p>${manifest.assets.length} original prompts · Transparent SVG · Graphite keycaps, amber directions · PNG exports at 64 and 128 px<br>Face buttons follow physical positions. Nintendo: B south, A east, Y west, X north.</p><nav>${Object.entries(manifest.families).map(([id,name])=>`<a href="#${id}">${name}</a>`).join('')}</nav></header><main>${groups}</main></body></html>`);
console.log(`Built ${manifest.assets.length} SVG prompts and preview in ${root}`);
