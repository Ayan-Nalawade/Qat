const { contextBridge } = require('electron')
// stripping youtube's ad json triggers its anti-adblock wait (~25s before playback), so let the ad load and skip it instantly
if (/(^|\.)youtube\.com$/.test(location.hostname)) contextBridge.executeInMainWorld({ func: () => {
  let muted = false
  setInterval(() => {
    const p = document.querySelector('.html5-video-player'), v = p?.querySelector('video')
    if (!v) return
    if (!p.classList.contains('ad-showing')) { if (muted) v.muted = muted = false; return }
    if (!v.muted) v.muted = muted = true
    if (isFinite(v.duration) && v.currentTime < v.duration - .1) v.currentTime = v.duration - .05
    document.querySelector('.ytp-skip-ad-button, .ytp-ad-skip-button, .ytp-ad-skip-button-modern')?.click()
  }, 250)
} })
