function qatPicker(box, { load, current, onPick, onClose, lead, action }) {
  box.classList.add('pk')
  box.innerHTML = '<div class="pk-row"><input class="ctl pk-q" placeholder="Search models" spellcheck="false" autocomplete="off"></div><div class="pk-list"><div class="pk-msg">Loading...</div></div><div class="pk-count"></div>'
  const q = box.querySelector('.pk-q'), list = box.querySelector('.pk-list'), count = box.querySelector('.pk-count')
  let ids = [], shown = [], hi = 0
  if (lead) q.before(lead)
  q.focus()
  const go = (i, block = 'nearest') => {
    list.children[hi]?.classList.remove('hi')
    hi = Math.max(0, Math.min(shown.length - 1, i))
    const el = list.children[hi]
    el?.classList.add('hi')
    el?.scrollIntoView({ block })
  }
  const paint = first => {
    const t = q.value.trim().toLowerCase()
    shown = ids.filter(i => i.toLowerCase().includes(t))
    list.innerHTML = ''
    for (const id of shown) {
      const d = document.createElement('div')
      d.className = 'pk-item' + (id === current ? ' cur' : '')
      d.textContent = d.title = id
      d.onclick = () => onPick(id)
      list.append(d)
    }
    count.textContent = shown.length + ' models'
    go(first ? shown.indexOf(current) : 0, first ? 'center' : 'nearest')
  }
  load().then(r => { ids = r; paint(true) }, e => {
    list.innerHTML = ''
    const d = document.createElement('div')
    d.className = 'pk-msg bad'
    d.textContent = e.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')
    list.append(d)
    if (action) {
      const b = document.createElement('button')
      b.className = 'pill'
      b.textContent = action.label
      b.onclick = action.run
      list.append(b)
    }
  })
  q.oninput = () => paint()
  box.onkeydown = e => {
    if (e.key === 'Escape') onClose()
    else if (e.target !== q) return
    else if (e.key === 'ArrowDown') go(hi + 1)
    else if (e.key === 'ArrowUp') go(hi - 1)
    else if (e.key === 'Enter' && shown[hi]) onPick(shown[hi])
    else return
    e.preventDefault()
  }
}
