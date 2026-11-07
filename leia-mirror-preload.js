const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('leiaMirror',{ready:(epoch,size)=>ipcRenderer.send('leia:mirrorReady',epoch,size),report:stats=>ipcRenderer.send('leia:mirrorStats',stats),onSnapshot:callback=>ipcRenderer.on('leia:mirror',(_,snapshot)=>callback(snapshot))});
