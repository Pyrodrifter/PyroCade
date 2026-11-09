// Isolated fixture: no real ROM folders, downloads, launches, or saved settings.
const {contextBridge, ipcRenderer} = require('electron');
const invoke = channel => (...args) => ipcRenderer.invoke(channel, ...args);
const config = {systems:[
  {id:'ps2',name:'PlayStation 2',caseType:'dvd',media:'disc',color:'#1d3f8f',romDir:'',extensions:['.iso'],emulator:''},
  {id:'gba',name:'Game Boy Advance',caseType:'cartbox',media:'cart',color:'#4b3a9b',romDir:'',extensions:['.gba'],emulator:''}
],emulators:{},customEmulators:[],hideWhilePlaying:true,uiSound:{enabled:false,volume:.25}};
contextBridge.exposeInMainWorld('api',{
  feedbackInfo:()=>invoke('feedback:info')(),
  feedbackCopy:text=>invoke('feedback:copy')(text),
  feedbackOpen:url=>invoke('feedback:open')(url),
  appVersion:async()=>'0.0.0-test',appCheckUpdate:async()=>null,appInstallUpdate:async()=>{},appOpenRelease:async()=>{},onAppUpdateProgress:()=>{},artSources:async()=>({launchbox:{built:0},screenscraper:{user:'',devId:'',hasPassword:false,hasDevPassword:false,ready:false}}),artSetScreenScraper:async()=>({launchbox:{built:0},screenscraper:{user:'',devId:'',ready:false}}),
  getConfig:async()=>config, scan:async()=>[],emuList:async()=>[],onToast:()=>{},onProgress:()=>{},fetchArt:async()=>null,
  setConfig:async c=>Object.assign(config,c),openManual:async()=>{},launch:async()=>{},pickFolder:async()=>null
});
