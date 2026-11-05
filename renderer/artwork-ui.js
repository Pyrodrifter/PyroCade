// Artwork tab: explicit downloads, progress, and incremental library updates.
const ArtworkUI = (()=>{
  let job=null,gameId=null,pending=false,systemInitialized=false,importPending=false,coverage='';
  const q=s=>document.querySelector(s);
  const escape=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  let context,sources=null;
  // Systems the LaunchBox and ScreenScraper sources know (kept in step with launchbox.js / screenscraper.js).
  const LAUNCHBOX=new Set(['ps1','ps2','ps3','ps4','psp','switch','switch2','wiiu','wii','gc','n64','snes','nes','3ds','nds','gba','gbc','gb','dreamcast','genesis','xbox','x360','a2600','arcade']);
  const SCREENSCRAPER=new Set(['genesis','nes','snes','gb','gbc','gba','gc','n64','nds','wii','3ds','wiiu','dreamcast','a2600','xbox','x360','ps1','ps2','ps3','psp','arcade','switch']);
  function chosenGames() {
    const games=context.getGames().filter(g=>!g.demo);
    const scope=q('#artScope').value;
    return games.filter(g=>scope==='library'||(scope==='game'?g.id===gameId:g.system===q('#artSystem').value));
  }
  function options() {
    if(!context)return;
    const scope=q('#artScope').value;
    q('#artSystem').classList.toggle('hidden',scope!=='system');q('#artSystemLabel').classList.toggle('hidden',scope!=='system');
    const games=chosenGames(),systems=context.getSystems();
    const supports=s=>!!(s&&(s.libretro||s.artworkProvider==='gametdb-switch'||LAUNCHBOX.has(s.id)||(sources?.screenscraper?.ready&&SCREENSCRAPER.has(s.id))));
    const unavailable=games.filter(g=>!supports(systems.find(s=>s.id===g.system))).length;
    const covered=games.length-unavailable;
    for(const input of document.querySelectorAll('#artTypes input')) {
      input.disabled=!covered;
      if(!covered&&games.length)input.checked=false; // with nothing loaded yet, keep the user's choices
      input.closest('label').classList.toggle('art-type-unavailable',!covered);
    }
    const nextCoverage=covered?'any':'none';
    if(nextCoverage!==coverage&&covered&&!q('#artTypes input:checked'))q('#artTypes input[value=front]').checked=true;
    coverage=nextCoverage;
    const selected=context.getGames().find(g=>g.id===gameId);
    q('#artImportGame').textContent=selected&&!selected.demo?`${selected.title} · ${systems.find(s=>s.id===selected.system)?.name||selected.system}`:'Select a game in Library, then use its Artwork button.';
    q('#artImport').disabled=importPending||!selected||selected.demo;q('#artImportKind').disabled=importPending||!selected||selected.demo;
    q('#artVersions').disabled=importPending||!selected||selected.demo||q('#artImportKind').value==='manual';
    q('#artImport').textContent=importPending?'Applying…':q('#artImportKind').value==='manual'?'Choose PDF…':'Your own image…';
    q('#artFindManuals').disabled=importPending;
    q('#artSourceLabel').textContent='Sources · LaunchBox, ScreenScraper, GameTDB, Libretro';
    q('#artSourceDetails').textContent='Each image comes from the first source that has it, in this order. Availability varies by game.';
    q('#artScopeSummary').textContent=(scope==='game'?(selected&&!selected.demo?selected.title:'Select a game in your library first.'):`${games.length.toLocaleString()} games`)+(unavailable?` · ${unavailable.toLocaleString()} skipped: no artwork source for ${[...new Set(games.filter(g=>!supports(systems.find(s=>s.id===g.system))).map(g=>systems.find(s=>s.id===g.system)?.name||g.system))].join(', ')}. Use “Use your own image” instead.`:'');
    const busy=pending||['running','cancelling'].includes(job?.status);
    q('#artStart').disabled=busy||!games.length||!q('#artTypes input:checked')||unavailable===games.length;
    q('#artScope').disabled=busy;q('#artSystem').disabled=busy;q('#artTypes').disabled=busy;q('#artRetry').disabled=busy;q('#artUpgrade').disabled=busy;
    q('#artCancel').classList.toggle('hidden',!['running','cancelling'].includes(job?.status));
    q('#artCancel').disabled=job?.status==='cancelling';
    q('#artCancel').textContent=job?.status==='cancelling'?'Cancelling…':'Cancel download';
    q('#artStart').textContent=busy?'Downloading…':'Download artwork';
  }
  function error(message='') {q('#artError').textContent=message;q('#artError').classList.toggle('hidden',!message)}
  function accept(next) {
    if(!next)return;
    if(job&&next.id!==job.id&&next.startedAt<job.startedAt)return;
    if(next.id===job?.id&&next.seq<job.seq)return;
    const finished=job?.status==='running'&&next.status!=='running'&&next.status!=='cancelling';
    job=next;
    if(finished)loadSources();
    if(next.item)context.updateGame(next.item);
    render();
  }
  function render() {
    if(!job){options();return}
    const running=['running','cancelling'].includes(job.status);
    const names={running:'Downloading',cancelling:'Cancelling',cancelled:'Cancelled',complete:'Complete',failed:'Failed'};
    q('#artJobTitle').textContent=running?'Finding artwork for your collection':job.status==='complete'?'Your artwork is ready':job.status==='cancelled'?'Download stopped':'Download needs attention';
    q('#artJobState').textContent=names[job.status]||job.status;q('#artJobState').dataset.status=job.status;
    q('#artCurrent').textContent=running?job.lastTitle:job.status==='cancelled'?'Finished downloads are kept. Start again to fill the remaining gaps.':job.status==='failed'?job.error:job.errors?'Some games could not be downloaded. You can run this selection again to retry.':'New artwork is available in your library. Games without a match keep their existing or generated artwork.';
    q('#artProgress').max=job.total||1;q('#artProgress').value=job.completed;
    q('#artCount').textContent=`${job.completed.toLocaleString()} / ${job.total.toLocaleString()} games checked`;
    q('#artPercent').textContent=`${Math.round(job.completed/(job.total||1)*100)}%`;
    for(const [id,value]of [['artDownloaded',job.downloaded],['artKept',job.existing],['artMissing',job.missing],['artErrors',job.errors]])q('#'+id).textContent=value.toLocaleString();
    q('#artUnsupported').textContent=`${job.unsupported.toLocaleString()} ${job.unsupported===1?'game':'games'} skipped because this source does not cover their system.`;
    q('#artUnsupported').classList.toggle('hidden',!job.unsupported);
    q('#artActivity').innerHTML=(job.entries||[]).map(r=>{
      const summary=r.unsupported?'No source for this system':[r.upgraded?`${r.upgraded} sharpened`:'',r.downloaded-(r.upgraded||0)?`${r.downloaded-(r.upgraded||0)} downloaded`:'',r.existing?`${r.existing} kept`:'',r.missing?`${r.missing} unavailable`:'',r.errors.length?'Download error':''].filter(Boolean).join(' · ');
      return `<li><span>${escape(r.title)}</span><small ${r.errors.length?'class="art-error"':''}>${escape(summary)}${r.errors.length?`<span class="art-error-detail">${escape(r.errors[0])}</span>`:''}</small></li>`;
    }).join('');
    options();
  }
  function open(scope='game') {
    const selected=context.getSelected();
    if(gameId!==(selected?.id||null))q('#artImportStatus').textContent='';
    gameId=selected?.id||null;
    const previous=q('#artSystem').value;
    q('#artSystem').replaceChildren();
    const games=context.getGames();
    context.getSystems().filter(s=>games.some(g=>g.system===s.id&&!g.demo)).forEach(s=>{
      const option=document.createElement('option');option.value=s.id;option.textContent=s.name;q('#artSystem').append(option);
    });
    q('#artSystem').value=systemInitialized&&previous?previous:selected?.system;
    if(!q('#artSystem').value&&q('#artSystem').options.length)q('#artSystem').selectedIndex=0;
    systemInitialized=true;
    if(!['running','cancelling'].includes(job?.status))q('#artScope').value=scope;
    options();
  }
  function showSources() {
    if(!sources)return;
    const built=sources.launchbox.built;
    q('#artLaunchBoxState').textContent=built?`Database ready · updated ${new Date(built).toLocaleDateString()}`:'The database (about 100 MB) downloads with your first artwork download.';
    const ss=sources.screenscraper;
    q('#artScreenScraperState').textContent=ss.ready?`Signed in as ${ss.user}`:ss.user||ss.devId?'Login incomplete: all four fields are needed.':'Not set up';
    q('#ssUser').value=ss.user||'';q('#ssDevId').value=ss.devId||'';
    q('#ssPassword').placeholder=ss.hasPassword?'Saved (leave empty to keep)':'';
    q('#ssDevPassword').placeholder=ss.hasDevPassword?'Saved (leave empty to keep)':'';
    q('#ssClear').disabled=!(ss.user||ss.devId||ss.hasPassword||ss.hasDevPassword);
  }
  async function loadSources() {if(!api.artSources)return;try{sources=await api.artSources();showSources();options()}catch(e){error(e.message)}}
  async function saveLogin(details) {
    q('#ssSave').disabled=true;q('#ssStatus').textContent='';
    try {
      sources=await api.artSetScreenScraper(details);
      q('#ssPassword').value='';q('#ssDevPassword').value='';
      q('#ssStatus').textContent=details.clear?'Login removed.':'Login saved. It is used on your next artwork download.';
      showSources();options();
    } catch(e){q('#ssStatus').textContent=e.message} finally {q('#ssSave').disabled=false}
  }
  function init(deps) {
    context=deps;
    for(const id of ['artScope','artSystem','artTypes'])q('#'+id).addEventListener('change',options);
    q('#artStart').onclick=async()=>{
      error();pending=true;options();
      try {accept(await api.artStart({scope:q('#artScope').value,systemId:q('#artSystem').value,gameId,types:[...document.querySelectorAll('#artTypes input:checked')].map(i=>i.value),retryMissing:q('#artRetry').checked,upgrade:q('#artUpgrade').checked}))}
      catch(e){error(e.message)}finally{pending=false;options()}
    };
    q('#artCancel').onclick=async()=>{try{accept(await api.artCancel())}catch(e){error(e.message)}};
    q('#artOpenFolder').onclick=async()=>{try{const message=await api.artOpenFolder();if(message)error(message)}catch(e){error(e.message)}};
    q('#artImportKind').addEventListener('change',()=>{q('#artVersionGrid').classList.add('hidden');q('#artVersionGrid').replaceChildren();options()});
    q('#artFindManuals').onclick=async()=>{
      error();importPending=true;options();q('#artImportStatus').textContent='Looking for manuals…';
      try {
        const r=await api.artFindManuals();
        if(!r){q('#artImportStatus').textContent='';return}
        for(const m of r.matched)context.updateGame(m);
        q('#artImportStatus').textContent=`Found ${r.found.toLocaleString()} PDF${r.found===1?'':'s'}; ${r.matched.length.toLocaleString()} matched to games that had no manual yet.`;
      } catch(e){q('#artImportStatus').textContent='';error(e.message)} finally{importPending=false;options()}
    };
    q('#artVersions').onclick=async()=>{
      error();const grid=q('#artVersionGrid'),kind=q('#artImportKind').value;
      importPending=true;options();q('#artImportStatus').textContent='Looking up other versions… (the first time can take a minute)';
      try {
        const found=await api.artCandidates({gameId,kind});
        grid.replaceChildren();
        for(const [i,c] of found.entries()) {
          const b=document.createElement('button');b.type='button';b.setAttribute('role','option');
          const img=document.createElement('img');img.src=c.preview;img.alt=`Version ${i+1}`;
          const size=document.createElement('span');size.textContent=`${c.width} × ${c.height}`;
          b.append(img,size);
          b.onclick=async()=>{
            importPending=true;options();
            try {const result=await api.artChoose({token:c.token});context.updateGame(result);grid.classList.add('hidden');q('#artImportStatus').textContent='Version applied. You can see it in Library and the case viewer.'}
            catch(e){error(e.message)} finally{importPending=false;options()}
          };
          grid.append(b);
        }
        grid.classList.toggle('hidden',!found.length);
        q('#artImportStatus').textContent=found.length?`${found.length} version${found.length===1?'':'s'} found. Pick one to use it.`:'No other versions found for this game.';
        grid.querySelector('button')?.focus();
      } catch(e){q('#artImportStatus').textContent='';error(e.message)} finally{importPending=false;options()}
    };
    q('#artImport').onclick=async()=>{
      error();importPending=true;options();
      try {
        const result=await api.artImport({gameId,kind:q('#artImportKind').value});
        if(result){context.updateGame(result);q('#artImportStatus').textContent=result.media.manual?'Manual added. Open it with the Manual button in Library.':'Image applied. You can see it in Library and the case viewer.';}
      }catch(e){error(e.message)}finally{importPending=false;options()}
    };
    q('#ssSave').onclick=()=>saveLogin({user:q('#ssUser').value,password:q('#ssPassword').value,devId:q('#ssDevId').value,devPassword:q('#ssDevPassword').value});
    q('#ssClear').onclick=()=>saveLogin({clear:true});
    loadSources();
    api.onArtProgress?.(accept);
    api.artStatus?.().then(accept).catch(e=>error(e.message));
  }
  return {init,open};
})();
