// same liquid glass as the toolbar: the panel is a muted, blurred copy of the page beside it and every .lg is a glass slab on top
;(() => {
const MAX = 48, cv = document.createElement('canvas'), veil = document.body.dataset.veil // set = the page shows through around the slabs, for the quick ask
cv.id = 'gl'
document.body.prepend(cv)
const gl = matchMedia('(prefers-reduced-transparency: reduce)').matches ? null : cv.getContext('webgl2', { alpha: veil != null, premultipliedAlpha: true, antialias: false })
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
uniform vec2 u_res; uniform float u_dpr, u_tone, u_a, u_t; uniform int u_n; uniform vec4 u_rect[${MAX}], u_meta[${MAX}]; uniform sampler2D u_tex;
out vec4 o;
float sdf(vec2 p, vec4 r, float rad) { vec2 b = r.zw * .5; rad = min(rad, min(b.x, b.y)); vec2 q = abs(p - r.xy - b) - (b - rad); return length(max(q, 0.)) + min(max(q.x, q.y), 0.) - rad; }
// negative radius = a glass ring that thick around the whole view, rounded on the inside like a screen bezel
float shape(vec2 p, vec4 r, float rad) { if (rad >= 0.) return sdf(p, r, rad); float t = -rad; return max(sdf(p, r, 0.), -sdf(p, vec4(r.xy + t, r.zw - 2. * t), 22.)); }
vec3 bg(vec2 p, float lod) { return textureLod(u_tex, clamp(p / u_res, 0., 1.), lod).bgr; }
float lum(vec3 c) { return dot(c, vec3(.299, .587, .114)); }
// the ring's hue: the page's own colour pushed richer, or a cool glass blue where the page has no colour to give (white, grey, black)
vec3 tint(vec2 p) { vec3 c = bg(p, 6.); float ch = max(c.r, max(c.g, c.b)) - min(c.r, min(c.g, c.b)); vec3 s = clamp(mix(vec3(lum(c)), c, 2.4) * 1.5 + .12, 0., 1.); return mix(vec3(.42, .66, 1.), s, smoothstep(.05, .18, ch)); }
void main() {
  vec2 p = vec2(gl_FragCoord.x, u_res.y * u_dpr - gl_FragCoord.y) / u_dpr;
  vec3 base = bg(p, 3.);
  base = mix(vec3(lum(base)), base, .5);
  base = mix(base, mix(vec3(.07, .075, .085), vec3(.945, .95, .955), u_tone), .64);
  float best = 1e5, rs = -1.; int k = -1, ri = -1;
  for (int i = 0; i < ${MAX}; i++) { if (i >= u_n) break; vec4 m = u_meta[i]; if (p.y < m.z || p.y > m.w) continue; float s = shape(p, u_rect[i], m.x); if (m.x < 0.) { rs = s; ri = i; } if (s < best) { best = s; k = i; } }
  // the ring's glow: the page's own colours, pushed brighter and richer, bleeding in from the edges and breathing
  vec4 G = vec4(0);
  if (ri >= 0 && rs > 0.) {
    vec3 hue = tint(p);
    float g = u_meta[ri].y * (exp(-rs / 34.) * .7 + exp(-rs / 140.) * .35) * (.86 + .14 * sin(u_t * 2.2));
    G = vec4(hue * g, g);
  }
  if (k < 0) { o = vec4(base * u_a, u_a) + G * (1. - u_a); return; }
  vec4 r = u_rect[k], m = u_meta[k];
  bool ring = m.x < 0.;
  float di = ring ? sdf(p, vec4(r.xy - m.x, r.zw + 2. * m.x), 22.) : 0.; // ring: distance to its inner edge
  float e = m.y, d = max(-best, 0.), cov = clamp(.5 - best, 0., 1.);
  float shd = pow(1. - clamp(best / 12., 0., 1.), 2.) * (ring ? .07 : .26 - .12 * u_tone) * step(0., best);
  base *= 1. - shd;
  if (best > .5) { vec4 res = vec4(base * u_a, u_a + (1. - u_a) * shd); o = res + G * (1. - res.a); return; } // see-through mode still gets the soft shadow, as plain black
  vec2 h = vec2(.5, 0.);
  vec2 n = normalize(vec2(shape(p + h.xy, r, m.x) - shape(p - h.xy, r, m.x), shape(p + h.yx, r, m.x) - shape(p - h.yx, r, m.x)) + 1e-5);
  vec2 off = n * (ring ? 22. : 12.) * pow(1. - clamp((ring ? di : d) / (ring ? 26. : 18.), 0., 1.), 2.);
  vec3 c = ring ? vec3(bg(p - off, .3).r, bg(p - off * 1.08, .3).g, bg(p - off * 1.16, .3).b) : bg(p - off, 1.5); // edge bends the backdrop inwards like a lens, the ring splits colour a little too
  c = mix(vec3(lum(c)), c, ring ? 1.3 : .85); // the ring stays clear but richer and lit with the hue so the edge pops
  if (ring) c = mix(c + (1. - c) * .1, tint(p), .3 * e);
  else c = mix(c, mix(vec3(.15, .16, .18), vec3(1.), u_tone), .52 + .06 * e);
  c += (1. - u_tone) * .045 * e;
  float L = max(dot(n, ring ? vec2(cos(u_t), sin(u_t)) : normalize(vec2(-1., -1.))), 0.); // the ring's highlight travels around it
  if (ring) c += pow(1. - clamp(di / 9., 0., 1.), 3.) * .35 * L + .16 * (1. - smoothstep(0., 1.4, di)) * (.4 + .6 * L) + .08 * pow(1. - clamp(d / 5., 0., 1.), 2.);
  else c += pow(1. - clamp(d / 7., 0., 1.), 3.) * (.06 + .05 * e) * L + .025 * (1. - (p.y - r.y) / r.w);
  c = clamp(c, 0., 1.);
  if (!ring) c = mix(c, c * .93, (1. - smoothstep(0., 1.2, d)) * u_tone);
  vec4 res = vec4(mix(base * u_a, c, cov), mix(u_a, 1., cov));
  o = res + G * (1. - res.a);
}`))
  gl.linkProgram(pr)
  gl.useProgram(pr)
  for (const n of ['u_res', 'u_dpr', 'u_tone', 'u_a', 'u_t', 'u_n', 'u_rect', 'u_meta', 'u_tex']) U[n] = gl.getUniformLocation(pr, n)
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
    const cs = getComputedStyle(el), ring = el.classList.contains('ring') && parseFloat(cs.getPropertyValue('--t'))
    if (ring === 0) continue
    items.push([r.x, r.y, r.width, r.height, ring ? -ring : parseFloat(cs.borderTopLeftRadius) || 12, ring ? parseFloat(cs.getPropertyValue('--g')) || 0 : e, y0, y1]) // a ring's e is how strong its glow is
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
  gl.uniform1f(U.u_a, veil == null ? 1 : +veil)
  gl.uniform1f(U.u_t, performance.now() / 2400)
  if (items.some(it => it[4] < 0) && !matchMedia('(prefers-reduced-motion: reduce)').matches) want() // keep the ring's light moving
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
  if (document.body.dataset.lock) goal = +(document.body.dataset.lock === 'light') // quick ask's bar is always dark, like the takeover one
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
