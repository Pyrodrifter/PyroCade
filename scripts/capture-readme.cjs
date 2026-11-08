// Recreates the README screenshots in docs/media from the demo shelf: npm run docs:screens
const {app, BrowserWindow} = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = path.resolve(__dirname, '..');
// PYROCADE_SCREENS_DIR writes somewhere else (e.g. to keep screenshots taken from a real library).
const out = process.env.PYROCADE_SCREENS_DIR || path.join(root, 'docs', 'media');
app.setPath('sessionData', path.join(os.tmpdir(), 'PyroCade-readme-' + process.pid));

app.whenReady().then(async () => {
  const win = new BrowserWindow({show:false, width:1600, height:900, webPreferences:{preload:path.join(__dirname, 'readme-preload.cjs'),
    sandbox:false, contextIsolation:true, offscreen:true, backgroundThrottling:false}});
  win.setContentSize(1600, 900);
  const js = code => win.webContents.executeJavaScript(`(async()=>{const pause=ms=>new Promise(r=>setTimeout(r,ms));${code}})()`);
  async function snap(name) {
    win.webContents.invalidate(); await new Promise(r => setTimeout(r, 250));
    const image = (await win.webContents.capturePage()).resize({width:1600});
    fs.writeFileSync(path.join(out, name), image.toJPEG(86)); console.log('saved', name);
  }
  try {
    fs.mkdirSync(out, {recursive:true});
    await win.loadFile(path.join(root, 'renderer', 'index.html'));
    await js(`for(let i=0;i<100&&!S.list.length;i++)await pause(50);document.querySelector('#demoBanner')?.classList.add('hidden');`);
    const library = async (layout, theme, index, file, wait = 1800) => {
      await js(`showView('library');setSystem('all');Appearance.apply({layout:'${layout}',theme:'${theme}'},false);select(${index});await pause(${wait});`);
      await snap(file);
    };
    await library('carousel', 'ember', 1, 'screen-carousel.jpg');
    // Bookshelf looks best full: repeat the demo games to fill the shelf.
    await js(`window.__demo=S.games;S.games=[0,1,2,3].flatMap(k=>window.__demo.map(g=>({...g,id:g.id+'#'+k,media:{...g.media},info:{...g.info}})));setSystem('all');await pause(300);`);
    await library('bookshelf', 'glacier', 20, 'screen-bookshelf.jpg');
    await js(`S.games=window.__demo;setSystem('all');await pause(300);`);
    await library('page-turn', 'violet', 5, 'screen-page-turn.jpg');
    await js(`Appearance.apply({layout:'carousel',theme:'ember'},false);select(1);await pause(900);await openCase();await pause(2300);CV.ry=26;rig();await pause(300);`);
    await snap('screen-case.jpg');
    await js(`closeCase();await pause(700);launchFx(S.list.find(g=>sysOf(g.system).media==='cart'));await pause(2700);`);
    await snap('screen-launch.jpg');
    await js(`document.querySelector('.launch-fx')?.remove();showView('emus');await pause(900);`);
    await snap('screen-emulators.jpg');
    app.exit(0);
  } catch (e) { console.error(e); app.exit(1); }
});
