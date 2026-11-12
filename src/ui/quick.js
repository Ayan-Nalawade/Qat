const $ = s => document.querySelector(s)
const input = $('#q-in'), card = $('#card'), out = $('#ans-body'), meta = $('#meta'), modeBtn = $('#mode'), B = document.body
let msgs = [], rid = 0, busy = false, text = '', last = 0, raf = 0, steps = 0, agent = true, t0 = 0, verb = '', away = false
try { agent = localStorage.quickAgent !== '0' } catch {}

// glass.js only re-reads slab positions on events, so nudge it every frame while things move
const follow = ms => { const end = performance.now() + ms, f = () => { dispatchEvent(new Event('resize')); performance.now() < end && requestAnimationFrame(f) }; f() }
const shut = () => { qat.quick.close(); B.classList.remove('in') }
// the page's own takeover bar looks the same, so while it clicks around we step aside and let that one show
const aside = v => { if (away !== v) { away = v; qat.quick.hide(v) } }

function line() {
  const s = Math.floor((Date.now() - t0) / 1000), tm = Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0')
  const t = busy ? 'Qat is ' + verb + (steps ? ' · step ' + steps : '') + ' · ' + tm : 'Quick ask · browser control ' + (agent ? 'on' : 'off')
  if (meta.textContent !== t) { const swap = !meta.textContent.startsWith(t.slice(0, 12)); meta.textContent = t; if (swap) { meta.classList.remove('in'); void meta.offsetWidth; meta.classList.add('in') } }
}
setInterval(() => busy && line(), 1000)

const paintMode = () => { modeBtn.classList.toggle('on', agent); modeBtn.title = agent ? 'Browser control on: it can click and type in this tab (Tab)' : 'Browser control off: it only searches in the background (Tab)'; line() }
paintMode()

function reset() { msgs = []; text = ''; card.hidden = true; out.replaceChildren(); follow(50) }

function paint() {
  raf = 0
  card.hidden = !text
  out.innerHTML = md(text)
  const sc = $('#ans-scroll')
  if (busy) sc.scrollTop = sc.scrollHeight
  follow(500)
}
const repaint = () => raf ||= requestAnimationFrame(paint)

function setBusy(v) {
  busy = v
  B.classList.toggle('busy', v)
  $('#go span').textContent = v ? 'Stop' : 'Ask'
  qat.quick.run(v)
  if (!v) aside(false)
  line()
}

function ask(q) {
  q = q.trim()
  if (!q || busy) return
  msgs.push({ role: 'user', content: q })
  text = ''
  steps = 0
  t0 = Date.now()
  verb = 'thinking'
  $('#ans-q').textContent = q
  card.hidden = true
  input.value = ''
  input.placeholder = q
  setBusy(true)
  follow(300)
  qat.ai.chat(++rid, msgs.slice(-12), agent, true)
}

qat.on('quick:open', t => {
  if (!busy && Date.now() - last > 5 * 60000) reset() // short memory, a question after a long break starts fresh
  input.placeholder = t.title ? 'Ask about ' + (t.title.length > 34 ? t.title.slice(0, 34) + '...' : t.title) + ' or tell Qat what to do' : 'Ask or tell Qat what to do'
  B.classList.remove('in')
  void B.offsetWidth
  B.classList.add('in')
  input.focus()
  input.select()
  follow(600)
})

const mine = d => d.rid === rid
qat.on('ai:think', d => { if (mine(d) && !text) { verb = 'thinking'; line() } })
qat.on('ai:step', d => {
  if (!mine(d) || d.state !== 'run') return
  steps++
  verb = d.web ? (/^Read/.test(d.label) ? 'reading' : 'searching') : 'browsing'
  if (!d.web) aside(true)
  line()
})
qat.on('ai:chunk', d => { if (!mine(d)) return; aside(false); verb = 'answering'; text += d.text; repaint() })
qat.on('ai:note', d => { if (mine(d)) { text += '\n\n*' + d.text + '*'; repaint() } })
qat.on('ai:done', d => { if (!mine(d)) return; text ||= 'Done.'; msgs.push({ role: 'assistant', content: text }); last = Date.now(); setBusy(false); paint() })
qat.on('ai:error', d => {
  if (!mine(d)) return
  msgs.pop()
  setBusy(false)
  text = ' '
  card.hidden = false
  out.innerHTML = '<p class="err"></p>'
  out.firstChild.textContent = /key|401|403/i.test(d.message) ? 'Add an API key in Settings first. ' + d.message : d.message
  follow(500)
})

$('#pill').onsubmit = e => { e.preventDefault(); busy ? qat.ai.stop(rid) : ask(input.value) }
modeBtn.onclick = () => { agent = !agent; try { localStorage.quickAgent = agent ? '1' : '0' } catch {} paintMode(); input.focus() }
input.onkeydown = e => { if (e.key === 'Tab') { e.preventDefault(); modeBtn.click() } }
$('#fresh').onclick = () => { reset(); input.focus() }
$('#copy').onclick = () => { navigator.clipboard.writeText(text); $('#copy span').textContent = 'Copied'; setTimeout(() => { $('#copy span').textContent = 'Copy' }, 1200) }
$('#move').onclick = () => qat.quick.move(msgs.map(m => m.role === 'user' ? { role: 'user', content: m.content, files: [] } : { role: 'assistant', parts: [{ type: 'text', text: m.content }] }))
out.onclick = e => { const a = e.target.closest('a'); if (a) { e.preventDefault(); qat.newTab(a.dataset.u); shut() } }
addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); shut() } }) // an answer still coming keeps going and is there next time
addEventListener('mousedown', e => { if (!e.target.closest('#q')) shut() }) // clicking the page around it closes it, like any popup
