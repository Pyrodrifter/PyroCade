// Original PyroCade prompt artwork. Rebuild with: npm run prompts:build
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '../renderer/assets/prompts');
const xml = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
const ink = '#f4f0eb', accent = '#b9d3f0', shell = '#2e2b29', edge = '#817a73';
function text(label, size = 24, color = ink) {
  // SVG middle aligns to the lowercase x-height. Raise the baseline for descenders
  // and lower it for cap-height labels to centre the visible glyphs.
  const offset = /[gjpqy]/.test(label) ? 0 : label === "Q" ? .06 : .095;
  const y = 32 + size * offset;
  return `<text x="32" y="${y}" text-anchor="middle" dominant-baseline="middle" font-family="Segoe UI,Arial,sans-serif" font-size="${size}" font-weight="650" fill="${color}">${xml(label)}</text>`;
}
const line = (d, color = ink, width = 3) => `<path d="${d}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle = (cx, cy, r, fill, stroke = 'none', sw = 2) => `<circle cx="${cx}" cy="${cy}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>`;
function cap(shape = 'round') {
  if (shape === 'round') return circle(32, 32, 23, shell, edge);
  const rect = shape === 'trigger' ? 'x="6" y="9" width="52" height="46" rx="10"' : 'x="3" y="11" width="58" height="42" rx="8"';
  return `<rect ${rect} fill="${shell}" stroke="${edge}" stroke-width="2"/>`;
}
const directionAngles = {up:0, 'up-right':45, right:90, 'down-right':135, down:180, 'down-left':225, left:270, 'up-left':315};
const arrow = (direction, color = accent, small = false) => `<g transform="rotate(${directionAngles[direction]} 32 32)">${line(small ? 'M27 18 L32 13 L37 18 M32 14 V23' : 'M23 28 L32 19 L41 28 M32 19 V45',color,3)}</g>`;
const cross = () => `<path d="M24 9 H40 V24 H55 V40 H40 V55 H24 V40 H9 V24 H24 Z" fill="${shell}" stroke="${edge}" stroke-width="2" stroke-linejoin="round"/>`;
function dpad(dir) {
  const base = cross();
  if (directionAngles[dir] !== undefined) return base + arrow(dir);
  if (dir === 'horizontal') return base + arrow('left', accent, true) + arrow('right', accent, true);
  if (dir === 'vertical') return base + arrow('up', accent, true) + arrow('down', accent, true);
  return base + ['up','right','down','left'].map(d => arrow(d, ink, true)).join('');
}
function stick(side, dir) {
  const base = circle(32, 32, 23, shell, edge);
  if (dir === 'press') return base + text(side === 'left' ? 'L3' : 'R3',20);
  if (dir === 'rotate') return base + text(side === 'left' ? 'L' : 'R',18) + line('M13 15 A25 25 0 1 1 8 40 M8 40 L6 29 M8 40 L18 37',accent,2.5);
  if (dir === 'horizontal') return base + arrow('left',accent,true) + arrow('right',accent,true) + text(side === 'left' ? 'L' : 'R',16);
  if (dir === 'vertical') return base + arrow('up',accent,true) + arrow('down',accent,true) + text(side === 'left' ? 'L' : 'R',16);
  return base + (dir ? arrow(dir) : text(side === 'left' ? 'L' : 'R',22));
}
const keyMarks = {
  '+': 'M23 32 H41 M32 23 V41',
  '−': 'M23 32 H41',
  ',': 'M34 28 Q34 34 30 36',
  '/': 'M26 44 L38 20',
  '[': 'M36 20 H28 V44 H36',
  ']': 'M28 20 H36 V44 H28',
};
function keyMark(label, size) {
  if (label === '.') return circle(32, 32, 2.5, ink);
  return keyMarks[label] ? line(keyMarks[label], ink) : text(label, size);
}
function symbol(name, color) {
  if (name === 'cross') return line('M23 23 L41 41 M41 23 L23 41',color,3.5);
  if (name === 'circle') return circle(32,32,12,'none',color,3);
  if (name === 'square') return `<rect x="21" y="21" width="22" height="22" rx="1" fill="none" stroke="${color}" stroke-width="3"/>`;
  return line('M32 19 L47 45 H17 Z',color,3);
}
const families = {
  xbox: {name:'Xbox', face:['A','B','X','Y'], colors:['#8fe09a','#ff8d93','#80bcff','#ffe082'], shoulders:['LB','RB','LT','RT'], menus:['View','Menu','Guide','Share']},
  playstation: {name:'PlayStation', face:['cross','circle','square','triangle'], colors:['#91bfff','#ff929b','#f0a5de','#8fe0cc'], shoulders:['L1','R1','L2','R2'], menus:['Share','Options','PS','Touch']},
  nintendo: {name:'Nintendo', face:['B','A','Y','X'], colors:[ink,ink,ink,ink], shoulders:['L','R','ZL','ZR'], menus:['−','+','Home','Capture']},
  generic: {name:'Generic gamepad', face:['1','2','3','4'], colors:[ink,ink,ink,ink], shoulders:['L1','R1','L2','R2'], menus:['Select','Start','Home','Share']},
};
const manifest = {version:1, canvas:64, style:'PyroCade flat graphite', families:{}, assets:[]};
function add(family, id, label, body) {
  const file = `${family}/${id}.svg`;
  fs.mkdirSync(path.join(root,family),{recursive:true});
  fs.writeFileSync(path.join(root,file), `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64" role="img" aria-label="${xml(label)}"><title>${xml(label)}</title>${body}</svg>\n`);
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
      : keyMark(label, label.length > 5 ? 12 : label.length > 3 ? 15 : 22);
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
for(const [id,label] of Object.entries(keys)) add('keyboard',id,label,cap('wide')+keyMark(label,label.length>3?18:label.length>1?20:26));
for(const dir of ['up','right','down','left']) add('keyboard',dir,`Arrow ${dir}`,cap('wide')+arrow(dir,ink));
add('keyboard','arrows','Arrow keys',cap('wide')+['up','right','down','left'].map(d=>arrow(d,ink,true)).join(''));
manifest.families.mouse = 'Mouse';
const mouseGestures = {
  scroll: 'M32 36 V50 M28 40 L32 36 L36 40 M28 46 L32 50 L36 46',
  'scroll-up': 'M28 40 L32 36 L36 40 M32 36 V50',
  'scroll-down': 'M28 46 L32 50 L36 46 M32 36 V50',
  move: 'M23 43 H41 M32 36 V50 M26 40 L23 43 L26 46 M38 40 L41 43 L38 46 M29 39 L32 36 L35 39 M29 47 L32 50 L35 47',
  'drag-left': 'M23 43 H41 M27 39 L23 43 L27 47 M37 39 L41 43 L37 47',
};
for (const id of ['mouse','left','right','middle','scroll','scroll-up','scroll-down','move','drag-left']) {
  let body = `<rect x="15" y="7" width="34" height="50" rx="17" fill="${shell}" stroke="${edge}" stroke-width="2"/>`;
  if (id === 'left' || id === 'drag-left') body += '<path d="M17 30 V24 Q17 9 30 9 V30 Z" fill="' + accent + '"/>';
  if (id === 'right') body += '<path d="M34 9 Q47 9 47 24 V30 H34 Z" fill="' + accent + '"/>';
  body += line('M16 31 H48 M32 8 V21',edge,2) + '<rect x="29" y="20" width="6" height="13" rx="3" fill="'+ (id === 'middle' || id.startsWith('scroll') ? accent : ink) +'"/>';
  if (mouseGestures[id]) body += line(mouseGestures[id], accent, 2);
  add('mouse',id,`Mouse ${id === 'mouse' ? '' : id.replaceAll('-',' ')}`.trim(),body);
}
fs.writeFileSync(path.join(root,'manifest.json'),JSON.stringify(manifest,null,2)+'\n');
fs.writeFileSync(path.join(root,'manifest.js'),'// Generated by scripts/build-prompts.js\nwindow.PromptManifest = '+JSON.stringify(manifest)+';\n');
const cards = manifest.assets.map(a=>`<figure data-family="${a.family}"><img src="${a.file}" alt="${xml(a.label)}" loading="lazy"/><figcaption>${xml(a.id)}</figcaption></figure>`);
const groups = Object.entries(manifest.families).map(([id,name])=>`<section id="${id}"><h2>${name}<span>${manifest.assets.filter(a=>a.family===id).length} prompts</span></h2><div class="grid">${cards.filter((_,i)=>manifest.assets[i].family===id).join('')}</div></section>`).join('');
fs.writeFileSync(path.join(root,'preview.html'),`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>PyroCade · Button prompts</title><meta name="viewport" content="width=device-width,initial-scale=1"><style>
* { box-sizing: border-box; }
body { margin: 0; background: #1d1c1b; color: #f2eee8; font: 14px "Segoe UI", system-ui, sans-serif; }
header, main { max-width: 1280px; margin: auto; padding: 36px; }
header { border-bottom: 1px solid #45423f; }
h1 { margin: 0 0 10px; font-size: 36px; font-weight: 650; letter-spacing: -.03em; }
p { color: #bbb7b1; line-height: 1.55; }
nav { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 18px; }
a { color: inherit; text-decoration: none; padding: 7px 12px; border: 1px solid #5c5853; border-radius: 7px; }
a:hover, a:focus-visible { border-color: #afd6ff; }
section { margin-bottom: 32px; scroll-margin-top: 24px; }
h2 { font-size: 21px; font-weight: 650; }
h2 span { margin-left: 12px; font-size: 12px; color: #bbb7b1; font-weight: 400; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 8px; }
figure { margin: 0; padding: 12px 5px 9px; background: #272523; border: 1px solid #45423f; border-radius: 7px; text-align: center; }
img { width: 64px; height: 64px; }
figcaption { font: 11px Consolas, monospace; color: #bbb7b1; margin-top: 4px; overflow-wrap: anywhere; }
@media (max-width: 600px) { header, main { padding: 22px; } }
</style></head><body><header><h1>Button prompts</h1><p>${manifest.assets.length} icons · SVG and transparent 64 px and 128 px PNGs</p><nav>${Object.entries(manifest.families).map(([id,name])=>`<a href="#${id}">${name}</a>`).join('')}</nav></header><main>${groups}</main></body></html>`);
console.log(`Built ${manifest.assets.length} SVG prompts and preview in ${root}`);
