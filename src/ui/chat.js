const msgsEl = $('#chat-msgs'), pickEl = $('#chat-pick'), input = $('#chat-in'), sendBtn = $('#chat-send'), agentBtn = $('#agent'), working = $('#working')
const sel = Object.assign(document.createElement('select'), { className: 'ctl' })
let cache = {}, cfg, msgs = [], busy = false, rid = 0, err = '', stick = true, tab = {}, agent = true
try { agent = localStorage.agent !== '0' } catch {}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const I = {
  ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>', err: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg>', spark: '<svg viewBox="0 0 24 24"><path d="M12 4l1.8 5.2L19 11l-5.2 1.8L12 18l-1.8-5.2L5 11l5.2-1.8z"/></svg>',
}
const SUGG = [['Summarize this page', 'Summarize this page in a few bullet points.'], ['What should I know here?', 'What are the most important things on this page?'], ['Find something for me', 'Search the web and find '], ['Fill in a form', 'Help me fill in the form on this page. Ask me for anything you need.']]

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

function steps(p, live) {
  const d = document.createElement('details'), done = p.steps.filter(s => s.state !== 'run').length, bad = p.steps.some(s => s.state === 'err')
  d.className = 'steps'
  d.open = live || p.open
  d.innerHTML = '<summary>' + I.spark + '<span>' + (live ? 'Using the browser' : 'Used the browser') + ', ' + p.steps.length + ' step' + (p.steps.length > 1 ? 's' : '') + (bad && !live ? ', some failed' : '') + '</span>' + I.chev + '</summary><ol></ol>'
  for (const s of p.steps) {
    const li = document.createElement('li')
    li.className = 'step ' + s.state
    li.innerHTML = '<span class="ic">' + (s.state === 'run' ? '<i class="spin"></i>' : I[s.state]) + '</span><span class="l"></span>'
    li.querySelector('.l').textContent = s.label
    if (s.detail) li.querySelector('.l').append(Object.assign(document.createElement('small'), { textContent: s.detail }))
    d.querySelector('ol').append(li)
  }
  d.querySelector('summary').onclick = () => { p.open = !d.open }
  return d
}

function bubble(m, last) {
  const el = document.createElement('div')
  el.className = 'msg ' + m.role
  if (m.role === 'user') { el.textContent = m.content; return el }
  for (const p of m.parts) {
    if (p.type === 'text') el.append(Object.assign(document.createElement('div'), { className: 'txt', innerHTML: md(p.text) }))
    else if (p.type === 'steps') el.append(steps(p, last && busy))
    else el.append(Object.assign(document.createElement('div'), { className: 'note', textContent: p.text }))
  }
  if (last && busy && m.parts.at(-1)?.type !== 'text') el.append(Object.assign(document.createElement('div'), { className: 'typing', innerHTML: '<i></i><i></i><i></i>' }))
  return el
}

function empty() {
  const el = document.createElement('div'), p = cfg.providers[cfg.provider]
  el.className = 'empty'
  el.innerHTML = '<img src="icon.png" alt=""><h3>How can I help?</h3>'
  if (!p.hasKey && cfg.provider !== 'custom') {
    el.insertAdjacentHTML('beforeend', '<p>Add an API key for ' + esc(p.name) + ' to start.</p><button class="pill">Open settings</button>')
    el.querySelector('button').onclick = openSettings
    return el
  }
  el.insertAdjacentHTML('beforeend', '<p>' + (agent ? 'I can read this page and use the browser for you: click, type, scroll and go to other sites.' : 'Ask me anything about this page or anything else.') + '</p><div class="sugg"></div>')
  for (const [t, q] of SUGG) {
    const b = document.createElement('button')
    b.innerHTML = I.spark + '<span></span>'
    b.lastChild.textContent = t
    b.onclick = () => { input.value = q; grow(); input.focus(); if (!q.endsWith(' ')) send() }
    el.querySelector('.sugg').append(b)
  }
  return el
}

function draw() {
  msgsEl.innerHTML = ''
  if (!msgs.length) msgsEl.append(empty())
  msgs.forEach((m, i) => msgsEl.append(bubble(m, i === msgs.length - 1)))
  if (err) msgsEl.append(Object.assign(document.createElement('div'), { className: 'err', textContent: err }))
  if (stick) msgsEl.scrollTop = msgsEl.scrollHeight
}
const redrawLast = () => { const el = msgsEl.lastElementChild; if (el?.classList.contains('assistant')) el.replaceWith(bubble(msgs.at(-1), true)); else draw(); if (stick) msgsEl.scrollTop = msgsEl.scrollHeight }

function setBusy(v) {
  busy = v
  sendBtn.classList.toggle('streaming', v)
  sendBtn.title = v ? 'Stop' : 'Send'
  working.hidden = !(v && agent)
  working.querySelector('span').textContent = 'Working in ' + (tab.title || 'this tab')
}

function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 160) + 'px' }

const text = m => m.role === 'user' ? m.content : m.parts.filter(p => p.type === 'text').map(p => p.text).join('\n\n')

function send() {
  const t = input.value.trim()
  if (!t || busy) return
  err = ''
  stick = true
  msgs.push({ role: 'user', content: t }, { role: 'assistant', parts: [] })
  input.value = ''
  grow()
  setBusy(true)
  draw()
  qat.ai.chat(++rid, msgs.slice(0, -1).slice(-30).map(m => ({ role: m.role, content: text(m) })).filter(m => m.content), agent)
}

const mine = d => d.rid === rid
qat.on('ai:chunk', d => {
  if (!mine(d)) return
  const parts = msgs.at(-1).parts
  if (parts.at(-1)?.type !== 'text') parts.push({ type: 'text', text: '' })
  parts.at(-1).text += d.text
  redrawLast()
})
qat.on('ai:break', () => {})
qat.on('ai:step', d => {
  if (!mine(d)) return
  const parts = msgs.at(-1).parts
  let p = parts.at(-1)
  if (p?.type !== 'steps') parts.push(p = { type: 'steps', steps: [] })
  const s = p.steps.find(s => s.id === d.id)
  s ? Object.assign(s, d) : p.steps.push({ id: d.id, label: d.label, state: d.state })
  redrawLast()
})
qat.on('ai:note', d => { if (mine(d)) { msgs.at(-1).parts.push({ type: 'note', text: d.text }); redrawLast() } })
qat.on('ai:done', d => { if (!mine(d)) return; setBusy(false); if (!msgs.at(-1).parts.length) msgs.pop(); draw() })
qat.on('ai:error', d => { if (!mine(d)) return; setBusy(false); err = d.message; if (!msgs.at(-1).parts.length) msgs.pop(); draw() })
qat.on('ai:tab', t => {
  tab = t || {}
  const c = $('#ctx'), img = c.querySelector('img')
  c.querySelector('span').textContent = tab.title || 'No tab'
  c.title = 'The assistant sees: ' + (tab.url || '')
  img.hidden = !tab.favicon
  if (tab.favicon) img.src = tab.favicon
  if (busy) setBusy(true)
})

msgsEl.addEventListener('scroll', () => { stick = msgsEl.scrollHeight - msgsEl.scrollTop - msgsEl.clientHeight < 40 })
msgsEl.addEventListener('click', e => {
  const a = e.target.closest('a'), c = e.target.closest('.copy')
  if (a) { e.preventDefault(); qat.newTab(a.dataset.u) }
  if (c) { navigator.clipboard.writeText(c.nextElementSibling.textContent); c.textContent = 'Copied'; setTimeout(() => { c.textContent = 'Copy' }, 1200) }
})
input.addEventListener('input', grow)
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); send() } })
sendBtn.onclick = () => busy ? qat.ai.stop(rid) : send()
$('#stop').onclick = () => qat.ai.stop(rid)
const paintAgent = () => { agentBtn.classList.toggle('on', agent); agentBtn.title = agent ? 'The assistant can click, type and browse in the current tab. Click to turn off' : 'Chat only. Click to let the assistant use the browser' }
agentBtn.onclick = () => { agent = !agent; try { localStorage.agent = agent ? '1' : '0' } catch {}; paintAgent(); if (!msgs.length) draw() }
$('#chat-new').onclick = () => { if (busy) qat.ai.stop(rid); rid++; setBusy(false); msgs = []; err = ''; closePick(); draw() }
paintAgent()

const openSettings = () => qat.newTab('qat://settings#ai')

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
const label = () => { $('#chat-prov span').textContent = cfg.providers[cfg.provider].model }

sel.onchange = showPick
$('#chat-prov').onclick = () => pickEl.hidden ? openPick() : closePick()
$('#chat-set').onclick = openSettings
$('#ctx').onclick = () => input.focus()
qat.on('ai:changed', s => { cfg = s; cache = {}; label(); draw() })

qat.ai.settings().then(s => { cfg = s; label(); draw() })
