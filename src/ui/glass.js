// same liquid glass as the toolbar: the panel is a muted, blurred copy of the page beside it and every .lg is a glass slab on top
;(() => {
const MAX = 48, cv = document.createElement('canvas'), veil = +document.body.dataset.veil || 0 // veil: see-through backdrop for the quick ask overlay
cv.id = 'gl'
document.body.prepend(cv)
const gl = matchMedia('(prefers-reduced-transparency: reduce)').matches ? null : cv.getContext('webgl2', { alpha: !!veil, premultipliedAlpha: true, antialias: false })
document.body.classList.toggle('solid', !gl)
cv.addEventListener('webglcontextlost', () => document.body.classList.add('solid'))
let U = {}, items = [], raf = 0, tone = 0, goal = 0

if (gl) {
  const sh = (t, src) => { const s = gl.createShader(t); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(s)); return s }
  const pr = gl.createProgram()
  gl.attachShader(pr, sh(gl.VERTEX_SHADER, `#version 300 es
void main() { vec2 v = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2); gl_Position = vec4(v * 2. - 1., 0, 1); }`))
  gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform vec2 u_res; uniform float u_dpr, u_tone, u_a; uniform int u_n; uniform vec4 u_rect[${MAX}], u_meta[${MAX}]; uniform sampler2D u_tex;
out vec4 o;
float sdf(vec2 p, vec4 r, float rad) { vec2 b = r.zw * .5; rad = min(rad, min(b.x, b.y)); vec2 q = abs(p - r.xy - b) - (b - rad); return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - rad; }
vec3 bg(vec2 p, float lod) { return textureLod(u_tex, clamp(p / u_res, 0., 1.), lod).bgr; }
float lum(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec3 base = bg(p, 3.);
  base = mix(vec3(lum(base)), base, .5);
  base = mix(base, mix(vec3(.07, .075, .085), vec3(.945, .95, .955), u_tone), .64);
  float best = 1e5; int k = -1;
  for (int i = 0; i < ${MAX}; i++) { if (i >= u_n) break; vec4 m = u_meta[i]; if (p.y < m.z || p.y > m.w) continue; float s = sdf(p, u_rect[i], m.x); if (s < best) { best = s; k = i; } }
  if (k < 0) { o = vec4(base * u_a, u_a); return; }
  vec4 r = u_rect[k], m = u_meta[k];
  float e = m.y, d = max(-best, 0.), cov = clamp(.5 - best, 0., 1.);
  base *= 1. - pow(1. - clamp(best / 12., 0., 1.), 2.) * (.26 - .12 * u_tone) * step(0., best);
  if (best > .5) { o = vec4(base * u_a, u_a); return; }
  vec2 h = vec2(.5, 0.);
  vec2 n = normalize(vec2(sdf(p + h.xy, r, m.x) - sdf(p - h.xy, r, m.x), sdf(p + h.yx, r, m.x) - sdf(p - h.yx, r, m.x)) + 1e-5);
  vec3 c = bg(p - n * 12. * pow(1. - clamp(d / 18., 0., 1.), 2.), 1.5); // edge bends the backdrop inwards like a lens
  c = mix(vec3(lum(c)), c, .85);
  c = mix(c, mix(vec3(.15, .16, .18), vec3(1.), u_tone), .52 + .06 * e);
  c += (1. - u_tone) * .045 * e;
  float L = max(dot(n, normalize(vec2(-1., -1.))), 0.);
  c += pow(1. - clamp(d / 7., 0., 1.), 3.) * (.06 + .05 * e) * L + .025 * (1. - (p.y - r.y) / r.w);
  c = clamp(c, 0., 1.);
  c = mix(c, c * .93, (1. - smoothstep(0., 1.2, d)) * u_tone);
  o = vec4(mix(base * u_a, c, cov), mix(u_a, 1., cov));
}`))
  gl.linkProgram(pr)
  gl.useProgram(pr)
  for (const n of ['u_res', 'u_dpr', 'u_tone', 'u_a', 'u_n', 'u_rect', 'u_meta', 'u_tex']) U[n] = gl.getUniformLocation(pr, n)
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture())
  for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([30, 28, 26, 255]))
  gl.generateMipmap(gl.TEXTURE_2D)
}

const want = () => { if (gl && !raf) raf = requestAnimationFrame(draw) }

function collect() {
  const clip = document.querySelector('[data-clip]'), box = clip ? clip.getBoundingClientRect() : {}
  items = []
  for (const el of document.querySelectorAll('.lg')) {
    const r = el.getBoundingClientRect(), inMsgs = !!clip?.contains(el) && el !== clip, y0 = inMsgs ? box.top : -1e4, y1 = inMsgs ? box.bottom : 1e4
    if (!r.width || r.bottom < y0 || r.top > y1) continue
    const e = el.matches(':focus-within') ? .8 : el.matches(':hover') ? .6 : el.classList.contains('on') ? .5 : 0
    items.push([r.x, r.y, r.width, r.height, parseFloat(getComputedStyle(el).borderTopLeftRadius) || 12, e, y0, y1])
    if (items.length === MAX) break
  }
  want()
}

function draw() {
  raf = 0
  const dpr = devicePixelRatio, W = Math.round(innerWidth * dpr), H = Math.round(innerHeight * dpr)
  if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; gl.viewport(0, 0, W, H) }
  tone += (goal - tone) * .25
  if (Math.abs(goal - tone) > .01) want()
  else tone = goal
  const rects = new Float32Array(MAX * 4), meta = new Float32Array(MAX * 4)
  items.forEach((it, i) => { rects.set(it.slice(0, 4), i * 4); meta.set(it.slice(4), i * 4) })
  gl.uniform2f(U.u_res, innerWidth, innerHeight)
  gl.uniform1f(U.u_dpr, dpr)
  gl.uniform1f(U.u_tone, tone)
  gl.uniform1f(U.u_a, veil || 1)
  gl.uniform1i(U.u_n, items.length)
  gl.uniform4fv(U.u_rect, rects)
  gl.uniform4fv(U.u_meta, meta)
  gl.drawArrays(gl.TRIANGLES, 0, 3)
}

qat.on('glass:frame', f => {
  let s = 0
  for (let i = 0; i < f.data.length; i += 4) s += .2126 * f.data[i + 2] + .7152 * f.data[i + 1] + .0722 * f.data[i]
  const l = s / (f.data.length / 4) / 255, t = document.body.dataset.tone
  goal = l > .58 ? 1 : l < .42 ? 0 : +(t === 'light')
  document.body.dataset.tone = goal ? 'light' : 'dark'
  if (!gl) return
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, f.width, f.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, f.data)
  gl.generateMipmap(gl.TEXTURE_2D)
  want()
})

new ResizeObserver(collect).observe(document.body)
new MutationObserver(collect).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'open', 'hidden'] })
document.querySelector('[data-clip]')?.addEventListener('scroll', collect, { passive: true })
for (const ev of ['pointerover', 'pointerout', 'focusin', 'focusout', 'resize']) addEventListener(ev, collect)
})()
