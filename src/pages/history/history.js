const $ = s => document.querySelector(s), list = $('#list')
const el = (tag, cls, txt) => Object.assign(document.createElement(tag), { className: cls || '', textContent: txt || '' })
const GLOBE = '<svg class="glo" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z"/></svg>'
const globe = () => Object.assign(document.createElement('span'), { innerHTML: GLOBE }).firstChild
let all = [], shown = 200

const dayOf = t => { const d = new Date(t), n = new Date(), y = new Date(n - 864e5), same = (a, b) => a.toDateString() === b.toDateString(); return (same(d, n) ? 'Today - ' : same(d, y) ? 'Yesterday - ' : '') + d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }) }
const host = u => { try { return new URL(u).hostname.replace(/^www\./, '') } catch { return u } }

function draw() {
  const q = $('#q').value.trim().toLowerCase().split(/\s+/).filter(Boolean)
  const hits = all.filter(e => q.every(w => (e.title + ' ' + e.url).toLowerCase().includes(w)))
  list.replaceChildren()
  if (!hits.length) return list.append(Object.assign(el('div', 'box'), { innerHTML: '<div class="empty">' + (all.length ? 'Nothing matches' : 'No history yet. Pages you visit show up here.') + '</div>' }))
  let box, day
  for (const e of hits.slice(0, shown)) {
    const d = dayOf(e.at)
    if (d !== day) { day = d; list.append(el('h3', '', d)); list.append(box = el('div', 'box')) }
    const row = el('div', 'item'), a = el('a', 'txt'), x = el('button', 'pill', 'Remove'), bx = box
    if (e.icon) { const i = el('img', 'fav'); i.src = e.icon; i.onerror = () => i.replaceWith(globe()); row.append(i) } else row.append(globe())
    a.href = e.url
    a.title = e.url + (e.visits > 1 ? '\n' + e.visits + ' visits' : '')
    a.append(el('b', 'url', e.title || host(e.url)), el('small', 'url', host(e.url)))
    x.onclick = async () => { await qat.hist.remove(e.url); all = all.filter(y => y !== e); row.remove(); if (!bx.children.length) draw() }
    row.append(a, el('time', '', new Date(e.at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })), x)
    box.append(row)
  }
  if (hits.length > shown) { const m = el('button', 'pill', 'Show more'); m.id = 'more'; m.onclick = () => { shown += 300; draw() }; list.append(m) }
}

$('#q').oninput = () => { shown = 200; draw() }
$('#clear').onclick = async () => { if (!confirm('Clear all of your browsing history? This can\'t be undone.')) return; await qat.hist.clear(); all = []; draw() }
qat.hist.list().then(h => { all = h; draw() })
