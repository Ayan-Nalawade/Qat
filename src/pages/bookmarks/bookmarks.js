const $ = s => document.querySelector(s), note = $('#note')
const el = (tag, cls, txt) => Object.assign(document.createElement(tag), { className: cls || '', textContent: txt || '' })
let all = []

async function draw() {
  all = await qat.bm.list()
  const q = $('#q').value.trim().toLowerCase(), groups = new Map(), list = $('#list')
  for (const b of all) if (!q || (b.title + ' ' + b.url).toLowerCase().includes(q)) (groups.get(b.folder) || groups.set(b.folder, []).get(b.folder)).push(b)
  list.innerHTML = ''
  if (!groups.size) return list.append(Object.assign(el('div', 'box'), { innerHTML: '<div class="empty">' + (all.length ? 'Nothing matches' : 'No bookmarks yet. Press Ctrl+D or the star in the address bar to add one.') + '</div>' }))
  for (const [f, items] of groups) {
    const box = el('div', 'box')
    if (f) box.append(el('div', 'hd', f))
    for (const b of items) {
      const row = el('div', 'item'), a = el('a', 'txt'), x = el('button', 'pill', 'Remove')
      a.href = b.url
      a.append(el('b', 'url', b.title), el('small', 'url', b.url))
      x.onclick = async () => { await qat.bm.remove(b.url, b.folder); draw() }
      row.append(a, x)
      box.append(row)
    }
    list.append(box)
  }
}

qat.profiles().then(p => { $('#prof').replaceChildren(...p.map(x => Object.assign(document.createElement('option'), { value: x.dir, textContent: x.name }))); $('#prof').hidden = $('#imp').hidden = !p.length })
$('#imp').onclick = async () => {
  try { const n = await qat.bm.import($('#prof').value); note.textContent = n ? 'Imported ' + n + ' bookmarks' : 'Nothing new to import' } catch { note.textContent = 'That Chrome profile has no bookmarks file' }
  draw()
}
$('#q').oninput = draw
draw()
