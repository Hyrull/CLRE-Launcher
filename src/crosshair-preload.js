const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('crosshair', { on: (fn) => ipcRenderer.on('crosshair', (_e, v) => fn(v)) });
