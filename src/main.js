const { app, components, BaseWindow, WebContentsView, ipcMain, protocol, net, screen, dialog, session, Menu, clipboard } = require('electron')
const { ElectronChromeExtensions } = require('electron-chrome-extensions')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { pathToFileURL } = require('url')
const put = require('./put'), block = require('./block'), site = require('./site'), { ask, ready } = require('./ai'), hist = require('./history'), bm = require('./bookmarks'), ext = require('./extensions'), chrome = require('./chrome')
protocol.registerSchemesAsPrivileged([{ scheme: 'qat', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
app.commandLine.appendSwitch('process-per-site')
app.commandLine.appendSwitch('renderer-process-limit', '6')
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,BackForwardCache') // site isolation stays on, captchas like cloudflare's fail when their frame shares the page's process
app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess2') // network runs inside the main process, one less process
app.commandLine.appendSwitch('js-flags', '--optimize-for-size') // smaller v8 heaps in every page, ~7% less ram across tabs
app.commandLine.appendSwitch('log-level', '3')
// sign in pages get this, the rest get it cleaned
const NATIVE = app.userAgentFallback
app.userAgentFallback = NATIVE.replace(/ (Electron|qat)\/\S+/gi, '') // some video sites stall ~25s before playing for browsers they don't recognise
app.setAppUserModelId('qat.browser') // own taskbar group, otherwise windows shows electron.exe's icon
process.removeAllListeners('warning')
process.on('warning', w => /Failed to load URL/.test(w.message) || w.name === 'ExtensionLoadWarning' || console.warn(w.name + ': ' + w.message))

const SLEEP_MS = 3 * 60 * 1000
const HOME = 'https://www.google.com'
const tabs = new Map()
const SIDE = 376, BUDGET = Math.max(768, os.totalmem() / 2 ** 20 / 16)
let STRIP = 88, crx, timers = [] // STRIP grows by a row when the bookmarks bar is on
let win, bar, side, quickBusy = false, quiet = false, barH = STRIP, countTimer, activeId = null, nextId = 1, sidebarOpen = false, pw = 0, hot = 0, busy = false

const live = v => v && !v.webContents.isDestroyed()
const send = (ch, ...a) => live(side) && side.webContents.send(ch, ...a)
const ui = () => { const v = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } }); v.webContents.on('will-navigate', e => e.preventDefault()); v.webContents.setWindowOpenHandler(() => ({ action: 'deny' })); return v } // these get window.qat, so they never leave their own page
const keys = wc => wc.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault() })
const toBar = (ch, ...a) => live(bar) && bar.webContents.send(ch, ...a)
const sendTabs = () => !win?.isDestroyed() && (send('ai:tab', { title: active()?.title, url: active()?.url, favicon: active()?.favicon }), toBar('tabs', { activeId, tabs: [...tabs.values()].map(({ id, title, url, favicon, loading, canGoBack, canGoForward, sleeping, view, certErr, q }) => ({ id, title, ai: !!q?.run, url, favicon, loading, canGoBack, canGoForward, sleeping, sec: site.sec(url, certErr), risk: scam ? site.risk(url) : null, starred: bm.has(url), blocked: view ? block.count(view.webContents.id) : 0, shield: block.enabled(url), zoom: view ? Math.round(view.webContents.getZoomFactor() * 100) : 100 })) }))
const active = () => tabs.get(activeId)
const tabOf = wc => [...tabs.values()].find(t => t.view?.webContents === wc)
const SET = () => path.join(app.getPath('userData'), 'settings.json')
const conf = (k, v) => { let s = {}; try { s = JSON.parse(fs.readFileSync(SET(), 'utf8')) } catch {} if (v === undefined) return s[k]; s[k] = v; put(SET(), JSON.stringify(s, null, 2)) }
const web = u => /^(https?|qat|chrome-extension):/i.test(u) // what pages and the assistant may open, no file: or javascript:
let boot = Promise.resolve(), warmed = new Map(), scam = conf('scamCheck') !== false // ai scam check, on unless turned off in settings
// dns + tls done before the click, saves a round trip or three on the actual load
const warm = u => { let o; try { o = new URL(u).origin } catch { return } if (!/^https?:/.test(o) || Date.now() - (warmed.get(o) || 0) < 10000) return; if (warmed.size > 300) warmed.clear(); warmed.set(o, Date.now()); session.defaultSession.preconnect({ url: o, numSockets: 1 }) }

// chrome's layout: loose bookmarks and "Bookmarks bar" folder on the bar, its subfolders as dropdowns, everything else under Other bookmarks
function sendBm() {
  const items = [], folders = new Map(), other = [], it = ({ url, title, icon }) => ({ url, title, icon })
  for (const b of bm.all()) {
    if (!b.folder || b.folder === 'Bookmarks bar') items.push(it(b))
    else if (b.folder.startsWith('Bookmarks bar/')) {
      const n = b.folder.slice(14).split('/')[0]
      if (!folders.has(n)) items.push(folders.set(n, { name: n, items: [] }).get(n))
      folders.get(n).items.push(it(b))
    } else other.push(it(b))
  }
  toBar('bookmarks', { show: conf('bookmarksBar') !== false && bm.all().length > 0, items, other })
}
const sendExts = () => toBar('exts', ext.list().filter(x => x.on).map(({ id, name, icon, pin, popup, options }) => ({ id, name, icon, pin, popup: !!(popup || options) })))

function toUrl(s) {
  s = s.trim()
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(about|data|file|view-source):/i.test(s)) return s
  if (/^(localhost|127\.\d+\.\d+\.\d+|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+|\[::1\])(:\d+)?([/?#]|$)/i.test(s)) return 'http://' + s // dev servers and the router are plain http
  if (!/\s/.test(s) && s.includes('.')) return 'https://' + s
  return 'https://www.google.com/search?q=' + encodeURIComponent(s)
}

function shortcut(input) {
  if (input.type !== 'keyDown') return false
  const c = input.control || input.meta, k = input.key.toLowerCase()
  if (c && !input.shift && !input.alt && k === ' ') active()?.q?.open && live(active().q.view) ? active().q.view.webContents.send('quick:shut') : toggleQuick(true) // closing goes through the page so it can fade out
  else if (c && !input.shift && !input.alt && k === 't') newTab()
  else if (c && k === 'w') closeTab(activeId)
  else if (c && k === 'l') focusOmnibox()
  else if (c && k === 'd') star()
  else if (c && !input.shift && k === 'h') newTab('qat://history')
  else if (c && input.shift && k === 'b') { conf('bookmarksBar', conf('bookmarksBar') === false); sendBm() }
  else if ((c && k === 'r') || k === 'f5') active().view?.webContents.reload()
  else if (c && k === 'tab') cycle(input.shift ? -1 : 1)
  else if (input.alt && k === 'arrowleft') active().view?.webContents.navigationHistory.goBack()
  else if (input.alt && k === 'arrowright') active().view?.webContents.navigationHistory.goForward()
  else if (c && input.shift && k === 'i') active().view?.webContents.toggleDevTools()
  else if (c && (k === '=' || k === '+')) zoom(1)
  else if (c && k === '-') zoom(-1)
  else if (c && k === '0') zoom(0)
  else if (k === 'f11') win.setFullScreen(!win.isFullScreen())
  else return false
  return true
}

const ZOOMS = [.25, .33, .5, .67, .75, .8, .9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5] // chrome's steps
function zoom(d) {
  const wc = active().view?.webContents
  if (!wc) return
  const i = ZOOMS.findIndex(z => z >= wc.getZoomFactor() - .001)
  wc.setZoomFactor(d ? ZOOMS[Math.max(0, Math.min(ZOOMS.length - 1, i + d))] : 1)
  sendTabs()
}

function star() { const t = active(); if (/^https?:/.test(t.url)) { bm.toggle(t.url, t.title, t.favicon); sendTabs(); sendBm() } }

function focusOmnibox() { bar.webContents.focus(); toBar('focus-omnibox') }

function cycle(d) {
  const ids = [...tabs.keys()]
  activate(ids[(ids.indexOf(activeId) + d + ids.length) % ids.length])
}

function attach(tab) {
  const view = tab.view = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'tab-preload.js'), backgroundThrottling: true, spellcheck: false, sandbox: true } })
  const wc = view.webContents
  const sync = () => { tab.url = wc.getURL() || tab.url; tab.loading = wc.isLoading(); tab.canGoBack = wc.navigationHistory.canGoBack(); tab.canGoForward = wc.navigationHistory.canGoForward(); sendTabs() }
  wc.on('page-title-updated', (e, t) => { tab.title = t; hist.title(wc.getURL(), t); sync() })
  wc.on('did-navigate', (e, u) => { hist.visit(u, tab.typed); tab.typed = false })
  wc.on('did-start-navigation', e => { if (e.isMainFrame && !e.isSameDocument) { block.reset(wc.id); tab.favicon = ''; tab.certErr = '' } })
  wc.on('did-fail-load', (e, code, desc, u, main) => { if (main && /^ERR_(CERT|SSL)/.test(desc)) { tab.certErr = desc; sync() } }) // chromium refused the certificate, the page never loaded
  const check = () => scam && !tab.certErr && !wc.isDestroyed() && ready() && site.scan(wc, wc.getURL(), ask, sendTabs)
  wc.on('dom-ready', () => setTimeout(check, 600)) // ads can keep a page loading forever, the text is there by now
  wc.on('did-stop-loading', check)
  wc.on('did-navigate-in-page', (e, u, main) => main && setTimeout(check, 1500)) // youtube and co swap pages without loading, big sites get a verdict per page
  wc.on('page-favicon-updated', (e, f) => { tab.favicon = f[0]; sync(); bm.icon(wc.getURL(), f[0]) && sendBm(); hist.icon(wc.getURL(), f[0]) })
  for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page']) wc.on(ev, sync)
  keys(wc)
  wc.setWindowOpenHandler(({ url }) => { web(url) && newTab(url); return { action: 'deny' } })
  wc.on('input-event', (e, i) => tab === active() && heat(i.type === 'mouseMove' ? 100 : 700))
  wc.on('context-menu', (e, p) => menu(wc, p))
  wc.on('console-message', e => e.message === '__qat:stop' && ai.stop(true)) // the stop pill the agent overlay puts on the page
  crx.addTab(wc, win)
  for (const ev of ['did-stop-loading', 'did-navigate-in-page', 'dom-ready']) wc.on(ev, () => tab === active() && heat(1500))
  wc.on('update-target-url', (e, u) => warm(u)) // hovering a link, it usually gets clicked
  const h = tab.hist
  tab.hist = null
  boot.then(() => !wc.isDestroyed() && (h ? wc.navigationHistory.restore(h) : wc.loadURL(tab.url)).catch(() => {}))
}

let lastFrame, snapAt = 0, snapT = 0
function push(image) {
  if (image.isEmpty() || !live(bar) || bar.webContents.isLoading()) return
  const raw = image.toBitmap()
  if (lastFrame?.equals(raw)) return // most frames are the same, skip the resize, the ipc and the bar's texture upload
  lastFrame = raw
  image = image.resize({ width: Math.round(pw / 2), height: STRIP / 2, quality: 'good' })
  const { width, height } = image.getSize()
  toBar('glass:frame', { width, height, data: image.toBitmap() })
}

// only the 52px strip gets read back, 30fps while the user scrolls or types, 2fps otherwise. uncapped it ate the main thread
function snap() {
  const wc = active()?.view?.webContents
  if (busy || snapT || !wc || win.isMinimized() || !win.isVisible()) return
  const wait = snapAt + 33 - Date.now()
  if (wait > 0) { snapT = setTimeout(() => { snapT = 0; snap() }, wait); return }
  busy = true
  snapAt = Date.now()
  wc.capturePage({ x: 0, y: 0, width: pw, height: STRIP }).then(push, () => {}).finally(() => { busy = false; if (Date.now() < hot) snap() })
}
const heat = ms => { hot = Math.max(hot, Date.now() + ms); snap(); sideSnap() }

// the chat panel's glass is tinted by the half of the page next to it, a 40px wide copy is plenty for that
let sideAt = 0, sideBusy = false
function sideSnap() {
  const wc = active()?.view?.webContents
  if (!sidebarOpen || !side || sideBusy || !wc || win.isMinimized() || Date.now() - sideAt < 700) return
  sideBusy = true
  sideAt = Date.now()
  const h = win.getContentBounds().height - STRIP, x = Math.round(pw / 2)
  wc.capturePage({ x, y: 0, width: pw - x, height: h }).then(img => { img = img.resize({ width: 40, quality: 'good' }); const { width, height } = img.getSize(); send('glass:frame', { width, height, data: img.toBitmap() }) }, () => {}).finally(() => { sideBusy = false })
}

// ctrl+space: the takeover look from agent.js, with an ask box in its bar. each tab has its own, so one can keep working while you use another tab
const qTab = wc => [...tabs.values()].find(t => t.q?.view.webContents === wc)
function toggleQuick(open, tab = active()) {
  if (!tab?.view) return
  const q = tab.q ||= { open: false, run: false }
  q.open = open
  if (open && !q.view) {
    q.view = ui()
    q.view.setBackgroundColor('#00000000')
    keys(q.view.webContents)
    q.view.webContents.loadFile(path.join(__dirname, 'ui', 'quick.html'))
    q.view.webContents.once('did-finish-load', () => q.open && tab === active() && showQuick(tab))
  } else if (open && !q.view.webContents.isLoading() && tab === active()) showQuick(tab)
  clearTimeout(q.free)
  if (!open) q.free = setTimeout(() => { // it forgets the chat after 5 min anyway, so its page can go too
    if (q.open || q.run || tab.q !== q) return
    if (live(q.view)) { win.contentView.removeChildView(q.view); q.view.webContents.close() }
    tab.q = null
  }, 5 * 60000)
  if (tab !== active()) return
  layout()
  if (!open) tab.view.webContents.focus()
}
function showQuick(tab) {
  win.contentView.addChildView(tab.q.view)
  layout()
  quickSnap()
  tab.q.view.webContents.focus()
  tab.q.view.webContents.send('quick:open', { title: tab.title, maxH: Math.round((win.getContentBounds().height - STRIP) * .6) })
}
function quickSnap() {
  const t = active(), q = t?.q, wc = t?.view?.webContents
  if (!q?.open || !live(q.view) || quickBusy || !wc || win.isMinimized()) return
  quickBusy = true
  wc.capturePage().then(img => { img = img.resize({ width: Math.round(pw / 3), quality: 'good' }); const { width, height } = img.getSize(); live(q.view) && q.view.webContents.send('glass:frame', { width, height, data: img.toBitmap() }) }, () => {}).finally(() => { quickBusy = false })
}
// the agent opened or switched tabs, its ask box goes with it. a page that gets pulled off the window stops drawing, so a working tab stays under the one you're on
function moveQuick(from, to) {
  if (!from?.q || from === to) return
  if (to.sleeping) { to.sleeping = false; attach(to) }
  to.q = from.q
  from.q = null
  from.view?.webContents.setBackgroundThrottling(true)
  to.view.webContents.setBackgroundThrottling(!to.q.run)
  const watching = from === active() || to === active()
  if (from !== active() && live(from.view)) win.contentView.removeChildView(from.view)
  if (watching) activate(to.id)
  else { win.contentView.addChildView(to.view, 0); layout(); sendTabs() }
}
const onQuick = (ch, f) => ipcMain.on(ch, (e, v) => { const t = qTab(e.sender); t && f(t, v) })
onQuick('quick:close', t => toggleQuick(false, t))
onQuick('quick:focus', t => t === active() && t.q.open && t.q.view.webContents.focus()) // the agent clicking around leaves focus on the page
onQuick('quick:run', (t, v) => {
  t.q.run = !!v
  t.view?.webContents.setBackgroundThrottling(!v)
  if (!v && t !== active() && live(t.view)) win.contentView.removeChildView(t.view)
  sendTabs()
})
onQuick('quick:move', (t, m) => {
  toggleQuick(false, t)
  if (t !== active()) return
  if (!sidebarOpen) toggleSide()
  side.webContents.isLoading() ? side.webContents.once('did-finish-load', () => send('chat:import', m)) : send('chat:import', m)
})

function purge(tab) {
  const d = tab !== active() && !tab.q?.run && live(tab.view) && tab.view.webContents.debugger
  if (!d || d.isAttached()) return
  try { d.attach() } catch { return }
  d.sendCommand('Memory.simulatePressureNotification', { level: 'critical' }).catch(() => {}).finally(() => d.detach())
}

function layout() {
  const { width, height } = win.getContentBounds()
  pw = width - (sidebarOpen ? SIDE : 0)
  active()?.view?.setBounds({ x: 0, y: STRIP, width: pw, height: height - STRIP })
  bar.setBounds({ x: 0, y: 0, width: pw, height: barH })
  side?.setBounds({ x: pw, y: 0, width: SIDE, height })
  side?.setVisible(sidebarOpen)
  const q = active()?.q, box = { x: 0, y: STRIP, width: pw, height: height - STRIP }
  q?.view?.setBounds(box)
  q?.view?.setVisible(q.open)
  for (const t of tabs.values()) if (t !== active() && t.q?.run) t.view?.setBounds(box)
}

function menu(wc, p) { // chrome's right click basics plus whatever extensions added
  const h = wc.navigationHistory, t = []
  if (p.linkURL) t.push({ label: 'Open link in new tab', click: () => newTab(p.linkURL) }, { label: 'Copy link address', click: () => clipboard.writeText(p.linkURL) }, { type: 'separator' })
  if (p.mediaType === 'image') t.push({ label: 'Open image in new tab', click: () => newTab(p.srcURL) }, { label: 'Copy image', click: () => wc.copyImageAt(p.x, p.y) }, { type: 'separator' })
  if (p.isEditable) t.push({ role: 'undo' }, { role: 'redo' }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' })
  else if (p.selectionText) t.push({ role: 'copy' }, { label: 'Search Google for "' + p.selectionText.trim().slice(0, 30) + '"', click: () => newTab(toUrl(p.selectionText)) })
  else t.push({ label: 'Back', enabled: h.canGoBack(), click: () => h.goBack() }, { label: 'Forward', enabled: h.canGoForward(), click: () => h.goForward() }, { label: 'Reload', click: () => wc.reload() })
  const x = crx.getContextMenuItems(wc, p)
  if (x.length) t.push({ type: 'separator' }, ...x)
  t.push({ type: 'separator' }, { label: 'Inspect', click: () => wc.inspectElement(p.x, p.y) })
  Menu.buildFromTemplate(t).popup()
}

function newTab(url = HOME, bg) {
  const tab = { id: nextId++, title: 'New Tab', url, favicon: '', loading: true, canGoBack: false, canGoForward: false, sleeping: false, lastActive: Date.now() }
  tabs.set(tab.id, tab)
  quiet = bg // the extensions lib selects every tab it's handed, a background one shouldn't steal the window
  attach(tab)
  quiet = false
  if (bg) { crx.selectTab(active().view.webContents); sendTabs() } else activate(tab.id)
  return tab
}

function activate(id) {
  if (!tabs.has(id)) return
  const prev = active()
  if (prev && prev !== tabs.get(id)) {
    if (live(prev.q?.view)) win.contentView.removeChildView(prev.q.view)
    if (prev.view) { prev.q?.run ? win.contentView.addChildView(prev.view, 0) : win.contentView.removeChildView(prev.view); prev.lastActive = Date.now(); setTimeout(() => purge(prev), 30000) }
  }
  activeId = id
  const tab = active()
  tab.lastActive = Date.now()
  if (tab.sleeping) { tab.sleeping = false; attach(tab) }
  win.contentView.addChildView(tab.view)
  win.contentView.addChildView(bar)
  layout()
  heat(1000)
  tab.view.webContents.focus()
  if (tab.q?.open && live(tab.q.view) && !tab.q.view.webContents.isLoading()) showQuick(tab)
  crx.selectTab(tab.view.webContents)
  sendTabs()
}

function closeTab(id) {
  const tab = tabs.get(id)
  if (!tab) return
  const ids = [...tabs.keys()], i = ids.indexOf(id)
  if (live(tab.q?.view)) { win.contentView.removeChildView(tab.q.view); tab.q.view.webContents.close(); tab.q = null }
  if (tab.view) { block.reset(tab.view.webContents.id); win.contentView.removeChildView(tab.view); tab.view.webContents.close(); tab.view = null }
  tabs.delete(id)
  if (!tabs.size) return newTab()
  if (id === activeId) activate([...tabs.keys()][Math.min(i, tabs.size - 1)])
  else sendTabs()
}

function sleep(tab) {
  const h = tab.view.webContents.navigationHistory
  tab.hist = { entries: h.getAllEntries(), index: h.getActiveIndex() } // waking up keeps back/forward and scroll
  tab.sleeping = true
  tab.loading = false
  block.reset(tab.view.webContents.id)
  win.contentView.removeChildView(tab.view)
  tab.view.webContents.close()
  tab.view = null
}

const idle = () => [...tabs.values()].filter(t => t.id !== activeId && !t.sleeping && !t.q?.run && !t.view.webContents.isCurrentlyAudible())

function sleepTabs(all) {
  for (const t of idle()) if (all || Date.now() - t.lastActive > SLEEP_MS) sleep(t)
  sendTabs()
}

function meter() {
  const mb = Math.round(app.getAppMetrics().reduce((s, m) => s + m.memory.privateBytes, 0) / 1024)
  toBar('mem', mb)
  const lru = mb > BUDGET && idle().sort((a, b) => a.lastActive - b.lastActive)[0]
  if (lru) { sleep(lru); sendTabs() }
}

function createWindow() {
  win = new BaseWindow({
    width: 1280, height: 820, minWidth: 720, minHeight: 480, frame: false, icon: path.join(__dirname, 'ui', process.platform === 'win32' ? 'icon.ico' : 'icon.png'), backgroundColor: '#16171a', // acrylic under a playing video flashed white on windows
    ...(process.platform === 'darwin' && { vibrancy: 'under-window', visualEffectState: 'active' }),
  })
  bar = ui()
  bar.setBackgroundColor('#00000000')
  win.contentView.addChildView(bar)
  bar.webContents.loadFile(path.join(__dirname, 'ui', 'bar.html'))
  // extensions load while the toolbar does, only the first page waits on them and widevine (castlabs fetches the cdm on first run)
  boot = Promise.all([ext.start().then(sendExts), components.whenReady().catch(e => console.warn('widevine: ' + e.message))])
  keys(bar.webContents)
  win.on('maximize', () => toBar('maximized', true))
  win.on('unmaximize', () => toBar('maximized', false))
  win.on('resize', layout)
  win.on('closed', () => { // timers and messages already in flight from the bar touched the dead window and threw 'Object has been destroyed'
    timers.forEach(clearInterval)
    clearTimeout(countTimer)
    ipcMain.removeAllListeners()
    app.quit()
  })
  newTab()
}

ipcMain.on('tab:new', (e, url) => newTab(url))
ipcMain.on('tab:close', (e, id) => closeTab(id))
ipcMain.on('tab:activate', (e, id) => activate(id))
ipcMain.on('nav:go', (e, text) => { active().typed = true; active().view.webContents.loadURL(toUrl(text)).catch(() => {}) })
ipcMain.on('bar:height', (e, h) => { barH = Math.max(STRIP, Math.min(h, win.getContentBounds().height)); layout() })
ipcMain.on('shield:toggle', () => { const t = active(); block.toggle(t.url); block.reset(t.view.webContents.id); t.view.webContents.reload(); sendTabs() })
const qatPage = e => !!e.senderFrame?.url.startsWith('qat://')
ipcMain.handle('block:get', e => qatPage(e) ? block.deep() : undefined)
ipcMain.handle('block:set', (e, v) => qatPage(e) ? block.setDeep(v) : undefined)
ipcMain.handle('omni:match', (e, q) => {
  const m = hist.match(q), b = bm.match(q).map(x => ({ url: x.url, title: x.title, star: true }))
  const strip = u => u.replace(/^https?:\/\/(www\.)?/, '')
  if (!m.inline) m.inline = b.map(x => strip(x.url)).find(u => u.startsWith(q.trim().toLowerCase())) || ''
  m.items = [...b, ...m.items.filter(i => !b.some(x => x.url === i.url))].slice(0, 6)
  warm(m.inline ? toUrl(m.inline) : m.items[0]?.url || HOME) // no match means it's probably a search
  return m
})
ipcMain.on('star:toggle', star)
const qh = (ch, f) => ipcMain.handle(ch, (e, ...a) => qatPage(e) ? f(...a) : undefined)
qh('chrome:profiles', () => chrome.profiles())
qh('bm:list', () => bm.all())
qh('hist:list', () => hist.list())
qh('hist:remove', u => hist.remove(u))
qh('hist:clear', () => hist.clear())
qh('bm:remove', (u, f) => { bm.remove(u, f); sendTabs(); sendBm() })
qh('bm:import', d => { const n = bm.add(chrome.bookmarks(d)); sendTabs(); sendBm(); return n })
qh('scam:get', () => scam)
qh('scam:set', v => { scam = !!v; conf('scamCheck', scam); sendTabs(); return scam })
ipcMain.handle('site:info', async e => { const t = active(); return e.sender === bar.webContents && t.view ? { ...await site.info(t.view.webContents, t.url, t.certErr), scam, ai: ready() } : null })
ipcMain.on('site:view', (e, host) => e.sender === bar.webContents && site.view(host))
ipcMain.on('site:rescan', e => { const wc = active()?.view?.webContents; if (e.sender !== bar.webContents || !wc) return; site.forget(wc.getURL()); scam && ready() && site.scan(wc, wc.getURL(), ask, sendTabs) })
qh('ext:list', () => ext.list())
const then = f => async (...a) => { const r = await f(...a); sendExts(); return r }
qh('ext:toggle', then(id => ext.toggle(id)))
qh('ext:remove', then(id => ext.remove(id)))
qh('ext:import', then(d => ext.import(chrome.extensions(d))))
qh('ext:load', then(async () => { const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'], title: 'Pick an unpacked extension folder' }); return r.canceled ? null : ext.add(r.filePaths[0]) }))
const fromBar = f => (e, ...a) => e.sender === bar.webContents && f(...a)
let shutAt = 0, shutId // clicking the icon of an open popup blurs it shut first, that click shouldn't reopen it
ipcMain.on('ext:popup', fromBar((id, r) => (id !== shutId || Date.now() - shutAt > 300) && crx.api.browserAction.activateClick({ extensionId: id, tabId: active().view?.webContents.id ?? -1, anchorRect: r })))
ipcMain.on('ext:pin', fromBar(id => { ext.pin(id); sendExts() }))
ipcMain.on('bar:strip', fromBar(h => { STRIP = h; layout(); heat(500) }))
qh('ext:open', u => /^chrome-extension:\/\//.test(u) && newTab(u))
qh('app:reset', async () => { // wipes everything qat ever saved, then starts fresh
  const s = session.defaultSession, ud = app.getPath('userData')
  for (const x of s.extensions.getAllExtensions()) s.extensions.removeExtension(x.id)
  await s.clearStorageData()
  await s.clearCache()
  for (const f of ['settings.json', 'allow.json', 'history.json', 'bookmarks.json', 'extensions.json', 'adblock.bin', 'adblock-deep.bin', 'adblock-deep2.bin', 'safety.json', 'extensions']) fs.rmSync(path.join(ud, f), { recursive: true, force: true })
  app.relaunch()
  app.exit(0)
})
ipcMain.handle('omni:search', (e, q) => fetch('https://suggestqueries.google.com/complete/search?client=chrome&q=' + encodeURIComponent(q), { signal: AbortSignal.timeout(1500) }).then(r => r.json()).then(j => j[1].slice(0, 5)).catch(() => []))
ipcMain.on('nav:back', () => active().view.webContents.navigationHistory.goBack())
ipcMain.on('nav:forward', () => active().view.webContents.navigationHistory.goForward())
ipcMain.on('nav:reload', () => { const wc = active().view.webContents; wc.isLoading() ? wc.stop() : wc.reload() })
ipcMain.on('side:toggle', () => toggleSide())
function toggleSide() {
  sidebarOpen = !sidebarOpen
  if (!side) { // chat only exists once it's been opened, the window itself has no page
    side = ui()
    side.setBackgroundColor('#00000000')
    keys(side.webContents)
    side.webContents.loadFile(path.join(__dirname, 'ui', 'index.html'))
    side.webContents.once('did-finish-load', () => { send('side', sidebarOpen); sendTabs(); sideAt = 0; sideSnap(); sidebarOpen && side.webContents.focus() })
    win.contentView.addChildView(side)
  }
  layout()
  send('side', sidebarOpen)
  toBar('side', sidebarOpen)
  sideAt = 0
  sideSnap()
  if (sidebarOpen) side.webContents.focus()
}
ipcMain.on('mem:sleep-all', () => sleepTabs(true))
ipcMain.on('menu', (e, a) => ({
  new: () => newTab(), settings: () => newTab('qat://settings'), bookmarks: () => newTab('qat://bookmarks'), history: () => newTab('qat://history'), bmbar: () => { conf('bookmarksBar', conf('bookmarksBar') === false); sendBm() }, extensions: () => newTab('qat://extensions'), sleep: () => sleepTabs(true), dev: () => active().view?.webContents.toggleDevTools(),
  zin: () => zoom(1), zout: () => zoom(-1), full: () => win.setFullScreen(!win.isFullScreen()),
})[a]?.())
ipcMain.on('win:min', () => win.minimize())
ipcMain.on('win:max', () => win.isMaximized() ? win.unmaximize() : win.maximize())
ipcMain.on('win:close', () => win.close())
ipcMain.on('ui:ready', () => { sendTabs(); sendBm(); sendExts() })

const quickTabs = s => { // what a quick ask's agent sees: the tab it was opened on, wherever you are
  const own = () => qTab(s)
  return own() && {
    wc: () => own()?.view?.webContents,
    list: () => [...tabs.values()].map(t => ({ title: t.title, url: t.url, active: t === own() })),
    open: u => { u = toUrl(u); if (!web(u)) throw new Error('Only web pages can be opened'); const o = own(); moveQuick(o, newTab(u, o !== active())) },
    switchTo: i => { const t = [...tabs.values()][i]; if (!t) throw new Error('No tab ' + i); moveQuick(own(), t) },
    close: i => { const t = [...tabs.values()][i]; if (!t) throw new Error('No tab ' + i); closeTab(t.id) },
  }
}
const ai = require('./ai').setup(ipcMain, () => [side?.webContents, ...[...tabs.values()].map(t => t.q?.view?.webContents)], {
  bind: quickTabs,
  wc: () => active()?.view?.webContents,
  list: () => [...tabs.values()].map(t => ({ title: t.title, url: t.url, active: t.id === activeId })),
  open: u => { u = toUrl(u); if (!web(u)) throw new Error('Only web pages can be opened'); newTab(u) },
  switchTo: i => { const t = [...tabs.values()][i]; if (!t) throw new Error('No tab ' + i); activate(t.id) },
  close: i => { const t = [...tabs.values()][i]; if (!t) throw new Error('No tab ' + i); closeTab(t.id) },
})

function qatFile(req) {
  let u, p
  try { u = new URL(req.url); p = decodeURIComponent(u.pathname) } catch { return null }
  const ui = path.join(__dirname, 'ui'), pages = path.join(__dirname, 'pages')
  const shared = p.startsWith('/shared/'), base = shared ? ui : pages
  const f = path.resolve(base, shared ? p.slice(8) : u.hostname + (p === '/' ? '/index.html' : p))
  return f.startsWith(base + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onBeforeSendHeaders({ urls: ['https://accounts.google.com/*', 'https://accounts.youtube.com/*'] }, (d, cb) => cb({ requestHeaders: { ...d.requestHeaders, 'User-Agent': NATIVE } })) // google's sign in turns away chromium posing as chrome, electron saying it's electron gets through. header only, switching the tab's own agent mid load makes chromium reload the page
  protocol.handle('qat', req => { const f = qatFile(req); return f ? net.fetch(pathToFileURL(f).toString()) : new Response('Not found', { status: 404 }) })
  crx = new ElectronChromeExtensions({ // fills in the chrome.* apis electron lacks: tabs, windows, webNavigation, contextMenus, action popups
    createTab: d => { newTab(d.url || HOME); return [active().view.webContents, win] },
    selectTab: wc => { const t = tabOf(wc); t && !quiet && activate(t.id) },
    removeTab: wc => { const t = tabOf(wc); t && closeTab(t.id) },
    createWindow: d => { newTab([d.url].flat()[0] || HOME); return win },
  })
  crx.on('browser-action-popup-created', p => p.browserWindow.once('closed', () => { shutAt = Date.now(); shutId = p.extensionId }))
  block.start(() => countTimer ||= setTimeout(() => { countTimer = null; sendTabs() }, 400))
  createWindow()
  timers = [setInterval(() => sleepTabs(false), 60000), setInterval(meter, 5000), setInterval(snap, 500), setInterval(() => { sideSnap(); quickSnap() }, 1500)]
})
app.on('window-all-closed', () => app.quit())
app.on('will-quit', hist.flush)
