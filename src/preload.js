const { contextBridge, ipcRenderer } = require('electron')
const send = ch => (...a) => ipcRenderer.send(ch, ...a)
contextBridge.exposeInMainWorld('qat', {
  newTab: send('tab:new'), closeTab: send('tab:close'), activateTab: send('tab:activate'),
  go: send('nav:go'), back: send('nav:back'), forward: send('nav:forward'), reload: send('nav:reload'),
  viewportRect: send('viewport:rect'), sleepAll: send('mem:sleep-all'), devtools: send('devtools'), ready: send('ui:ready'),
  minimize: send('win:min'), maximize: send('win:max'), close: send('win:close'),
  on: (ch, cb) => ipcRenderer.on(ch, (e, ...a) => cb(...a)),
})
