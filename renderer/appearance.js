const Appearance=(()=>{
  const $=s=>document.querySelector(s);
  const themes={ember:{name:'Ember',accent:'#ff752e',light:'#ffc074'},glacier:{name:'Glacier',accent:'#37bfe6',light:'#9defff'},violet:{name:'Violet',accent:'#a685ff',light:'#ebafff'},mint:{name:'Mint',accent:'#4dc59c',light:'#c3f59f'},rose:{name:'Rose',accent:'#f46e9b',light:'#ffc2a5'}};
  const layouts={carousel:{name:'Carousel',note:'3D cases'},vertical:{name:'Vertical stack',note:'Vertical list'},flipbook:{name:'Flipbook',note:'Page through'},bookshelf:{name:'Bookshelf',note:'Spines on a shelf'},spinner:{name:'Spinner rack',note:'Rotating store tower'},swatches:{name:'Colour cards',note:'Colour grid'}};
  let theme='ember',mode='carousel',infoBar='small',context,saves=Promise.resolve(),volumeTimer;
  function persist(){
    const state=context.getState();state.config.libraryTheme=theme;state.config.libraryLayout=mode;state.config.uiSound=AudioUI.settings();state.config.libraryInfoBar=infoBar;
    const snapshot=structuredClone(state.config);
    saves=saves.catch(()=>{}).then(()=>api.setConfig(snapshot)).catch(()=>context.toast('Appearance could not be saved. Try changing the option again.'));
    return saves;
  }
  function apply(next={},save=true){
    const old=mode,oldInfo=infoBar;if(['large','small','compact','hidden'].includes(next.infoBar))infoBar=next.infoBar;if(themes[next.theme])theme=next.theme;if(layouts[next.layout])mode=next.layout;
    document.documentElement.dataset.infoBar=infoBar;
    for(const b of document.querySelectorAll('#infoBarOptions button'))b.setAttribute('aria-pressed',String(b.dataset.infoBar===infoBar));
    document.documentElement.dataset.theme=theme;document.documentElement.dataset.layout=mode;
    const palette=themes[theme];document.documentElement.style.setProperty('--accent',palette.accent);document.documentElement.style.setProperty('--accent2',palette.light);
    for(const b of document.querySelectorAll('#layoutOptions button'))b.setAttribute('aria-pressed',String(b.dataset.layout===mode));
    for(const b of document.querySelectorAll('#themeOptions button'))b.setAttribute('aria-pressed',String(b.dataset.theme===theme));
    $('#btnAppearance').title=`${layouts[mode].name} · ${themes[theme].name} · change appearance`;
    if(context&&(old!==mode||oldInfo!==infoBar))context.refresh();if(save){AudioUI.play('confirm');persist()}
  }
  function init(options){
    context=options;const config=context.getState().config;
    for(const [id,v]of Object.entries(layouts)){
      const b=document.createElement('button');b.className='layout-option';b.dataset.layout=id;b.type='button';
      b.innerHTML=`<span class="layout-mini" data-kind="${id}" aria-hidden="true"><i></i><i></i><i></i>${id==='swatches'?'<i></i>':''}</span><strong>${v.name}</strong><small>${v.note}</small>`;
      b.onclick=()=>apply({layout:id});$('#layoutOptions').append(b);
    }
    for(const [id,v]of Object.entries(themes)){
      const b=document.createElement('button');b.className='theme-option';b.dataset.theme=id;b.type='button';b.style.setProperty('--theme-gradient',`linear-gradient(135deg,${v.light},${v.accent})`);b.innerHTML=`<i aria-hidden="true"></i>${v.name}`;b.onclick=()=>apply({theme:id});$('#themeOptions').append(b);
    }
    const bgNames={off:['Off','#2a2f3a,#12151d'],ribbon:['Ribbon','#ffc074,#ff752e'],xbox:['Orbit','#b8ee74,#266822'],codex:['Constellation','#70d2ce,#4f64c1'],towers:['Towers','#97b7ff,#243c89'],loom:['Loom','#60ced6,#ff752e'],day:['Pixel day','#dcf4fd,#3f9be0'],night:['Pixel night','#394e94,#070b22'],'pixel-auto':['Pixel auto','#dcf4fd,#070b22']};
    for(const id of Ambient.backgrounds()){
      const b=document.createElement('button');b.className='theme-option';b.dataset.background=id;b.type='button';b.style.setProperty('--theme-gradient',`linear-gradient(135deg,${bgNames[id][1]})`);b.innerHTML=`<i aria-hidden="true"></i>${bgNames[id][0]}`;
      b.onclick=()=>{Ambient.configure({background:id});const state=context.getState();state.config.ambient={...(state.config.ambient||{}),idleMinutes:Ambient.settings().idleMinutes,background:id};delete state.config.ambient.ribbon;syncBackground();const sel=$('#sBackground');if(sel)sel.value=id;AudioUI.play('confirm');persist()};
      $('#backgroundOptions').append(b);
    }
    for(const b of document.querySelectorAll('#infoBarOptions button'))b.onclick=()=>apply({infoBar:b.dataset.infoBar});
    syncBackground();
    apply({infoBar:config.libraryInfoBar||'small',theme:config.libraryTheme||'ember',layout:config.libraryLayout||'carousel'},false);
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
  const RACK_TIERS=3;
  function geometry(stage,selected,length){
    if(mode==='bookshelf')return {lo:selected-26,hi:selected+26};
    if(mode==='spinner'){const col=Math.floor(selected/RACK_TIERS);return {lo:(col-4)*RACK_TIERS,hi:(col+4)*RACK_TIERS+RACK_TIERS-1}}
    if(mode!=='swatches')return {lo:selected-8,hi:selected+8};
    const columns=Math.max(1,Math.min(stage.clientWidth>=1400?4:3,length||1)),rows=stage.clientHeight>=260?2:1,cells=columns*rows;
    const start=Math.floor(selected/cells)*cells,width=Math.min(300,(stage.clientWidth-180-(columns-1)*16)/columns),height=Math.min(133,Math.max(78,(stage.clientHeight-58-(rows-1)*14)/rows));
    return {lo:start,hi:Math.min(length-1,start+cells-1),columns,rows,width,height,start};
  }
  // size(i) gives the [width, height, depth] of case i, so spines can stand side by side.
  function position(i,sel,scale,itemScale,stage,view,size=()=>[230,323,24]){
    const d=i-sel,a=Math.abs(d),s=Math.sign(d);
    if(mode==='bookshelf') {
      // Cases stand spine-out side by side on one baseline; the selected one slides out to face you.
      const k=itemScale*.6,ks=itemScale*.82,base=323*k/2;
      if(d===0){const [,H]=size(i);return {transform:`translate3d(0px,${base-H*ks/2-34*scale}px,150px) scale3d(${ks},${ks},${ks})`,hidden:false}}
      const [Ws]=size(sel);let x=Ws*ks/2+18*scale;
      for(let j=sel+s;j!==i;j+=s)x+=size(j)[2]*k+1.5;
      const [,H,D]=size(i);x+=D*k/2;
      return {transform:`translate3d(${s*x}px,${base-H*k/2}px,0px) rotateY(90deg) scale3d(${k},${k},${k})`,hidden:x>stage.clientWidth/2+40};
    }
    if(mode==='spinner') {
      // A store tower: columns of three cases around a turning post; the selected case pops out.
      const k=itemScale*.4,col=Math.floor(i/RACK_TIERS),tier=i%RACK_TIERS,dc=col-Math.floor(sel/RACK_TIERS);
      const angle=dc*38,radius=330*scale,pitch=Math.min(330*k+12*scale,(stage.clientHeight-40)/RACK_TIERS);
      const pop=d===0?70*scale:0,ks=d===0?k*1.12:k;
      return {transform:`translate3d(0px,${(tier-1)*pitch}px,${-radius}px) rotateY(${angle}deg) translateZ(${radius+pop}px) scale3d(${ks},${ks},${ks})`,hidden:Math.abs(angle)>115,shade:Math.min(.75,Math.abs(angle)/120)};
    }
    if(mode==='swatches'){
      const col=(i-view.start)%view.columns,row=Math.floor((i-view.start)/view.columns);
      return {transform:`translate3d(${col*(view.width+16)-(view.columns*view.width+(view.columns-1)*16)/2}px,${row*(view.height+14)-(view.rows*view.height+(view.rows-1)*14)/2}px,0)`,hidden:i<view.lo||i>view.hi,width:view.width,height:view.height};
    }
    if(mode==='vertical')return {transform:d===0?`translate3d(${85*scale}px,-8px,90px) scale(${itemScale*.91})`:`translate3d(${-235*scale}px,${d*Math.min(95*scale,stage.clientHeight*.17)}px,${-a*80}px) rotateY(12deg) scale(${itemScale*.40})`,hidden:a>(stage.clientHeight>300?2:1)};
    if(mode==='flipbook')return {transform:d===0?`translate3d(${-15*scale}px,-6px,100px) rotateY(-9deg) scale(${itemScale})`:`translate3d(${s*(275+(a-1)*37)*scale}px,${a*3}px,${-a*65}px) rotateY(${-s*62}deg) scale(${itemScale*.87})`,hidden:a>3};
    return {transform:d===0?`translate3d(${-55*scale}px,-8px,130px) scale(${itemScale})`:`translate3d(${s*(325+(a-1)*156)*scale}px,10px,${-a*115-85}px) rotateY(${-s*50}deg) scale(${itemScale*.92})`,hidden:a>6};
  }
  function card(game,a){
    const card=document.createElement('div');card.className='swatch-card';card.setAttribute('aria-hidden','true');
    const cover=EshopCovers.face(game,a,'swatch-cover'),copy=document.createElement('div');copy.className='swatch-copy';const title=document.createElement('strong');title.textContent=game.title;const system=document.createElement('small');system.textContent=a.sys.name;copy.append(title,system);card.append(cover,copy);
    if(game._swatchSource!==a.front){game._swatchSource=a.front;delete game._swatchColor}
    card.style.setProperty('--swatch-color',game._swatchColor||a.sys.color||'#554668');
    if(!game._swatchColor)Art.tint(a.digital?.source||a.front,a.digital?.crop||a.packshot).then(color=>{if(game._swatchSource===a.front){game._swatchColor=color;card.style.setProperty('--swatch-color',color)}});
    return card;
  }
  function controller(action){
    if(action==='back'||action==='systems')return $('#appearancePicker').close();
    const active=document.activeElement;
    if(action==='play'||action==='case'){if(active.matches('button'))active.click();return;}
    if(!['left','right','up','down'].includes(action))return;
    if(active.id==='soundVolume'&&['left','right'].includes(action)){active.value=Math.max(0,Math.min(100,Number(active.value)+(action==='left'?-5:5)));active.dispatchEvent(new Event('input'));AudioUI.play('scroll');return;}
    const layoutButtons=[...document.querySelectorAll('#layoutOptions button')],rows=[layoutButtons.slice(0,3),layoutButtons.slice(3),[...document.querySelectorAll('#themeOptions button')],[...document.querySelectorAll('#backgroundOptions button')],[...document.querySelectorAll('#infoBarOptions button')],[$('#soundToggle'),$('#soundVolume'),$('#soundPreview')]];
    let row=rows.findIndex(r=>r.includes(active)),col=row<0?0:rows[row].indexOf(active);if(row<0){rows[0][0].focus();return;}
    if(action==='left'||action==='right')col=Math.max(0,Math.min(rows[row].length-1,col+(action==='left'?-1:1)));
    else{row=Math.max(0,Math.min(rows.length-1,row+(action==='up'?-1:1)));col=Math.min(col,rows[row].length-1)}
    rows[row][col].focus();
  }
  return {init,apply,persist,syncBackground,geometry,position,card,controller,mode:()=>mode,theme:()=>theme,panelOpen:()=>!!$('#appearancePicker')?.open,layouts,themes};
})();
