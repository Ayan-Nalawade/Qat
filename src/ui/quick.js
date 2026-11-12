const $ = s => document.querySelector(s)
const input = $('#q-in'), sheet = $('#sheet'), ans = $('#ans'), out = $('#ans-body'), live = $('#live'), modeBtn = $('#mode'), B = document.body
let msgs = [], rid = 0, busy = false, text = '', last = 0, raf = 0, steps = 0, agent = true
try { agent = localStorage.quickAgent !== '0' } catch {}

// the view is only as big as the sheet, main sizes it from this
new ResizeObserver(() => qat.quick.size(sheet.offsetHeight + 34)).observe(sheet)
// glass.js only re-reads slab positions on events, so nudge it every frame while things move
const follow = ms => { const end = performance.now() + ms, f = () => { dispatchEvent(new Event('resize')); performance.now() < end && requestAnimationFrame(f) }; f() }
const shut = () => { qat.quick.close(); B.classList.remove('in') }
const paintMode = () => { modeBtn.classList.toggle('on', agent); input.placeholder = agent ? 'Ask or tell Qat what to do' : 'Ask anything, it only searches in the background' }
paintMode()

function reset() { msgs = []; text = ''; ans.hidden = true; out.replaceChildren(); B.classList.remove('asked'); follow(50) }

function paint() {
  raf = 0
  out.innerHTML = md(text)
  const sc = $('#ans-scroll')
  if (busy) sc.scrollTop = sc.scrollHeight
  follow(50)
}
const repaint = () => raf ||= requestAnimationFrame(paint)
const status = t => { live.hidden = !t; live.querySelector('span').textContent = t || ''; live.querySelector('b').textContent = steps ? 'step ' + steps : '' }

function setBusy(v) {
  busy = v
  B.classList.toggle('busy', v)
  qat.quick.run(v)
  if (!v) { status(''); B.classList.remove('driving') }
  follow(300)
}

function ask(q) {
  q = q.trim()
  if (!q || busy) return
  msgs.push({ role: 'user', content: q })
  text = ''
  steps = 0
  $('#ans-q').textContent = q
  ans.hidden = false
  out.replaceChildren()
  input.value = ''
  B.classList.remove('typed')
  B.classList.add('asked')
  status('Thinking')
  setBusy(true)
  qat.ai.chat(++rid, msgs.slice(-12), agent, true)
}

qat.on('quick:open', t => {
  if (!busy && Date.now() - last > 5 * 60000) reset() // short memory, a question after a long break starts fresh
  B.style.setProperty('--maxh', (t.maxH || 420) + 'px')
  $('#where').textContent = t.title ? 'on ' + t.title : ''
  B.classList.remove('in')
  void B.offsetWidth
  B.classList.add('in')
  input.focus()
  input.select()
  follow(400)
})

const mine = d => d.rid === rid
qat.on('ai:think', d => mine(d) && !text && status('Thinking'))
qat.on('ai:step', d => {
  if (!mine(d) || d.state !== 'run') return
  steps++
  if (!d.web) B.classList.add('driving') // working in the tab, fold down to one line so the page is visible
  status(d.label)
})
qat.on('ai:chunk', d => { if (!mine(d)) return; B.classList.remove('driving'); status(''); text += d.text; repaint() })
qat.on('ai:note', d => { if (mine(d)) { text += '\n\n*' + d.text + '*'; repaint() } })
qat.on('ai:done', d => { if (!mine(d)) return; msgs.push({ role: 'assistant', content: text || 'Done.' }); text ||= 'Done.'; last = Date.now(); setBusy(false); paint() })
qat.on('ai:error', d => {
  if (!mine(d)) return
  msgs.pop()
  setBusy(false)
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
