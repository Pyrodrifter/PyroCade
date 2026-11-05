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
  launch: (id, rom) => call('game:launch', id, rom),
  fetchArt: (sys, base, options) => call('art:fetch', sys, base, options),
  artStart: options => call('art:start', options),
  artStatus: () => call('art:status'),
  artCancel: () => call('art:cancel'),
  artOpenFolder: () => call('art:openFolder'),
  artImport: options => call('art:import', options),
  onArtProgress: fn => ipcRenderer.on('art:progress', (_e, p) => fn(p)),
  emuList: () => call('emu:list'),
  emuCheck: id => call('emu:check', id),
  emuInstall: id => call('emu:install', id),
  emuUninstall: id => call('emu:uninstall', id),
  emuOpenFolder: id => call('emu:openFolder', id),
  emuPickExe: id => call('emu:pickExe', id),
  emuAddCustom: opts => call('emu:addCustom', opts),
  pickFolder: title => call('dialog:folder', title),
  openManual: p => call('manual:open', p),
  onProgress: fn => ipcRenderer.on('emu:progress', (_e, p) => fn(p)),
  onToast: fn => ipcRenderer.on('toast', (_e, m) => fn(m)),
});
