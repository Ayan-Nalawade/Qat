const { app } = require('electron')
const fs = require('fs')
const path = require('path')

const file = () => path.join(app.getPath('userData'), 'bookmarks.json')
let list = []
try { list = JSON.parse(fs.readFileSync(file(), 'utf8')) } catch {}
const save = () => fs.writeFile(file(), JSON.stringify(list), () => {})
const strip = u => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')

module.exports = {
  all: () => list,
  has: u => list.some(b => b.url === u),
  toggle(url, title) {
    const i = list.findIndex(b => b.url === url)
    i < 0 ? list.unshift({ url, title: title || url, folder: '' }) : list.splice(i, 1)
    save()
  },
  remove(url) { list = list.filter(b => b.url !== url); save() },
  add(items) {
    const seen = new Set(list.map(b => b.url)), fresh = items.filter(b => /^https?:/.test(b.url) && !seen.has(b.url) && seen.add(b.url))
    list.push(...fresh)
    save()
    return fresh.length
  },
  match(q) {
    const words = q.trim().toLowerCase().split(/\s+/)
    return list.filter(b => { const hay = (strip(b.url) + ' ' + b.title).toLowerCase(); return words.every(w => hay.includes(w)) })
      .sort((a, b) => strip(b.url).startsWith(words[0]) - strip(a.url).startsWith(words[0])).slice(0, 3)
  },
}
