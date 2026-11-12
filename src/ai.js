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
    runs.set(key, ac)
    const job = (async () => {
      await prev
      try { await run({ base: c.base, model: c.model, headers: headers(id, c), history: messages, agent, quick, signal: ac.signal, browser, out }) }
      catch (err) { out('ai:error', { message: err.message }) }
      finally { runs.delete(key) }
    })()
    if (!quick) last = job // quick asks never touch the page, no need to queue them behind the sidebar
  })

  on('ai:stop', (e, rid) => runs.get(e.sender.id + ':' + rid)?.abort())
  return { stop: () => runs.forEach(a => a.abort()) }
}

module.exports = { setup }
