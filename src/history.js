const { app } = require('electron')
const fs = require('fs')
const path = require('path')
const put = require('./put')

const file = () => path.join(app.getPath('userData'), 'history.json')
let h = new Map(), timer
try { h = new Map(JSON.parse(fs.readFileSync(file(), 'utf8')).map(e => [e.u, e])) } catch {}

const strip = u => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
const score = e => (e.n + 3 * (e.k || 0)) / (1 + (Date.now() - e.v) / 6048e5) // typed counts more, a week halves it

function flush() {
  if (!timer) return
  clearTimeout(timer)
  timer = null
  const all = [...h.values()].sort((a, b) => b.v - a.v).slice(0, 5000)
  h = new Map(all.map(e => [e.u, e]))
  put(file(), JSON.stringify(all))
}
const save = () => { clearTimeout(timer); timer = setTimeout(flush, 4000) }

module.exports = {
  flush,
  visit(u, typed) {
    if (!/^https?:/.test(u)) return
    const e = h.get(u) || { u, t: '', n: 0 }
    e.n++; e.v = Date.now(); if (typed) e.k = (e.k || 0) + 1
    h.set(u, e); save()
  },
  title(u, t) { const e = h.get(u); if (e && t) { e.t = t; save() } },
  icon(u, f) { const e = h.get(u); if (e && f && e.f !== f) { e.f = f; save() } },
  list: () => [...h.values()].sort((a, b) => b.v - a.v).map(e => ({ url: e.u, title: e.t, icon: e.f || '', at: e.v, visits: e.n })),
  remove(urls) { for (const u of [].concat(urls)) h.delete(u); save(); flush() },
  clear() { h.clear(); save(); flush() },

  // inline completion like chrome: finish a host you've been to, or a full url once you type past the host
  match(q) {
    q = q.trim().toLowerCase()
    if (!q) return { inline: '', items: [] }
    const words = q.split(/\s+/), hosts = new Map(), items = []
    for (const e of h.values()) {
      const s = strip(e.u), host = s.split('/')[0], sc = score(e)
      if (!/\s/.test(q) && host.startsWith(q.replace(/^www\./, ''))) hosts.set(host, (hosts.get(host) || 0) + sc)
      const hay = (s + ' ' + e.t).toLowerCase()
      if (words.every(w => hay.includes(w))) items.push({ e, sc: sc * (s.startsWith(q) ? 3 : 1) })
    }
    items.sort((a, b) => b.sc - a.sc)
    let inline = [...hosts].sort((a, b) => b[1] - a[1])[0]?.[0] || ''
    if (!inline || q.length > inline.length) inline = items.map(i => strip(i.e.u)).find(s => s.startsWith(q)) || ''
    if (inline && q.startsWith('www.')) inline = 'www.' + inline
    return { inline, items: items.slice(0, 5).map(({ e }) => ({ url: e.u, title: e.t })) }
  },
}
