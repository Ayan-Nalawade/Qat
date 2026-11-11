const { contextBridge, ipcRenderer } = require('electron')
const call = ch => (...a) => ipcRenderer.invoke(ch, ...a)
if (location.protocol === 'qat:') contextBridge.exposeInMainWorld('qat', { ai: { settings: call('ai:settings'), save: call('ai:save'), models: call('ai:models'), pick: call('ai:pick') } })
