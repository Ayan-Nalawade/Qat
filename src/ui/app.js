const $ = s => document.querySelector(s)
const omni = $('#omnibox'), tabsEl = $('#tabs'), vp = $('#viewport')
let state = { tabs: [], activeId: null }

const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'

function render() {
  const cur = state.tabs.find(t => t.id === state.activeId)
  tabsEl.innerHTML = ''
  for (const t of state.tabs) {
    const el = document.createElement('div')
    el.className = 'tab' + (t.id === state.activeId ? ' active' : '') + (t.sleeping ? ' sleeping' : '')
    el.title = t.title
    el.innerHTML = (t.loading ? '<i class="spin"></i>' : t.favicon ? '<img class="fav" alt="">' : '<i class="dot"></i>') + '<span class="title"></span><button class="x" title="Close tab">' + X + '</button>'
    el.querySelector('.title').textContent = t.title
    const img = el.querySelector('img')
    if (img) { img.src = t.favicon; img.onerror = () => img.replaceWith(Object.assign(document.createElement('i'), { className: 'dot' })) }
    el.onmousedown = e => { if (e.button === 1) { e.preventDefault(); qat.closeTab(t.id) } else if (e.button === 0 && !e.target.closest('.x')) qat.activateTab(t.id) }
    el.querySelector('.x').onclick = () => qat.closeTab(t.id)
    tabsEl.append(el)
  }
  $('#back').disabled = !cur.canGoBack
  $('#forward').disabled = !cur.canGoForward
  $('#reload').classList.toggle('loading', cur.loading)
  $('#loadbar').classList.toggle('on', cur.loading)
  if (document.activeElement !== omni) omni.value = cur.url
}

qat.on('tabs', s => { state = s; render() })
qat.on('mem', mb => { $('#mem-val').textContent = mb + ' MB' })
qat.on('focus-omnibox', () => { omni.focus(); omni.select() })
qat.on('maximized', m => { $('#w-max').title = m ? 'Restore' : 'Maximize' })

omni.addEventListener('keydown', e => { if (e.key === 'Enter' && omni.value.trim()) { qat.go(omni.value); omni.blur() } else if (e.key === 'Escape') omni.blur() })
omni.addEventListener('focus', () => omni.select())
omni.addEventListener('blur', () => state.activeId && render())
$('#back').onclick = qat.back
$('#forward').onclick = qat.forward
$('#reload').onclick = qat.reload
$('#new-tab').onclick = () => qat.newTab()
$('#mem').onclick = qat.sleepAll
$('#ai-toggle').onclick = () => $('#ai-toggle').classList.toggle('on', $('#side').classList.toggle('open'))
$('#w-min').onclick = qat.minimize
$('#w-max').onclick = qat.maximize
$('#w-close').onclick = qat.close

addEventListener('keydown', e => {
  const c = e.ctrlKey || e.metaKey, k = e.key.toLowerCase(), cur = state.activeId
  const ids = state.tabs.map(t => t.id), i = ids.indexOf(cur)
  if (c && !e.shiftKey && k === 't') qat.newTab()
  else if (c && k === 'w') qat.closeTab(cur)
  else if (c && k === 'l') { omni.focus(); omni.select() }
  else if ((c && k === 'r') || k === 'f5') qat.reload()
  else if (c && k === 'tab') qat.activateTab(ids[(i + (e.shiftKey ? -1 : 1) + ids.length) % ids.length])
  else if (e.altKey && k === 'arrowleft') qat.back()
  else if (e.altKey && k === 'arrowright') qat.forward()
  else if (c && e.shiftKey && k === 'i') qat.devtools()
  else return
  e.preventDefault()
})

const sendRect = () => { const r = vp.getBoundingClientRect(); qat.viewportRect({ x: r.x + 1, y: r.y + 1, width: r.width - 2, height: r.height - 2 }) }
new ResizeObserver(sendRect).observe(vp)
addEventListener('resize', sendRect)
sendRect()
qat.ready()
