const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {createArtworkService}=require('../artwork');
const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1cAAAAASUVORK5CYII=','base64');
const normalize=s=>s.replace(/\([^)]*\)/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const pause=ms=>new Promise(r=>setTimeout(r,ms));
async function until(test){for(let i=0;i<300;i++){if(test())return;await pause(10)}throw new Error('Timed out waiting for artwork job')}
(async()=>{
  const dir=await fs.mkdtemp(path.join(os.tmpdir(),'pyrocade-artwork-test-'));
  try {
    const systems=[{id:'snes',name:'SNES',libretro:'Nintendo - Super Nintendo'},{id:'switch',name:'Switch'}];
    const make=(base,system='snes')=>({id:`${system}:${base}`,title:base,base,system,media:{}});
    const calls=[];let mode='normal',extra=false;
    async function fake(url,{signal}={}) {
      calls.push(url);const decoded=decodeURIComponent(url);
      if(decoded.endsWith('/')) {
        const names=decoded.includes('Named_Titles')?['Title Only (USA).png']:['Example (USA).png','Example (Europe).png','Slow (USA).png','Bad (USA).png','Shared (USA).png',...(extra?['Missing (USA).png']:[])];
        return new Response(names.map(n=>`<a href="${encodeURIComponent(n)}">${n}</a>`).join(''));
      }
      if(mode==='slow'&&decoded.includes('Slow'))await new Promise((resolve,reject)=>{
        const timer=setTimeout(resolve,1000);
        signal.addEventListener('abort',()=>{clearTimeout(timer);reject(new DOMException('Cancelled','AbortError'))},{once:true});
      });
      if(decoded.includes('Bad'))return new Response('<html>not an image</html>');
      return new Response(png,{headers:{'content-type':'image/png'}});
    }
    let games=[make('Example (Europe)')];const events=[];
    const service=createArtworkService({dataDir:dir,getSystems:()=>systems,getGames:()=>games,normalize,fetchImpl:fake,onProgress:p=>events.push(p)});
    const cover=path.join(dir,'media/snes/covers/Example (Europe).png');await fs.mkdir(path.dirname(cover),{recursive:true});await fs.writeFile(cover,png);
    const result=await service.downloadGame(games[0],['front','screenshot']);
    assert.equal(result.existing,1);assert.equal(result.downloaded,1);
    assert(calls.some(u=>decodeURIComponent(u).endsWith('Named_Snaps/Example (Europe).png')),'Must prefer the exact region');
    assert(!calls.some(u=>u.includes('Named_Boxarts')),'Existing cover should not block or be re-downloaded with missing screenshot');
    const custom=make('Example (USA)');custom.media.front='file:///custom/hand-picked.png';
    const preserved=await service.downloadGame(custom,['front']);assert.equal(preserved.existing,1);assert.equal(preserved.media.front,custom.media.front);
    const title=await service.downloadGame(make('Title Only (USA)'),['title']);assert.equal(title.downloaded,1,'Title art must work independently of box covers');
    const missing=make('Missing (USA)');assert.equal((await service.downloadGame(missing,['front'])).missing,1);
    extra=true;
    const retry=await service.downloadGame(missing,['front'],{retryMissing:true,refreshed:new Set()});assert.equal(retry.downloaded,1,'Explicit refresh should find newly available art');
    const bad=await service.downloadGame(make('Bad (USA)'),['front']);assert.equal(bad.errors.length,1);
    await assert.rejects(fs.stat(path.join(dir,'media/snes/covers/Bad (USA).png')),{code:'ENOENT'});
    const unsafe=await service.downloadGame(make('../outside'),['front']);assert.equal(unsafe.errors.length,1);
    const shared=make('Shared (USA)');await Promise.all([service.downloadGame(shared,['front']),service.downloadGame(shared,['front'])]);
    assert.equal(calls.filter(u=>decodeURIComponent(u).endsWith('/Named_Boxarts/Shared (USA).png')).length,1,'Concurrent requests should share one download');
    assert.throws(()=>service.start({scope:'library',types:[]}),/artwork type/);
    assert.throws(()=>service.start({scope:'game',gameId:'unknown',types:['front']}),/No games/);
    games=[make('Example (Europe)'),make('Slow (USA)'),make('Unsupported','switch')];mode='slow';
    service.start({scope:'library',types:['front','screenshot']});
    await until(()=>service.status().completed>=1);
    assert.throws(()=>service.start({scope:'library',types:['front']}),/already running/);
    service.cancel();await until(()=>service.status().status==='cancelled');
    assert(service.status().completed<3,'Cancellation must stop pending work');
    mode='normal';service.start({scope:'library',types:['front','screenshot']});await until(()=>service.status().status==='complete');
    const done=service.status();assert.equal(done.total,3);assert.equal(done.completed,3);assert.equal(done.unsupported,1);assert(done.existing>=2);assert(done.downloaded>=1);
    assert(events.some(e=>e.item?.media.screenshot),'Progress should carry fresh artwork to the frontend');
    let outages=0;const offlineGames=Array.from({length:20},(_,i)=>make('Offline '+i));
    const offline=createArtworkService({dataDir:path.join(dir,'offline'),getSystems:()=>systems,getGames:()=>offlineGames,normalize,fetchImpl:async()=>{outages++;return new Response('offline',{status:503})}});
    offline.start({scope:'library',types:['front','screenshot']});await until(()=>offline.status().status==='complete');
    assert.equal(offline.status().errors,20);assert(outages<=2,'A failed system index must not be requested for every game');
    const switchCalls=[];
    const switchGame=make('Mario Kart 8 Deluxe 3.0.1 [0100152000022000]','switch');switchGame.title='Mario Kart 8 Deluxe 3.0.1';
    const switchService=createArtworkService({dataDir:path.join(dir,'switch-provider'),getSystems:()=>[{id:'switch',name:'Switch',artworkProvider:'gametdb-switch'}],getGames:()=>[switchGame],normalize,fetchImpl:async url=>{
      switchCalls.push(url);
      if(url.includes('switchtdb.txt'))return new Response('TITLES = GameTDB\nAABPA = Mario Kart 8 Deluxe\n');
      if(url.includes('/US/'))return new Response('',{status:404});
      return new Response(png);
    }});
    const switchResult=await switchService.downloadGame(switchGame,['front','disc','back','screenshot']);
    assert.equal(switchResult.downloaded,3);assert.equal(switchResult.missing,1);assert.equal(switchResult.unsupported,false);
    assert(switchCalls.some(u=>u.includes('/cover/EN/AABPA.jpg')),'Switch cover must use a GameTDB product code and region fallback');
    assert(switchCalls.some(u=>u.includes('/label/EN/AABPA.png')),'Switch label must be available for the cartridge');
    assert(!switchCalls.some(u=>u.includes('Named_Snaps')),'Switch must not query Libretro');
    assert.equal(switchCalls.filter(u=>u.includes('switchtdb.txt')).length,1,'Switch types must share the metadata request');
    // D07: Rust fallback contract (static check of the Tauri host; the unit tests in artwork.rs
    // cover the matching logic without network). The legacy JS above has no fallback.
    {
      const rust=await fs.readFile(path.join(__dirname,'../src-tauri/src/artwork.rs'),'utf8');
      for(const needle of [
        'mariowiki_covers','archive_covers','fetch_mariowiki_image','fetch_internet_archive_image',
        'slow down','410','429','503','WEB_CACHE_AGE_SECS','30 * 86400','Duration::from_secs(20)',
        'trusted_release','without_version','region_of','fits_front','infobox_images','is_front_cover',
        'item_name','systems_of','front_files','softwareboxart','?action=raw','Category','Nintendo DS game covers',
      ]) assert(rust.includes(needle),`Rust fallback missing ${needle}`);
      // Front covers only, after the existing providers: fallback gated on kind == "front".
      assert(rust.includes('kind == "front"'),'Fallback must be gated on front covers only');
      // Polite 1/s: two per-site gates.
      assert((rust.match(/PoliteSite::/g)||[]).length>=2,'Polite per-site gates missing');
      const ui=await fs.readFile(path.join(__dirname,'../renderer/artwork-ui.js'),'utf8');
      assert(ui.includes('Super Mario Wiki'),'Artwork UI must name Super Mario Wiki');
      assert(ui.includes('Internet Archive'),'Artwork UI must name Internet Archive');
      assert(ui.includes('never replacing an existing cover'),'Artwork UI must state front-cover fallback policy');
    }
    // M04a: LaunchBox/ScreenScraper providers through the Rust artwork service (same static style as D07).
    {
      const rust=await fs.readFile(path.join(__dirname,'../src-tauri/src/artwork.rs'),'utf8');
      for(const needle of [
        'launchbox_platform','launchbox_covers','fetch_launchbox_image','parse_launchbox_metadata',
        'launchbox_index_file','build_launchbox_index','load_launchbox_index','download_launchbox_zip',
        'LAUNCHBOX_METADATA','LAUNCHBOX_IMAGES','LAUNCHBOX_INDEX_VERSION','LAUNCHBOX_KEEP',
        'Metadata.xml','launchbox-index.json','Box - Front','launchbox_front_rank','launchbox_file_ok',
        'screenscraper_system','screenscraper_covers','screenscraper_configured','screenscraper_credentials',
        'fetch_screenscraper_image','screenscraper_medias','screenscraper_json','screenscraper_lookup_url',
        'SCREENSCRAPER_API','jeuInfos.php','romtaille','crc32_update','box-2D','screenscraper_media_url',
        'PoliteSite::ScreenScraper','PoliteSite::LaunchBox','allow_index_download',
      ]) assert(rust.includes(needle),`Rust provider missing ${needle}`);
      // Front covers only, after Libretro/GameTDB: same gate as the D07 providers.
      assert(rust.includes('launchbox_covers(&system_id)'),'LaunchBox must join the front-cover fallback gate');
      assert(rust.includes('screenscraper_covers(&system_id, config)'),'ScreenScraper must join the front-cover fallback gate');
      // ScreenScraper never runs without all four credentials (user, devId, password, devPassword).
      assert(rust.includes('credentials.dev_password.is_empty()'),'ScreenScraper must require credentials');
      const backend=await fs.readFile(path.join(__dirname,'../src-tauri/src/backend.rs'),'utf8');
      // ScreenScraper passwords must never cross the bridge to the renderer.
      assert(backend.includes('object.remove("screenscraper")'),'Backend must strip ScreenScraper credentials from get_config');
      assert(backend.includes('cfg["screenscraper"] = section.clone()'),'Backend must preserve ScreenScraper credentials on set_config');
    }
    console.log('Passed: missing screenshots with cached covers, custom-art preservation, exact-region matching, independent title art, refreshed matches, invalid-image handling, path validation, shared requests, cancellation, resume, unsupported systems and progress updates.');
  } finally {
    // Only remove the unique test directory inside the OS temp directory.
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    assert(path.basename(dir).startsWith('pyrocade-artwork-test-'));
    await fs.rm(dir,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1});
