const { app, safeStorage } = require('electron')
const fs = require('fs')
const path = require('path')

const SYSTEM = 'You are Qat, a helpful assistant built into a web browser. Be concise.'
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
  for (const id in PROVIDERS) { const c = conf(id); providers[id] = { name: PROVIDERS[id].name, base: c.base, model: c.model, hasKey: !!c.key } }
  return { provider: read().provider || 'nvidia', providers }
}

const headers = (id, c) => ({ 'Content-Type': 'application/json', ...(c.key && { Authorization: 'Bearer ' + c.key }), ...PROVIDERS[id].headers })

function setup(ipcMain) {
  const runs = new Map()

  ipcMain.handle('ai:settings', () => pub())

  ipcMain.handle('ai:save', (e, { provider, id, base, model, key }) => {
    const s = read(), old = s.providers?.[id] || {}, d = PROVIDERS[id]
    s.provider = provider
    s.providers ||= {}
    s.providers[id] = { base: base.trim().replace(/\/+$/, '') || d.base, model: model.trim() || d.model, ...(key === null ? {} : key ? lock(key) : { key: old.key, enc: old.enc }) }
    fs.writeFileSync(file(), JSON.stringify(s, null, 2))
    return pub()
  })

  ipcMain.handle('ai:models', async (e, id) => {
    const c = conf(id)
    let r
    try { r = await fetch(c.base + '/models', { headers: headers(id, c) }) } catch (err) { throw new Error('Could not reach ' + c.base) }
    if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 200)}`)
    const j = await r.json()
    return (j.data || j).map(m => m.id).sort()
  })

  ipcMain.on('ai:chat', async (e, { rid, messages }) => {
    const id = pub().provider, c = conf(id), ac = new AbortController()
    runs.set(rid, ac)
    const out = (ch, d) => e.sender.isDestroyed() || e.sender.send(ch, { rid, ...d })
    const feed = l => {
      l = l.trim()
      if (!l.startsWith('data:')) return
      const d = l.slice(5).trim()
      if (d === '[DONE]') return
      try { const t = JSON.parse(d).choices?.[0]?.delta?.content; if (t) out('ai:chunk', { text: t }) } catch {}
    }
    try {
      const r = await fetch(c.base + '/chat/completions', { method: 'POST', headers: headers(id, c), signal: ac.signal, body: JSON.stringify({ model: c.model, stream: true, messages: [{ role: 'system', content: SYSTEM }, ...messages] }) })
      if (!r.ok) throw new Error(`HTTP ${r.status} ${(await r.text()).slice(0, 500)}`)
      const dec = new TextDecoder()
      let buf = ''
      for await (const chunk of r.body) {
        buf += dec.decode(chunk, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop()
        lines.forEach(feed)
      }
      feed(buf)
      out('ai:done')
    } catch (err) {
      ac.signal.aborted ? out('ai:done') : out('ai:error', { message: err.message + (err.cause ? ': ' + err.cause.message : '') })
    }
    runs.delete(rid)
  })

  ipcMain.on('ai:stop', (e, rid) => runs.get(rid)?.abort())
}

module.exports = { setup }
