const { app, session, webContents } = require('electron')
const { ElectronBlocker } = require('@ghostery/adblocker-electron')
const fs = require('fs')
const path = require('path')

const dir = () => app.getPath('userData')
const host = u => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return '' } }
const counts = new Map()
let allow = new Set(), onCount = () => {}
try { allow = new Set(JSON.parse(fs.readFileSync(path.join(dir(), 'allow.json'), 'utf8'))) } catch {}

const pageOf = id => { const wc = id && webContents.fromId(id); return wc ? host(wc.getURL()) : '' }
const on = id => !allow.has(pageOf(id))

async function start() {
  const bin = path.join(dir(), 'adblock.bin')
  try { if (Date.now() - fs.statSync(bin).mtimeMs > 7 * 864e5) fs.unlinkSync(bin) } catch {} // refresh lists weekly
  const b = await ElectronBlocker.fromPrebuiltAdsAndTracking(fetch, { path: bin, read: fs.promises.readFile, write: fs.promises.writeFile })
  const req = b.onBeforeRequest, css = b.onInjectCosmeticFilters // count unique urls, some pages retry one blocked url thousands of times
  b.onBeforeRequest = (d, cb) => on(d.webContentsId) ? req(d, r => { if ((r.cancel || r.redirectURL) && d.webContentsId) { const c = counts.get(d.webContentsId) || counts.set(d.webContentsId, new Set()).get(d.webContentsId); c.size !== c.add(d.url).size && onCount() } cb(r) }) : cb({})
  b.onInjectCosmeticFilters = (e, ...a) => on(e.sender.id) ? css(e, ...a) : undefined
  b.enableBlockingInSession(session.defaultSession)
}

module.exports = {
  start: cb => { onCount = cb; start().catch(e => console.warn('adblock: ' + e.message)) },
  count: id => counts.get(id)?.size || 0,
  reset: id => counts.delete(id),
  enabled: url => !allow.has(host(url)),
  toggle(url) {
    const h = host(url)
    allow.has(h) ? allow.delete(h) : allow.add(h)
    fs.writeFileSync(path.join(dir(), 'allow.json'), JSON.stringify([...allow]))
  },
}
