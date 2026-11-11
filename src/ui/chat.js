const msgsEl = $('#chat-msgs'), pickEl = $('#chat-pick'), input = $('#chat-in'), sendBtn = $('#chat-send')
const sel = Object.assign(document.createElement('select'), { className: 'ctl' })
let cache = {}, cfg, msgs = [], streaming = false, rid = 0, err = '', lastEl = null, stick = true

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function md(src) {
  const stash = []
  const keep = h => '\0' + (stash.push(h) - 1) + '\0'
  let s = esc(src).replace(/```[^\n`]*\n?([\s\S]*?)(```|$)/g, (m, c) => keep('<div class="code"><button class="copy">Copy</button><pre><code>' + c.replace(/\n$/, '') + '</code></pre></div>'))
  s = s.replace(/`([^`\n]+)`/g, (m, c) => keep('<code>' + c + '</code>'))
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*([^*\s][^*]*?)\*/g, '<i>$1</i>').replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="#" data-u="$2">$1</a>')
  let out = '', list = '', para = []
  const flush = () => { if (para.length) out += '<p>' + inline(para.join('<br>')) + '</p>'; para = [] }
  const close = () => { if (list) out += '</' + list + '>'; list = '' }
  for (const line of s.split('\n')) {
    let m
    if (!line.trim()) { flush(); close() }
    else if (/^\0\d+\0$/.test(line.trim())) { flush(); close(); out += line.trim() }
    else if ((m = line.match(/^#{1,3}\s+(.*)/))) { flush(); close(); out += '<p class="h">' + inline(m[1]) + '</p>' }
    else if ((m = line.match(/^\s*([-*]|\d+\.)\s+(.*)/))) {
      flush()
      const t = /\d/.test(m[1]) ? 'ol' : 'ul'
      if (list !== t) { close(); out += '<' + t + '>'; list = t }
      out += '<li>' + inline(m[2]) + '</li>'
    } else { close(); para.push(line) }
  }
  flush(); close()
  return out.replace(/\0(\d+)\0/g, (m, i) => stash[i])
}

function bubble(m) {
  const el = document.createElement('div')
  el.className = 'msg ' + m.role
  if (m.role === 'user') el.textContent = m.content
  else el.innerHTML = md(m.content)
  return el
}

function empty() {
  const el = document.createElement('div')
  el.className = 'empty'
  const p = cfg.providers[cfg.provider]
  if (!p.hasKey && cfg.provider !== 'custom') {
    el.innerHTML = '<p>Add an API key for ' + esc(p.name) + ' to start chatting.</p><button class="pill">Open settings</button>'
    el.querySelector('button').onclick = openSettings
  } else el.innerHTML = '<p>Ask anything.</p>'
  return el
}

function draw() {
  msgsEl.innerHTML = ''
  lastEl = null
  if (!msgs.length) msgsEl.append(empty())
  for (const m of msgs) msgsEl.append(lastEl = bubble(m))
  if (err) { const e = document.createElement('div'); e.className = 'err'; e.textContent = err; msgsEl.append(e) }
  if (stick) msgsEl.scrollTop = msgsEl.scrollHeight
}

function label() {
  $('#chat-prov').textContent = cfg.providers[cfg.provider].model
}

function setStreaming(v) {
  streaming = v
  sendBtn.classList.toggle('streaming', v)
  sendBtn.title = v ? 'Stop' : 'Send'
}

function grow() {
  input.style.height = 'auto'
  input.style.height = Math.min(input.scrollHeight, 150) + 'px'
}

function send() {
  const text = input.value.trim()
  if (!text || streaming) return
  err = ''
  stick = true
  msgs.push({ role: 'user', content: text }, { role: 'assistant', content: '' })
  input.value = ''
  grow()
  setStreaming(true)
  draw()
  qat.ai.chat(++rid, msgs.slice(0, -1).slice(-40))
}

qat.on('ai:chunk', d => {
  if (d.rid !== rid) return
  const m = msgs.at(-1)
  m.content += d.text
  lastEl.innerHTML = md(m.content)
  if (stick) msgsEl.scrollTop = msgsEl.scrollHeight
})
qat.on('ai:done', d => {
  if (d.rid !== rid) return
  setStreaming(false)
  if (!msgs.at(-1).content) { msgs.pop(); draw() }
})
qat.on('ai:error', d => {
  if (d.rid !== rid) return
  setStreaming(false)
  err = d.message
  if (!msgs.at(-1).content) msgs.pop()
  draw()
})

msgsEl.addEventListener('scroll', () => { stick = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 40 })
msgsEl.addEventListener('click', e => {
  const a = e.target.closest('a'), c = e.target.closest('.copy')
  if (a) { e.preventDefault(); qat.newTab(a.dataset.u) }
  if (c) { navigator.clipboard.writeText(c.nextElementSibling.textContent); c.textContent = 'Copied'; setTimeout(() => { c.textContent = 'Copy' }, 1200) }
})
input.addEventListener('input', grow)
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } })
sendBtn.onclick = () => streaming ? qat.ai.stop(rid) : send()
$('#chat-new').onclick = () => { if (streaming) qat.ai.stop(rid); rid++; setStreaming(false); msgs = []; err = ''; closePick(); draw() }
$('#ai-toggle').addEventListener('click', () => { if ($('#side').classList.contains('open')) input.focus() })

const openSettings = () => qat.newTab('qat://settings')

function showPick() {
  const id = sel.value
  qatPicker(pickEl, {
    lead: sel, current: cfg.providers[id].model,
    load: async () => cache[id] ||= await qat.ai.models(id),
    onPick: async model => { cfg = await qat.ai.pick({ provider: id, model }); closePick(); label(); draw() },
    onClose: closePick,
    action: { label: 'Open settings', run: openSettings },
  })
}

function openPick() {
  sel.innerHTML = Object.entries(cfg.providers).map(([id, p]) => '<option value="' + id + '">' + esc(p.name) + (!p.hasKey && id !== 'custom' ? ' (no key)' : '') + '</option>').join('')
  sel.value = cfg.provider
  msgsEl.hidden = true
  pickEl.hidden = false
  showPick()
}

function closePick() { pickEl.hidden = true; msgsEl.hidden = false }

sel.onchange = showPick
$('#chat-prov').onclick = () => pickEl.hidden ? openPick() : closePick()
$('#chat-set').onclick = openSettings
qat.on('ai:changed', s => { cfg = s; cache = {}; label(); draw() })

qat.ai.settings().then(s => { cfg = s; label(); draw() })
