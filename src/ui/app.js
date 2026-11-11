const $ = s => document.querySelector(s)
qat.on('side', open => { $('#side').classList.toggle('open', open); if (open) $('#chat-in').focus() })
