const $ = s => document.querySelector(s)
const input = $('#q-in'), ans = $('#ans'), out = $('#ans-body'), stat = $('#ans-stat'), act = $('#ans-act')
let msgs = [], rid = 0, busy = false, text = '', last = 0, tab = {}, raf = 0

// glass.js only re-reads slab positions on events, so nudge it every frame while things slide in
const follow = ms => { const end = performance.now() + ms, f = () => { dispatchEvent(new Event('resize')); performance.now() < end && requestAnimationFrame(f) }; f() }
const shut = () => { qat.quick.close(); document.body.classList.remove('in') }

function reset() { msgs = []; text = ''; ans.hidden = true; out.replaceChildren(); follow(50) }

function paint() {
  raf = 0
  out.innerHTML = md(text)
  const sc = $('#ans-scroll')
  if (busy) sc.scrollTop = sc.scrollHeight
  follow(50)
}
const repaint = () => raf ||= requestAnimationFrame(paint)

function status(t) { stat.hidden = !t; stat.querySelector('span').textContent = t || '' }

function setBusy(v) {
  busy = v
  document.body.classList.toggle('busy', v)
  act.hidden = v || !text
  if (!v) status('')
}

function ask(q) {
  q = q.trim()
  if (!q || busy) return
  msgs.push({ role: 'user', content: q })
  text = ''
  $('#ans-q').textContent = q
  ans.hidden = false
  out.replaceChildren()
  input.value = ''
  document.body.classList.remove('typed')
  status('Thinking')
  setBusy(true)
  follow(400)
  qat.ai.chat(++rid, msgs.slice(-12), false, true)
}

qat.on('quick:open', t => {
  tab = t || {}
  if (!busy && Date.now() - last > 5 * 60000) reset() // short memory, a question after a long break starts fresh
  document.body.classList.remove('in')
  void document.body.offsetWidth
  document.body.classList.add('in')
  input.placeholder = tab.title ? 'Ask about ' + (tab.title.length > 40 ? tab.title.slice(0, 40) + '...' : tab.title) + ', or anything' : 'Ask anything'
  input.focus()
  input.select()
  follow(700)
})

const mine = d => d.rid === rid
qat.on('ai:think', d => mine(d) && !text && status('Thinking'))
qat.on('ai:step', d => mine(d) && d.state === 'run' && status(d.label))
qat.on('ai:chunk', d => { if (!mine(d)) return; status(''); text += d.text; repaint() })
qat.on('ai:note', d => { if (mine(d)) { text += '\n\n*' + d.text + '*'; repaint() } })
qat.on('ai:done', d => { if (!mine(d)) return; msgs.push({ role: 'assistant', content: text }); last = Date.now(); setBusy(false); paint() })
qat.on('ai:error', d => {
  if (!mine(d)) return
  msgs.pop()
  setBusy(false)
  out.innerHTML = '<p class="err"></p>'
  out.firstChild.textContent = /key|401|403/i.test(d.message) ? 'Add an API key in Settings first. ' + d.message : d.message
  follow(50)
})

$('#ask').onsubmit = e => { e.preventDefault(); ask(input.value) }
$('#q-send').onclick = e => { e.preventDefault(); ask(input.value) }
input.oninput = () => document.body.classList.toggle('typed', !!input.value.trim())
$('#ans-x').onclick = shut
$('#fresh').onclick = () => { reset(); input.focus() }
$('#copy').onclick = () => { navigator.clipboard.writeText(text); $('#copy span').textContent = 'Copied'; setTimeout(() => { $('#copy span').textContent = 'Copy' }, 1200) }
$('#move').onclick = () => qat.quick.move(msgs.map(m => m.role === 'user' ? { role: 'user', content: m.content, files: [] } : { role: 'assistant', parts: [{ type: 'text', text: m.content }] }))
out.onclick = e => { const a = e.target.closest('a'); if (a) { e.preventDefault(); qat.newTab(a.dataset.u); shut() } }
addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); shut() } }) // an answer still coming keeps going and is there next time
addEventListener('mousedown', e => { if (!e.target.closest('#q')) shut() }) // clicking the page around it closes it, like any popup
