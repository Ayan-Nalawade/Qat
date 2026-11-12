const fs = require('fs')
const { FiltersEngine, fetchLists } = require('@ghostery/adblocker')
// parsing ~240k rules spikes a few hundred MB, done here so it dies with this process instead of bloating main
process.parentPort.once('message', async ({ data: { bin, lists } }) => {
  try {
    const e = FiltersEngine.parse((await fetchLists(fetch, lists)).join('\n'), { enableMutationObserver: true, loadExtendedSelectors: true })
    fs.writeFileSync(bin, e.serialize())
    process.parentPort.postMessage('')
  } catch (err) { process.parentPort.postMessage(err.message) }
  process.exit(0)
})
