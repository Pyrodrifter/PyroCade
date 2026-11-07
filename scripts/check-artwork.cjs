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
    // Upgrades: a sharper copy replaces PyroCade's own small cover (even when the format changes),
    // the window is told to swap it in, and images the user picked themselves are left alone.
    {
      const wide=Buffer.from(png);wide.writeUInt32BE(1000,16);wide.writeUInt32BE(1000,20);
      const updir=path.join(dir,'upgrade');
      const launchbox={find:async()=>['https://lb.test/sharp.png'],available:()=>true,platforms:{snes:'Super Nintendo Entertainment System'}};
      const up=createArtworkService({dataDir:updir,getSystems:()=>systems,getGames:()=>[],normalize,launchbox,
        fetchImpl:async()=>new Response(wide,{headers:{'content-type':'image/png'}}),encodeImage:async bytes=>({bytes,ext:'jpg'})});
      const covers=path.join(updir,'media','snes','covers');await fs.mkdir(covers,{recursive:true});
      const small=path.join(covers,'Upgrade Me (USA).png');await fs.writeFile(small,png);
      const owned=make('Upgrade Me (USA)');owned.media.front=require('node:url').pathToFileURL(small).href;
      const r=await up.downloadGame(owned,['front'],{upgrade:true});
      assert.equal(r.upgraded,1,'small cover was not upgraded');
      assert.equal(r.replace,true,'upgrade must tell the window to replace the old image');
      assert.match(r.media.front,/Upgrade%20Me%20\(USA\)\.jpg\?v=\d+$/,'upgraded cover should point at the new file');
      await assert.rejects(fs.stat(small),'the old small file should be removed');
      const mine=path.join(updir,'media','snes','Mine (USA)');await fs.mkdir(mine,{recursive:true});
      const chosen=path.join(mine,'front.png');await fs.writeFile(chosen,png);
      const user=make('Mine (USA)');user.media.front=require('node:url').pathToFileURL(chosen).href;
      const kept=await up.downloadGame(user,['front'],{upgrade:true});
      assert.equal(kept.upgraded,0,'an image the user chose must never be replaced');
      assert.equal(await fs.readFile(chosen,'base64'),png.toString('base64'));
    }
    // Fallback sources: Super Mario Wiki (raw page text only) and the Internet Archive's box scans.
    // Every reply below is a fixture; nothing here reaches the network.
    {
      const {createMarioWiki,imageUrl}=require('../mariowiki');
      const {createInternetArchive,itemName,systemsOf,frontFiles,indexItem,fitsFront}=require('../internet-archive');
      const key=s=>s.replace(/\([^)]*\)|\[[^\]]*\]/g,'').toLowerCase().replace(/&|\band\b|\bthe\b/g,'').replace(/[^a-z0-9]/g,'');
      const game=(title,system,base=title)=>({id:`${system}:${base}`,title,base,system,media:{}});
      const keys=g=>[key(g.title)];
      // Super Mario Wiki
      const wikiPages={
        'Mario_Kart_DS':'{{game infobox\n|image=[[File:MKDS NA Box Art.png|270px]]\n|platforms=[[Nintendo DS]]\n}}',
        'File:MKDS_NA_Box_Art.png':'{{game-cover}}\n[[Category:Nintendo DS game covers]]\n[[Category:Mario Kart DS images]]',
        'Mario_&_Luigi:_Partners_in_Time':'#REDIRECT [[Mario & Luigi: Partners in Time (game)]]',
        'Mario_&_Luigi:_Partners_in_Time_(game)':'{{game infobox\n|image=[[File:MLPiT Box.jpg|250px]]\n}}',
        'File:MLPiT_Box.jpg':'{{game-cover}}\n[[Category:Nintendo DS game covers]]',
        'Super_Mario_64':'{{game infobox\n|image=[[File:SM64 Box.png|260px]]\n}}',
        'File:SM64_Box.png':'[[Category:Nintendo 64 game covers]]',
        'Mario_Party_DS':'{{game infobox\n|image=[[File:MPDS Box Back.png|250px]]\n}}',
        'File:MPDS_Box_Back.png':'{{game-cover}}\n[[Category:Nintendo DS game covers]]',
        'Mario_Golf':'{{disambig}} [[Mario Golf (Nintendo 64)]]',
      };
      const wikiCalls=[];let open=0,overlap=false;
      const wikiFetch=async url=>{
        open++;if(open>1)overlap=true;wikiCalls.push({url,at:Date.now()});await pause(5);open--;
        const m=url.match(/^https:\/\/www\.mariowiki\.com\/(.+)\?action=raw$/);
        assert(m,'Super Mario Wiki must only be read through ?action=raw (robots.txt shuts out /api.php): '+url);
        const text=wikiPages[decodeURIComponent(m[1])];return text===undefined?new Response('',{status:404}):new Response(text);
      };
      const wikiDir=path.join(dir,'wiki');
      const wiki=createMarioWiki({dataDir:wikiDir,fetchImpl:wikiFetch,gapMs:30});
      assert.deepEqual(await wiki.find(game('Mario Kart DS','nds','Mario Kart DS (USA)'),'nds'),[imageUrl('MKDS NA Box Art.png','https://mario.wiki.gallery')]);
      assert.match(imageUrl('MKDS NA Box Art.png','https://mario.wiki.gallery'),/\/images\/e\/e1\/MKDS_NA_Box_Art\.png$/,'MediaWiki image paths come from the md5 of the file name');
      assert.equal((await wiki.find(game('Mario & Luigi - Partners in Time','nds'),'nds')).length,1,'" - " should also be tried as ": ", and redirects followed');
      assert.deepEqual(await wiki.find(game('Super Mario 64','nds'),'nds'),[],'a cover filed under another system must not match');
      assert.deepEqual(await wiki.find(game('Mario Party DS','nds'),'nds'),[],'a back cover must not count as box art');
      assert.deepEqual(await wiki.find(game('Mario Golf','n64'),'n64'),[],'a page that is not a game has no cover');
      const before=wikiCalls.length;
      assert.deepEqual(await wiki.find(game('Super Mario World','snes','Super Mario World Co-op (Super Mario World modification) (1.0)'),'snes'),[],'ROM hacks never get the original game\'s cover');
      assert.deepEqual(await wiki.find(game('Pokemon Platinum','nds'),'nds'),[],'games the wiki does not cover are not looked up');
      assert.deepEqual(await wiki.find(game('Mario Kart DS','ps2'),'ps2'),[]);
      assert.equal(wikiCalls.length,before,'skipped games must not cost the wiki a request');
      assert(!overlap,'Super Mario Wiki requests must go out one at a time');
      assert(wikiCalls.every((c,i)=>!i||c.at-wikiCalls[i-1].at>=25),'Super Mario Wiki requests must be spaced out');
      wiki.flush();
      const again=createMarioWiki({dataDir:wikiDir,fetchImpl:async()=>{throw new Error('should be cached')},gapMs:0});
      assert.equal((await again.find(game('Mario Kart DS','nds'),'nds')).length,1,'Super Mario Wiki answers must be kept on disk');
      assert.deepEqual(await again.find(game('Super Mario 64','nds'),'nds'),[],'misses are kept on disk too');
      // Internet Archive: reading item titles and files
      assert.equal(itemName('Pokemon - Black Version [TWL-IRBO-USA] (Nintendo DS) - Box Scans (1200DPI)'),'Pokemon - Black Version');
      assert.equal(itemName('Sword of Hope, The (Spain) DMG-SE-ESP 1200dpi 48bit'),'Sword of Hope, The');
      assert.equal(itemName('Golden Sun - Dark Dawn PAL NTR-B05P-EUR 1200dpi 48bit'),'Golden Sun - Dark Dawn');
      assert.equal(itemName('Advance Wars Dual Strike Nintendo Ds box art full cover'),'Advance Wars Dual Strike');
      assert.deepEqual(systemsOf('Invincible Iron Man, The [AGB-AIOE USA] Box Scan',['Nintendo','GameBoy','GameBoy Advance','GBA']),['gba'],'GameBoy Advance items are also tagged GameBoy');
      assert.deepEqual(systemsOf('Pokemon Red [DMG-APAE-USA] (Nintendo Game Boy)',['Game Boy','Game Boy Color']),['gb'],'a serial number settles the system');
      assert.deepEqual(systemsOf('Some Game',['PS2','PS1']).sort(),['ps2']);
      assert.equal(systemsOf('Some Game',['Nintendo DS','PSP']).length,2,'an item naming two systems is ambiguous');
      assert.deepEqual(frontFiles([
        {name:'Mario and Wario - Box Front.jpg',format:'JPEG',size:'6086510'},{name:'Mario and Wario - Box Front.png',format:'PNG',size:'130168702'},
        {name:'Mario and Wario - Cart Front.jpg',format:'JPEG',size:'1131975'},{name:'Mario and Wario - Box Back.jpg',format:'JPEG',size:'5754998'},
        {name:'Mario and Wario - Box Front_thumb.jpg',format:'JPEG Thumb',size:'20000'},{name:'021_GAME_NDS_survey_front.jpg',format:'JPEG',size:'500000'},
        {name:'Pokemon - Platinum Version - Box.jpg',format:'JPEG',size:'6404024'},{name:'000_thumbnail.jpg',format:'JPEG',size:'910703'},
        {name:'scans/001 SLES-03633-Front.jpg',format:'JPEG',size:'6444678'},{name:'FrontCover.png',format:'PNG',size:'900000'},
      ]),['Mario and Wario - Box Front.jpg','scans/001 SLES-03633-Front.jpg','FrontCover.png'],'only files named as the front cover count; wraps, cartridge fronts, thumbnails and huge files do not');
      for(const [title,subject] of [
        ['Tomb Raider: Prophecy, The [5001656] Merchandise Offer',['GameBoy Advance','Insert','Merchandise Offer']],
        ['Rhythm Heaven DS for display only cover art',['Nintendo DS']],['Wii Music display cover art',['Wii','for display only']],
        ['2 Games in 1 (Sonic Pinball Party + Sonic Battle) [AGB-BW6P NOE] Box Scan',['GameBoy Advance']],
        ['Spider-Man 2 - Enter - Electro - Manual (Europe) (Es,It) SLES-03623-PL 800dpi 48bit',['PS1','Manual']],
        ['Mario Kart DS (Not for Resale) (Canada) [NTR-AMCE-USA] (Nintendo DS) - Cover, Media, Insert Scans (1200 DPI)',['Nintendo DS']],
      ])assert.equal(indexItem({identifier:'x',title,subject},key),null,'must not be indexed: '+title);
      assert(indexItem({identifier:'x',title:'Castlevania Portrait Of Ruin [NTR-ACBE-USA] (Nintendo DS) - Box, Manual, Cart Scans (1200DPI)',subject:['Nintendo DS']},key),'a box scan that also has the manual still counts');
      // Internet Archive: the whole lookup, from the collection list to a download address
      const docs=[
        {identifier:'mario-and-wario-sfc',title:'Mario & Wario [SHVC-WE] (Nintendo Super Famicom) - Box, Manual, Cart Scans (1200DPI)',subject:['Super Famicom','SNES','Box']},
        {identifier:'pokemon-platinum-nds',title:'Pokemon - Platinum Version [NTR-CPUE-USA] (Nintendo DS) - Box Scans (1200DPI)',subject:['Nintendo DS']},
        {identifier:'pokemon-black-nds',title:'Pokemon - Black Version [TWL-IRBO-USA] (Nintendo DS) - Cover Scans',subject:['Nintendo DS']},
        {identifier:'millipede-eur',title:'Millipede, Super Breakout & Lunar Lander [AGB-BMLP EUR] Box Scan',subject:['GameBoy','GameBoy Advance']},
        {identifier:'millipede-usa',title:'Millipede, Super Breakout & Lunar Lander [AGB-BMLE USA] Box Scan',subject:['GameBoy','GameBoy Advance']},
        {identifier:'tetris-gb',title:'Tetris [DMG-TRA-USA] (Nintendo Game Boy) - Box Scans',subject:['Game Boy']},
        {identifier:'cartoon-network-flat',title:'Cartoon Network Collection [AGB-MCME USA] Box Scan',subject:['GameBoy','GameBoy Advance']},
        {identifier:'heartgold-nfr',title:'Pokemon - HeartGold Version [NTR-IPKE-USA] (Nintendo DS) - Box Scans (1200DPI)',subject:['Nintendo DS']},
      ];
      const itemFiles={
        'mario-and-wario-sfc':[{name:'Mario and Wario - Box Front.jpg',format:'JPEG',size:'6086510'},{name:'Mario and Wario - Cart Front.jpg',format:'JPEG',size:'1131975'}],
        'pokemon-platinum-nds':[{name:'Pokemon - Platinum Version - Box.jpg',format:'JPEG',size:'6404024'}],
        'pokemon-black-nds':[{name:'Pokemon Black Front Cover.jpg',format:'JPEG',size:'4000000'}],
        'millipede-eur':[{name:'Box Front.jpg',format:'JPEG',size:'4000000'}],'millipede-usa':[{name:'Box Front.jpg',format:'JPEG',size:'4000000'}],
        'tetris-gb':[{name:'Box Front.jpg',format:'JPEG',size:'4000000'}],
        'cartoon-network-flat':[{name:'1.5 Box Front.jpg',format:'JPEG',size:'4406595'}],
        'heartgold-nfr':[{name:'Pokemon - HeartGold Version - Box Front.jpg',format:'JPEG',size:'6000000'}],
      };
      // Scan sizes from the IIIF service. The two last ones are real: in this collection "Box Front" can be
      // the whole box scanned flat with its flaps (0.57 wide for a square box), or a full wrap (2.41).
      const scanSizes={'mario-and-wario-sfc/Mario and Wario - Box Front.jpg':[4140,3000],'pokemon-black-nds/Pokemon Black Front Cover.jpg':[4450,5000],
        'millipede-eur/Box Front.jpg':[3000,3000],'millipede-usa/Box Front.jpg':[2950,3010],'tetris-gb/Box Front.jpg':[3000,3000],
        'cartoon-network-flat/1.5 Box Front.jpg':[3020,5327],'heartgold-nfr/Pokemon - HeartGold Version - Box Front.jpg':[6504,2698]};
      const iaCalls=[];
      const iaFetch=async url=>{
        iaCalls.push(url);
        if(url.startsWith('https://archive.org/advancedsearch.php?')) {
          const q=new URL(url).searchParams;
          assert.equal(q.get('q'),'collection:softwareboxart');assert.equal(q.get('output'),'json');
          return Response.json({response:{numFound:docs.length,docs}});
        }
        const info=url.match(/^https:\/\/iiif\.archive\.org\/image\/iiif\/3\/([^/]+)\/info\.json$/);
        if(info){const size=scanSizes[decodeURIComponent(info[1])];return size?Response.json({width:size[0],height:size[1]}):new Response('',{status:404})}
        const m=url.match(/^https:\/\/archive\.org\/metadata\/([^/]+)\/files$/);
        if(m&&itemFiles[decodeURIComponent(m[1])])return Response.json({result:itemFiles[decodeURIComponent(m[1])]});
        return new Response('',{status:404});
      };
      const iaDir=path.join(dir,'archive');
      const ia=createInternetArchive({dataDir:iaDir,normalize:key,fetchImpl:iaFetch,gapMs:0});
      const mw=game('Mario & Wario','snes','Mario & Wario (Japan)');
      assert.deepEqual(await ia.find(mw,'snes',keys(mw)),['https://iiif.archive.org/image/iiif/3/mario-and-wario-sfc%2FMario%20and%20Wario%20-%20Box%20Front.jpg/full/!1600,1600/0/default.jpg']);
      assert.deepEqual(await ia.find(game('Mario & Wario','gba'),'gba',['mariowario']),[],'a scan of another system\'s box must not match');
      assert.deepEqual(await ia.find(game('Pokemon Platinum','nds'),'nds',['pokemonplatinum']),[],'a full wrap (front, spine and back) is not a front cover');
      assert.equal((await ia.find(game('Pokemon Black','nds'),'nds',['pokemonblack'])).length,1,'"Pokemon Black" is "Pokemon - Black Version"');
      const mil=game('Millipede, Super Breakout & Lunar Lander','gba','Millipede, Super Breakout & Lunar Lander (USA)');
      assert.match((await ia.find(mil,'gba',keys(mil)))[0],/millipede-usa/,'the game\'s own region comes first');
      assert.deepEqual(await ia.find(game('Tetris','gb','Tetris (Demo) (USA)'),'gb',['tetris']),[],'demos never get the retail cover');
      assert.deepEqual(await ia.find(game('Cartoon Network Collection','gba','Cartoon Network Collection (U)'),'gba',['cartoonnetworkcollection']),[],'a box scanned flat with its flaps is not a front cover, whatever the file is called');
      assert.deepEqual(await ia.find(game('Pokemon HeartGold','nds'),'nds',['pokemonheartgold']),[],'a full wrap named "Box Front" is not a front cover');
      assert(fitsFront('ps1',2953,3015)&&fitsFront('snes',4140,3000)&&fitsFront('snes',2160,3000)&&!fitsFront('snes',3137,6735)&&!fitsFront('arcade',1000,1000),'box front shapes');
      assert.equal(iaCalls.filter(u=>u.includes('advancedsearch')).length,1,'the collection list is fetched once');
      ia.flush();
      const iaAgain=createInternetArchive({dataDir:iaDir,normalize:key,fetchImpl:async()=>{throw new Error('should be cached')},gapMs:0});
      assert.equal((await iaAgain.find(mw,'snes',keys(mw))).length,1,'the collection list and file lists must be kept on disk');
      // In the artwork pipeline: last in line, front covers only, and never in place of a cover an earlier source has.
      const order=[];
      const stubWiki={covers:()=>true,find:async()=>{order.push('mariowiki');return []}};
      const stubArchive={covers:()=>true,find:async g=>{order.push('archive');return g.title==='Found Late'?['https://archive.org/download/x/Box%20Front.jpg']:[]}};
      const lb={find:async(sys,k)=>{order.push('launchbox');return k.includes(key('Found Early'))?['https://lb.test/early.png']:[]},available:()=>true,platforms:{snes:'Super Nintendo Entertainment System'}};
      const fbCalls=[];
      const fallbackService=createArtworkService({dataDir:path.join(dir,'fallback'),getSystems:()=>systems,getGames:()=>[],normalize,launchbox:lb,mariowiki:stubWiki,internetArchive:stubArchive,
        fetchImpl:async url=>{fbCalls.push(url);return url.endsWith('/')?new Response(''):new Response(png,{headers:{'content-type':'image/png'}})}});
      const early=await fallbackService.downloadGame(game('Found Early','snes','Found Early (USA)'),['front']);
      assert.equal(early.downloaded,1);assert.deepEqual(order,['launchbox'],'a cover from an existing source wins; the fallbacks are not asked');
      order.length=0;
      const late=await fallbackService.downloadGame(game('Found Late','snes','Found Late (USA)'),['front','screenshot']);
      assert.equal(late.downloaded,1);assert.equal(late.missing,1);assert(late.media.front,'the archive cover is saved');
      assert.deepEqual(order.filter(s=>s!=='launchbox'),['mariowiki','archive'],'fallbacks run after the existing sources, wiki first, and for the front cover only');
      assert(fbCalls.some(u=>u.includes('Named_Boxarts')),'Libretro is still asked before the fallbacks');
    }
    console.log('Passed: Super Mario Wiki and Internet Archive fallbacks (title + system matching, front covers only, hacks and demos skipped, spaced requests, disk cache, source order), sharper-cover upgrades (window refresh, user images kept), missing screenshots with cached covers, custom-art preservation, exact-region matching, independent title art, refreshed matches, invalid-image handling, path validation, shared requests, cancellation, resume, unsupported systems and progress updates.');
  } finally {
    // Only remove the unique test directory inside the OS temp directory.
    assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));
    assert(path.basename(dir).startsWith('pyrocade-artwork-test-'));
    await fs.rm(dir,{recursive:true,force:true});
  }
})().catch(e=>{console.error(e);process.exitCode=1});
