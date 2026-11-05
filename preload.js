const { contextBridge, ipcRenderer } = require('electron');

const call = async (ch, ...args) => {
  const r = await ipcRenderer.invoke(ch, ...args);
  if (!r.ok) throw new Error(r.error);
  return r.value;
};

contextBridge.exposeInMainWorld('api', {
  getConfig: () => call('config:get'),
  setConfig: cfg => call('config:set', cfg),
  scan: () => call('library:scan'),
  launch: id => call('game:launch', id),
  fetchArt: (sys, base, options) => call('art:fetch', sys, base, options),
  artStart: options => call('art:start', options),
  artStatus: () => call('art:status'),
  artCancel: () => call('art:cancel'),
  artOpenFolder: () => call('art:openFolder'),
  artImport: options => call('art:import', options),
  artSources: () => call('art:sources'),
  artCandidates: options => call('art:candidates', options),
  artFindManuals: () => call('art:findManuals'),
  artChoose: options => call('art:choose', options),
  artSetScreenScraper: details => call('art:setScreenScraper', details),
  onArtProgress: fn => ipcRenderer.on('art:progress', (_e, p) => fn(p)),
  onArtMedia: fn => ipcRenderer.on('art:media', (_e, p) => fn(p)),
  onLibraryInfo: fn => ipcRenderer.on('library:info', (_e, p) => fn(p)),
  emuList: () => call('emu:list'),
  emuCheck: id => call('emu:check', id),
  emuInstall: id => call('emu:install', id),
  emuUninstall: id => call('emu:uninstall', id),
  emuOpenFolder: id => call('emu:openFolder', id),
  emuPickExe: id => call('emu:pickExe', id),
  emuAddCustom: opts => call('emu:addCustom', opts),
  emuSetSource: opts => call('emu:setSource', opts),
  emuTestSource: opts => call('emu:testSource', opts),
  emuAddRepo: opts => call('emu:addRepo', opts),
  emuRemove: id => call('emu:remove', id),
  pickFolder: title => call('dialog:folder', title),
  openManual: p => call('manual:open', p),
  onProgress: fn => ipcRenderer.on('emu:progress', (_e, p) => fn(p)),
  onToast: fn => ipcRenderer.on('toast', (_e, m) => fn(m)),
  appVersion: () => call('app:version'),
  appCheckUpdate: () => call('app:checkUpdate'),
  appInstallUpdate: () => call('app:installUpdate'),
  appOpenRelease: url => call('app:openRelease', url),
  onAppUpdateProgress: fn => ipcRenderer.on('app:updateProgress', (_e, p) => fn(p)),
});
