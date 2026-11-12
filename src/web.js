const { WebContentsView, session } = require('electron')
// a page nobody sees, so the assistant can search and read without touching the user's tabs
let view, idle, hooked
const sleep = ms => new Promise(r => setTimeout(r, ms))

function page() {
  clearTimeout(idle)
  idle = setTimeout(close, 60000) // frees the renderer a minute after the last lookup
  if (view && !view.webContents.isDestroyed()) return view.webContents
  view = new WebContentsView({ webPreferences: { sandbox: true, backgroundThrottling: false, images: false, spellcheck: false } })
  const w = view.webContents
  w.setAudioMuted(true)
  w.setWindowOpenHandler(() => ({ action: 'deny' }))
  if (!hooked) hooked = session.defaultSession.on('will-download', (e, item, from) => from === view?.webContents && item.cancel())
  return w
}

function close() { if (view && !view.webContents.isDestroyed()) view.webContents.close(); view = null }

async function load(url, signal, settle) {
  const w = page(), stop = () => w.stop()
  signal.addEventListener('abort', stop, { once: true })
  try { await Promise.race([w.loadURL(url).catch(e => { if (!/ERR_ABORTED/.test(e.message)) throw new Error('Could not open ' + url + ' (' + e.message.split(' loading')[0] + ')') }), sleep(15000)]) }
  finally { signal.removeEventListener('abort', stop) }
  if (signal.aborted) throw new Error('Stopped')
  await sleep(settle)
  return w
}

const GOOGLE = `(() => {
  const out = [], seen = new Set()
  for (const h of document.querySelectorAll('#search a h3, #rso a h3')) {
    const a = h.closest('a')
    if (!a || !/^https?:/.test(a.href) || /(^|\\.)google\\./.test(new URL(a.href).hostname) || seen.has(a.href)) continue
    seen.add(a.href)
    const box = a.closest('.MjjYud, .g, [data-hveid]') || a.parentElement
    out.push({ t: h.innerText.trim(), u: a.href, s: (box.innerText || '').replace(h.innerText, '').replace(/\\s+/g, ' ').trim().slice(0, 320) })
    if (out.length === 8) break
  }
  const ans = document.querySelector('.kno-rdesc, .hgKElc, .IZ6rdc, .Z0LcW, [data-attrid="wa:/description"], #wob_wc')
  return { ans: ans ? ans.innerText.replace(/\\s+/g, ' ').trim().slice(0, 600) : '', out }
})()`
const DDG = `({ ans: '', out: [...document.querySelectorAll('.result')].map(r => { const a = r.querySelector('.result__a'); if (!a) return; let u = a.href; try { u = new URL(u).searchParams.get('uddg') || u } catch {} return { t: a.innerText.trim(), u, s: (r.querySelector('.result__snippet')?.innerText || '').trim() } }).filter(Boolean).slice(0, 8) })`

async function search(q, signal) {
  let w = await load('https://www.google.com/search?hl=en&q=' + encodeURIComponent(q), signal, 300)
  let r = /\/sorry\/|consent\./.test(w.getURL()) ? null : await w.executeJavaScript(GOOGLE)
  if (!r?.out.length) { w = await load('https://html.duckduckgo.com/html/?q=' + encodeURIComponent(q), signal, 100); r = await w.executeJavaScript(DDG) } // google wants a captcha now and then
  if (!r.out.length) return 'No results for "' + q + '".'
  return (r.ans ? 'Quick answer: ' + r.ans + '\n\n' : '') + r.out.map((x, i) => `${i + 1}. ${x.t}\n${x.u}\n${x.s}`).join('\n\n')
}

let last = ''
async function read(url, offset, signal) {
  if (!/^https?:\/\//i.test(url)) { if (/^[a-z][\w+.-]*:/i.test(url) && !/^[\w.-]+:\d/.test(url)) throw new Error('I can only read http and https pages'); url = 'https://' + url }
  const w = offset && last === url && view ? view.webContents : await load(url, signal, 900)
  last = url
  const t = await w.executeJavaScript(`(() => { const m = document.querySelector('main, article, [role=main]'), b = document.body?.innerText || ''; return m && m.innerText.length > 600 ? m.innerText : b })()`)
  const text = t.replace(/\n{3,}/g, '\n\n')
  if (!text.trim()) return 'The page at ' + w.getURL() + ' has no readable text.'
  return `${w.getTitle()} (${w.getURL()})\nchars ${offset}-${Math.min(text.length, offset + 12000)} of ${text.length}:\n` + text.slice(offset, offset + 12000)
}

module.exports = { search, read, close }
