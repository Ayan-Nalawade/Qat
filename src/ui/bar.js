const $ = s => document.querySelector(s)
const omni = $('#omnibox'), tabsEl = $('#tabs'), cv = $('#gl')
const MAX = 32, BH = 52
let state = { tabs: [], activeId: null }
const X = '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg>'

function render() {
  const cur = state.tabs.find(t => t.id === state.activeId)
  tabsEl.innerHTML = ''
  for (const t of state.tabs) {
    const el = document.createElement('div')
    el.className = 'tab lg' + (t.id === state.activeId ? ' active' : '') + (t.sleeping ? ' sleeping' : '')
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
  const sh = $('#shield'), web = /^https?:/.test(cur.url)
  sh.classList.toggle('na', !web)
  sh.classList.toggle('off', !cur.shield)
  sh.title = cur.shield ? cur.blocked + ' ads and trackers blocked. Click to allow ads on this site' : 'Ad blocker off for this site. Click to turn it back on'
  $('#shield-n').textContent = cur.shield && cur.blocked ? (cur.blocked > 999 ? '999+' : cur.blocked) : ''
  watchRects()
}

qat.on('tabs', s => { state = s; render() })
qat.on('mem', mb => { $('#mem-val').textContent = mb + ' MB' })
qat.on('side', open => $('#ai-toggle').classList.toggle('on', open))
qat.on('focus-omnibox', () => { omni.focus(); omni.select() })
qat.on('maximized', m => { $('#w-max').title = m ? 'Restore' : 'Maximize' })

const drop = $('#drop'), looksUrl = s => /^[a-z][a-z0-9+.-]*:\/\//i.test(s) || /^localhost(:\d+)?([/?#]|$)/i.test(s) || (!/\s/.test(s) && s.includes('.'))
const ICON = { url: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 2.5 15.3 0 18M12 3c-2.5 2.7-2.5 15.3 0 18"/></svg>', search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg>' }
const gsearch = q => 'https://www.google.com/search?q=' + encodeURIComponent(q), bare = u => u.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '')
let sugg = [], sel = -1, typed = '', seq = 0, gt

function show(list) {
  sugg = list.slice(0, 8); sel = -1
  drop.innerHTML = ''
  for (const s of sugg) {
    const el = document.createElement('div')
    el.className = 'sg'
    el.innerHTML = ICON[s.kind] + '<span class="t"></span><span class="u"></span>'
    el.querySelector('.t').textContent = s.title || s.text
    el.querySelector('.u').textContent = s.title ? s.text : ''
    el.onmousedown = e => { e.preventDefault(); go(s) }
    drop.append(el)
  }
  drop.hidden = !sugg.length
  const r = $('#omni').getBoundingClientRect()
  Object.assign(drop.style, { left: r.x + 'px', width: r.width + 'px' })
  drop.dataset.tone = $('#omni').dataset.tone || 'dark'
  qat.barHeight(sugg.length ? Math.ceil(drop.getBoundingClientRect().bottom) + 16 : BH)
}

function build(m, g = []) {
  const v = omni.value, list = [looksUrl(v) ? { kind: 'url', text: v, url: v } : { kind: 'search', text: v, title: v + ' - Google Search', url: gsearch(v) }], seen = new Set([bare(v)])
  for (const h of m.items) if (!seen.has(bare(h.url))) { seen.add(bare(h.url)); list.push({ kind: 'url', text: bare(h.url), title: h.title, url: h.url }) }
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
  show(build(m))
  gt = setTimeout(() => qat.search(typed).then(g => my === seq && show(build(m, g))), 120)
})
omni.addEventListener('keydown', e => {
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && sugg.length) {
    e.preventDefault()
    sel = (sel + (e.key === 'ArrowDown' ? 2 : 0) + sugg.length) % (sugg.length + 1) - 1
    drop.querySelectorAll('.sg').forEach((el, i) => el.classList.toggle('hi', i === sel))
    omni.value = sel < 0 ? typed : sugg[sel].kind === 'url' ? sugg[sel].url : sugg[sel].text
  } else if (e.key === 'Enter' && omni.value.trim()) { sel >= 0 ? go(sugg[sel]) : qat.go(omni.value); omni.blur() }
  else if (e.key === 'Escape') { if (sugg.length) { show([]); omni.value = typed } else omni.blur() }
})
omni.addEventListener('focus', () => omni.select())
omni.addEventListener('blur', () => { seq++; clearTimeout(gt); show([]); state.activeId && render() })
addEventListener('mousedown', e => (e.target === document.body || e.target === document.documentElement) && omni.blur())
$('#shield').onclick = qat.shield
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
let items = [], frame = null, bits = null, tex, tw = 0, th = 0, raf = 0, dpr = 1
const U = {}

if (gl) {
  const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s }
  const pr = gl.createProgram()
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, `#version 300 es
void main() { vec2 v = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(v * 2. - 1., 0, 1); }`))
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform vec2 u_res; uniform float u_dpr; uniform int u_n; uniform vec4 u_rect[${MAX}]; uniform float u_emph[${MAX}]; uniform float u_tone[${MAX}]; uniform sampler2D u_tex;
out vec4 o;
float sdf(vec2 p, vec4 r) { vec2 b = r.zw * .5; float rad = min(b.x, b.y); vec2 q = abs(p - r.xy - b) - (b - rad); return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - rad; }
vec3 tx(vec2 p) { return texture(u_tex, clamp(vec2(p.x, u_res.y - p.y) / u_res, 0., 1.)).bgr; } // page top mirrored up into the bar, like apple's background extension
vec3 blur(vec2 p, float r) { return textureLod(u_tex, clamp(vec2(p.x, u_res.y - p.y) / u_res, 0., 1.), log2(r) - 1.).bgr; } // mip levels = smooth cheap blur, texture is half res
void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y * u_dpr - gl_FragCoord.y) / u_dpr;
  float best = 1e5; int k = -1;
  for (int i = 0; i < ${MAX}; i++) { if (i >= u_n) break; float s = sdf(p, u_rect[i]); if (s < best) { best = s; k = i; } }
  vec3 bg = blur(p, 11.);
  bg = mix(bg, blur(p, 24.), .6);
  if (k < 0) { o = vec4(bg, 1); return; }
  vec4 r = u_rect[k]; float e = u_emph[k], tn = u_tone[k];
  bg *= 1. - pow(1. - clamp(best / 9., 0., 1.), 2.) * (.14 + .12 * tn) * step(0., best);
  if (best > .5) { o = vec4(bg, 1); return; }
  float cov = clamp(.5 - best, 0., 1.), d = max(-best, 0.);
  vec2 h = vec2(.5, 0.);
  vec2 n = normalize(vec2(sdf(p + h.xy, r) - sdf(p - h.xy, r), sdf(p + h.yx, r) - sdf(p - h.yx, r)) + 1e-5);
  vec2 off = n * (6. + 2. * e) * pow(1. - clamp(d / 18., 0., 1.), 2.); // 2*6/18 < 1 keeps the mapping monotonic, no mirrored text
  vec3 c = vec3(0);
  for (int j = 0; j < 9; j++) { vec2 q = vec2(float(j % 3) - 1., float(j / 3) - 1.) * 2.4; c += vec3(tx(p - off + q).r, tx(p - off * 1.05 + q).g, tx(p - off * 1.1 + q).b); }
  c /= 9.;
  c = mix(c, blur(p, 14.), .45); // wide average stops one small bright button flooding the whole capsule
  c = mix(vec3(dot(c, vec3(.299, .587, .114))), c, 1.15 + .06 * e);
  c = mix(c, mix(vec3(.08, .09, .12), vec3(1.), tn), .45 + .05 * e);
  float L = dot(n, normalize(vec2(-1., -1.)));
  float spec = (1. - smoothstep(0., 1.8, d)) * (.25 + .6 * max(L, 0.) + .25 * max(-L, 0.)) * (1. + .5 * e);
  float glow = pow(1. - clamp(d / 8., 0., 1.), 3.) * .12 * max(L, 0.);
  c += spec + glow + .05 * (1. - (p.y - r.y) / r.w);
  c = mix(c, c * .82, (1. - smoothstep(0., 1.2, d)) * tn); // darker rim edge on light backdrops
  o = vec4(mix(bg, clamp(c, 0., 1.), cov), 1);
}`))
  gl.linkProgram(pr)
  gl.useProgram(pr)
  for (const n of ['u_res', 'u_dpr', 'u_n', 'u_rect', 'u_emph', 'u_tone', 'u_tex']) U[n] = gl.getUniformLocation(pr, n)
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
  items = [...document.querySelectorAll('.lg')].slice(0, MAX).map(el => {
    const r = el.getBoundingClientRect()
    return { el, x: r.x, y: r.y, w: r.width, h: r.height, e: el.classList.contains('active') ? 1 : el.matches(':focus-within') ? .8 : el.matches(':hover') ? .6 : 0 }
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
  for (const it of items) {
    let sum = 0, n = 0
    for (let y = Math.max(0, Math.floor(it.y * sy)); y < Math.min(bits.h, (it.y + it.h) * sy); y += 4)
      for (let x = Math.max(0, Math.floor(it.x * sx)); x < Math.min(bits.w, (it.x + it.w) * sx); x += 4) {
        const i = (y * bits.w + x) * 4
        sum += .2126 * bits.d[i + 2] + .7152 * bits.d[i + 1] + .0722 * bits.d[i]
        n++
      }
    const l = n ? sum / n / 255 : 0, t = it.el.dataset.tone
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
  const rects = new Float32Array(MAX * 4), emph = new Float32Array(MAX), tone = new Float32Array(MAX)
  items.forEach((it, i) => { rects.set([it.x, it.y, it.w, it.h], i * 4); emph[i] = it.e; tone[i] = it.el.dataset.tone === 'light' ? 1 : 0 })
  gl.uniform2f(U.u_res, innerWidth, BH)
  gl.uniform1f(U.u_dpr, dpr)
  gl.uniform1i(U.u_n, items.length)
  gl.uniform4fv(U.u_rect, rects)
  gl.uniform1fv(U.u_emph, emph)
  gl.uniform1fv(U.u_tone, tone)
  gl.clearColor(0, 0, 0, 0)
  gl.clear(gl.COLOR_BUFFER_BIT)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

function want() { if (gl && !raf) raf = requestAnimationFrame(draw) }

qat.on('glass:frame', f => { frame = f; want() })
for (const ev of ['pointerover', 'pointerout', 'focusin', 'focusout']) addEventListener(ev, collect)
addEventListener('resize', collect)
qat.ready()
