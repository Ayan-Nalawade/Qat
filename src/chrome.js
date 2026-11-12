const fs = require('fs')
const path = require('path')
// reads straight from chrome's profile folder, works while chrome is open since nothing gets written
const root = () => path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'User Data')
const json = f => JSON.parse(fs.readFileSync(f, 'utf8'))

module.exports = {
  profiles() {
    try { return Object.entries(json(path.join(root(), 'Local State')).profile.info_cache).map(([dir, p]) => ({ dir, name: p.name })) } catch { return [] }
  },
  bookmarks(dir) {
    const out = [], walk = (n, f) => n.type === 'url' ? out.push({ url: n.url, title: n.name, folder: f }) : (n.children || []).forEach(c => walk(c, f ? f + '/' + n.name : n.name))
    for (const r of Object.values(json(path.join(root(), dir, 'Bookmarks')).roots)) if (r.children) walk(r, '')
    return out
  },
  extensions(dir) {
    const base = path.join(root(), dir, 'Extensions'), out = []
    for (const id of fs.readdirSync(base)) {
      if (!/^[a-p]{32}$/.test(id)) continue
      try {
        const v = fs.readdirSync(path.join(base, id)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1), p = path.join(base, id, v)
        if (!json(path.join(p, 'manifest.json')).theme) out.push({ id, path: p })
      } catch {} // half uninstalled ones are empty folders
    }
    return out
  },
}
