const fs = require('fs')
// write next to the file then swap, a crash mid-write used to leave half a json that loaded as empty and got saved over
module.exports = (f, data) => { fs.writeFileSync(f + '.tmp', data); fs.renameSync(f + '.tmp', f) }
