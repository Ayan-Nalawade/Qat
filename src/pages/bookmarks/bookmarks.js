const $ = s => document.querySelector(s), note = $('#note')
const el = (tag, cls, txt) => Object.assign(document.createElement(tag), { className: cls || '', textContent: txt || '' })
let all = []
let dragSrc = null

async function draw() {
  all = await qat.bm.list()
  const folders = [...new Set(all.map(b => b.folder).filter(Boolean))].sort()
  const q = $('#q').value.trim().toLowerCase(), groups = new Map(), list = $('#list')
  for (const b of all) if (!q || (b.title + ' ' + b.url).toLowerCase().includes(q)) (groups.get(b.folder) || groups.set(b.folder, []).get(b.folder)).push(b)
  list.innerHTML = ''
  if (!groups.size) return list.append(Object.assign(el('div', 'box'), { innerHTML: '<div class="empty">' + (all.length ? 'Nothing matches' : 'No bookmarks yet. Press Ctrl+D or the star in the address bar to add one.') + '</div>' }))
  for (const [f, items] of groups) {
    const box = el('div', 'box')
    if (f) {
      const hd = el('div', 'hd', f)
      hd.title = 'Ctrl+click to open all'
      hd.style.cursor = 'pointer'
      hd.onclick = e => {
        if (e.ctrlKey || e.metaKey) {
          if (confirm(`Open all ${items.length} bookmarks in "${f}"?`)) {
            for (const b of items) qat.newTab(b.url)
          }
        }
      }
      box.append(hd)
    }
    for (const b of items) {
      const row = el('div', 'item')
      row.draggable = true
      row.dataset.url = b.url
      row.dataset.folder = b.folder || ''
      const dragHandle = el('span', 'drag-handle', '⋮⋮')
      dragHandle.title = 'Drag to reorder'
      const a = el('a', 'txt')
      a.href = b.url
      a.append(el('b', 'url', b.title), el('small', 'url', b.url))
      const folderSel = el('select', 'folder-sel')
      folderSel.innerHTML = '<option value="">(none)</option>' + folders.map(ff => `<option value="${ff}"${ff === b.folder ? ' selected' : ''}>${ff}</option>`).join('')
      folderSel.onchange = async () => {
        await qat.bm.move(b.url, folderSel.value)
        draw()
      }
      const x = el('button', 'pill', 'Remove')
      x.onclick = async () => { await qat.bm.remove(b.url, b.folder); draw() }
      row.append(dragHandle, a, folderSel, x)
      row.addEventListener('dragstart', e => {
        dragSrc = row
        row.classList.add('dragging')
        e.dataTransfer.effectAllowed = 'move'
      })
      row.addEventListener('dragend', () => {
        row.classList.remove('dragging')
        dragSrc = null
      })
      row.addEventListener('dragover', e => {
        e.preventDefault()
        e.dataTransfer.dropEffect = 'move'
        const after = getDragAfterElement(list, e.clientY)
        if (after == null) list.appendChild(row)
        else list.insertBefore(row, after)
      })
      row.addEventListener('drop', async e => {
        e.preventDefault()
        if (dragSrc && dragSrc !== row) {
          const url = dragSrc.dataset.url
          const newFolder = row.dataset.folder
          if (dragSrc.dataset.folder !== newFolder) {
            await qat.bm.move(url, newFolder)
            draw()
          }
        }
      })
      box.append(row)
    }
    list.append(box)
  }
}

function getDragAfterElement(container, y) {
  const draggableElements = [...container.querySelectorAll('.item:not(.dragging)')]
  return draggableElements.reduce((closest, child) => {
    const box = child.getBoundingClientRect()
    const offset = y - box.top - box.height / 2
    if (offset < 0 && offset > closest.offset) return { offset, element: child }
    return closest
  }, { offset: Number.NEGATIVE_INFINITY }).element
}

qat.profiles().then(p => { $('#prof').replaceChildren(...p.map(x => Object.assign(document.createElement('option'), { value: x.dir, textContent: x.name }))); $('#prof').hidden = $('#imp').hidden = !p.length })
$('#imp').onclick = async () => {
  try { const n = await qat.bm.import($('#prof').value); note.textContent = n ? 'Imported ' + n + ' bookmarks' : 'Nothing new to import' } catch { note.textContent = 'That Chrome profile has no bookmarks file' }
  draw()
}
$('#q').oninput = draw
draw()

// Context menu for creating folders
let ctxMenu = null
document.addEventListener('contextmenu', e => {
  if (e.target.closest('#list') || e.target.closest('.box') || e.target.closest('.hd')) {
    e.preventDefault()
    if (ctxMenu) ctxMenu.remove()
    ctxMenu = el('div', 'ctx-menu')
    const createBtn = el('button', 'ctx-item', 'New folder')
    createBtn.onclick = async () => {
      const name = prompt('Folder name:')
      if (name) {
        await qat.bm.createFolder(name)
        draw()
      }
      ctxMenu.remove()
      ctxMenu = null
    }
    ctxMenu.append(createBtn)
    ctxMenu.style.left = e.clientX + 'px'
    ctxMenu.style.top = e.clientY + 'px'
    document.body.append(ctxMenu)
  }
})
document.addEventListener('click', () => { if (ctxMenu) { ctxMenu.remove(); ctxMenu = null } })
