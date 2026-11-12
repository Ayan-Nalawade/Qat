const { contextBridge, ipcRenderer } = require('electron')
const send = ch => (...a) => ipcRenderer.send(ch, ...a)
contextBridge.exposeInMainWorld('qat', {
  newTab: send('tab:new'), closeTab: send('tab:close'), activateTab: send('tab:activate'),
  go: send('nav:go'), back: send('nav:back'), forward: send('nav:forward'), reload: send('nav:reload'),
  toggleSide: send('side:toggle'), shield: send('shield:toggle'), star: send('star:toggle'), strip: send('bar:strip'), extOpen: send('ext:popup'), extPin: send('ext:pin'), menu: send('menu'), barHeight: send('bar:height'),
  match: q => ipcRenderer.invoke('omni:match', q), search: q => ipcRenderer.invoke('omni:search', q), sleepAll: send('mem:sleep-all'), ready: send('ui:ready'),
  minimize: send('win:min'), maximize: send('win:max'), close: send('win:close'),
  ai: { settings: () => ipcRenderer.invoke('ai:settings'), save: o => ipcRenderer.invoke('ai:save', o), models: id => ipcRenderer.invoke('ai:models', id), pick: o => ipcRenderer.invoke('ai:pick', o), chat: (rid, messages, agent, quick) => ipcRenderer.send('ai:chat', { rid, messages, agent, quick }), stop: rid => ipcRenderer.send('ai:stop', rid), pdf: b => ipcRenderer.invoke('ai:pdf', b) },
  quick: { close: send('quick:close'), move: send('quick:move'), size: send('quick:size'), run: send('quick:run') },
  on: (ch, cb) => ipcRenderer.on(ch, (e, ...a) => cb(...a)),
})
