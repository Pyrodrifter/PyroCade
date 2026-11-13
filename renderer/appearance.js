const Appearance=(()=>{
  const $=s=>document.querySelector(s);
  const themes = {
    ember: {name: 'Ember', accent: '#efaa68', light: '#ffca97'},
    glacier: {name: 'Glacier', accent: '#78b8f3', light: '#afd6ff'},
    violet: {name: 'Violet', accent: '#bc9af3', light: '#dac4ff'},
    mint: {name: 'Mint', accent: '#83d5a4', light: '#b5eccb'},
    rose: {name: 'Rose', accent: '#ed9da7', light: '#ffc6ce'},
  };
  const layouts={carousel:{name:'Carousel',note:'3D cases'},vertical:{name:'Vertical stack',note:'Vertical list'},flipbook:{name:'Flipbook',note:'Fanned covers'},bookshelf:{name:'Bookshelf',note:'Spines on a shelf'},'page-turn':{name:'Page turn',note:'Cases swing around a spine'},media:{name:'Media carousel',note:'Discs and cartridges'}};
  // Old layout names in saved settings. Top flip was replaced by the media carousel before release.
  const retiredLayouts={spinner:'page-turn',swatches:'media','top-flip':'media'};
  let theme='ember',mode='carousel',infoBar='small',context,saves=Promise.resolve(),volumeTimer;
  const browsesVertically=(layout=mode)=>layout==='vertical';
  function persist(){
    const state=context.getState();state.config.libraryTheme=theme;state.config.libraryLayout=mode;state.config.uiSound=AudioUI.settings();state.config.libraryInfoBar=infoBar;if(infoBar!=='hidden')state.config.libraryLastDetailsSize=infoBar;
    saves=saves.catch(()=>{}).then(()=>api.setConfig(structuredClone(context.getState().config))).catch(()=>context.toast('Appearance could not be saved. Try changing the option again.'));
    return saves;
  }
  function apply(next={},save=true){
    const old=mode,oldInfo=infoBar,layout=retiredLayouts[next.layout]||next.layout;
    if(['xlarge','large','small','compact','hidden'].includes(next.infoBar))infoBar=next.infoBar;
    if(Object.hasOwn(themes,next.theme))theme=next.theme;
    if(Object.hasOwn(layouts,layout))mode=layout;
    document.documentElement.dataset.infoBar=infoBar;
    $('#btnToggleDetails').setAttribute('aria-pressed',String(infoBar!=='hidden'));
    $('#btnToggleDetails').textContent=infoBar==='hidden'?'Show details (I)':'Hide details (I)';
    for(const b of document.querySelectorAll('#infoBarOptions button'))b.setAttribute('aria-pressed',String(b.dataset.infoBar===infoBar));
    document.documentElement.dataset.theme=theme;document.documentElement.dataset.layout=mode;
    const palette=themes[theme];document.documentElement.style.setProperty('--accent',palette.accent);document.documentElement.style.setProperty('--accent2',palette.light);
    for(const b of document.querySelectorAll('#layoutOptions button'))b.setAttribute('aria-pressed',String(b.dataset.layout===mode));
    for(const b of document.querySelectorAll('#themeOptions button'))b.setAttribute('aria-pressed',String(b.dataset.theme===theme));
    if(typeof Customize!=='undefined')Customize.paint(); // a custom accent colour goes on top of the preset
    $('#btnAppearance').title=`${layouts[mode].name} · ${themes[theme].name} · change appearance`;
    if(context&&(old!==mode||oldInfo!==infoBar))context.refresh();if(save){AudioUI.play('confirm');persist()}
  }
  function init(options){
    context=options;const config=context.getState().config;
    for(const [id,v]of Object.entries(layouts)){
      const b=document.createElement('button');b.className='layout-option';b.dataset.layout=id;b.type='button';
      b.innerHTML=`<span class="layout-mini" data-kind="${id}" aria-hidden="true"><i></i><i></i><i></i></span><strong>${v.name}</strong><small>${v.note}</small>`;
      b.onclick=()=>apply({layout:id});$('#layoutOptions').append(b);
    }
    for(const [id,v]of Object.entries(themes)){
      const b=document.createElement('button');b.className='theme-option';b.dataset.theme=id;b.type='button';b.style.setProperty('--theme-gradient',`linear-gradient(135deg,${v.light},${v.accent})`);b.innerHTML=`<i aria-hidden="true"></i>${v.name}`;b.onclick=()=>{Customize.clearAccent();apply({theme:id})};$('#themeOptions').append(b);
    }
    const bgNames={off:['Off','#2a2f3a,#12151d'],ribbon:['Ribbon','#ffc074,#ff752e'],xbox:['Orbit','#b8ee74,#266822'],codex:['Constellation','#70d2ce,#4f64c1'],towers:['Towers','#97b7ff,#243c89'],loom:['Loom','#60ced6,#ff752e'],fable:['Fable','#ffecd6,#d97757'],aurora:['Aurora','#54e896,#3a2f8f'],ridges:['Ridges','#8fa3d8,#0b0e1b'],embers:['Embers','#ffe4b0,#c2330e'],deep:['Deep','#96e2f0,#062b47'],day:['Pixel day','#dcf4fd,#3f9be0'],night:['Pixel night','#394e94,#070b22'],'pixel-auto':['Pixel auto','#dcf4fd,#070b22']};
    for(const id of Ambient.backgrounds()){
      const b=document.createElement('button');b.className='theme-option';b.dataset.background=id;b.type='button';b.style.setProperty('--theme-gradient',`linear-gradient(135deg,${bgNames[id][1]})`);b.innerHTML=`<i aria-hidden="true"></i>${bgNames[id][0]}`;
      b.onclick=()=>{Ambient.configure({background:id});const state=context.getState();state.config.ambient={...(state.config.ambient||{}),idleMinutes:Ambient.settings().idleMinutes,background:id};delete state.config.ambient.ribbon;syncBackground();const sel=$('#sBackground');if(sel)sel.value=id;AudioUI.play('confirm');persist()};
      $('#backgroundOptions').append(b);
    }
    for(const b of document.querySelectorAll('#infoBarOptions button'))b.onclick=()=>apply({infoBar:b.dataset.infoBar});
    syncBackground();
    apply({infoBar:config.libraryInfoBar||'small',theme:config.libraryTheme||'ember',layout:config.libraryLayout},false);
    config.libraryLayout=mode;
    $('#btnAppearance').onclick=()=>{if($('#appearancePicker').open)return $('#appearancePicker').close();if($('#systemPicker').open)$('#systemPicker').close();AudioUI.play('open');$('#appearancePicker').showModal();$('#btnAppearance').setAttribute('aria-expanded','true');$('#layoutOptions [aria-pressed=true]').focus()};
    $('#closeAppearance').onclick=()=>$('#appearancePicker').close();
    $('#appearancePicker').addEventListener('close',()=>{$('#btnAppearance').setAttribute('aria-expanded','false');$('#btnAppearance').focus();AudioUI.play('back')});
    $('#appearancePicker').addEventListener('click',e=>{const r=e.currentTarget.getBoundingClientRect();if(e.target===e.currentTarget&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))e.currentTarget.close()});
    const updateSound=()=>{const sound=AudioUI.settings();$('#soundToggle').textContent=sound.enabled?'Sound on':'Muted';$('#soundToggle').setAttribute('aria-pressed',String(sound.enabled));$('#soundVolume').value=Math.round(sound.volume*100);$('#soundVolume').setAttribute('aria-valuetext',Math.round(sound.volume*100)+'%');$('#soundVolumeValue').textContent=Math.round(sound.volume*100)+'%';$('#soundPreview').disabled=!sound.enabled||sound.volume===0};
    updateSound();$('#soundToggle').onclick=()=>{AudioUI.configure({enabled:!AudioUI.settings().enabled});updateSound();AudioUI.play('confirm');persist()};
    $('#soundVolume').oninput=e=>{AudioUI.configure({volume:Number(e.target.value)/100});updateSound();clearTimeout(volumeTimer);volumeTimer=setTimeout(persist,180)};
    $('#soundVolume').onchange=()=>{clearTimeout(volumeTimer);persist();AudioUI.play('confirm')};$('#soundPreview').onclick=()=>AudioUI.play('system');
    $('#appearancePicker').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key)&&!e.target.matches('input')){e.preventDefault();controller(e.key.slice(5).toLowerCase())}});
  }
  function syncBackground(){const current=Ambient.settings().background;for(const b of document.querySelectorAll('#backgroundOptions button'))b.setAttribute('aria-pressed',String(b.dataset.background===current))}
  function geometry(selected,selectedHasDisc=false){
    if(mode==='bookshelf')return {lo:selected-26,hi:selected+26,discPeek:selectedHasDisc?48:0};
    const radius=mode==='page-turn'?3:8;
    return {lo:selected-radius,hi:selected+radius};
  }
  // size(i) gives the [width, height, depth] of case i, so spines can stand side by side.
  function position(i,sel,scale,itemScale,stage,view,size=()=>[230,323,24]){
    const d=i-sel,a=Math.abs(d),s=Math.sign(d);
    // Spacing and tilt of the side cases, from Settings > Customize.
    const K=typeof Customize==='undefined'?{spacing:1,tilt:1}:Customize.shelf(),gap=scale*K.spacing;
    if(mode==='bookshelf') {
      // Cases stand spine-out side by side on one baseline; the selected one slides out to face you.
      // Spines are what this layout is for, and a 24px-deep case has very little spine to print a
      // title on, so the shelf is sized from the stage instead of from the shared scale. That scale
      // stops at 1.16, which on a 1920x1080 screen left the shelf 600px wide in the middle and
      // spine titles 8px tall. Standing cases now fill about 55% of the stage height; the case
      // pulled out towards you is a little larger, but capped so that, with the extra size the
      // 150px of perspective gives it, it still fits under the header. Everything is measured from
      // the middle of the stage, where #carousel sits.
      const fit=itemScale/scale,h=stage.clientHeight;
      const k=fit*Math.max(scale*.6,h*.55/323),ks=fit*Math.max(scale*.82,Math.min(h*.55/323*1.37,h*.7/323));
      const floor=Math.max(323*Math.max(scale*.6,h*.55/323)/2,h*.28);   // one floor for every case, whatever its own displayScale
      if(d===0){const [,H]=size(i);return {transform:`translate3d(0px,${floor-h*.04-H*ks/2}px,150px) scale3d(${ks},${ks},${ks})`,hidden:false}}
      const [Ws]=size(sel);let x=Ws*ks/2+26*k;
      if(s>0)x+=view.discPeek*ks;
      for(let j=sel+s;j!==i;j+=s)x+=size(j)[2]*k+2*k;
      const [,H,D]=size(i);x+=D*k/2;
      return {transform:`translate3d(${s*x}px,${floor-H*k/2}px,0px) rotateY(90deg) scale3d(${k},${k},${k})`,hidden:x>stage.clientWidth/2+40};
    }
    if(mode==='page-turn'){
      // Offset the case from its spine after rotation, so it turns across the gutter like a page.
      const [width]=size(i),k=itemScale*(d===0?.94:.89);
      const x=(-24+s*a*26)*scale,angle=d<0?-164-(a-1)*4:d>0?12+(a-1)*9:-8;
      const z=d===0?90:40-a*32;
      return {transform:`translate3d(${x}px,0px,${z}px) rotateY(${angle}deg) translateX(${width*k/2}px) scale(${k})`,hidden:a>3};
    }
    if(mode==='media'){
      // The discs and cartridges themselves, out of their cases (library-ui.css hides the cases).
      // A carousel like the first layout, a little tighter since the media is smaller than a case,
      // and turned less so the discs on either side still read as discs.
      return {transform:d===0?`translate3d(0px,-8px,140px) scale(${itemScale*1.05})`:`translate3d(${s*(270+(a-1)*150)*gap}px,10px,${-a*110-70}px) rotateY(${-s*38*K.tilt}deg) scale(${itemScale*.9})`,hidden:a>6};
    }
    if(mode==='vertical')return {transform:d===0?`translate3d(${85*scale}px,-8px,90px) scale(${itemScale*.91})`:`translate3d(${-235*scale}px,${d*Math.min(95*scale,stage.clientHeight*.17)}px,${-a*80}px) rotateY(12deg) scale(${itemScale*.40})`,hidden:a>(stage.clientHeight>300?2:1)};
    if(mode==='flipbook')return {transform:d===0?`translate3d(${-15*scale}px,-6px,100px) rotateY(-9deg) scale(${itemScale})`:`translate3d(${s*(275+(a-1)*37)*gap}px,${a*3}px,${-a*65}px) rotateY(${-s*62*K.tilt}deg) scale(${itemScale*.87})`,hidden:a>3};
    return {transform:d===0?`translate3d(0px,-8px,130px) scale(${itemScale})`:`translate3d(${s*(325+(a-1)*156)*gap}px,10px,${-a*115-85}px) rotateY(${-s*50*K.tilt}deg) scale(${itemScale*.92})`,hidden:a>6};
  }
  function controller(action){
    if(action==='back'||action==='systems')return $('#appearancePicker').close();
    const active=document.activeElement;
    if(action==='play'||action==='case'){if(active.matches('button,input[type=checkbox]'))active.click();return;}
    if(!['left','right','up','down'].includes(action))return;
    if(active.id==='soundVolume'&&['left','right'].includes(action)){active.value=Math.max(0,Math.min(100,Number(active.value)+(action==='left'?-5:5)));active.dispatchEvent(new Event('input'));AudioUI.play('scroll');return;}
    // Backgrounds wrap five to a row (library-ui.css), so up and down move between those rows too.
    const layoutButtons=[...document.querySelectorAll('#layoutOptions button')],backgroundButtons=[...document.querySelectorAll('#backgroundOptions button')],rows=[layoutButtons.slice(0,3),layoutButtons.slice(3),[...document.querySelectorAll('#themeOptions button')],backgroundButtons.slice(0,5),backgroundButtons.slice(5,10),backgroundButtons.slice(10),[...document.querySelectorAll('#infoBarOptions button')],[$('#appearanceDetailsPinned')],[$('#soundToggle'),$('#soundVolume'),$('#soundPreview')]];
    let row=rows.findIndex(r=>r.includes(active)),col=row<0?0:rows[row].indexOf(active);if(row<0){rows[0][0].focus();return;}
    if(action==='left'||action==='right')col=Math.max(0,Math.min(rows[row].length-1,col+(action==='left'?-1:1)));
    else{row=Math.max(0,Math.min(rows.length-1,row+(action==='up'?-1:1)));col=Math.min(col,rows[row].length-1)}
    rows[row][col].focus();
  }
  return {init,apply,persist,syncBackground,geometry,position,browsesVertically,controller,mode:()=>mode,theme:()=>theme,panelOpen:()=>!!$('#appearancePicker')?.open,layouts,themes};
})();
