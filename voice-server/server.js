// Colvy voice relay — the always-on piece of the AI phone agent.
//
// Twilio ConversationRelay holds a WebSocket open for the whole call: it sends
// what the caller says (already turned into text) and reads aloud whatever text
// we send back. Vercel can't hold WebSockets, so this small server does, and
// forwards each turn to Colvy (POST /api/phone-agent/relay), streaming Colvy's
// reply back to Twilio word by word. All the business logic stays in Colvy;
// this server only needs Colvy's address and a shared secret.
//
// Env: COLVY_URL (https://colvy.com), VOICE_RELAY_SECRET (same as on Vercel), PORT.

import http from 'node:http'
import crypto from 'node:crypto'
import { WebSocketServer } from 'ws'

const PORT = Number(process.env.PORT || 8080)
const COLVY_URL = String(process.env.COLVY_URL || 'https://colvy.com').replace(/\/$/, '')
const SECRET = process.env.VOICE_RELAY_SECRET || ''
if (!SECRET) console.warn('[relay] VOICE_RELAY_SECRET is not set — every call will be refused')

const log = (...a) => console.log(new Date().toISOString(), ...a)

// The pass Colvy put in the call's TwiML: valid for this call, for an hour.
export function passOk(p, now = Date.now()) {
  if (!SECRET || !p?.callRowId || !p?.companyId || !p?.exp || !p?.sig) return false
  if (Number(p.exp) * 1000 < now) return false
  const want = crypto.createHmac('sha256', SECRET).update(`${p.callRowId}.${p.companyId}.${p.exp}`).digest('hex')
  const a = Buffer.from(String(p.sig)), b = Buffer.from(want)
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

function colvy(event, call, extra = {}, signal) {
  return fetch(`${COLVY_URL}/api/phone-agent/relay`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-relay-secret': SECRET },
    body: JSON.stringify({ event, callRowId: call.callRowId, companyId: call.companyId, ...extra }),
    signal,
  })
}

export function handleConnection(ws) {
  let call = null            // { callRowId, companyId } once the pass checks out
  let inflight = null        // the reply being streamed (aborted if the caller talks over it)
  const send = (o) => { if (ws.readyState === 1) ws.send(JSON.stringify(o)) }
  const endWith = (action) => send({ type: 'end', handoffData: JSON.stringify({ action }) })

  async function reply(said) {
    if (inflight) inflight.abort()
    const ctrl = new AbortController()
    inflight = ctrl
    const t0 = Date.now()
    let firstAt = 0
    try {
      const res = await colvy('prompt', call, { said }, ctrl.signal)
      if (!res.ok || !res.body) throw new Error(`Colvy answered ${res.status}`)
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let nl
        while ((nl = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          if (!line) continue
          let m
          try { m = JSON.parse(line) } catch { continue }
          if (m.t === 'text' && m.text) {
            if (!firstAt) { firstAt = Date.now(); log('[relay] first words after', firstAt - t0, 'ms', call.callRowId) }
            send({ type: 'text', token: m.text, last: false })
          } else if (m.t === 'done') {
            send({ type: 'text', token: '', last: true })
            if (m.end) endWith(m.voicemail ? 'voicemail' : 'hangup')
          }
        }
      }
    } catch (e) {
      if (ctrl.signal.aborted) return
      log('[relay] turn failed', call?.callRowId, e?.message || e)
      send({ type: 'text', token: 'Sorry, I’m having trouble on my end, so I’ll pass you to voicemail.', last: true })
      endWith('voicemail')
    } finally {
      if (inflight === ctrl) inflight = null
    }
  }

  ws.on('message', (raw) => {
    let msg
    try { msg = JSON.parse(String(raw)) } catch { return }
    if (msg.type === 'setup') {
      const p = msg.customParameters || {}
      if (!passOk(p)) { log('[relay] refused a call with a bad pass', msg.callSid || ''); ws.close(1008, 'forbidden'); return }
      call = { callRowId: p.callRowId, companyId: p.companyId }
      log('[relay] call connected', call.callRowId)
      return
    }
    if (!call) return
    if (msg.type === 'prompt' && msg.last !== false) {
      const said = String(msg.voicePrompt || '').trim()
      if (said) reply(said)
    } else if (msg.type === 'interrupt') {
      if (inflight) inflight.abort()
      colvy('interrupt', call, { heard: msg.utteranceUntilInterrupt || '' }).catch(() => {})
    } else if (msg.type === 'dtmf' && String(msg.digit) === '0') {
      if (inflight) inflight.abort()
      endWith('voicemail')
    } else if (msg.type === 'error') {
      log('[relay] Twilio reported an error', call.callRowId, msg.description)
    }
  })
  ws.on('close', () => {
    if (inflight) inflight.abort()
    if (call) colvy('closed', call).catch(() => {})
  })
}

export function startServer(port = PORT) {
  const server = http.createServer((req, res) => {
    if (req.url === '/health' || req.url === '/') { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('ok'); return }
    res.writeHead(404); res.end()
  })
  const wss = new WebSocketServer({ server, path: '/relay' })
  wss.on('connection', handleConnection)
  server.listen(port, () => log(`[relay] listening on ${port}, Colvy at ${COLVY_URL}`))
  return server
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) startServer()
