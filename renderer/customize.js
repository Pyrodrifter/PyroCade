// The "Customize" panel in Settings: your own accent colour and background image, background speed
// and brightness, the size, spacing and tilt of the shelf, which parts of the interface are shown,
// and which keys and controller buttons do what. Every change applies at once and saves itself.
const Customize=(()=>{
  const root=document.documentElement,$=s=>document.querySelector(s);
  const DEFAULTS={accent:'',bgSpeed:1,bgBrightness:1,bgImage:'',caseSize:1,spacing:1,tilt:1,reflections:true,spotlight:true,hide:[],clock:'auto',keys:{},pad:{}};
  const RANGES={bgSpeed:[.25,2],bgBrightness:[.4,1.4],caseSize:[.8,1.1],spacing:[.7,1.4],tilt:[0,1.4]};
  const PARTS={hints:'Controls bar at the bottom',clock:'Clock',arrows:'Shelf arrows',position:'Position counter',tools:'Sort, filter and random buttons'};
  const ACTIONS={left:'Previous game',right:'Next game',up:'Up · previous system',down:'Down · next system',play:'Play',case:'Open case',back:'Back',manual:'Manual',favorite:'Favourite',hide:'Hide game',pgup:'Jump back 10',pgdn:'Jump forward 10',random:'Random game',sysprev:'Previous system',sysnext:'Next system',systems:'System list'};
  const KEY_DEFAULTS={left:'ArrowLeft',right:'ArrowRight',up:'ArrowUp',down:'ArrowDown',play:'Enter',case:' ',back:'Escape',manual:'m',favorite:'f',hide:'Delete',pgup:'PageUp',pgdn:'PageDown',random:'',sysprev:'',sysnext:''};
  // Standard Gamepad button numbers. The d-pad and left stick always browse.
  const PAD_DEFAULTS={play:0,back:1,manual:2,case:3,sysprev:4,sysnext:5,pgup:6,pgdn:7,favorite:8,systems:9,random:10};
  const PAD_BUTTONS=[['south','A · Cross · bottom'],['east','B · Circle · right'],['west','X · Square · left'],['north','Y · Triangle · top'],['lb','LB · L1'],['rb','RB · R1'],['lt','LT · L2'],['rt','RT · R2'],['select','View · Share · −'],['start','Menu · Options · +'],['left-stick-press','Left stick press'],['right-stick-press','Right stick press']];
  // Keys that have a prompt icon can be assigned; the names are the icon ids.
  const KEY_IDS={ArrowLeft:'left',ArrowRight:'right',ArrowUp:'up',ArrowDown:'down',Enter:'enter',' ':'space',Escape:'escape',Backspace:'backspace',Delete:'delete',Insert:'insert',Home:'home',End:'end',PageUp:'pageup',PageDown:'pagedown','+':'plus','-':'minus',',':'comma','.':'period','[':'bracketleft',']':'bracketright'};
  // Already taken by search, the overlay, details, fullscreen and 3D, or needed to move focus.
  const RESERVED=['o','i','F9','F11'];
  const norm=key=>key.length===1?key.toLowerCase():key;
  const keyId=key=>!key?null:KEY_IDS[key]||(/^[a-z0-9]$/.test(key)?key:/^F([1-9]|1[0-2])$/.test(key)?key.toLowerCase():null);
  let c=structuredClone(DEFAULTS),context,saves=Promise.resolve(),saveTimer=0,capture=null,layer=null;

  function sanitize(saved){
    const next=structuredClone(DEFAULTS);if(!saved||typeof saved!=='object')return next;
    if(/^#[0-9a-f]{6}$/i.test(saved.accent||''))next.accent=saved.accent.toLowerCase();
    for(const [key,[lo,hi]] of Object.entries(RANGES)){const v=Number(saved[key]);if(Number.isFinite(v))next[key]=Math.max(lo,Math.min(hi,v))}
    if(typeof saved.bgImage==='string'&&/^file:/i.test(saved.bgImage))next.bgImage=saved.bgImage;
    next.reflections=saved.reflections!==false;next.spotlight=saved.spotlight!==false;
    if(Array.isArray(saved.hide))next.hide=saved.hide.filter(part=>Object.hasOwn(PARTS,part));
    if(['auto','12','24'].includes(saved.clock))next.clock=saved.clock;
    // A binding is kept only while it stays one key or button per action.
    const keys=saved.keys&&typeof saved.keys==='object'?saved.keys:{},usedKeys=new Set();
    for(const action of Object.keys(KEY_DEFAULTS)){
      const key=typeof keys[action]==='string'?keys[action]:null;
      if(key===''||(key&&keyId(key)&&!RESERVED.includes(key)))next.keys[action]=key;
    }
    for(const action of Object.keys(KEY_DEFAULTS)){const key=next.keys[action]??KEY_DEFAULTS[action];if(key&&usedKeys.has(key)){next.keys={};break}usedKeys.add(key)}
    const pad=saved.pad&&typeof saved.pad==='object'?saved.pad:{},usedButtons=new Set();
    for(const action of Object.keys(PAD_DEFAULTS))if(Number.isInteger(pad[action])&&pad[action]>=0&&pad[action]<PAD_BUTTONS.length)next.pad[action]=pad[action];
    for(const action of Object.keys(PAD_DEFAULTS)){const button=next.pad[action]??PAD_DEFAULTS[action];if(usedButtons.has(button)){next.pad={};break}usedButtons.add(button)}
    return next;
  }
  const keyFor=action=>c.keys[action]??KEY_DEFAULTS[action]??'';
  const buttonFor=action=>c.pad[action]??PAD_DEFAULTS[action];
  function keyAction(key){
    const wanted=norm(key);
    for(const action of Object.keys(KEY_DEFAULTS))if(keyFor(action)===wanted)return action;
    return null;
  }
  const padMap=()=>Object.fromEntries(Object.keys(PAD_DEFAULTS).map(action=>[action,buttonFor(action)]));
  const keyIcon=action=>keyId(keyFor(action));
  const padIcon=action=>PAD_BUTTONS[buttonFor(action)][0];
  const shelf=()=>({size:c.caseSize,spacing:c.spacing,tilt:c.tilt});
  function time(date=new Date()){
    return date.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit',...(c.clock==='auto'?{}:{hour12:c.clock==='12'})});
  }

  // Lighter partner colour for gradients and highlights, as the presets have.
  function lighten(hex){
    const n=parseInt(hex.slice(1),16),part=shift=>Math.round(((n>>shift)&255)+(255-((n>>shift)&255))*.45);
    return '#'+[16,8,0].map(shift=>part(shift).toString(16).padStart(2,'0')).join('');
  }
  // Appearance sets the preset colours; this runs straight after to put a custom colour on top.
  function paint(){
    if(!c.accent)return;
    root.style.setProperty('--accent',c.accent);root.style.setProperty('--accent2',lighten(c.accent));root.dataset.theme='custom';
    for(const button of document.querySelectorAll('#themeOptions button'))button.setAttribute('aria-pressed','false');
  }
  function apply(){
    root.dataset.reflections=c.reflections?'on':'off';root.dataset.spotlight=c.spotlight?'on':'off';
    if(c.hide.length)root.dataset.hide=c.hide.join(' ');else delete root.dataset.hide;
    if(typeof Ambient!=='undefined')Ambient.configure({speed:c.bgSpeed,brightness:c.bgBrightness});
    if(layer){
      layer.hidden=!c.bgImage;layer.style.backgroundImage=c.bgImage?`url("${c.bgImage.replace(/["\\\n]/g,encodeURIComponent)}")`:'';
      layer.style.filter=`brightness(${(.6*c.bgBrightness).toFixed(2)})`;root.toggleAttribute('data-bg-image',!!c.bgImage);
    }
    if(typeof Appearance!=='undefined'&&context)Appearance.apply({},false);
    const clock=$('#clock');if(clock)clock.textContent=time();
  }
  function save(){
    context.getState().config.custom=structuredClone(c);
    clearTimeout(saveTimer);
    saveTimer=setTimeout(()=>{saves=saves.catch(()=>{}).then(()=>api.setConfig(structuredClone(context.getState().config))).catch(()=>context.toast('Customizations could not be saved. Try changing the option again.'))},250);
  }
  function change(patch,{relayout=false,prompts=false}={}){
    Object.assign(c,patch);apply();if(relayout)context.relayout();if(prompts)context.refreshPrompts();sync();save();
  }
  // Picking a preset theme in View & theme puts the custom colour away.
  function clearAccent(){if(!c.accent)return;c.accent='';if(context){sync();save()}}

  const percent=v=>Math.round(v*100)+'%';
  const slider=(key,label,step=.05)=>`<label class="row"><span>${label}</span><input type="range" data-range="${key}" min="${RANGES[key][0]}" max="${RANGES[key][1]}" step="${step}"/><output data-out="${key}"></output></label>`;
  const check=(attr,label)=>`<label class="row check"><input type="checkbox" ${attr}/> ${label}</label>`;
  function build(panel){
    panel.innerHTML=`<h2 id="customizeHeading">Customize</h2>
      <p class="hint">These apply straight away and save themselves.</p>
      <h3>Colours and background</h3>
      <div class="row"><span>Accent colour</span><input type="color" id="cAccent" aria-label="Accent colour"/><button type="button" id="cAccentReset">Use the theme's colour</button></div>
      ${slider('bgSpeed','Background speed')}${slider('bgBrightness','Brightness')}
      <div class="row"><span>Background image</span><button type="button" id="cImagePick">Choose image…</button><button type="button" id="cImageClear">Remove</button></div>
      <p class="hint" id="cImageNote"></p>
      <h3>Shelf</h3>
      ${slider('caseSize','Case size',.01)}${slider('spacing','Space between cases')}${slider('tilt','Side case tilt')}
      <p class="hint">Spacing and tilt apply to the Carousel, Flipbook and Media carousel layouts.</p>
      ${check('data-flag="reflections"','Floor reflection under the selected case')}${check('data-flag="spotlight"','Spotlight behind the shelf')}
      <h3>Interface</h3>
      ${Object.entries(PARTS).map(([part,label])=>check(`data-part="${part}"`,label)).join('')}
      <label class="row"><span>Clock</span><select id="cClock"><option value="auto">Follow Windows</option><option value="12">12-hour</option><option value="24">24-hour</option></select></label>
      <h3>Keyboard</h3>
      <p class="hint" id="cKeyNote">Click an action, then press the key for it. Esc cancels. A key that is already in use swaps places.</p>
      <div class="bindings" id="cKeys">${Object.keys(KEY_DEFAULTS).map(action=>`<div class="binding"><span>${ACTIONS[action]}</span><button type="button" data-key-action="${action}"></button></div>`).join('')}</div>
      <div class="row"><button type="button" id="cKeysReset">Reset keys</button></div>
      <h3>Controller</h3>
      <p class="hint">The d-pad and left stick always browse. Holding View + Menu to close a game stays as it is. A button that is already in use swaps places.</p>
      <div class="bindings" id="cPad">${Object.keys(PAD_DEFAULTS).map(action=>`<label class="binding"><span>${ACTIONS[action]}</span><select data-pad-action="${action}">${PAD_BUTTONS.map(([,name],i)=>`<option value="${i}">${name}</option>`).join('')}</select></label>`).join('')}</div>
      <div class="row"><button type="button" id="cPadReset">Reset buttons</button><button type="button" id="cResetAll">Reset everything in Customize</button></div>`;
    panel.addEventListener('input',e=>{
      const range=e.target.dataset?.range;
      if(range)change({[range]:Number(e.target.value)},{relayout:['caseSize','spacing','tilt'].includes(range)});
      else if(e.target.id==='cAccent')change({accent:e.target.value});
    });
    panel.addEventListener('change',e=>{
      const t=e.target;
      if(t.dataset.flag)change({[t.dataset.flag]:t.checked});
      else if(t.dataset.part)change({hide:Object.keys(PARTS).filter(part=>part===t.dataset.part?!t.checked:c.hide.includes(part))},{relayout:true});
      else if(t.id==='cClock')change({clock:t.value});
      else if(t.dataset.padAction)bindButton(t.dataset.padAction,Number(t.value));
    });
    panel.addEventListener('click',async e=>{
      const t=e.target.closest('button');if(!t)return;
      if(t.dataset.keyAction)startCapture(t.dataset.keyAction);
      else if(t.id==='cAccentReset')change({accent:''});
      else if(t.id==='cImageClear')change({bgImage:''});
      else if(t.id==='cImagePick'){try{const url=await api.pickBackgroundImage();if(url)change({bgImage:url})}catch(err){context.toast(err.message)}}
      else if(t.id==='cKeysReset')change({keys:{}},{prompts:true});
      else if(t.id==='cPadReset')change({pad:{}},{prompts:true});
      else if(t.id==='cResetAll'){c=structuredClone(DEFAULTS);change({},{relayout:true,prompts:true})}
    });
  }
  function sync(){
    const panel=$('#customizePanel');if(!panel||!panel.firstChild)return;
    $('#cAccent').value=c.accent||getComputedStyle(root).getPropertyValue('--accent').trim()||'#efaa68';
    $('#cAccentReset').disabled=!c.accent;
    for(const input of panel.querySelectorAll('[data-range]')){input.value=c[input.dataset.range];panel.querySelector(`[data-out="${input.dataset.range}"]`).textContent=percent(c[input.dataset.range])}
    for(const box of panel.querySelectorAll('[data-flag]'))box.checked=c[box.dataset.flag];
    for(const box of panel.querySelectorAll('[data-part]'))box.checked=!c.hide.includes(box.dataset.part);
    $('#cClock').value=c.clock;
    const canPick=typeof api!=='undefined'&&!!api.pickBackgroundImage;
    $('#cImagePick').disabled=!canPick;$('#cImageClear').disabled=!c.bgImage;
    $('#cImageNote').textContent=c.bgImage?'Your image shows behind the Off, Ribbon, Orbit and Constellation backgrounds. The other backgrounds cover it.':'Shows behind the Off, Ribbon, Orbit and Constellation backgrounds.';
    for(const button of panel.querySelectorAll('[data-key-action]')){
      const action=button.dataset.keyAction,listening=capture===action,id=keyIcon(action);
      button.classList.toggle('listening',listening);
      button.innerHTML=listening?'Press a key…':id?Prompts.icon('keyboard',id):'Not set';
    }
    for(const select of panel.querySelectorAll('[data-pad-action]'))select.value=String(buttonFor(select.dataset.padAction));
  }

  // Giving an action a key or button that another action has moves that action onto the one given up.
  function bindKey(action,key){
    const keys=Object.fromEntries(Object.keys(KEY_DEFAULTS).map(a=>[a,keyFor(a)])),other=Object.keys(keys).find(a=>a!==action&&keys[a]===key);
    if(other)keys[other]=keys[action];
    keys[action]=key;change({keys},{prompts:true});
  }
  function bindButton(action,button){
    const pad=padMap(),other=Object.keys(pad).find(a=>a!==action&&pad[a]===button);
    if(other)pad[other]=pad[action];
    pad[action]=button;change({pad},{prompts:true});
  }
  function note(text){const el=$('#cKeyNote');if(el){el.textContent=text;el.classList.toggle('warn',text!==NOTE)}}
  const NOTE='Click an action, then press the key for it. Esc cancels. A key that is already in use swaps places.';
  function onCaptureKey(e){
    e.preventDefault();e.stopImmediatePropagation();
    if(['Shift','Control','Alt','Meta'].includes(e.key))return;
    const action=capture,key=norm(e.key);
    if(e.key==='Escape'&&keyFor(action)!=='Escape'){stopCapture();note(NOTE);return}
    if(e.ctrlKey||e.altKey||e.metaKey||!keyId(key)||RESERVED.includes(key)||key==='Tab'||key==='/'){note(`${e.key===' '?'Space':e.key} can't be used here. Press another key, or Esc to cancel.`);return}
    stopCapture();note(NOTE);bindKey(action,key);
  }
  function startCapture(action){
    if(capture===action){stopCapture();return}
    stopCapture();capture=action;addEventListener('keydown',onCaptureKey,true);addEventListener('pointerdown',onCapturePointer,true);note(NOTE);sync();
  }
  function onCapturePointer(e){if(!e.target.closest?.(`[data-key-action="${capture}"]`))stopCapture()}
  function stopCapture(){
    if(!capture)return;capture=null;removeEventListener('keydown',onCaptureKey,true);removeEventListener('pointerdown',onCapturePointer,true);sync();
  }

  function init(options){
    context=options;c=sanitize(context.getState().config.custom);
    const canvas=$('#xmb');
    if(canvas){layer=document.createElement('div');layer.id='bgImage';layer.hidden=true;canvas.before(layer)}
    const panel=$('#customizePanel');if(panel)build(panel);
    apply();sync();
  }
  return {init,paint,clearAccent,keyAction,padMap,keyIcon,padIcon,shelf,time,capturing:()=>!!capture,settings:()=>structuredClone(c)};
})();
