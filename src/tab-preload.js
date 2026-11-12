const { contextBridge, ipcRenderer } = require('electron')
const call = ch => (...a) => ipcRenderer.invoke(ch, ...a)
if (location.protocol === 'qat:') contextBridge.exposeInMainWorld('qat', { ai: { settings: call('ai:settings'), save: call('ai:save'), models: call('ai:models'), pick: call('ai:pick') }, block: { get: call('block:get'), set: call('block:set') }, scam: { get: call('scam:get'), set: call('scam:set') },
  profiles: call('chrome:profiles'), reset: call('app:reset'),
  hist: { list: call('hist:list'), remove: call('hist:remove'), clear: call('hist:clear') },
  bm: { list: call('bm:list'), remove: call('bm:remove'), import: call('bm:import') },
  ext: { list: call('ext:list'), toggle: call('ext:toggle'), remove: call('ext:remove'), import: call('ext:import'), load: call('ext:load'), open: call('ext:open') },
})
