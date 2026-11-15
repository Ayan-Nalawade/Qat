const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// [text](url) where the url may hold balanced parens (wikipedia's Foo_(bar)); a regex can't count nesting, so scan
function links(s, inl) {
  let out = '', i = 0
  while (i < s.length) {
    const a = s.indexOf('[', i)
    if (a < 0) { out += s.slice(i); break }
    const b = s.indexOf(']', a + 1)
    if (b < 0 || s[b + 1] !== '(' || s.slice(a + 1, b).includes('\n')) { out += s.slice(i, a + 1); i = a + 1; continue }
    let d = 0, j = b + 2, bad = false
    for (; j < s.length; j++) {
      const c = s[j]
      if (c === ' ') { bad = true; break }
      if (c === '(') d++
      else if (c === ')' && !d--) break
    }
    const u = bad || j >= s.length ? '' : s.slice(b + 2, j)
    if (!/^https?:\/\/[^\s]+$/.test(u)) { out += s.slice(i, a + 1); i = a + 1; continue }
    out += s.slice(i, a) + inl('<a href="#" data-u="' + u + '">' + s.slice(a + 1, b) + '</a>')
    i = j + 1
  }
  return out
}

function md(src) {
  const stash = []
  const keep = h => '\0' + (stash.push(h) - 1) + '\0', inl = h => '\x01' + (stash.push(h) - 1) + '\x01'
  let s = esc(src).replace(/```[^\n`]*\n?([\s\S]*?)(```|$)/g, (m, c) => keep('<div class="code"><button class="copy">Copy</button><pre><code>' + c.replace(/\n$/, '') + '</code></pre></div>'))
  s = links(s.replace(/`([^`\n]+)`/g, (m, c) => inl('<code>' + c + '</code>')), inl) // links stashed before bold and italic so a * in a url stays put
  const inline = t => t.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/\*([^*\s][^*]*?)\*/g, '<i>$1</i>')
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
  const un = h => h.replace(/[\0\x01](\d+)[\0\x01]/g, (m, i) => stash[i])
  return un(un(out))
}

