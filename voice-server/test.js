// Local check of the relay: a fake Colvy (streams a reply) and a fake Twilio
// (a WebSocket client sending ConversationRelay messages). Run: npm test
import http from 'node:http'
import crypto from 'node:crypto'
process.env.VOICE_RELAY_SECRET = 'test-secret'
const colvyCalls = []
const colvy = http.createServer((req, res) => {
  let body = ''
  req.on('data', c => body += c)
  req.on('end', async () => {
    const b = JSON.parse(body); colvyCalls.push({ ...b, secret: req.headers['x-relay-secret'] })
    if (b.event !== 'prompt') { res.end('{"ok":true}'); return }
    res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
    if (/goodbye/i.test(b.said)) { res.write(JSON.stringify({ t: 'text', text: 'Thanks, bye!' }) + '\n'); res.end(JSON.stringify({ t: 'done', end: true }) + '\n'); return }
    if (/slow/i.test(b.said)) { res.write(JSON.stringify({ t: 'text', text: 'Let me check ' }) + '\n'); await new Promise(r => setTimeout(r, 1500)); res.end(JSON.stringify({ t: 'done', end: false }) + '\n'); return }
    for (const w of ['We are ', 'open until ', '5pm today.']) { res.write(JSON.stringify({ t: 'text', text: w }) + '\n'); await new Promise(r => setTimeout(r, 30)) }
    res.end(JSON.stringify({ t: 'done', end: false }) + '\n')
  })
}).listen(0)
await new Promise(r => colvy.on('listening', r))
process.env.COLVY_URL = `http://127.0.0.1:${colvy.address().port}`
const { startServer } = await import('./server.js')
const { WebSocket } = await import('ws')
const relay = startServer(0)
await new Promise(r => relay.on('listening', r))
const url = `ws://127.0.0.1:${relay.address().port}/relay`

let pass = 0, fail = 0
const ok = (c, m) => { if (c) { pass++; console.log('ok  ', m) } else { fail++; console.log('FAIL', m) } }
const pass_ = (exp = Math.floor(Date.now() / 1000) + 600, secret = 'test-secret') => {
  const p = { callRowId: 'call1', companyId: 'co1', exp: String(exp) }
  return { ...p, sig: crypto.createHmac('sha256', secret).update(`${p.callRowId}.${p.companyId}.${p.exp}`).digest('hex') }
}
const open = (params) => new Promise(resolve => {
  const ws = new WebSocket(url); const got = []; let closed = null
  ws.on('message', m => got.push(JSON.parse(String(m))))
  ws.on('close', code => { closed = code })
  ws.on('open', () => { ws.send(JSON.stringify({ type: 'setup', callSid: 'CA1', customParameters: params })); resolve({ ws, got, closedCode: () => closed }) })
})
const wait = (ms) => new Promise(r => setTimeout(r, ms))

// 1. A good pass: a prompt streams back word by word, then last:true
let c = await open(pass_())
c.ws.send(JSON.stringify({ type: 'prompt', voicePrompt: 'When do you close?', last: true }))
await wait(400)
const texts = c.got.filter(m => m.type === 'text')
ok(texts.length === 4 && texts.slice(0, 3).map(t => t.token).join('') === 'We are open until 5pm today.' && texts[3].last === true, `reply streamed in pieces then marked last (${JSON.stringify(texts)})`)
ok(colvyCalls[0]?.event === 'prompt' && colvyCalls[0].said === 'When do you close?' && colvyCalls[0].secret === 'test-secret' && colvyCalls[0].callRowId === 'call1', 'forwarded to Colvy with the secret and the call')

// 2. Caller talks over a reply: it's cut off and Colvy hears what they heard
c.ws.send(JSON.stringify({ type: 'prompt', voicePrompt: 'Something slow please', last: true }))
await wait(200)
c.ws.send(JSON.stringify({ type: 'interrupt', utteranceUntilInterrupt: 'Let me', durationUntilInterruptMs: 400 }))
await wait(1700)
ok(colvyCalls.some(x => x.event === 'interrupt' && x.heard === 'Let me'), 'interrupt reported to Colvy')
ok(!c.got.slice(4).some(m => m.type === 'text' && m.last === true), 'the cut-off reply is not finished off')

// 3. Pressing 0 → voicemail handoff
c.ws.send(JSON.stringify({ type: 'dtmf', digit: '0' }))
await wait(100)
const end = c.got.find(m => m.type === 'end')
ok(end && JSON.parse(end.handoffData).action === 'voicemail', `0 ends the session with a voicemail handoff (${JSON.stringify(end)})`)

// 4. Goodbye from Colvy ends the session
const c2 = await open(pass_())
c2.ws.send(JSON.stringify({ type: 'prompt', voicePrompt: 'ok goodbye', last: true }))
await wait(300)
const end2 = c2.got.find(m => m.type === 'end')
ok(c2.got.some(m => m.token === 'Thanks, bye!') && end2 && JSON.parse(end2.handoffData).action === 'hangup', 'goodbye: speaks then ends the session')

// 5. Partial prompts are ignored (only final speech is answered)
const before = colvyCalls.filter(x => x.event === 'prompt').length
c2.ws.send(JSON.stringify({ type: 'prompt', voicePrompt: 'hal', last: false }))
await wait(150)
ok(colvyCalls.filter(x => x.event === 'prompt').length === before, 'partial speech is not sent to Colvy')

// 6. Hang-up tells Colvy to save
c2.ws.close(); await wait(150)
ok(colvyCalls.some(x => x.event === 'closed'), 'call end reported to Colvy')

// 7. Bad passes are refused: wrong secret, expired, missing
for (const [label, p] of [['wrong secret', pass_(undefined, 'other')], ['expired', pass_(Math.floor(Date.now() / 1000) - 5)], ['missing', {}]]) {
  const n = colvyCalls.length
  const x = await open(p); await wait(150)
  x.ws.readyState === 1 && x.ws.send(JSON.stringify({ type: 'prompt', voicePrompt: 'hi', last: true }))
  await wait(150)
  ok(x.closedCode() === 1008 && colvyCalls.length === n, `${label} pass: connection refused, nothing sent to Colvy`)
}

// 8. Colvy down → the caller hears an apology and goes to voicemail
const port = colvy.address().port
colvy.close(); colvy.closeAllConnections?.()
await wait(100)
const c3 = await open(pass_())
c3.ws.send(JSON.stringify({ type: 'prompt', voicePrompt: 'hello', last: true }))
await wait(500)
const end3 = c3.got.find(m => m.type === 'end')
ok(c3.got.some(m => /trouble/.test(m.token || '')) && end3 && JSON.parse(end3.handoffData).action === 'voicemail', `Colvy unreachable → apology + voicemail (port ${port})`)

// 9. Health check for the host
const h = await fetch(`http://127.0.0.1:${relay.address().port}/health`).then(r => r.text())
ok(h === 'ok', 'health check answers ok')

console.log(`\n${pass} passed, ${fail} failed`)
relay.close(); process.exit(fail ? 1 : 0)
