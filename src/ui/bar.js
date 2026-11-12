const $ = s => document.querySelector(s)
const omni = $('#omnibox'), tabsEl = $('#tabs'), cv = $('#gl')
const MAX = 32
let BH = 88
let state = { tabs: [], activeId: null }
const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'

function tabEl(t) {
  const el = document.createElement('div')
  el.className = 'tab' + (t.id === state.activeId ? ' lg active' : '') + (t.sleeping ? ' sleeping' : '') + (t.ai ? ' ai' : '')
  el.title = t.ai ? t.title + ' (Qat is working in this tab)' : t.title
  if (t.id === state.activeId && document.body.dataset.tone) el.dataset.tone = document.body.dataset.tone // new node, keep the tone until the next frame
  el.innerHTML = (t.loading ? '<i class="spin"></i>' : t.favicon ? '<img class="fav" alt="">' : '<i class="dot"></i>') + '<span class="title"></span><button class="x" title="Close tab">' + X + '</button>'
  el.querySelector('.title').textContent = t.title
  const img = el.querySelector('img')
  if (img) { img.src = t.favicon; img.onerror = () => img.replaceWith(Object.assign(document.createElement('i'), { className: 'dot' })) }
  el.onmousedown = e => { if (e.button === 1) { e.preventDefault(); qat.closeTab(t.id) } else if (e.button === 0 && !e.target.closest('.x')) qat.activateTab(t.id) }
  el.querySelector('.x').onclick = () => qat.closeTab(t.id)
  return el
}

const tabEls = new Map()
let lastState = ''
function render() {
  const cur = state.tabs.find(t => t.id === state.activeId)
  // tabs only get rebuilt when they change, this fires a lot while pages load and a full rebuild restarted spinners and refetched favicons
  let moved = false
  state.tabs.forEach((t, i) => {
    const sig = [t.title, t.loading, t.favicon, t.sleeping, t.ai, t.id === state.activeId].join('\n')
    let el = tabEls.get(t.id)
    if (el?.sig !== sig) { const n = tabEl(t); el?.replaceWith(n); el = n; el.sig = sig; tabEls.set(t.id, el); moved = true }
    if (tabsEl.children[i] !== el) { tabsEl.insertBefore(el, tabsEl.children[i] || null); moved = true }
  })
  for (const [id, el] of tabEls) if (!state.tabs.some(t => t.id === id)) { el.remove(); tabEls.delete(id); moved = true }
  $('#back').disabled = !cur.canGoBack
  $('#forward').disabled = !cur.canGoForward
  $('#reload').classList.toggle('loading', cur.loading)
  $('#loadbar').classList.toggle('on', cur.loading)
  if (document.activeElement !== omni) omni.value = cur.url
  const sh = $('#shield'), web = /^https?:/.test(cur.url)
  sh.classList.toggle('na', !web)
  sh.classList.toggle('off', !cur.shield)
  sh.title = cur.shield ? cur.blocked + ' ads and trackers blocked. Click to allow ads on this site' : 'Ad blocker off for this site. Click to turn it back on'
  $('#star').classList.toggle('na', !web)
  $('#star').classList.toggle('on', !!cur.starred)
  $('#star').title = cur.starred ? 'Remove bookmark' : 'Bookmark this tab (Ctrl+D)'
  $('#zoom-val').textContent = (cur.zoom || 100) + '%'
  $('#shield-n').textContent = cur.shield && cur.blocked ? (cur.blocked > 999 ? '999+' : cur.blocked) : ''
  const site = $('#site'), open = cur.sec === 'http' || cur.sec === 'bad', lv = cur.risk?.level, bad = lv === 'dangerous'
  site.classList.toggle('warn', open || bad)
  site.classList.toggle('danger', bad) // a likely scam swaps the certificate for a warning sign
  site.classList.toggle('risk', lv === 'suspicious')
  site.classList.toggle('chk', lv === 'checking')
  $('#site-lbl').textContent = lv === 'checking' ? 'Checking website...' : open ? 'Not secure' : ''
  site.title = bad ? 'This site might be a scam. Click for details' : lv === 'suspicious' ? 'This site looks a bit off. Click for details' : 'View site information'
  if (!sitepop.hidden) siteData?.url && siteData.url !== cur.url ? openPop(null) : paintSite()
  if (moved) watchRects()
}

qat.on('tabs', s => { const j = JSON.stringify(s); if (j === lastState) return; lastState = j; state = s; render() })
qat.on('mem', mb => { $('#mem-val').textContent = mb + ' MB' })
qat.on('side', open => $('#ai-toggle').classList.toggle('on', open))
qat.on('focus-omnibox', () => { omni.focus(); omni.select() })
qat.on('maximized', m => { $('#w-max').title = m ? 'Restore' : 'Maximize' })

const drop = $('#drop'), looksUrl = s => /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^localhost(:\d+)?([/?#]|$)/i.test(s) || (!/\s/.test(s) && s.includes('.'))
const ICON = { url: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>', star: '<svg viewBox="0 0 24 24"><path d="M12 3.5l2.6 5.3 5.8.8-4.2 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.2-4.1 5.8-.8z"/></svg>', search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>' }
const gsearch = q => 'https://www.google.com/search?q=' + encodeURIComponent(q), bare = u => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
let sugg = [], sel = -1, typed = '', seq = 0, gt

function show(list) {
  sugg = list.slice(0, 8); sel = -1
  drop.innerHTML = ''
  for (const s of sugg) {
    const el = document.createElement('div')
    el.className = 'sg'
    el.innerHTML = ICON[s.star ? 'star' : s.kind] + '<span class="t"></span><span class="u"></span>'
    el.querySelector('.t').textContent = s.title || s.text
    el.querySelector('.u').textContent = s.title ? s.text : ''
    el.onmousedown = e => { e.preventDefault(); e.button < 2 && go(s) }
    drop.append(el)
  }
  drop.hidden = !sugg.length
  const r = $('#omni').getBoundingClientRect()
  Object.assign(drop.style, { left: r.x + 'px', width: r.width + 'px' })
  drop.dataset.tone = $('#omni').dataset.tone || 'dark'
  fit()
}

// the bar view grows while a popup is open so it can hang over the page
const fit = () => qat.barHeight(Math.max(BH, ...[...document.querySelectorAll('.pop:not([hidden])')].map(p => Math.ceil(p.getBoundingClientRect().bottom) + 16)))

const menu = $('#menu'), mbtn = $('#menu-btn'), extmenu = $('#extmenu'), fold = $('#bmfold'), sitepop = $('#sitepop'), pops = [menu, extmenu, fold, sitepop]
const mk = (tag, cls, txt) => Object.assign(document.createElement(tag), { className: cls || '', textContent: txt || '' })
let popBtn = null

// one dropdown at a time, hung under whichever button opened it. same button again closes it
function openPop(el, btn, left) {
  const same = el && !el.hidden && popBtn === btn
  for (const p of pops) p.hidden = true
  popBtn?.classList.remove('on')
  popBtn = null
  if (el && !same) {
    el.hidden = false
    popBtn = btn
    btn.classList.add('on')
    const r = btn.getBoundingClientRect()
    el.style.top = r.bottom + 6 + 'px'
    el.style.left = Math.max(8, Math.min(left ? r.left : r.right - el.offsetWidth, innerWidth - el.offsetWidth - 8)) + 'px'
    el.dataset.tone = btn.closest('.lg')?.dataset.tone || document.body.dataset.tone || 'dark'
  }
  fit()
}
mbtn.onclick = () => openPop(menu, mbtn)
menu.onclick = e => { const a = e.target.closest('[data-a]')?.dataset.a; if (!a) return; qat.menu(a); if (!['zin', 'zout'].includes(a)) openPop(null) }
addEventListener('keydown', e => e.key === 'Escape' && popBtn && openPop(null))
addEventListener('blur', () => openPop(null))

const FOLDER = '<svg viewBox="0 0 24 24"><path d="M3.5 7.5a2 2 0 0 1 2-2h4l2 2h7a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z"/></svg>'
const PIN = '<svg viewBox="0 0 24 24"><path d="M9 4h6l-1 6 3 3H7l3-3zM12 13v7"/></svg>'
let bmd = { show: false, items: [], other: [] }, exts = []

function ico(b) {
  const s = mk('span')
  s.style.display = 'contents'
  if (b.items || !b.icon) s.innerHTML = b.items ? FOLDER : ICON.url
  else s.append(Object.assign(mk('img'), { src: b.icon, alt: '', onerror: () => { s.innerHTML = ICON.url } }))
  return s
}
const open = (u, e) => e.button === 1 || e.ctrlKey ? qat.newTab(u) : qat.go(u)

function showFolder(items, btn) {
  fold.innerHTML = ''
  for (const b of items) {
    const r = mk('div', 'sg')
    r.append(ico(b), mk('span', 't', b.title))
    r.title = b.url
    r.onmousedown = e => { e.preventDefault(); if (e.button < 2) { open(b.url, e); openPop(null) } }
    fold.append(r)
  }
  openPop(fold, btn, true)
}

function bmBtn(b) {
  const el = mk('button', 'bm' + (b.items ? ' bmf' : ''))
  el.append(ico(b), mk('span', '', b.items ? b.name : b.title))
  el._b = b
  el.title = b.items ? b.name : b.title + '\n' + b.url
  if (b.items) el.onclick = () => showFolder(b.items, el)
  else el.onmouseup = e => e.button < 2 && open(b.url, e)
  return el
}

function overflow() { // anything cut off by the window edge moves into the >> dropdown
  const box = $('#bms'), more = $('#bm-more')
  more.hidden = false
  for (const el of box.children) el.style.visibility = ''
  const lim = box.getBoundingClientRect().right, hid = [...box.children].filter(el => el.getBoundingClientRect().right > lim + 1)
  hid.forEach(el => el.style.visibility = 'hidden')
  more.hidden = !hid.length
  more.onclick = () => showFolder(hid.flatMap(el => el._b.items || [el._b]), more)
}

qat.on('bookmarks', d => {
  bmd = d
  $('#bmbar').hidden = !d.show
  const h = d.show ? 118 : 88
  if (h !== BH) { BH = h; cv.style.height = BH + 'px'; qat.strip(BH); fit(); want() }
  $('#bms').replaceChildren(...d.items.map(bmBtn))
  $('#bm-other').hidden = !d.other.length
  $('#bm-other').onclick = () => showFolder(d.other, $('#bm-other'))
  if (d.show) overflow()
})
addEventListener('resize', () => bmd.show && overflow())

const rect = el => { const r = el.getBoundingClientRect(); return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } }

function fillExt() {
  const full = exts.filter(x => x.pin).length >= 4
  extmenu.innerHTML = ''
  for (const x of exts) {
    const r = mk('div', 'er'), pin = mk('button', 'mi' + (x.pin ? ' on' : ''))
    r.append(Object.assign(mk('img'), { src: x.icon || 'icon.png', alt: '' }), mk('span', '', x.name), pin)
    pin.innerHTML = PIN
    pin.title = x.pin ? 'Unpin from toolbar' : full ? 'Toolbar is full, unpin one first' : 'Pin to toolbar'
    pin.disabled = !x.pin && full
    pin.onclick = e => { e.stopPropagation(); qat.extPin(x.id) }
    r.onclick = () => { openPop(null); qat.extOpen(x.id, rect($('#ext-more'))) }
    extmenu.append(r)
  }
  const m = mk('div', 'er')
  m.append(mk('span', '', 'Manage extensions'))
  m.onclick = () => { openPop(null); qat.menu('extensions') }
  extmenu.append(mk('hr'), m)
  fit()
}

qat.on('exts', l => {
  exts = l
  $('#exts').hidden = !l.length
  $('#pins').replaceChildren(...l.filter(x => x.pin).map(x => {
    const b = mk('button', 'ib')
    b.title = x.name
    b.append(Object.assign(mk('img'), { src: x.icon || 'icon.png', alt: '' }))
    b.onclick = () => qat.extOpen(x.id, rect(b))
    return b
  }))
  if (!extmenu.hidden) fillExt()
  watchRects()
})
$('#ext-more').onclick = () => { if (extmenu.hidden) fillExt(); openPop(extmenu, $('#ext-more')) }

// site info popup, laid out like the main menu
const ic = d => '<svg viewBox="0 0 24 24">' + d + '</svg>'
const LOCK = ic('<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>'), OPEN = ic('<rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V8a4 4 0 0 1 7.6-1.7"/>'), INFO = ic('<circle cx="12" cy="12" r="8.5"/><path d="M12 11v5M12 8h.01"/>')
const CERT = ic('<rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M7.5 8.5h9M7.5 11.5h4"/><circle cx="16" cy="14" r="2.4"/>'), WARN = ic('<path d="M12 4 3 19.5h18z"/><path d="M12 10v4.5M12 17h.01"/>'), BARS = ic('<path d="M6 19v-6M12 19V6M18 19v-9"/>'), RELOAD = ic('<path d="M20 12a8 8 0 1 1-2.4-5.7M20 4v5h-5"/>'), GEAR = ic('<circle cx="12" cy="12" r="3"/><path d="M12 3v2.5M12 18.5V21M3 12h2.5M18.5 12H21M5.6 5.6l1.8 1.8M16.6 16.6l1.8 1.8M5.6 18.4l1.8-1.8M16.6 7.4l1.8-1.8"/>')
const SEC = { ok: [LOCK, '', 'Connection is secure'], http: [OPEN, 'bad', 'Not secure'], bad: [OPEN, 'bad', 'Certificate is not valid'], local: [INFO, '', 'Local site'], qat: [INFO, '', 'Qat page'], other: [INFO, '', 'Site info'] }
let siteData = null
const day = t => new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
const kv = rows => { const g = mk('div', 'kv'); for (const [k, v] of rows) if (v != null && v !== '' && !Number.isNaN(v)) g.append(mk('span', '', k), mk('span', '', String(v))); return g }
const srow = (svg, cls, text, sub, click) => { const r = mk(click ? 'button' : 'div', 'srow ' + cls); r.innerHTML = svg; const t = mk('span'); t.append(text); if (sub) t.append(mk('small', '', sub)); r.append(t); if (click) r.onclick = click; return r }

function paintSite() {
  const cur = state.tabs.find(t => t.id === state.activeId), d = siteData || {}, [svg, cls, title] = SEC[cur.sec] || SEC.other, open = sitepop.querySelector('.nerd')?.open, r = cur.risk
  const sub = cur.sec === 'http' ? "Don't type passwords or card details here" : cur.sec === 'bad' ? d.certErr || cur.certErr : ''
  sitepop.replaceChildren(mk('div', 'host', d.host || cur.url), srow(svg, cls, title, sub))
  if (r?.level === 'checking') {
    const row = srow('<i class="spin"></i>', '', 'Checking this site', r.stage + ' · ' + Math.max(0, Math.round((Date.now() - r.since) / 1000)) + 's')
    if (r.peek) row.lastChild.append(mk('small', 'peek', r.peek))
    sitepop.append(row)
  } else if (r?.level === 'error') sitepop.append(srow(INFO, '', "Couldn't check this site", r.reason))
  if (r?.level === 'dangerous' || r?.level === 'suspicious') sitepop.append(srow(WARN, r.level === 'dangerous' ? 'bad' : 'sus', r.level === 'dangerous' ? 'Might be a scam' : 'Looks a bit off', r.reason))
  if (d.scam && d.ai && ['safe', 'suspicious', 'dangerous', 'error'].includes(r?.level) && !r.trusted) sitepop.append(srow(RELOAD, '', 'Check again', '', () => qat.site.rescan()))
  if (d.cert) {
    const left = Math.ceil((d.cert.to - Date.now()) / 864e5)
    sitepop.append(srow(CERT, '', 'Certificate', (d.cert.issuerOrg || d.cert.issuer) + (left < 0 ? ', expired' : ', expires ' + day(d.cert.to)), () => qat.site.view(d.host)))
  } else if (d.err) sitepop.append(srow(CERT, '', 'Certificate', "Couldn't read it"))
  if (d.url && (d.tls || d.page)) {
    const n = mk('details', 'nerd'), t = d.tls || {}, c = d.cert || {}, p = d.page || {}, ms = v => v ? v + ' ms' : null, s = mk('summary')
    s.innerHTML = BARS
    s.append('Stats for nerds')
    n.append(s, kv([
      ['TLS', t.version], ['Cipher', t.cipher], ['Key exchange', t.group], ['Protocol', p.proto], ['Server IP', t.ip], ['Handshake', ms(t.ms)],
      ['Cert key', c.key], ['Signature', c.sig], ['Names on cert', c.names], ['Valid from', c.from && day(c.from)], ['Chain', c.chain?.join(' < ')], ['Serial', c.serial], ['SHA-256', c.sha256],
      ['DNS', ms(p.dns)], ['Connect', ms(p.connect)], ['TLS setup', ms(p.tls)], ['First byte', ms(p.ttfb)], ['DOM ready', ms(p.dom)], ['Loaded', ms(p.load)],
      ['Requests', p.requests], ['Downloaded', p.kb ? p.kb + ' KB' : null], ['Cookies', d.cookies], ['Ads blocked', cur.blocked],
    ]))
    n.open = !!open
    n.ontoggle = fit
    sitepop.append(n)
  }
  if (/^https?:/.test(cur.url) && cur.sec !== 'local') {
    sitepop.append(mk('hr'))
    const off = d.url && (!d.scam || !d.ai)
    sitepop.append(srow(GEAR, '', 'Scam check', off ? (d.scam ? 'Needs an AI key' : 'Off') : r?.level === 'safe' ? 'Looks fine' + (r.reason ? ': ' + r.reason : '') : '', () => { openPop(null); qat.site.settings('settings') }))
  }
  fit()
}

setInterval(() => !sitepop.hidden && state.tabs.find(t => t.id === state.activeId)?.risk?.level === 'checking' && paintSite(), 1000) // the seconds counter
$('#site').onclick = async () => {
  if (!sitepop.hidden) return openPop(null)
  siteData = null
  paintSite()
  openPop(sitepop, $('#site'), true)
  const d = await qat.site.info()
  if (sitepop.hidden || !d) return
  siteData = d
  paintSite()
}

function build(v, m, g = []) {
  const list = [looksUrl(v) ? { kind: 'url', text: v, url: v } : { kind: 'search', text: v, title: v + ' - Google Search', url: gsearch(v) }], seen = new Set([bare(v)])
  for (const h of m.items) if (!seen.has(bare(h.url))) { seen.add(bare(h.url)); list.push({ kind: 'url', text: bare(h.url), title: h.title, url: h.url, star: h.star }) }
  for (const q of g) if (q !== typed) list.push({ kind: 'search', text: q, url: gsearch(q) })
  return list
}

function go(s) { qat.go(s.url); omni.blur() }

omni.addEventListener('input', async e => {
  typed = omni.value
  const my = ++seq, del = e.inputType?.startsWith('delete')
  clearTimeout(gt)
  if (!typed.trim()) return show([])
  const m = await qat.match(typed)
  if (my !== seq) return
  if (!del && m.inline.toLowerCase().startsWith(typed.toLowerCase()) && m.inline.length > typed.length && omni.value === typed) { omni.value = typed + m.inline.slice(typed.length); omni.setSelectionRange(typed.length, omni.value.length) }
  const v = omni.value // first row is what was typed plus the inline completion, not a suggestion picked with the arrows later
  show(build(v, m))
  gt = setTimeout(() => qat.search(typed).then(g => my === seq && sel < 0 && show(build(v, m, g))), 120)
})
omni.addEventListener('keydown', e => {
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && sugg.length) {
    e.preventDefault()
    sel = (sel + 1 + (e.key === 'ArrowDown' ? 1 : sugg.length)) % (sugg.length + 1) - 1
    drop.querySelectorAll('.sg').forEach((el, i) => el.classList.toggle('hi', i === sel))
    omni.value = sel < 0 ? typed : sugg[sel].kind === 'url' ? sugg[sel].url : sugg[sel].text
  } else if (e.key === 'Enter' && omni.value.trim()) { sel >= 0 ? go(sugg[sel]) : qat.go(omni.value); omni.blur() }
  else if (e.key === 'Escape') { if (sugg.length) { show([]); omni.value = typed } else omni.blur() }
})
omni.addEventListener('focus', () => omni.select())
omni.addEventListener('blur', () => { seq++; clearTimeout(gt); show([]); state.activeId && render() })
addEventListener('mousedown', e => { if (e.target === document.body || e.target === document.documentElement) omni.blur(); if (popBtn && !e.target.closest('.pop, #menu-btn, #ext-more, .bmf, #site')) openPop(null) })
$('#shield').onclick = qat.shield
$('#star').onclick = qat.star
$('#back').onclick = qat.back
$('#forward').onclick = qat.forward
$('#reload').onclick = qat.reload
$('#new-tab').onclick = () => qat.newTab()
$('#mem').onclick = qat.sleepAll
$('#ai-toggle').onclick = qat.toggleSide
$('#w-min').onclick = qat.minimize
$('#w-max').onclick = qat.maximize
$('#w-close').onclick = qat.close

const solid = matchMedia('(prefers-reduced-transparency: reduce)').matches
document.body.classList.toggle('solid', solid)

const gl = solid ? null : cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false })
document.body.classList.toggle('solid', !gl)
cv.addEventListener('webglcontextlost', () => document.body.classList.add('solid')) // gpu reset, plain capsules beat invisible ones
let items = [], frame = null, bits = null, tex, tw = 0, th = 0, raf = 0, dpr = 1
const U = {}

if (gl) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s }
  const pr = gl.createProgram()
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, `#version 300 es
void main() { vec2 v = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(v * 2. - 1., 0, 1); }`))
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform vec2 u_res; uniform float u_dpr; uniform int u_n; uniform vec4 u_rect[${MAX}]; uniform float u_emph[${MAX}]; uniform float u_rad[${MAX}]; uniform float u_tone[${MAX}]; uniform float u_lum[${MAX}]; uniform sampler2D u_tex;
out vec4 o;
float sdf(vec2 p, vec4 r, float rad) { vec2 b = r.zw * .5; rad = min(rad, min(b.x, b.y)); vec2 q = abs(p - r.xy - b) - (b - rad); return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - rad; }
vec3 tx(vec2 p) { return texture(u_tex, clamp(vec2(p.x, u_res.y - p.y) / u_res, 0., 1.)).bgr; } // page top mirrored up into the bar, like apple's background extension
vec3 blur(vec2 p, float r) { return textureLod(u_tex, clamp(vec2(p.x, u_res.y - p.y) / u_res, 0., 1.), log2(r) - 1.).bgr; } // mip levels = smooth cheap blur, texture is half res
void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y * u_dpr - gl_FragCoord.y) / u_dpr;
  float best = 1e5; int k = -1;
  for (int i = 0; i < ${MAX}; i++) { if (i >= u_n) break; float s = sdf(p, u_rect[i], u_rad[i]); if (s < best) { best = s; k = i; } }
  vec3 bg = blur(p, 11.);
  bg = mix(bg, blur(p, 24.), .6);
  bg = mix(bg, blur(p, 48.), .5);
  bg = mix(vec3(dot(bg, vec3(.299, .587, .114))), bg, .35); // muted, page colours shouldn't bleed into the bar
  if (k < 0) { o = vec4(bg, 1); return; }
  vec4 r = u_rect[k]; float R = u_rad[k], e = u_emph[k], tn = u_tone[k], f = smoothstep(.45, .9, u_lum[k]); // brighter backdrop = frostier, less shine
  bg *= 1. - pow(1. - clamp(best / 9., 0., 1.), 2.) * (.14 + .16 * tn) * step(0., best);
  if (best > .5) { o = vec4(bg, 1); return; }
  float cov = clamp(.5 - best, 0., 1.), d = max(-best, 0.);
  vec2 h = vec2(.5, 0.);
  vec2 n = normalize(vec2(sdf(p + h.xy, r, R) - sdf(p - h.xy, r, R), sdf(p + h.yx, r, R) - sdf(p - h.yx, r, R)) + 1e-5);
  vec2 off = n * (6. + 2. * e) * (1. - .6 * f) * pow(1. - clamp(d / 18., 0., 1.), 2.); // 2*6/18 < 1 keeps the mapping monotonic, no mirrored text
  vec3 c = vec3(0);
  for (int j = 0; j < 9; j++) { vec2 q = vec2(float(j % 3) - 1., float(j / 3) - 1.) * 2.4; c += vec3(tx(p - off + q).r, tx(p - off * 1.05 + q).g, tx(p - off * 1.1 + q).b); }
  c /= 9.;
  c = mix(c, blur(p, 14.), .6 + .3 * f); // wide average stops one small bright button flooding the whole capsule
  c = mix(vec3(dot(c, vec3(.299, .587, .114))), c, .7 + .06 * e - .2 * f);
  c = mix(c, mix(vec3(.08, .09, .12), vec3(1.), tn), .55 + .05 * e + .2 * f);
  float L = max(dot(n, normalize(vec2(-1., -1.))), 0.);
  c += (pow(1. - clamp(d / 8., 0., 1.), 3.) * .08 * L + .03 * (1. - (p.y - r.y) / r.w)) * (1. - f); // soft inner light, no hard rim line
  c = clamp(c, 0., 1.); // clamp first or the light-backdrop rim below darkens >1 values back to pure white
  c = mix(c, c * .9, (1. - smoothstep(0., 1.4, d)) * tn);
  o = vec4(mix(bg, c, cov), 1);
}`))
  gl.linkProgram(pr)
  gl.useProgram(pr)
  for (const n of ['u_res', 'u_dpr', 'u_n', 'u_rect', 'u_emph', 'u_rad', 'u_tone', 'u_lum', 'u_tex']) U[n] = gl.getUniformLocation(pr, n)
  tex = gl.createTexture()
  gl.bindTexture(gl.TEXTURE_2D, tex)
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([46, 38, 38, 255]))
  gl.generateMipmap(gl.TEXTURE_2D)
  tw = th = 1
  gl.uniform1i(U.u_tex, 0)
  gl.enable(gl.BLEND)
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
}

function collect() {
  items = [...document.querySelectorAll('.lg')].filter(el => el.offsetWidth).slice(0, MAX).map(el => {
    const r = el.getBoundingClientRect()
    return { el, x: r.x, y: r.y, w: r.width, h: r.height, rad: parseFloat(getComputedStyle(el).borderTopLeftRadius) || 10, e: el.classList.contains('active') ? 1 : el.matches(':focus-within') ? .8 : el.matches(':hover') ? .6 : 0 }
  })
  want()
}

const ro = new ResizeObserver(collect)
function watchRects() {
  ro.disconnect()
  ro.observe(document.body)
  ro.observe(tabsEl)
  document.querySelectorAll('.lg').forEach(el => ro.observe(el))
  collect()
}

function tones() {
  if (!bits) return
  const sx = bits.w / innerWidth, sy = bits.h / BH
  let gs = 0, gn = 0
  for (let i = 0; i < bits.d.length; i += 64) { gs += .2126 * bits.d[i + 2] + .7152 * bits.d[i + 1] + .0722 * bits.d[i]; gn++ }
  const g = gs / gn / 255 // mostly the whole strip's brightness, so one bright button on the page can't flip a single capsule white
  document.body.dataset.tone = g > .6 ? 'light' : g < .45 ? 'dark' : document.body.dataset.tone || 'dark'
  for (const it of items) {
    let sum = 0, n = 0
    for (let y = Math.max(0, Math.floor(it.y * sy)); y < Math.min(bits.h, (it.y + it.h) * sy); y += 4)
      for (let x = Math.max(0, Math.floor(it.x * sx)); x < Math.min(bits.w, (it.x + it.w) * sx); x += 4) {
        const i = (y * bits.w + x) * 4
        sum += .2126 * bits.d[i + 2] + .7152 * bits.d[i + 1] + .0722 * bits.d[i]
        n++
      }
    const l = it.l = .35 * (n ? sum / n / 255 : g) + .65 * g, t = it.el.dataset.tone
    if (l > .6 && t !== 'light') it.el.dataset.tone = 'light'
    else if (l < .45 && t !== 'dark') it.el.dataset.tone = 'dark'
  }
}

function draw() {
  raf = 0
  dpr = devicePixelRatio
  const W = Math.round(innerWidth * dpr), H = Math.round(BH * dpr)
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; gl.viewport(0, 0, W, H) }
  if (frame) {
    bits = { w: frame.width, h: frame.height, d: frame.data }
    frame = null
    if (tw === bits.w && th === bits.h) gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, tw, th, gl.RGBA, gl.UNSIGNED_BYTE, bits.d)
    else { tw = bits.w; th = bits.h; gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, tw, th, 0, gl.RGBA, gl.UNSIGNED_BYTE, bits.d) }
    gl.generateMipmap(gl.TEXTURE_2D)
  }
  tones()
  const rects = new Float32Array(MAX * 4), emph = new Float32Array(MAX), rad = new Float32Array(MAX), tone = new Float32Array(MAX), lum = new Float32Array(MAX)
  items.forEach((it, i) => { rects.set([it.x, it.y, it.w, it.h], i * 4); emph[i] = it.e; rad[i] = it.rad; tone[i] = it.el.dataset.tone === 'light' ? 1 : 0; lum[i] = it.l || 0 })
  gl.uniform2f(U.u_res, innerWidth, BH)
  gl.uniform1f(U.u_dpr, dpr)
  gl.uniform1i(U.u_n, items.length)
  gl.uniform4fv(U.u_rect, rects)
  gl.uniform1fv(U.u_emph, emph)
  gl.uniform1fv(U.u_rad, rad)
  gl.uniform1fv(U.u_tone, tone)
  gl.uniform1fv(U.u_lum, lum)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function want() { if (gl && !raf) raf = requestAnimationFrame(draw) }

qat.on('glass:frame', f => { frame = f; want() })
for (const ev of ['pointerover', 'pointerout', 'focusin', 'focusout']) addEventListener(ev, collect)
addEventListener('resize', collect)
qat.ready()
