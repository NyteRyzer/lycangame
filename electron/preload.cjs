// Minimal bridge: the game page can ask the desktop app to quit.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('lycanNative', {
  quit: () => ipcRenderer.send('lycan:quit'),
  platform: process.platform,
});
