const msgsEl = $('#chat-msgs'), pickEl = $('#chat-pick'), input = $('#chat-in'), sendBtn = $('#chat-send'), agentBtn = $('#agent'), working = $('#working')
const sel = Object.assign(document.createElement('select'), { className: 'ctl' })
let cache = {}, cfg, msgs = [], busy = false, rid = 0, err = '', stick = true, tab = {}, agent = true
try { agent = localStorage.agent !== '0' } catch {}

const I = {
  ok: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>', err: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  globe: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>',
  chev: '<svg class="chev" viewBox="0 0 24 24"><path d="M7 10l5 5 5-5"/></svg>', cursor: '<svg viewBox="0 0 24 24"><path d="M5 3l14 8-6 1.5L10 19z"/></svg>',
  think: '<svg viewBox="0 0 24 24"><path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.6.5 1 1.2 1 2V16h5.2v-.2c0-.8.4-1.5 1-2A6 6 0 0 0 12 3z"/></svg>',
}
const SICO = ['<path d="M5 7h14M5 12h14M5 17h9"/>', '<path d="M7 4h10v16l-5-3.5L7 20z"/>', '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>', '<path d="M4 20h4L19 9l-4-4L4 16z"/>']
const SUGG = [['Summarise this page', 'Summarise this page in a few bullet points.'], ['What matters on this page?', 'What are the most important things on this page?'], ['Look something up', 'Search the web and find '], ['Help me fill in this form', 'Help me fill in the form on this page. Ask me for anything you need.']]

function steps(p, live) {
  const d = document.createElement('details'), bad = p.steps.some(s => s.state === 'err'), bg = p.steps.every(s => s.web)
  d.className = 'card lg' + (live ? ' live' : '')
  d.open = live || p.open
  d.innerHTML = '<summary>' + (bg ? I.globe : I.cursor) + '<span>' + (bg ? (live ? 'Searching the web' : 'Searched the web') : live ? 'Using the browser' : 'Used the browser') + ', ' + p.steps.length + ' step' + (p.steps.length > 1 ? 's' : '') + (bad && !live ? ', some failed' : '') + '</span>' + I.chev + '</summary><ol></ol>'
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

function thought(p, live) {
  const d = document.createElement('details'), secs = Math.max(1, Math.round(((p.end || Date.now()) - p.start) / 1000))
  d.className = 'card lg' + (live ? ' live' : '')
  d.open = live || p.open
  d.innerHTML = '<summary>' + I.think + '<span>' + (live ? 'Thinking' : 'Thought for ' + secs + 's') + '</span>' + I.chev + '</summary><pre class="think-body"></pre>'
  d.querySelector('pre').textContent = p.text.trim()
  d.querySelector('summary').onclick = () => { p.open = !d.open }
  if (live) requestAnimationFrame(() => { const b = d.querySelector('pre'); b.scrollTop = b.scrollHeight })
  return d
}

function bubble(m, last) {
  const el = document.createElement('div')
  el.className = 'msg ' + m.role + (m.role === 'user' ? ' lg' : '')
  if (m.role === 'user') {
    if (!m.files?.length) { el.textContent = m.content; return el }
    const row = Object.assign(document.createElement('div'), { className: 'ufiles' })
    row.append(...m.files.map(f => chip(f)))
    el.append(row, m.content)
    return el
  }
  for (const p of m.parts) {
    if (p.type === 'text') el.append(Object.assign(document.createElement('div'), { className: 'txt', innerHTML: md(p.text) }))
    else if (p.type === 'steps') el.append(steps(p, last && busy))
    else if (p.type === 'think') el.append(thought(p, last && busy && !p.end))
    else el.append(Object.assign(document.createElement('div'), { className: 'note', textContent: p.text }))
  }
  if (last && busy && m.parts.at(-1)?.type !== 'text') el.append(Object.assign(document.createElement('div'), { className: 'typing', innerHTML: '<i></i><i></i><i></i>' }))
  return el
}

function empty() {
  const el = document.createElement('div'), p = cfg.providers[cfg.provider]
  el.className = 'empty'
  el.innerHTML = '<div class="hd"><img src="icon.png" alt=""><h3>' + (tab.title ? 'Ask about this page' : 'Ask Qat anything') + '</h3></div>'
  if (!p.hasKey && cfg.provider !== 'custom') {
    el.insertAdjacentHTML('beforeend', '<p>Add an API key for ' + esc(p.name) + ' to start.</p><button class="pill">Open settings</button>')
    el.querySelector('button').onclick = openSettings
    return el
  }
  el.insertAdjacentHTML('beforeend', '<p>' + (agent ? 'Or tell it what to do. It can click and type in this tab while you watch, and looks things up in the background without touching your tabs.' : 'Browser control is off. It can still search the web for you in the background.') + '</p><div class="sugg lg"></div>')
  SUGG.forEach(([t, q], i) => {
    const b = document.createElement('button')
    b.innerHTML = '<svg viewBox="0 0 24 24">' + SICO[i] + '</svg><span></span><svg class="go" viewBox="0 0 24 24"><path d="M7 17L17 7M9 7h8v8"/></svg>'
    b.querySelector('span').textContent = t
    b.onclick = () => { input.value = q; grow(); input.focus(); if (!q.endsWith(' ')) ask(q.trim()) }
    el.querySelector('.sugg').append(b)
  })
  return el
}

function draw() {
  if (!cfg) return
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

const said = m => m.parts.filter(p => p.type === 'text').map(p => p.text).join('\n\n')
// what the model gets back as history, a reply that only used the browser still says what it did
const text = m => m.role === 'user' ? m.content : said(m) || m.parts.filter(p => p.type === 'steps').map(p => '(used the browser: ' + p.steps.map(s => s.label).join(', ') + ')').join('\n')

// uploads: images go to the model as pictures, pdfs and text files as their text
let files = []
const filesEl = $('#files'), fileIn = $('#file-in'), composer = $('#chat-composer')
const DOC = '<svg viewBox="0 0 24 24"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/></svg>'
const TEXTY = /\.(txt|md|markdown|csv|tsv|json|jsonl|xml|yaml|yml|toml|ini|log|html?|css|s?js|mjs|cjs|jsx|tsx?|py|rb|go|rs|java|kt|c|h|cc|cpp|hpp|cs|php|swift|sh|ps1|bat|sql|lua|r|vue|svelte)$/i
const kb = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'

function chip(f, rm) {
  const b = Object.assign(document.createElement('div'), { className: 'att' + (f.kind === 'image' ? ' img' : ''), title: f.name })
  if (f.kind === 'image') b.append(Object.assign(document.createElement('img'), { src: f.url, alt: f.name }))
  else {
    b.insertAdjacentHTML('beforeend', '<span class="doc">' + DOC + '</span><div><b></b><small></small></div>')
    b.querySelector('b').textContent = f.name
    b.querySelector('small').textContent = f.info
  }
  if (rm) { const x = Object.assign(document.createElement('button'), { className: 'x', title: 'Remove', innerHTML: I.err }); x.onclick = rm; b.append(x) }
  return b
}
const paintFiles = () => filesEl.replaceChildren(...files.map((f, i) => chip(f, () => { files.splice(i, 1); paintFiles() })))

function shrink(file) { // phone photos are 5MB+, 1600px jpeg is plenty for a model to read
  return createImageBitmap(file).then(bm => {
    const k = Math.min(1, 1600 / Math.max(bm.width, bm.height)), c = Object.assign(document.createElement('canvas'), { width: Math.round(bm.width * k), height: Math.round(bm.height * k) })
    c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height)
    return c.toDataURL('image/jpeg', .85)
  })
}

async function attach(list) {
  for (const f of list) {
    if (files.length >= 10) return flash('10 files at most')
    try {
      if (f.type.startsWith('image/')) files.push({ kind: 'image', name: f.name || 'pasted image', url: await shrink(f) })
      else if (f.type === 'application/pdf' || /\.pdf$/i.test(f.name)) {
        const { text, pages } = await qat.ai.pdf(new Uint8Array(await f.arrayBuffer()))
        if (!text) { flash(f.name + ' has no text, it might be scanned'); continue }
        files.push({ kind: 'text', name: f.name, text: text.slice(0, 150000), info: pages + ' page' + (pages > 1 ? 's' : '') })
      } else if (f.type.startsWith('text/') || /json|xml|javascript/.test(f.type) || TEXTY.test(f.name)) {
        const t = await f.text()
        files.push({ kind: 'text', name: f.name, text: t.slice(0, 150000), info: kb(f.size) })
      } else flash("Can't read " + (f.name.split('.').pop() || 'that kind of') + ' files yet')
    } catch { flash("Couldn't open " + f.name) }
    paintFiles()
  }
  input.focus()
}

fileIn.onchange = () => { attach([...fileIn.files]); fileIn.value = '' }
$('#attach').onclick = () => fileIn.click()
input.addEventListener('paste', e => { const f = [...e.clipboardData.files]; if (f.length) { e.preventDefault(); attach(f) } })
const side = $('#side')
side.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); composer.classList.add('drag') } })
side.addEventListener('dragleave', e => { if (!side.contains(e.relatedTarget)) composer.classList.remove('drag') })
side.addEventListener('drop', e => { e.preventDefault(); composer.classList.remove('drag'); attach([...e.dataTransfer.files]) })

// what the api gets for a message: attached text inline, images as image parts
function api(m) {
  if (m.role !== 'user' || !m.files?.length) return { role: m.role, content: text(m) }
  const t = [...m.files.filter(f => f.kind === 'text').map(f => 'Attached file ' + f.name + ':\n"""\n' + f.text + '\n"""'), m.content].filter(Boolean).join('\n\n'), imgs = m.files.filter(f => f.kind === 'image')
  return { role: 'user', content: imgs.length ? [{ type: 'text', text: t || 'Look at the attached image.' }, ...imgs.map(f => ({ type: 'image_url', image_url: { url: f.url } }))] : t }
}

function send() {
  const t = input.value.trim(), m = t.match(/^\/(\w+)(?:\s+([\s\S]*))?$/) // /etc/hosts style text isn't a command
  if (m) {
    const c = CMDS.find(c => c[0] === m[1].toLowerCase())
    input.value = ''; grow(); menu()
    if (c && c[2]((m[2] || '').trim()) === false) { input.value = t; grow() }
    else { err = 'There is no /' + m[1] + ' command. Type / to see them all.'; draw() }
    return
  }
  ask(t, files)
}

function ask(t, att = []) {
  if (!t && !att.length) return
  if (busy) { flash('Still replying, wait for it or use /stop'); return false }
  err = ''
  stick = true
  msgs.push({ role: 'user', content: t, files: att }, { role: 'assistant', parts: [] })
  if (att === files) { files = []; paintFiles() }
  input.value = ''
  grow()
  setBusy(true)
  draw()
  qat.ai.chat(++rid, msgs.slice(0, -1).slice(-30).map(api).filter(m => m.content), agent)
}

const mine = d => d.rid === rid
const endThink = parts => { const t = parts.findLast(p => p.type === 'think'); if (t && !t.end) t.end = Date.now() }
qat.on('ai:think', d => {
  if (!mine(d)) return
  const parts = msgs.at(-1).parts
  if (parts.at(-1)?.type !== 'think') parts.push({ type: 'think', text: '', start: Date.now() })
  parts.at(-1).text += d.text
  redrawLast()
})
qat.on('ai:chunk', d => {
  if (!mine(d)) return
  const parts = msgs.at(-1).parts
  endThink(parts)
  if (parts.at(-1)?.type !== 'text') parts.push({ type: 'text', text: '' })
  parts.at(-1).text += d.text
  redrawLast()
})
qat.on('ai:break', () => {})
qat.on('chat:import', m => { if (busy) qat.ai.stop(rid); rid++; setBusy(false); msgs = m; err = ''; closePick(); draw() }) // a quick ask moved over here
qat.on('ai:step', d => {
  if (!mine(d)) return
  const parts = msgs.at(-1).parts
  endThink(parts)
  let p = parts.at(-1)
  if (p?.type !== 'steps') parts.push(p = { type: 'steps', steps: [] })
  const s = p.steps.find(s => s.id === d.id)
  s ? Object.assign(s, d) : p.steps.push({ id: d.id, label: d.label, state: d.state, web: d.web })
  redrawLast()
})
qat.on('ai:note', d => { if (mine(d)) { msgs.at(-1).parts.push({ type: 'note', text: d.text }); redrawLast() } })
qat.on('ai:done', d => { if (!mine(d)) return; endThink(msgs.at(-1).parts); setBusy(false); if (!msgs.at(-1).parts.length) msgs.pop(); draw() })
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
input.addEventListener('input', () => { grow(); hush = false; menu() })
input.addEventListener('keydown', e => {
  if (e.isComposing) return
  if (!slash.hidden) {
    const go = { ArrowDown: 1, ArrowUp: -1 }[e.key]
    if (go) { e.preventDefault(); hi = (hi + go + shown.length) % shown.length; return menu() }
    if (e.key === 'Escape') { e.preventDefault(); hush = true; return menu() }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) { e.preventDefault(); return run(shown[hi], e.key === 'Tab') }
  }
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() }
})
sendBtn.onclick = () => busy ? qat.ai.stop(rid) : send()
$('#stop').onclick = () => qat.ai.stop(rid)
const paintAgent = () => { agentBtn.classList.toggle('on', agent); agentBtn.title = agent ? 'The assistant can click, type and browse in the current tab. Click to turn off' : 'Chat only. Click to let the assistant use the browser' }
agentBtn.onclick = () => { agent = !agent; try { localStorage.agent = agent ? '1' : '0' } catch {}; paintAgent(); if (!msgs.length) draw() }
function newChat() { if (busy) qat.ai.stop(rid); rid++; setBusy(false); msgs = []; err = ''; closePick(); draw(); input.focus() }
$('#chat-new').onclick = newChat

function retry() {
  const i = msgs.findLastIndex(m => m.role === 'user')
  if (i < 0) return
  if (busy) return ask(msgs[i].content)
  const { content, files: f } = msgs[i]
  msgs = msgs.slice(0, i)
  ask(content, f)
}

function copyLast() {
  const m = msgs.findLast(m => m.role === 'assistant' && said(m))
  if (!m) return flash('Nothing to copy yet')
  navigator.clipboard.writeText(said(m))
  flash('Copied the last answer')
}

const PH = input.placeholder
let flashT
function flash(t) { input.placeholder = t; clearTimeout(flashT); flashT = setTimeout(() => { input.placeholder = PH }, 1600) }

// name, what it does, run(args), true if it wants an argument before running
const CMDS = [
  ['new', 'Start a new chat', newChat],
  ['clear', 'Clear this chat', newChat],
  ['retry', 'Ask your last message again', retry],
  ['copy', 'Copy the last answer', copyLast],
  ['stop', 'Stop the current reply', () => busy && qat.ai.stop(rid)],
  ['browser', 'Turn browser control on or off', () => agentBtn.click()],
  ['model', 'Choose a model', () => openPick()],
  ['settings', 'Open AI settings', () => openSettings()],
  ['summarise', 'Summarise this page', a => ask('Summarise this page in a few bullet points.' + (a ? ' ' + a : ''))],
  ['explain', 'Explain this page simply', a => ask('Explain what this page is about in simple words.' + (a ? ' ' + a : ''))],
  ['translate', 'Translate this page, like /translate French', a => ask('Translate the main content of this page into ' + (a || 'English') + '.'), true],
  ['help', 'Show every command', () => { input.value = '/'; menu(); input.focus() }],
  ['close', 'Close the assistant', () => qat.toggleSide()],
]
const slash = $('#slash')
let hi = 0, shown = [], hush = false

function menu() {
  const m = input.value.match(/^\/(\w*)$/), was = shown
  shown = m && !hush ? CMDS.filter(c => c[0].startsWith(m[1].toLowerCase())) : []
  if (shown.length !== was.length || shown.some((c, i) => c !== was[i])) hi = 0
  slash.hidden = !shown.length
  slash.replaceChildren(...shown.map((c, i) => {
    const b = document.createElement('button')
    b.className = i === hi ? 'hi' : ''
    b.append(Object.assign(document.createElement('b'), { textContent: '/' + c[0] }), Object.assign(document.createElement('small'), { textContent: c[1] }))
    b.onmousedown = e => { e.preventDefault(); run(c) }
    b.onmouseenter = () => { hi = i; slash.querySelector('.hi')?.classList.remove('hi'); b.classList.add('hi') }
    return b
  }))
  slash.querySelector('.hi')?.scrollIntoView({ block: 'nearest' })
}

function run(c, fill) {
  if (fill || c[3]) { input.value = '/' + c[0] + ' '; hush = true; menu(); return input.focus() }
  input.value = ''; grow(); menu()
  c[2]('')
}
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
$('#chat-close').onclick = () => qat.toggleSide()
$('#ctx').onclick = () => input.focus()
qat.on('ai:changed', s => { cfg = s; cache = {}; label(); draw() })

qat.ai.settings().then(s => { cfg = s; label(); draw() })
