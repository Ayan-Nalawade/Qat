const { app, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')
const put = require('./put')

const { run } = require('./agent')
const PROVIDERS = {
  nvidia: { name: 'NVIDIA NIM', base: 'https://integrate.api.nvidia.com/v1', model: 'meta/llama-3.3-70b-instruct' },
  openrouter: { name: 'OpenRouter', base: 'https://openrouter.ai/api/v1', model: 'openrouter/auto', headers: { 'HTTP-Referer': 'https://github.com/Ayan-Nalawade/Qat', 'X-Title': 'Qat' } },
  openai: { name: 'OpenAI', base: 'https://api.openai.com/v1', model: 'gpt-4o-mini' },
  custom: { name: 'Custom / Ollama', base: 'http://localhost:11434/v1', model: 'llama3.2' },
}

const file = () => path.join(app.getPath('userData'), 'settings.json')
const read = () => { try { return JSON.parse(fs.readFileSync(file(), 'utf8')) } catch { return {} } }
const lock = k => safeStorage.isEncryptionAvailable() ? { key: safeStorage.encryptString(k).toString('base64'), enc: true } : { key: k }
const unlock = p => { try { return !p.key ? '' : p.enc ? safeStorage.decryptString(Buffer.from(p.key, 'base64')) : p.key } catch { return '' } }

function conf(id) {
  const s = read().providers?.[id] || {}, d = PROVIDERS[id]
  return { base: s.base || d.base, model: s.model || d.model, key: unlock(s) }
}

function pub() {
  const providers = {}
  for (const id in PROVIDERS) { const c = conf(id); providers[id] = { name: PROVIDERS[id].name, defBase: PROVIDERS[id].base, base: c.base, model: c.model, hasKey: !!c.key } }
  return { provider: read().provider || 'nvidia', providers }
}

const headers = (id, c) => ({ 'Content-Type': 'application/json', ...(c.key && { Authorization: 'Bearer ' + c.key }), ...PROVIDERS[id].headers })

function setup(ipcMain, ui, browser) {
  const runs = new Map()
  let last = Promise.resolve() // a new chat waits for the stopped run to clean up its overlay, otherwise that wipes the new run's refs
  const uis = () => [].concat(ui()).filter(w => w && !w.isDestroyed()), ok = e => uis().includes(e.sender) || !!e.senderFrame?.url.startsWith('qat://')
  const handle = (ch, f) => ipcMain.handle(ch, (e, ...a) => ok(e) ? f(e, ...a) : undefined)
  const on = (ch, f) => ipcMain.on(ch, (e, ...a) => ok(e) && f(e, ...a))
  const changed = () => { const p = pub(); uis().forEach(w => w.send('ai:changed', p)); return p }

  handle('ai:settings', () => pub())

  handle('ai:pdf', async (e, bytes) => { // text out of an uploaded pdf, the model only gets words
    const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
    const task = getDocument({ data: new Uint8Array(bytes), isEvalSupported: false, useSystemFonts: true }), doc = await task.promise
    let text = ''
    for (let i = 1; i <= doc.numPages && text.length < 150000; i++) text += (await (await doc.getPage(i)).getTextContent()).items.map(t => t.str + (t.hasEOL ? '\n' : '')).join('') + '\n\n'
    const pages = doc.numPages
    task.destroy()
    return { text: text.trim(), pages }
  })

  handle('ai:pick', (e, { provider, model }) => {
    const s = read()
    s.provider = provider
    s.providers = { ...s.providers, [provider]: { ...s.providers?.[provider], model } }
    put(file(), JSON.stringify(s, null, 2))
    return changed()
  })

  handle('ai:save', (e, { provider, id, base, model, key }) => {
    const s = read(), old = s.providers?.[id] || {}, d = PROVIDERS[id]
    s.provider = provider
    s.providers ||= {}
    s.providers[id] = { base: base.trim().replace(/\/+$/, '') || d.base, model: model.trim() || d.model, ...(key === null ? {} : key ? lock(key) : { key: old.key, enc: old.enc }) }
    put(file(), JSON.stringify(s, null, 2))
    return changed()
  })

  handle('ai:models', async (e, id) => {
    const c = conf(id)
    let r
    try { r = await fetch(c.base + '/models', { headers: headers(id, c) }) } catch (err) { throw new Error('Could not reach ' + c.base) }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
    const j = await r.json()
    return (j.data || j).map(m => m.id).sort()
  })

  on('ai:chat', async (e, { rid, messages, agent, quick }) => {
    const id = pub().provider, c = conf(id), ac = new AbortController(), out = (ch, d) => e.sender.isDestroyed() || e.sender.send(ch, { rid, ...d }), key = e.sender.id + ':' + rid, prev = quick ? null : last
    runs.set(key, Object.assign(ac, { quick }))
    const job = (async () => {
      await prev
      try { await run({ base: c.base, model: c.model, headers: headers(id, c), history: messages, agent, quick, signal: ac.signal, browser: quick && browser.bind(e.sender) || browser, out }) }
      catch (err) { out('ai:error', { message: err.message }) }
      finally { runs.delete(key) }
    })()
    if (!quick) last = job // quick asks never touch the page, no need to queue them behind the sidebar
  })

  on('ai:stop', (e, rid) => runs.get(e.sender.id + ':' + rid)?.abort())
  return { stop: sideOnly => runs.forEach(a => (!sideOnly || !a.quick) && a.abort()) } // the page's stop pill is the sidebar's, quick asks have their own button
}

// one shot, no streaming, for background jobs like the scam check
const ready = () => { const id = pub().provider; return id === 'custom' || !!conf(id).key }
// streams and hangs up as soon as the reply holds a full json object, and asks thinking models to keep it short
const plain = new Set() // models that reject reasoning_effort
async function ask(messages, on = () => {}) {
  const id = pub().provider, c = conf(id), ac = new AbortController(), t = setTimeout(() => ac.abort(), 60000)
  const go = low => fetch(c.base + '/chat/completions', { method: 'POST', headers: headers(id, c), signal: ac.signal, body: JSON.stringify({ model: c.model, messages, temperature: 0, max_tokens: 1500, stream: true, ...(low && { reasoning_effort: 'low' }) }) })
  try {
    let r = await go(!plain.has(c.model))
    if (r.status === 400 && !plain.has(c.model)) { plain.add(c.model); r = await go(false) }
    if (!r.ok) throw new Error('HTTP ' + r.status)
    const dec = new TextDecoder()
    let buf = '', out = ''
    for await (const chunk of r.body) {
      buf += dec.decode(chunk, { stream: true })
      const lines = buf.split(/\r?\n/)
      buf = lines.pop()
      for (const l of lines) if (l.startsWith('data: {')) { const d = JSON.parse(l.slice(6)).choices?.[0]?.delta || {}, think = d.reasoning_content || d.reasoning; think && on({ think }); d.content && on({ text: d.content }); out += d.content || '' }
      if (/\{[\s\S]*\}/.test(out)) { try { JSON.parse(out.match(/\{[\s\S]*\}/)[0]); break } catch {} }
    }
    return out
  } finally { clearTimeout(t); ac.abort() }
}

ask.model = () => conf(pub().provider).model
module.exports = { setup, ask, ready }
