// Isolated fixture: no real ROM folders, downloads, launches, or saved settings.
const {contextBridge} = require('electron');
const config = {systems:[
  {id:'ps2',name:'PlayStation 2',caseType:'dvd',media:'disc',color:'#1d3f8f',romDir:'',extensions:['.iso'],emulator:''},
  {id:'gba',name:'Game Boy Advance',caseType:'cartbox',media:'cart',color:'#4b3a9b',romDir:'',extensions:['.gba'],emulator:''}
],emulators:{},customEmulators:[],hideWhilePlaying:true,uiSound:{enabled:false,volume:.25}};
contextBridge.exposeInMainWorld('api',{
  getConfig:async()=>config, scan:async()=>[],emuList:async()=>[],onToast:()=>{},onProgress:()=>{},fetchArt:async()=>null,
  setConfig:async c=>Object.assign(config,c),openManual:async()=>{},launch:async()=>{},pickFolder:async()=>null
});
