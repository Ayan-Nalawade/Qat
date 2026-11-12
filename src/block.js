const { app, session, webContents, utilityProcess } = require('electron')
const { ElectronBlocker, fullLists } = require('@ghostery/adblocker-electron')
const fs = require('fs')
const path = require('path')

const dir = () => app.getPath('userData')
const host = u => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
const conf = () => { try { return JSON.parse(fs.readFileSync(path.join(dir(), 'settings.json'), 'utf8')) } catch { return {} } }
const DNS = 'https://raw.githubusercontent.com/hagezi/dns-blocklists/main/adblock/pro.txt' // ~220k ad, tracker and telemetry hosts that easylist skips
const counts = new Map()
let allow = new Set(), onCount = () => {}, blocker, deepId
try { allow = new Set(JSON.parse(fs.readFileSync(path.join(dir(), 'allow.json'), 'utf8'))) } catch {}

const pageOf = id => { const wc = id && webContents.fromId(id); return wc ? host(wc.getURL()) : '' }
const on = id => !allow.has(pageOf(id))

async function load(deep) {
  const bin = path.join(dir(), deep ? 'adblock-deep2.bin' : 'adblock.bin')
  try { if (Date.now() - fs.statSync(bin).mtimeMs > 7 * 864e5) fs.unlinkSync(bin) } catch {} // refresh lists weekly
  if (deep && !fs.existsSync(bin)) await new Promise((ok, no) => { const w = utilityProcess.fork(path.join(__dirname, 'lists-worker.js')); w.once('message', m => m ? no(new Error(m)) : ok()); w.once('exit', () => no(new Error('Could not build filter lists'))); w.postMessage({ bin, lists: [...fullLists, DNS] }) })
  const b = deep ? ElectronBlocker.deserialize(await fs.promises.readFile(bin)) : await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, { path: bin, read: fs.promises.readFile, write: fs.promises.writeFile })
  const req = b.onBeforeRequest, css = b.onInjectCosmeticFilters // count unique urls, some pages retry one blocked url thousands of times
  b.onBeforeRequest = (d, cb) => on(d.webContentsId) ? req(d, r => { if ((r.cancel || r.redirectURL) && d.webContentsId) { const c = counts.get(d.webContentsId) || counts.set(d.webContentsId, new Set()).get(d.webContentsId); c.size !== c.add(d.url).size && onCount() } cb(r) }) : cb({})
  b.onInjectCosmeticFilters = (e, ...a) => { // ghostery doesn't await these, a page that breaks a scriptlet would spam unhandled rejections
    const w = e.sender
    return on(w.id) ? css({ frameId: e.frameId, processId: e.processId, sender: { insertCSS: (...x) => w.insertCSS(...x).catch(() => {}), executeJavaScript: (...x) => w.executeJavaScript(...x).catch(() => {}) } }, ...a) : undefined
  }
  const s = session.defaultSession
  blocker?.disableBlockingInSession(s)
  b.enableBlockingInSession(s)
  blocker = b
  if (deep && !deepId) deepId = s.registerPreloadScript({ type: 'frame', filePath: path.join(__dirname, 'deep-preload.js') })
  if (!deep && deepId) { s.unregisterPreloadScript(deepId); deepId = null }
}

module.exports = {
  start: cb => { onCount = cb; load(!!conf().deepScan).catch(e => console.warn('adblock: ' + e.message)) },
  deep: () => !!conf().deepScan,
  async setDeep(v) {
    const s = conf()
    s.deepScan = !!v
    fs.writeFileSync(path.join(dir(), 'settings.json'), JSON.stringify(s, null, 2))
    await load(s.deepScan)
    return s.deepScan
  },
  count: id => counts.get(id)?.size || 0,
  reset: id => counts.delete(id),
  enabled: url => !allow.has(host(url)),
  toggle(url) {
    const h = host(url)
    allow.has(h) ? allow.delete(h) : allow.add(h)
    fs.writeFileSync(path.join(dir(), 'allow.json'), JSON.stringify([...allow]))
  },
}
