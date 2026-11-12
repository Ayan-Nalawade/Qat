const { app, components, BaseWindow, WebContentsView, ipcMain, protocol, net, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const os = require('os')
const { pathToFileURL } = require('url')
const block = require('./block'), hist = require('./history')
protocol.registerSchemesAsPrivileged([{ scheme: 'qat', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
app.commandLine.appendSwitch('process-per-site')
app.commandLine.appendSwitch('renderer-process-limit', '6')
app.commandLine.appendSwitch('disable-site-isolation-trials') // cross-site iframes share the parent's process, ad heavy pages spawned 25+ processes
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,BackForwardCache,IsolateOrigins,site-per-process')
app.commandLine.appendSwitch('enable-features', 'NetworkServiceInProcess2') // network runs inside the main process, one less process
app.commandLine.appendSwitch('log-level', '3')
app.userAgentFallback = app.userAgentFallback.replace(/ (Electron|qat)\/\S+/gi, '') // youtube stalls ~25s before playing for browsers it doesn't recognise
process.removeAllListeners('warning')
process.on('warning', w => /Failed to load URL/.test(w.message) || console.warn(w.name + ': ' + w.message))

const SLEEP_MS = 3 * 60 * 1000
const HOME = 'https://www.google.com'
const tabs = new Map()
const STRIP = 52, SIDE = 376, BUDGET = Math.max(768, os.totalmem() / 2 ** 20 / 16)
let win, bar, side, barH = 52, countTimer, activeId = null, nextId = 1, sidebarOpen = false, pw = 0, hot = 0, busy = false

const send = (ch, ...a) => side?.webContents.send(ch, ...a)
const ui = () => new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } })
const keys = wc => wc.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault() })
const toBar = (ch, ...a) => bar.webContents.send(ch, ...a)
const sendTabs = () => toBar('tabs', { activeId, tabs: [...tabs.values()].map(({ id, title, url, favicon, loading, canGoBack, canGoForward, sleeping, view }) => ({ id, title, url, favicon, loading, canGoBack, canGoForward, sleeping, blocked: view ? block.count(view.webContents.id) : 0, shield: block.enabled(url) })) })
const active = () => tabs.get(activeId)

function toUrl(s) {
  s = s.trim()
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^(about|data|file|view-source):/i.test(s)) return s
  if (/^localhost(:\d+)?([/?#]|$)/i.test(s) || (!/\s/.test(s) && s.includes('.'))) return 'https://' + s
  return 'https://www.google.com/search?q=' + encodeURIComponent(s)
}

function shortcut(input) {
  if (input.type !== 'keyDown') return false
  const c = input.control || input.meta, k = input.key.toLowerCase()
  if (c && !input.shift && !input.alt && k === 't') newTab()
  else if (c && k === 'w') closeTab(activeId)
  else if (c && k === 'l') focusOmnibox()
  else if ((c && k === 'r') || k === 'f5') active().view?.webContents.reload()
  else if (c && k === 'tab') cycle(input.shift ? -1 : 1)
  else if (input.alt && k === 'arrowleft') active().view?.webContents.navigationHistory.goBack()
  else if (input.alt && k === 'arrowright') active().view?.webContents.navigationHistory.goForward()
  else if (c && input.shift && k === 'i') active().view?.webContents.toggleDevTools()
  else return false
  return true
}

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
  wc.on('did-start-navigation', e => { if (e.isMainFrame && !e.isSameDocument) { block.reset(wc.id); tab.favicon = '' } }) // pages without a favicon would keep the last site's
  wc.on('page-favicon-updated', (e, f) => { tab.favicon = f[0]; sync() })
  for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page']) wc.on(ev, sync)
  keys(wc)
  wc.setWindowOpenHandler(({ url }) => { newTab(url); return { action: 'deny' } })
  wc.on('input-event', (e, i) => tab === active() && heat(i.type === 'mouseMove' ? 100 : 700))
  for (const ev of ['did-stop-loading', 'did-navigate-in-page', 'dom-ready']) wc.on(ev, () => tab === active() && heat(1500))
  if (tab.hist) wc.navigationHistory.restore(tab.hist).catch(() => {})
  else wc.loadURL(tab.url).catch(() => {})
  tab.hist = null
}

function push(image) {
  image = image.resize({ width: Math.round(pw / 2), height: STRIP / 2, quality: 'good' })
  const { width, height } = image.getSize()
  toBar('glass:frame', { width, height, data: image.toBitmap() })
}

// only the 52px strip gets read back, fast while the user scrolls or types, 2fps otherwise
function snap() {
  const wc = active()?.view?.webContents
  if (busy || !wc || win.isMinimized() || !win.isVisible()) return
  busy = true
  wc.capturePage({ x: 0, y: 0, width: pw, height: STRIP }).then(push, () => {}).finally(() => { busy = false; if (Date.now() < hot) snap() })
}
const heat = ms => { hot = Math.max(hot, Date.now() + ms); snap() }

function purge(tab) {
  const d = tab !== active() && tab.view?.webContents.debugger
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
}

function newTab(url = HOME) {
  const tab = { id: nextId++, title: 'New Tab', url, favicon: '', loading: true, canGoBack: false, canGoForward: false, sleeping: false, lastActive: Date.now() }
  tabs.set(tab.id, tab)
  attach(tab)
  activate(tab.id)
}

function activate(id) {
  const prev = active()
  if (prev && prev !== tabs.get(id) && prev.view) { win.contentView.removeChildView(prev.view); prev.lastActive = Date.now(); setTimeout(() => purge(prev), 30000) }
  activeId = id
  const tab = active()
  tab.lastActive = Date.now()
  if (tab.sleeping) { tab.sleeping = false; attach(tab) }
  win.contentView.addChildView(tab.view)
  win.contentView.addChildView(bar)
  layout()
  heat(1000)
  tab.view.webContents.focus()
  sendTabs()
}

function closeTab(id) {
  const tab = tabs.get(id)
  const ids = [...tabs.keys()], i = ids.indexOf(id)
  if (tab.view) { win.contentView.removeChildView(tab.view); tab.view.webContents.close() }
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
  win.contentView.removeChildView(tab.view)
  tab.view.webContents.close()
  tab.view = null
}

const idle = () => [...tabs.values()].filter(t => t.id !== activeId && !t.sleeping && !t.view.webContents.isCurrentlyAudible())

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
    width: 1280, height: 820, minWidth: 720, minHeight: 480, frame: false, icon: path.join(__dirname, 'ui', 'icon.png'), backgroundColor: '#00000000',
    ...(process.platform === 'win32' && { backgroundMaterial: 'acrylic' }),
    ...(process.platform === 'darwin' && { vibrancy: 'under-window', visualEffectState: 'active' }),
  })
  bar = ui()
  bar.setBackgroundColor('#00000000')
  win.contentView.addChildView(bar)
  bar.webContents.loadFile(path.join(__dirname, 'ui', 'bar.html'))
  keys(bar.webContents)
  win.on('maximize', () => toBar('maximized', true))
  win.on('unmaximize', () => toBar('maximized', false))
  win.on('resize', layout)
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
ipcMain.handle('omni:match', (e, q) => hist.match(q))
ipcMain.handle('omni:search', (e, q) => fetch('https://suggestqueries.google.com/complete/search?client=chrome&q=' + encodeURIComponent(q), { signal: AbortSignal.timeout(1500) }).then(r => r.json()).then(j => j[1].slice(0, 5)).catch(() => []))
ipcMain.on('nav:back', () => active().view.webContents.navigationHistory.goBack())
ipcMain.on('nav:forward', () => active().view.webContents.navigationHistory.goForward())
ipcMain.on('nav:reload', () => { const wc = active().view.webContents; wc.isLoading() ? wc.stop() : wc.reload() })
ipcMain.on('side:toggle', () => {
  sidebarOpen = !sidebarOpen
  if (!side) { // chat only exists once it's been opened, the window itself has no page
    side = ui()
    side.setBackgroundColor('#00000000')
    keys(side.webContents)
    side.webContents.loadFile(path.join(__dirname, 'ui', 'index.html'))
    side.webContents.once('did-finish-load', () => { send('side', sidebarOpen); sidebarOpen && side.webContents.focus() })
    win.contentView.addChildView(side)
  }
  layout()
  send('side', sidebarOpen)
  toBar('side', sidebarOpen)
  if (sidebarOpen) side.webContents.focus()
})
ipcMain.on('mem:sleep-all', () => sleepTabs(true))
ipcMain.on('win:min', () => win.minimize())
ipcMain.on('win:max', () => win.isMaximized() ? win.unmaximize() : win.maximize())
ipcMain.on('win:close', () => win.close())
ipcMain.on('ui:ready', () => sendTabs())

require('./ai').setup(ipcMain, () => side?.webContents)

function qatFile(req) {
  const u = new URL(req.url), p = decodeURIComponent(u.pathname), ui = path.join(__dirname, 'ui'), pages = path.join(__dirname, 'pages')
  const shared = p.startsWith('/shared/'), base = shared ? ui : pages
  const f = path.resolve(base, shared ? p.slice(8) : u.hostname + (p === '/' ? '/index.html' : p))
  return f.startsWith(base + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null
}

app.whenReady().then(async () => {
  await components.whenReady().catch(e => console.warn('widevine: ' + e.message)) // castlabs build fetches the cdm on first run so drm video plays
  protocol.handle('qat', req => { const f = qatFile(req); return f ? net.fetch(pathToFileURL(f).toString()) : new Response('Not found', { status: 404 }) })
  block.start(() => countTimer ||= setTimeout(() => { countTimer = null; sendTabs() }, 400))
  createWindow()
  setInterval(() => sleepTabs(false), 60000)
  setInterval(meter, 5000)
  setInterval(snap, 500)
})
app.on('window-all-closed', () => app.quit())
