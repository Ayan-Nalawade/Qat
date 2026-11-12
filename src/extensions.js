const { app, session } = require('electron')
const fs = require('fs')
const path = require('path')
const put = require('./put')

const dir = () => path.join(app.getPath('userData'), 'extensions')
const file = () => path.join(app.getPath('userData'), 'extensions.json')
let list = [] // { id, path, on }
try { list = JSON.parse(fs.readFileSync(file(), 'utf8')) } catch {}
const save = () => put(file(), JSON.stringify(list, null, 2))
const ext = () => session.defaultSession.extensions
const load = p => ext().loadExtension(p, { allowFileAccess: true })

function info(e) {
  const m = e.manifest, page = p => p && 'chrome-extension://' + e.id + '/' + p.replace(/^\//, '')
  let msgs = {}
  try { msgs = JSON.parse(fs.readFileSync(path.join(e.path, '_locales', m.default_locale, 'messages.json'), 'utf8')) } catch {}
  const t = s => (s || '').replace(/__MSG_(\w+)__/g, (x, k) => Object.entries(msgs).find(([n]) => n.toLowerCase() === k.toLowerCase())?.[1].message || '')
  const icon = Object.entries(m.icons || {}).sort((a, b) => b[0] - a[0])[0]?.[1]
  let img = ''
  try { img = icon && 'data:image/png;base64,' + fs.readFileSync(path.join(e.path, icon)).toString('base64') } catch {}
  return { id: e.id, name: t(m.name), version: m.version, description: t(m.description), on: e.on, pin: !!e.pin, error: e.error || '', icon: img, popup: page((m.action || m.browser_action)?.default_popup), options: page(m.options_ui?.page || m.options_page) }
}

async function add(p) {
  try {
    const e = await load(p)
    list = list.filter(x => x.id !== e.id)
    list.push({ id: e.id, path: p, on: true, pin: list.filter(x => x.pin).length < 4, manifest: e.manifest })
    save()
    return null
  } catch (err) { return path.basename(p) + ': ' + err.message }
}

module.exports = {
  // MV2/MV3 support in electron is partial, an extension that fails to load just shows its error instead of blocking startup
  start: () => Promise.all(list.filter(e => e.on).map(e => load(e.path).then(() => { e.error = '' }, err => { e.error = err.message }))),
  list: () => list.map(info),
  add,
  async toggle(id) {
    const e = list.find(x => x.id === id)
    e.on = !e.on
    e.on ? await load(e.path).catch(err => { e.error = err.message }) : ext().removeExtension(id)
    save()
  },
  pin(id) { // the toolbar holds 4, the rest live behind the puzzle button
    const e = list.find(x => x.id === id)
    if (e.pin || list.filter(x => x.pin).length < 4) { e.pin = !e.pin; save() }
  },
  remove(id) {
    const e = list.find(x => x.id === id)
    if (ext().getExtension(id)) ext().removeExtension(id)
    if (e.path.startsWith(dir() + path.sep)) fs.rmSync(e.path, { recursive: true, force: true })
    list = list.filter(x => x !== e)
    save()
  },
  async import(found) { // copied so chrome updating or uninstalling it doesn't break ours
    const errs = []
    for (const f of found) {
      if (list.some(x => x.id === f.id)) continue
      const to = path.join(dir(), f.id)
      fs.cpSync(f.path, to, { recursive: true })
      fs.rmSync(path.join(to, '_metadata'), { recursive: true, force: true }) // chrome's signature folder, electron refuses to load with it
      const err = await add(to)
      if (err) { errs.push(err); fs.rmSync(to, { recursive: true, force: true }) }
    }
    return errs
  },
  dir,
}
