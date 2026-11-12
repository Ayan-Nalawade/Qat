const { contextBridge, ipcRenderer } = require('electron')
const call = ch => (...a) => ipcRenderer.invoke(ch, ...a)
if (location.protocol === 'qat:') contextBridge.exposeInMainWorld('qat', { ai: { settings: call('ai:settings'), save: call('ai:save'), models: call('ai:models'), pick: call('ai:pick') }, block: { get: call('block:get'), set: call('block:set') },
  profiles: call('chrome:profiles'), reset: call('app:reset'),
  bm: { list: call('bm:list'), remove: call('bm:remove'), import: call('bm:import') },
  ext: { list: call('ext:list'), toggle: call('ext:toggle'), remove: call('ext:remove'), import: call('ext:import'), load: call('ext:load'), open: call('ext:open') },
})
