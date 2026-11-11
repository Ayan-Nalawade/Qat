const { app, BrowserWindow, WebContentsView, ipcMain, protocol, net } = require('electron')
const path = require('path')
const fs = require('fs')
const { pathToFileURL } = require('url')
protocol.registerSchemesAsPrivileged([{ scheme: 'qat', privileges: { standard: true, secure: true, supportFetchAPI: true } }])
app.commandLine.appendSwitch('process-per-site')
app.commandLine.appendSwitch('renderer-process-limit', '6')
app.commandLine.appendSwitch('disable-features', 'SpareRendererForSitePerProcess,BackForwardCache')
app.commandLine.appendSwitch('js-flags', '--max-old-space-size=512')

const SLEEP_MS = 5 * 60 * 1000
const HOME = 'https://www.google.com'
const tabs = new Map()
let win, activeId = null, nextId = 1, rect = { x: 0, y: 0, width: 0, height: 0 }

const send = (ch, ...a) => win.webContents.send(ch, ...a)
const sendTabs = () => send('tabs', { activeId, tabs: [...tabs.values()].map(({ id, title, url, favicon, loading, canGoBack, canGoForward, sleeping }) => ({ id, title, url, favicon, loading, canGoBack, canGoForward, sleeping })) })
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

function focusOmnibox() { win.webContents.focus(); send('focus-omnibox') }

function cycle(d) {
  const ids = [...tabs.keys()]
  activate(ids[(ids.indexOf(activeId) + d + ids.length) % ids.length])
}

function attach(tab) {
  const view = tab.view = new WebContentsView({ webPreferences: { preload: path.join(__dirname, 'tab-preload.js'), backgroundThrottling: true, spellcheck: false, sandbox: true } })
  view.setBorderRadius?.(12)
  const wc = view.webContents
  const sync = () => { tab.url = wc.getURL() || tab.url; tab.loading = wc.isLoading(); tab.canGoBack = wc.navigationHistory.canGoBack(); tab.canGoForward = wc.navigationHistory.canGoForward(); sendTabs() }
  wc.on('page-title-updated', (e, t) => { tab.title = t; sync() })
  wc.on('page-favicon-updated', (e, f) => { tab.favicon = f[0]; sync() })
  for (const ev of ['did-start-loading', 'did-stop-loading', 'did-navigate', 'did-navigate-in-page']) wc.on(ev, sync)
  wc.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault() })
  wc.setWindowOpenHandler(({ url }) => { newTab(url); return { action: 'deny' } })
  wc.loadURL(tab.url).catch(() => {})
}

function newTab(url = HOME) {
  const tab = { id: nextId++, title: 'New Tab', url, favicon: '', loading: true, canGoBack: false, canGoForward: false, sleeping: false, lastActive: Date.now() }
  tabs.set(tab.id, tab)
  attach(tab)
  activate(tab.id)
}

function activate(id) {
  const prev = active()
  if (prev && prev !== tabs.get(id) && prev.view) win.contentView.removeChildView(prev.view)
  activeId = id
  const tab = active()
  tab.lastActive = Date.now()
  if (tab.sleeping) { tab.sleeping = false; attach(tab) }
  win.contentView.addChildView(tab.view)
  tab.view.setBounds(rect)
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
  win.webContents.on('before-input-event', (e, input) => { if (shortcut(input)) e.preventDefault() })
  win.on('maximize', () => send('maximized', true))
  win.on('unmaximize', () => send('maximized', false))
  win.webContents.once('did-finish-load', () => newTab())
}

ipcMain.on('tab:new', (e, url) => newTab(url))
ipcMain.on('tab:close', (e, id) => closeTab(id))
ipcMain.on('tab:activate', (e, id) => activate(id))
ipcMain.on('nav:go', (e, text) => active().view.webContents.loadURL(toUrl(text)).catch(() => {}))
ipcMain.on('nav:back', () => active().view.webContents.navigationHistory.goBack())
ipcMain.on('nav:forward', () => active().view.webContents.navigationHistory.goForward())
ipcMain.on('nav:reload', () => { const wc = active().view.webContents; wc.isLoading() ? wc.stop() : wc.reload() })
ipcMain.on('viewport:rect', (e, r) => { rect = { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) }; active()?.view?.setBounds(rect) })
ipcMain.on('mem:sleep-all', () => sleepTabs(true))
ipcMain.on('devtools', () => active().view.webContents.toggleDevTools())
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
  createWindow()
  setInterval(() => sleepTabs(false), 60000)
  setInterval(() => send('mem', Math.round(app.getAppMetrics().reduce((s, m) => s + m.memory.workingSetSize, 0) / 1024)), 5000)
})
app.on('window-all-closed', () => app.quit())
