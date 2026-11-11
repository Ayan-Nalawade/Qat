const { session } = require('electron')
const HOSTS = new Set(`doubleclick.net googlesyndication.com googleadservices.com google-analytics.com googletagservices.com adservice.google.com pagead2.googlesyndication.com
amazon-adsystem.com adnxs.com adsrvr.org rubiconproject.com pubmatic.com openx.net casalemedia.com criteo.com criteo.net taboola.com outbrain.com
sharethrough.com smaato.net 3lift.com triplelift.com yieldmo.com teads.tv adform.net smartadserver.com indexww.com lijit.com sovrn.com
33across.com gumgum.com media.net contextweb.com districtm.io bidswitch.net spotxchange.com spotx.tv springserve.com freewheel.tv fwmrm.net
360yield.com improvedigital.com turn.com mathtag.com rlcdn.com demdex.net krxd.net bluekai.com agkn.com crwdcntrl.net tapad.com
omnitagjs.com adyoulike.com cootlogix.com programmaticx.ai kueez.com nextmillmedia.com krushmedia.com copper6.com servenobid.com nobid.io
moatads.com adsafeprotected.com doubleverify.com quantserve.com scorecardresearch.com hotjar.com hotjar.io adlightning.com confiant-integrations.net
onetag-sys.com sonobi.com undertone.com zemanta.com yahoo.net ads.yahoo.com advertising.com adtechus.com everesttech.net eyeota.net
id5-sync.com liadm.com 1rx.io rtbhouse.com emxdgt.com richaudience.com seedtag.com connatix.com primis.tech aniview.com vidazoo.com
minutemedia-prebid.com unrulymedia.com yieldlab.net adkernel.com e-planning.net ad.gt audienceexposure.com sitescout.com dotomi.com`.split(/\s+/))
const blocked = h => { for (let i = h.indexOf('.'); i !== -1; h = h.slice(i + 1), i = h.indexOf('.')) if (HOSTS.has(h)) return true; return false }
module.exports = () => session.defaultSession.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (d, cb) => cb({ cancel: blocked(new URL(d.url).hostname) }))
