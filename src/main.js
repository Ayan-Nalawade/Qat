const { app, BrowserWindow, WebContentsView, ipcMain, protocol, net, screen } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
protocol.registerSchemesAsPrivileged([{ scheme: 'qat', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
app.commandLine.appendSwitch('process-per-site')
app.commandLine.appendSwitch('renderer-process-limit', '6')
app.commandLine.appendSwitch('disable-site-isolation-trials') // cross-site iframes share the parent's process, ad heavy pages spawned 25+ processes
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,BackForwardCache,IsolateOrigins,site-per-process')
app.commandLine.appendSwitch('log-level', '3')
process.removeAllListeners('warning')
process.on('warning', w => /Failed to load URL/.test(w.message) || console.warn(w.name + ': ' + w.message))

const SLEEP_MS = 5 * 60 * 1000
const HOME = 'https://www.google.com'
const tabs = new Map()
const STRIP = 52, SIDE = 376
let win, bar, activeId = null, nextId = 1, sidebarOpen = false, pw = 0, lastFrame = 0, trail

const send = (ch, ...a) => win.webContents.send(ch, ...a)
const toBar = (ch, ...a) => bar.webContents.send(ch, ...a)
const sendTabs = () => toBar('tabs', { activeId, tabs: [...tabs.values()].map(({ id, title, url, favicon, loading, canGoBack, canGoForward, sleeping }) => ({ id, title, url, favicon, loading, canGoBack, canGoForward, sleeping })) })
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
  wc.on('page-title-updated', (e, t) => { tab.title = t; sync() })
  wc.on('page-favicon-updated', (e, f) => { tab.favicon = f[0]; sync() })
  for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page']) wc.on(ev, sync)
  wc.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault() })
  wc.setWindowOpenHandler(({ url }) => { newTab(url); return { action: 'deny' } })
  wc.loadURL(tab.url).catch(() => {})
}

function push(image) {
  const s = image.getSize().width / pw
  let c = image.crop({ x: 0, y: 0, width: Math.round(pw * s), height: Math.round(STRIP * s) })
  c = c.resize({ width: Math.round(pw / 2), height: STRIP / 2, quality: 'good' }) // half res = 4x less IPC so it keeps up at 60fps, the glass softens it anyway
  const { width, height } = c.getSize()
  toBar('glass:frame', { width, height, data: c.toBitmap() })
}

const snap = tab => tab === active() && tab.view?.webContents.capturePage({ x: 0, y: 0, width: pw, height: STRIP }).then(push, () => {})

function watch(tab) {
  tab.view.webContents.beginFrameSubscription(false, image => {
    if (win.isMinimized() || !win.isVisible()) return
    const now = Date.now()
    if (now - lastFrame < 14) { clearTimeout(trail); trail = setTimeout(() => snap(tab), 30); return }
    lastFrame = now
    push(image)
  })
  snap(tab)
}

function layout() {
  const { width, height } = win.getContentBounds()
  pw = width - (sidebarOpen ? SIDE : 0)
  active()?.view?.setBounds({ x: 0, y: STRIP, width: pw, height: height - STRIP })
  bar.setBounds({ x: 0, y: 0, width: pw, height: STRIP })
}

function newTab(url = HOME) {
  const tab = { id: nextId++, title: 'New Tab', url, favicon: '', loading: true, canGoBack: false, canGoForward: false, sleeping: false, lastActive: Date.now() }
  tabs.set(tab.id, tab)
  attach(tab)
  activate(tab.id)
}

function activate(id) {
  const prev = active()
  if (prev && prev !== tabs.get(id) && prev.view) { prev.view.webContents.endFrameSubscription(); win.contentView.removeChildView(prev.view) }
  activeId = id
  const tab = active()
  tab.lastActive = Date.now()
  if (tab.sleeping) { tab.sleeping = false; attach(tab) }
  win.contentView.addChildView(tab.view)
  win.contentView.addChildView(bar)
  layout()
  watch(tab)
  tab.view.webContents.focus()
  sendTabs()
}

function closeTab(id) {
  const tab = tabs.get(id)
  const ids = [...tabs.keys()], i = ids.indexOf(id)
  if (tab.view) { if (id === activeId) tab.view.webContents.endFrameSubscription(); win.contentView.removeChildView(tab.view); tab.view.webContents.close() }
  tabs.delete(id)
  if (!tabs.size) return newTab()
  if (id === activeId) activate([...tabs.keys()][Math.min(i, tabs.size - 1)])
  else sendTabs()
}

function sleep(tab) {
  tab.sleeping = true
  tab.loading = false
  win.contentView.removeChildView(tab.view)
  tab.view.webContents.close()
  tab.view = null
}

function sleepTabs(all) {
  for (const t of tabs.values()) {
    if (t.id === activeId || t.sleeping) continue
    if (all ? !t.view.webContents.isCurrentlyAudible() : Date.now() - t.lastActive > SLEEP_MS && !t.view.webContents.isCurrentlyAudible()) sleep(t)
  }
  sendTabs()
}

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 820, minWidth: 720, minHeight: 480, frame: false, backgroundColor: '#00000000',
    ...(process.platform === 'win32' && { backgroundMaterial: 'acrylic' }),
    ...(process.platform === 'darwin' && { vibrancy: 'under-window', visualEffectState: 'active' }),
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  })
  win.loadFile(path.join(__dirname, 'ui', 'index.html'))
  bar = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false } })
  bar.setBackgroundColor('#00000000')
  win.contentView.addChildView(bar)
  bar.webContents.loadFile(path.join(__dirname, 'ui', 'bar.html'))
  for (const wc of [win.webContents, bar.webContents]) wc.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault() })
  win.on('maximize', () => toBar('maximized', true))
  win.on('unmaximize', () => toBar('maximized', false))
  win.on('resize', layout)
  win.webContents.once('did-finish-load', () => newTab())
}

ipcMain.on('tab:new', (e, url) => newTab(url))
ipcMain.on('tab:close', (e, id) => closeTab(id))
ipcMain.on('tab:activate', (e, id) => activate(id))
ipcMain.on('nav:go', (e, text) => active().view.webContents.loadURL(toUrl(text)).catch(() => {}))
ipcMain.on('nav:back', () => active().view.webContents.navigationHistory.goBack())
ipcMain.on('nav:forward', () => active().view.webContents.navigationHistory.goForward())
ipcMain.on('nav:reload', () => { const wc = active().view.webContents; wc.isLoading() ? wc.stop() : wc.reload() })
ipcMain.on('side:toggle', () => {
  sidebarOpen = !sidebarOpen
  layout()
  send('side', sidebarOpen)
  toBar('side', sidebarOpen)
  if (sidebarOpen) win.webContents.focus()
})
ipcMain.on('mem:sleep-all', () => sleepTabs(true))
ipcMain.on('win:min', () => win.minimize())
ipcMain.on('win:max', () => win.isMaximized() ? win.unmaximize() : win.maximize())
ipcMain.on('win:close', () => win.close())
ipcMain.on('ui:ready', () => sendTabs())

require('./ai').setup(ipcMain, () => win.webContents)

function qatFile(req) {
  const u = new URL(req.url), p = decodeURIComponent(u.pathname), ui = path.join(__dirname, 'ui'), pages = path.join(__dirname, 'pages')
  const shared = p.startsWith('/shared/'), base = shared ? ui : pages
  const f = path.resolve(base, shared ? p.slice(8) : u.hostname + (p === '/' ? '/index.html' : p))
  return f.startsWith(base + path.sep) && fs.existsSync(f) && fs.statSync(f).isFile() ? f : null
}

app.whenReady().then(() => {
  protocol.handle('qat', req => { const f = qatFile(req); return f ? net.fetch(pathToFileURL(f).toString()) : new Response('Not found', { status: 404 }) })
  require('./block')()
  createWindow()
  setInterval(() => sleepTabs(false), 60000)
  setInterval(() => toBar('mem', Math.round(app.getAppMetrics().reduce((s, m) => s + m.memory.privateBytes, 0) / 1024)), 5000)
})
app.on('window-all-closed', () => app.quit())
