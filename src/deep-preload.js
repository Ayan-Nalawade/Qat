const { contextBridge } = require('electron')
// youtube ships ads inside the same json as the video, strip them before the player ever reads it
if (/(^|\.)youtube(-nocookie)?\.com$/.test(location.hostname)) contextBridge.executeInMainWorld({ func: () => {
  const KEYS = ['adPlacements', 'adSlots', 'playerAds', 'adBreakHeartbeatParams', 'adBreakParams']
  const prune = o => { if (o && typeof o === 'object') { for (const k of KEYS) delete o[k]; o.playerResponse && prune(o.playerResponse) } return o }
  const parse = JSON.parse
  JSON.parse = function (...a) { return prune(parse.apply(this, a)) }
  const json = Response.prototype.json
  Response.prototype.json = function () { return json.call(this).then(prune) }
  for (const g of ['ytInitialPlayerResponse', 'playerResponse']) { let v; Object.defineProperty(window, g, { configurable: true, get: () => v, set: x => { v = prune(x) } }) }
} })
