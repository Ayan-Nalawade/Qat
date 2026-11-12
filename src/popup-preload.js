const { ipcRenderer } = require('electron')
// electron's chrome.tabs calls the focused view the active tab, which is this popup, so active queries get pointed at the page tab
const id = ipcRenderer.sendSync('ext:tab'), q = chrome.tabs.query.bind(chrome.tabs)
chrome.tabs.query = (info = {}, cb) => {
  if (!info.active) return q(info, cb)
  const { active, currentWindow, lastFocusedWindow, ...rest } = info
  const p = new Promise(r => q(rest, t => r(t.filter(x => x.id === id).map(x => ({ ...x, active: true })))))
  return cb ? void p.then(cb) : p
}
