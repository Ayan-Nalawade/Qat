const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function md(src) {
  const stash = []
  const keep = h => '\0' + (stash.push(h) - 1) + '\0', inl = h => '\x01' + (stash.push(h) - 1) + '\x01'
  let s = esc(src).replace(/```[^\n`]*\n?([\s\S]*?)(```|$)/g, (m, c) => keep('<div class="code"><button class="copy">Copy</button><pre><code>' + c.replace(/\n$/, '') + '</code></pre></div>'))
  s = s.replace(/`([^`\n]+)`/g, (m, c) => inl('<code>' + c + '</code>')).replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, (m, t, u) => inl('<a href="#" data-u="' + u + '">' + t + '</a>')) // links stashed before bold and italic so a * in a url stays put
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

