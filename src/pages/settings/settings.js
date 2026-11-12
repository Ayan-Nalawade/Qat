const $ = s => document.querySelector(s)
const msgOf = e => e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
let cfg

function card(id) {
  const el = document.createElement('section')
  el.className = 'card glass'
  el.innerHTML = '<h3></h3>' +
    '<label>Base URL<span class="row"><input class="ctl base" spellcheck="false" autocomplete="off"><button type="button" class="link reset">Reset to default</button></span></label>' +
    '<label>API key<span class="row"><input class="ctl key" type="password" autocomplete="off"><button type="button" class="pill clear">Clear key</button></span></label>' +
    '<label>Default model<span class="row"><input class="ctl model" spellcheck="false" autocomplete="off"><button type="button" class="pill browse">Browse</button></span></label>' +
    '<div class="pick" hidden></div>' +
    '<div class="actions"><button type="button" class="pill test">Test connection</button><button type="button" class="pill primary save">Save</button><span class="note"></span></div>'
  const q = s => el.querySelector(s), note = q('.note')
  const say = (t, bad) => { note.textContent = t; note.className = 'note' + (bad ? ' bad' : '') }
  const fill = () => { const c = cfg.providers[id]; q('.base').value = c.base; q('.model').value = c.model; q('.key').value = ''; q('.key').placeholder = c.hasKey ? 'Saved' : 'Paste API key' }
  const save = async key => { cfg = await qat.ai.save({ provider: cfg.provider, id, base: q('.base').value, model: q('.model').value, key }); fill() }
  const run = f => async () => { try { await f() } catch (e) { say(msgOf(e), true) } }
  q('h3').textContent = cfg.providers[id].name
  fill()
  q('.reset').onclick = () => { q('.base').value = cfg.providers[id].defBase }
  q('.clear').onclick = run(async () => { await save(null); say('Key cleared') })
  q('.save').onclick = run(async () => { await save(q('.key').value); say('Saved'); setTimeout(() => say(''), 2000) })
  q('.test').onclick = run(async () => { say('Testing...'); await save(q('.key').value); say('Connected, ' + (await qat.ai.models(id)).length + ' models') })
  q('.browse').onclick = () => {
    const box = q('.pick')
    if (!box.hidden) return void (box.hidden = true)
    box.hidden = false
    qatPicker(box, {
      current: q('.model').value,
      load: async () => { await save(q('.key').value); return qat.ai.models(id) },
      onPick: m => { q('.model').value = m; box.hidden = true },
      onClose: () => { box.hidden = true },
    })
  }
  return el
}

qat.ai.settings().then(s => {
  cfg = s
  const sel = $('#active')
  sel.innerHTML = Object.entries(cfg.providers).map(([id, p]) => '<option value="' + id + '">' + p.name + '</option>').join('')
  sel.value = cfg.provider
  sel.onchange = async () => { cfg = await qat.ai.pick({ provider: sel.value, model: cfg.providers[sel.value].model }) }
  $('#cards').append(...Object.keys(cfg.providers).map(card))
})

const deep = $('#deep'), dn = $('#deep-note')
qat.block.get().then(v => deep.checked = v)
deep.onchange = async () => {
  deep.disabled = true
  dn.textContent = deep.checked ? 'Downloading filter lists...' : ''
  try { await qat.block.set(deep.checked); dn.textContent = deep.checked ? 'Deep scan is on.' : 'Deep scan is off.' } catch (e) { dn.textContent = msgOf(e); deep.checked = !deep.checked }
  deep.disabled = false
}
