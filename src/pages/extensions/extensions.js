const $ = s => document.querySelector(s), note = $('#note')
const el = (tag, cls, txt) => Object.assign(document.createElement(tag), { className: cls || '', textContent: txt || '' })
const say = (t, bad) => { note.textContent = t; note.className = 'note' + (bad ? ' bad' : '') }

async function draw() {
  const list = $('#list'), exts = await qat.ext.list()
  list.innerHTML = ''
  if (!exts.length) return list.append(el('div', 'empty', 'No extensions yet. Import them from Chrome or load an unpacked folder.'))
  for (const x of exts) {
    const row = el('div', 'item'), txt = el('span', 'txt'), sw = el('input', 'sw'), img = el('img', 'ico')
    img.src = x.icon || 'qat://settings/shared/icon.png'
    txt.append(el('b', '', x.name + '  ' + x.version), el('small', '', x.description))
    if (x.error) txt.append(el('small', 'bad', x.error))
    row.append(img, txt)
    for (const [label, url] of [['Open', x.popup], ['Options', x.options]]) if (url && x.on) { const b = el('button', 'pill', label); b.onclick = () => qat.ext.open(url); row.append(b) }
    const rm = el('button', 'pill', 'Remove')
    rm.onclick = async () => { if (confirm('Remove ' + x.name + '?')) { await qat.ext.remove(x.id); draw() } }
    sw.type = 'checkbox'
    sw.checked = x.on
    sw.title = x.on ? 'Turn off' : 'Turn on'
    sw.onchange = async () => { await qat.ext.toggle(x.id); draw() }
    row.append(rm, sw)
    list.append(row)
  }
}

qat.profiles().then(p => { $('#prof').innerHTML = p.map(x => '<option value="' + x.dir + '"></option>').join(''); [...$('#prof').options].forEach((o, i) => o.textContent = p[i].name); $('#prof').hidden = $('#imp').hidden = !p.length })
$('#imp').onclick = async () => {
  say('Importing...')
  try { const errs = await qat.ext.import($('#prof').value); errs.length ? say("Some didn't load: " + errs.join('; '), true) : say('Done') } catch { say('That Chrome profile has no extensions', true) }
  draw()
}
$('#load').onclick = async () => { const err = await qat.ext.load(); if (err) say(err, true); draw() }
draw()
