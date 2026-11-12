const { ipcRenderer } = require('electron')
// removing ad data or seeking past ads makes the player stall, so ads run muted at 16x
// and Skip gets a real click from main since script clicks are ignored
if (/(^|\.)youtube\.com$/.test(location.hostname) && window === top) {
  let ad = false, rate = 1, mute = false, last = 0
  setInterval(() => {
    const p = document.querySelector('.html5-video-player'), v = p?.querySelector('video')
    if (!v) return
    if (!p.classList.contains('ad-showing')) { if (ad) { ad = false; v.muted = mute; v.playbackRate = rate } return }
    if (!ad) { ad = true; rate = v.playbackRate === 16 ? 1 : v.playbackRate; mute = v.muted }
    v.muted = true
    if (v.playbackRate !== 16) v.playbackRate = 16
    const b = document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern')?.getBoundingClientRect()
    if (b?.width && Date.now() - last > 600) { last = Date.now(); ipcRenderer.send('ad:skip', Math.round(b.x + b.width / 2), Math.round(b.y + b.height / 2)) }
  }, 250)
}
