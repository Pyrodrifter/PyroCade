// Console navigation and library chrome; no network or configuration writes.
const LibraryUI=(()=>{
  const $=s=>document.querySelector(s);
  let context,entries=[],railFrame=null,pickerChosen=false;
  let favoriteSet=new Set(),recentlyPlayed=[],sortKey='title',sortAsc=true;
  const shapes={
    grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
    pad:'<path d="M7 7h10c3 0 4 3 4 7l-1 4c-.4 2-2 2-3 0l-2-3H9l-2 3c-1 2-2.6 2-3 0l-1-4c0-4 1-7 4-7Z"/><path d="M7 9v5m-2.5-2.5h5"/><circle cx="16" cy="10" r=".8"/><circle cx="18.5" cy="12.5" r=".8"/>',
    handheld:'<rect x="5" y="2" width="14" height="20" rx="2.5"/><rect x="7.5" y="4.5" width="9" height="7" rx=".6"/><path d="M9 14v5m-2.5-2.5h5m3.5 2 2-2"/>',
    wide:'<rect x="2" y="5" width="20" height="14" rx="4"/><rect x="7" y="7.5" width="10" height="9" rx=".8"/><path d="M4.5 9v5m-2-2.5h4m13 0h.1"/>',
    dual:'<path d="M4 2h16v9H4zM3 13h18v9H3z"/><path d="M7 4h10v5H7zm1 11h8v5H8zm-3 2v2m14-2v2"/>',
    switch:'<rect x="2" y="4" width="20" height="16" rx="4"/><path d="M7 4v16M17 4v16M9 7h6v10H9"/><circle cx="4.5" cy="8" r=".8"/><circle cx="19.5" cy="16" r=".8"/>',
    remote:'<rect x="8" y="2" width="8" height="20" rx="2"/><circle cx="12" cy="5" r=".8"/><path d="M12 8v5m-2.5-2.5h5"/><circle cx="12" cy="16.5" r="1.4"/>',
    cube:'<path d="m12 2 10 5.5v10L12 23 2 17.5v-10L12 2Z"/><path d="m2 7.5 10 5.7 10-5.7M12 13v10m-5-18 10 5.5"/>',
    n64:'<path d="M6 5h12c3 0 4 5 3 9l-1 5-4-5-2 7h-4l-2-7-4 5-1-5c-1-4 0-9 3-9Z"/><path d="M7 7v6m-3-3h6m6-1h.1m3 3h.1"/>',
    nes:'<rect x="2" y="5" width="20" height="14" rx="1.5"/><path d="M7 8v8m-4-4h8m1 3h3"/><circle cx="16" cy="11" r="1.5"/><circle cx="20" cy="11" r="1.5"/>',
    swirl:'<path d="M15 16c-7 5-15-3-10-10s17-3 15 5c-2 7-12 7-12 1 0-4 7-4 7 0 0 2-3 2-3 1"/>',
    joystick:'<path d="m3 15 9-3 9 3v6H3zM12 14V6"/><circle cx="12" cy="4" r="2.5"/><circle cx="17" cy="17" r="1"/>',
    arcade:'<path d="M5 2h14l-1 12 3 3v5H3v-5l3-3L5 2Z"/><path d="M7.5 5h9v7h-9zm-1 12h11m-8-3v3m6-2h.1"/>',
    search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="m15.5 15.5 5 5"/>',
    library:'<path d="M3 4h4v16H3zm7 0h4v16h-4zm7 0 4 1-1 15-4-1z"/>',
    download:'<path d="M12 2v13m-5-5 5 5 5-5M3 16v5h18v-5"/>',
    art:'<rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8" cy="8" r="1.5"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
    settings:'<path d="M4 6h16M4 12h16M4 18h16"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>',
    favorite:'<path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>'
  };
  const glyph={all:'grid',ps1:'psp',ps2:'ps2',ps3:'ps3',ps4:'ps4',switch:'switch',switch2:'switch2',nds:'nds','3ds':'3ds',gb:'gb',gbc:'gbc',gba:'gba',n64:'n64',snes:'snes',nes:'nes',gc:'gc',genesis:'genesis',xbox:'xbox',x360:'x360',a2600:'a2600',arcade:'arcade'};
  function icon(id){return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes[glyph[id]||id]||shapes.pad}</svg>`}
  function isAndroid(){return /android/i.test(navigator.userAgent||'')||(navigator.platform||'').toLowerCase().includes('android')}
  function emulatorStateFor(system){
    const emus=context?.getState?.().emus||[];
    const emu=emus.find(e=>e.id===system.emulator);
    if(!emu)return{label:'NO EMULATOR',linked:false};
    if(isAndroid())return emu.package||emu.linked?{label:`LINKED ${emu.package||''}`.trim(),linked:true,emu}:{label:'NOT LINKED',linked:false,emu};
    if(emu.installed)return{label:'INSTALLED',linked:true,emu};
    if(emu.exe)return{label:'LINKED',linked:true,emu};
    return{label:'NOT INSTALLED',linked:false,emu};
  }
  function element(tag,cls,text){const n=document.createElement(tag);n.className=cls;if(text!==undefined)n.textContent=text;return n}
  const smooth=()=>document.documentElement.dataset.motion==='reduced'?'instant':'smooth';
  async function toggleFavorite(entry){
    try{const result=await window.api?.toggleFavorite?.(entry.id);if(result&&context?.refresh){favoriteSet=new Set(context.getState().config?.favorites||[]);context.refresh()}}catch(e){console.error('toggleFavorite failed:',e)}
  }
  function button(entry,cls){
    const b=element('button',cls);b.type='button';b.dataset.id=entry.id;b.style.setProperty('--system-color',entry.color||'#ff954e');
    b.setAttribute('aria-pressed',String(entry.id===context.getState().system));
    const emu=entry.id==='all'?null:emulatorStateFor(entry);
    const emuSuffix=isAndroid()&&emu?`, emulator ${emu.label.toLowerCase()}`:'';
    const isFav=favoriteSet.has(entry.id);
    b.setAttribute('aria-label',`${entry.name}, ${entry.count.toLocaleString()} ${entry.count===1?'game':'games'}${emuSuffix}${isFav?' · Favorite':''}`);
    b.title=`${entry.name} · ${entry.count.toLocaleString()} ${entry.count===1?'game':'games'}${emuSuffix?` · ${emu.label}`:''}${isFav?' · ★ Favorite':''}`;
    if(emu)b.dataset.emulator=emu.label.toLowerCase().replace(/\s+/g,'-');
    const mark=element('span','system-glyph');mark.innerHTML=icon(entry.id);const copy=element('span','system-copy');
    const compact=cls==='system-tile';
    copy.append(element('span','system-name',compact?(shortNames[entry.id]||entry.name):entry.name),element('span','n',compact?entry.count.toLocaleString():entry.count?`${entry.count.toLocaleString()} ${entry.count===1?'game':'games'}`:'No games yet'));
    if(isAndroid()&&emu)copy.append(element('span','emu-state',emu.label));
    // Favorite toggle button (visible on desktop, hidden on Android).
    if(!isAndroid()){
      const favBtn=element('button','fav-btn','F');
      favBtn.type='button';favBtn.dataset.fav='true';
      favBtn.innerHTML=`<svg viewBox="0 0 24 24" fill="${isFav?'currentColor':'none'}" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${shapes.favorite}</svg>`;
      favBtn.setAttribute('aria-label',`${isFav?'Remove from':'Add to'} favorites`);
      favBtn.onclick=(e)=>{e.stopPropagation();toggleFavorite(entry)};
      b.appendChild(favBtn);
    }
    b.append(mark,copy);return b;
  }
  function render(){
    const s=context.getState(),counts={};for(const g of s.games)counts[g.system]=(counts[g.system]||0)+1;
    entries=[{id:'all',name:'All games',count:s.games.length,color:'#ffad65'},...s.config.systems.filter(sys=>counts[sys.id]||sys.romDir).map(sys=>({...sys,count:counts[sys.id]||0}))];
    // Update library state from config.
    favoriteSet=new Set(s.config?.favorites||[]);
    recentlyPlayed=s.config?.recentlyPlayed||[];
    sortKey=s.config?.sortKey||'title';
    sortAsc=s.config?.sortAsc!==false;
    document.body.dataset.platform=isAndroid()?'android':'desktop';
    const nav=$('#systems');nav.replaceChildren();for(const e of entries){const b=button(e,'system-tile');b.onclick=()=>context.select(e.id);nav.append(b)}
    // Update filter buttons.
    updateFilterButtons(s.config);
    $('#systemTotal').textContent=`${entries.length-1} systems`;
    $('#systemPickerSummary').textContent=`${s.games.length.toLocaleString()} games · ${entries.length-1} systems`;
    if(pickerOpen())renderPicker();requestAnimationFrame(updateRail);
  }
  function updateFilterButtons(config){
    const favOnly=config?.showFavoritesOnly||false;
    const showRec=config?.showRecentlyPlayed||false;
    const sortBtn=$('#sortButton');
    const favBtn=$('#filterFavorites');
    const recBtn=$('#filterRecentlyPlayed');
    if(favBtn){favBtn.classList.toggle('active',favOnly);favBtn.setAttribute('aria-pressed',String(favOnly));}
    if(recBtn){recBtn.classList.toggle('active',showRec);recBtn.setAttribute('aria-pressed',String(showRec));}
    if(sortBtn){
      const labels={title:'Title',system:'System',favorites:'Favorites',recent:'Recent'};
      sortBtn.textContent=labels[sortKey]||'Title';
    }
  }
  function select(){
    const s=context.getState();
    for(const b of $('#systems').querySelectorAll('button')){const active=b.dataset.id===s.system;b.classList.toggle('active',active);b.setAttribute('aria-pressed',String(active));b.tabIndex=active?0:-1}
    const active=$('#systems button.active');active?.scrollIntoView({inline:'center',block:'nearest',behavior:smooth()});
    $('#clearSearch').classList.toggle('hidden',!$('#search').value);$('.search-shortcut').classList.toggle('hidden',!!$('#search').value);
    const name=entries.find(e=>e.id===s.system)?.name||'All games';
    $('#searchSummary').textContent=s.query?`${s.list.length.toLocaleString()} matches in ${name}`:`${s.list.length.toLocaleString()} games · ${name}`;
    requestAnimationFrame(updateRail);
  }
  function updateRail(){
    const rail=$('#systems');if(!rail)return;const max=rail.scrollWidth-rail.clientWidth;
    $('#systemsPrev').disabled=rail.scrollLeft<2;$('#systemsNext').disabled=max-rail.scrollLeft<2;
    rail.parentElement.classList.toggle('can-scroll-left',rail.scrollLeft>2);rail.parentElement.classList.toggle('can-scroll-right',max-rail.scrollLeft<2);
  }
  function pageRail(direction){$('#systems').scrollBy({left:direction*$('#systems').clientWidth*.72,behavior:smooth()})}
  function pickerOpen(){return !!$('#systemPicker')?.open}
  function renderPicker(){
    const q=$('#systemSearch').value.trim().toLowerCase(),grid=$('#systemPickerGrid');grid.replaceChildren();
    for(const e of entries.filter(e=>(e.name+' '+e.id).toLowerCase().includes(q))){const b=button(e,'system-picker-card');b.onclick=()=>{pickerChosen=true;context.select(e.id);$('#systemPicker').close()};grid.append(b)}
    $('#systemPickerEmpty').classList.toggle('hidden',!!grid.children.length);
  }
  function openPicker(){
    if(pickerOpen())return $('#systemPicker').close();
    if($('#appearancePicker').open)$('#appearancePicker').close();pickerChosen=false;AudioUI.play('open');
    $('#systemSearch').value='';renderPicker();$('#systemPicker').showModal();$('#btnSystemPicker').setAttribute('aria-expanded','true');$('#systemSearch').focus();
  }
  function movePicker(direction){
    const cards=[...$('#systemPickerGrid').querySelectorAll('button')];if(!cards.length)return;
    if(document.activeElement.id==='systemPickerAppearance'){cards[Math.max(0,cards.length-1)].focus();return;}
    const columns=getComputedStyle($('#systemPickerGrid')).gridTemplateColumns.split(' ').length;
    const i=cards.indexOf(document.activeElement),step=direction==='left'?-1:direction==='right'?1:direction==='up'?-columns:columns;
    if(i>=0&&direction==='down'&&i+step>=cards.length){$('#systemPickerAppearance').focus();return;}
    cards[i<0?0:Math.max(0,Math.min(cards.length-1,i+step))].focus();
  }
  function controller(action){
    if(action==='back'||action==='systems')$('#systemPicker').close();
    else if(action==='manual')$('#systemPickerAppearance').click();
    else if(['left','right','up','down'].includes(action))movePicker(action);
    else if(action==='play'||action==='case')(document.activeElement.id==='systemPickerAppearance'?document.activeElement:$('#systemPickerGrid button:focus')||$('#systemPickerGrid button'))?.click();
  }
  function init(options){
    context=options;
    $('.system-browser-icon').innerHTML=icon('grid');$('.search .search-icon').innerHTML=icon('search');$('.system-picker-search .search-icon').innerHTML=icon('search');
    $('.flame').innerHTML=PyroCadeBrand.mark;
    const names={library:'library',emus:'download',artwork:'art',settings:'settings'};
    for(const b of document.querySelectorAll('#tabs button')){const text=b.textContent;b.innerHTML=icon(names[b.dataset.view]);b.append(element('span','',text));if(b.classList.contains('active'))b.setAttribute('aria-current','page')}
    $('#btnSystemPicker').onclick=openPicker;$('#closeSystemPicker').onclick=()=>$('#systemPicker').close();
    $('#systemPickerAppearance').onclick=()=>{$('#systemPicker').close();$('#btnAppearance').click()};
    $('#systemSearch').addEventListener('input',renderPicker);
    $('#systemPicker').addEventListener('close',()=>{$('#btnSystemPicker').setAttribute('aria-expanded','false');$('#btnSystemPicker').focus();if(!pickerChosen)AudioUI.play('back')});
    $('#systemPicker').addEventListener('click',e=>{const r=e.currentTarget.getBoundingClientRect();if(e.target===e.currentTarget&&(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom))e.currentTarget.close()});
    $('#systemPicker').addEventListener('keydown',e=>{
      if(e.key==='Tab'||e.key==='Escape')return;
      if(['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(e.key)&&(!e.target.matches('input')||e.key==='ArrowDown')){e.preventDefault();movePicker(e.key.slice(5).toLowerCase())}
      if(e.key==='Enter'&&e.target.matches('input')){e.preventDefault();$('#systemPickerGrid button')?.click()}
    });
    $('#systemsPrev').onclick=()=>pageRail(-1);$('#systemsNext').onclick=()=>pageRail(1);
    $('#systems').addEventListener('scroll',()=>{if(railFrame!==null)return;railFrame=requestAnimationFrame(()=>{railFrame=null;updateRail()})},{passive:true});
    $('#systems').addEventListener('wheel',e=>{if(e.ctrlKey||$('#systems').scrollWidth<=$('#systems').clientWidth)return;e.preventDefault();$('#systems').scrollLeft+=Math.abs(e.deltaX)>Math.abs(e.deltaY)?e.deltaX:e.deltaY},{passive:false});
    $('#systems').addEventListener('keydown',e=>{
      if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Home','End'].includes(e.key))return;
      e.preventDefault();e.stopPropagation();const buttons=[...$('#systems').querySelectorAll('button')],i=buttons.indexOf(document.activeElement);
      const n=e.key==='Home'?0:e.key==='End'?buttons.length-1:Math.max(0,Math.min(buttons.length-1,i+(['ArrowLeft','ArrowUp'].includes(e.key)?-1:1)));
      buttons[n]?.focus();if(buttons[n])context.select(buttons[n].dataset.id);
    });
    $('#clearSearch').onclick=()=>{$('#search').value='';$('#search').dispatchEvent(new Event('input'));$('#search').focus()};
    // Library state filter buttons.
    const favBtn=$('#filterFavorites');
    if(favBtn)favBtn.onclick=async()=>{
      const s=context.getState();
      const newVal=!s.config?.showFavoritesOnly;
      try{await window.api?.updateLibraryPrefs?.({showFavoritesOnly:newVal});context?.refresh?.()}catch(e){console.error('updateLibraryPrefs failed:',e)}
    };
    const recBtn=$('#filterRecentlyPlayed');
    if(recBtn)recBtn.onclick=async()=>{
      const s=context.getState();
      const newVal=!s.config?.showRecentlyPlayed;
      try{await window.api?.updateLibraryPrefs?.({showRecentlyPlayed:newVal});context?.refresh?.()}catch(e){console.error('updateLibraryPrefs failed:',e)}
    };
    const sortBtn=$('#sortButton');
    if(sortBtn){
      const modes=['title','system','favorites','recent'];
      let idx=modes.indexOf(sortKey);
      sortBtn.onclick=async()=>{
        idx=(idx+1)%modes.length;
        const newKey=modes[idx];
        try{await window.api?.updateLibraryPrefs?.({sortKey:newKey});context?.refresh?.()}catch(e){console.error('updateLibraryPrefs failed:',e)}
      };
    }
    new ResizeObserver(updateRail).observe($('#systems'));
  }
  return {init,render,select,pickerOpen,openPicker,controller,isAndroid,emulatorStateFor};
})();
