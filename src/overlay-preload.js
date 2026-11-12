const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('overlay', { on: (fn) => ipcRenderer.on('overlay', (_e, v) => fn(v)) });
