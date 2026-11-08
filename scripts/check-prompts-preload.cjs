// Isolated fixture: no real ROM folders, downloads, launches, or saved settings.
const {contextBridge,ipcRenderer} = require('electron');
const feedbackCall = async (channel, ...args) => {
  const result = await ipcRenderer.invoke(channel, ...args);
  if (!result.ok) throw new Error(result.error);
  return result.value;
};
const config = {systems:[
  {id:'ps2',name:'PlayStation 2',caseType:'dvd',media:'disc',color:'#1d3f8f',romDir:'',extensions:['.iso'],emulator:''},
  {id:'gba',name:'Game Boy Advance',caseType:'cartbox',media:'cart',color:'#4b3a9b',romDir:'',extensions:['.gba'],emulator:''}
],emulators:{},customEmulators:[],hideWhilePlaying:true,uiSound:{enabled:false,volume:.25}};
contextBridge.exposeInMainWorld('api',{
  feedbackInfo:()=>feedbackCall('feedback:info'),feedbackOpen:report=>feedbackCall('feedback:open',report),feedbackCopy:report=>feedbackCall('feedback:copy',report),
  appVersion:async()=>'0.0.0-test',appCheckUpdate:async()=>null,appInstallUpdate:async()=>{},appOpenRelease:async()=>{},onAppUpdateProgress:()=>{},artSources:async()=>({launchbox:{built:0},screenscraper:{user:'',devId:'',hasPassword:false,hasDevPassword:false,ready:false}}),artSetScreenScraper:async()=>({launchbox:{built:0},screenscraper:{user:'',devId:'',ready:false}}),
  getConfig:async()=>config, scan:async()=>[],emuList:async()=>[],onToast:()=>{},onProgress:()=>{},fetchArt:async()=>null,
  setConfig:async c=>Object.assign(config,c),openManual:async()=>{},launch:async()=>{},pickFolder:async()=>null
});
