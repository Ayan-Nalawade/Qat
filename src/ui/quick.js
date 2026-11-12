const $ = s => document.querySelector(s)
const input = $('#q-in'), wrap = $('#wrap'), card = $('#card'), ans = $('#ans'), out = $('#ans-body'), live = $('#live'), modeBtn = $('#mode'), B = document.body
let msgs = [], rid = 0, busy = false, text = '', last = 0, raf = 0, steps = 0, agent = true
try { agent = localStorage.quickAgent !== '0' } catch {}

// the view is only as big as this, main sizes it from what we report
new ResizeObserver(() => qat.quick.size(wrap.offsetHeight)).observe(wrap)
// glass.js only re-reads slab positions on events, so nudge it every frame while things move
const follow = ms => { const end = performance.now() + ms, f = () => { dispatchEvent(new Event('resize')); performance.now() < end && requestAnimationFrame(f) }; f() }
const shut = () => { qat.quick.close(); B.classList.remove('in') }
const paintMode = () => { modeBtn.classList.toggle('on', agent); modeBtn.title = agent ? 'Browser control is on, it can click and type in this tab (Tab)' : 'Browser control is off, it only searches in the background (Tab)' }
paintMode()

function reset() { msgs = []; text = ''; card.hidden = true; out.replaceChildren(); follow(50) }

function paint() {
  raf = 0
  ans.hidden = !text
  out.innerHTML = md(text)
  const sc = $('#ans-scroll')
  if (busy) sc.scrollTop = sc.scrollHeight
  follow(50)
}
const repaint = () => raf ||= requestAnimationFrame(paint)
const status = t => { live.hidden = !t; live.querySelector('span').textContent = t || ''; live.querySelector('b').textContent = steps ? 'step ' + steps : ''; follow(50) }

function setBusy(v) {
  busy = v
  B.classList.toggle('busy', v)
  qat.quick.run(v)
  if (!v) status('')
}

function ask(q) {
  q = q.trim()
  if (!q || busy) return
  msgs.push({ role: 'user', content: q })
  text = ''
  steps = 0
  $('#ans-q').textContent = q
  card.hidden = false
  ans.hidden = true
  out.replaceChildren()
  input.value = ''
  B.classList.remove('typed')
  status('Thinking')
  setBusy(true)
  qat.ai.chat(++rid, msgs.slice(-12), agent, true)
}

qat.on('quick:open', t => {
  if (!busy && Date.now() - last > 5 * 60000) reset() // short memory, a question after a long break starts fresh
  B.style.setProperty('--maxh', (t.maxH || 420) + 'px')
  input.placeholder = t.title ? 'Ask about ' + (t.title.length > 36 ? t.title.slice(0, 36) + '...' : t.title) + ' or tell Qat what to do' : 'Ask or tell Qat what to do'
  B.classList.remove('in')
  void B.offsetWidth
  B.classList.add('in')
  input.focus()
  input.select()
  follow(300)
})

const mine = d => d.rid === rid
qat.on('ai:think', d => mine(d) && !text && status('Thinking'))
qat.on('ai:step', d => { if (mine(d) && d.state === 'run') { steps++; status(d.label) } })
qat.on('ai:chunk', d => { if (!mine(d)) return; status(''); text += d.text; repaint() })
qat.on('ai:note', d => { if (mine(d)) { text += '\n\n*' + d.text + '*'; repaint() } })
qat.on('ai:done', d => { if (!mine(d)) return; text ||= 'Done.'; msgs.push({ role: 'assistant', content: text }); last = Date.now(); setBusy(false); paint() })
qat.on('ai:error', d => {
  if (!mine(d)) return
  msgs.pop()
  setBusy(false)
  text = ''
  ans.hidden = false
  out.innerHTML = '<p class="err"></p>'
  out.firstChild.textContent = /key|401|403/i.test(d.message) ? 'Add an API key in Settings first. ' + d.message : d.message
  follow(50)
})

$('#ask').onsubmit = e => { e.preventDefault(); busy ? qat.ai.stop(rid) : ask(input.value) }
modeBtn.onclick = () => { agent = !agent; try { localStorage.quickAgent = agent ? '1' : '0' } catch {} paintMode(); input.focus() }
input.oninput = () => B.classList.toggle('typed', !!input.value.trim())
input.onkeydown = e => { if (e.key === 'Tab') { e.preventDefault(); modeBtn.click() } }
$('#fresh').onclick = () => { reset(); input.focus() }
$('#copy').onclick = () => { navigator.clipboard.writeText(text); $('#copy span').textContent = 'Copied'; setTimeout(() => { $('#copy span').textContent = 'Copy' }, 1200) }
$('#move').onclick = () => qat.quick.move(msgs.map(m => m.role === 'user' ? { role: 'user', content: m.content, files: [] } : { role: 'assistant', parts: [{ type: 'text', text: m.content }] }))
out.onclick = e => { const a = e.target.closest('a'); if (a) { e.preventDefault(); qat.newTab(a.dataset.u); shut() } }
addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); shut() } }) // an answer still coming keeps going and is there next time
addEventListener('blur', () => { if (!busy && !msgs.length) shut() }) // clicked away before asking anything
