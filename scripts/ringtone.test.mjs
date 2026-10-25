// Runnable tests for the incoming-call ringtone (lib/ringtone.ts).
//
//   npx tsx scripts/ringtone.test.mjs
//
// Zero-dependency (same pattern as scripts/form-logic.test.mjs). Audio and
// AudioContext are faked the way Chrome behaves: play() can stay pending
// while media is held back (a background tab), and pause() during a pending
// play() rejects it with an AbortError. Timers are faked so the 3s beep and
// the grace/cap timeouts can be stepped through. Exits non-zero on failure.

let failures = 0
const ok = (cond, name) => { if (cond) console.log('  ok  ', name); else { failures++; console.log('  FAIL', name) } }

// ── Fake timers ──────────────────────────────────────────────────────────────
let now = 0, seq = 0
const timers = new Map()
globalThis.setTimeout = (fn, ms = 0) => { const id = ++seq; timers.set(id, { fn, at: now + ms }); return id }
globalThis.setInterval = (fn, ms = 0) => { const id = ++seq; timers.set(id, { fn, at: now + ms, every: ms }); return id }
globalThis.clearTimeout = globalThis.clearInterval = id => { timers.delete(id) }
const flush = () => new Promise(r => queueMicrotask(r)).then(() => new Promise(r => queueMicrotask(r)))
async function advance(ms) {
  const end = now + ms
  for (;;) {
    let next = null
    for (const [id, t] of timers) if (t.at <= end && (!next || t.at < next[1].at)) next = [id, t]
    if (!next) break
    const [id, t] = next
    now = t.at
    if (t.every) t.at += t.every; else timers.delete(id)
    t.fn()
    await flush()
  }
  now = end
  await flush()
}

// ── Fake media ───────────────────────────────────────────────────────────────
// mode: 'held' (play() stays pending until release()), 'plays', 'blocked'.
let mode = 'plays'
const audios = []
class FakeAudio {
  constructor(src) { this.src = src; this.playing = false; this.listeners = {}; this.pending = null; audios.push(this) }
  addEventListener(ev, fn) { (this.listeners[ev] ||= []).push(fn) }
  emit(ev) { for (const fn of this.listeners[ev] || []) fn() }
  play() {
    if (mode === 'blocked') return Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
    if (mode === 'plays') { this.playing = true; queueMicrotask(() => this.emit('playing')); return Promise.resolve() }
    return new Promise((resolve, reject) => { this.pending = { resolve, reject } })
  }
  release() { if (this.pending) { this.playing = true; this.pending.resolve(); this.pending = null; this.emit('playing') } }
  pause() { this.playing = false; if (this.pending) { const p = this.pending; this.pending = null; p.reject(Object.assign(new Error('The play() request was interrupted by a call to pause()'), { name: 'AbortError' })) } }
  removeAttribute() { this.src = '' }
  load() {}
}
const ctxs = []
class FakeCtx {
  constructor() { this.closed = false; this.beeps = 0; this.currentTime = 0; this.destination = {}; ctxs.push(this) }
  createOscillator() { const c = this; return { frequency: {}, connect() {}, start() { if (!c.closed) c.beeps++ }, stop() {} } }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} } }
  close() { this.closed = true }
}
globalThis.Audio = FakeAudio
globalThis.window = { AudioContext: FakeCtx }

const { createRinger, RING_FILE_GRACE_MS, RING_CAP_MS } = await import('../lib/ringtone.ts')
const reset = () => { audios.length = 0; ctxs.length = 0; timers.clear() }
const soundOn = () => audios.some(a => a.playing) || ctxs.some(c => !c.closed)
const beepsAfter = async ms => { const before = ctxs.reduce((n, c) => n + c.beeps, 0); await advance(ms); return ctxs.reduce((n, c) => n + c.beeps, 0) - before }

console.log('The reported bug: answered while the file was still held back')
{
  reset(); mode = 'held'
  const r = createRinger()
  r.start(); await flush()
  await advance(1000)          // answered within the grace period
  r.stop(); await flush()
  ok(!soundOn(), 'nothing is playing right after the answer')
  ok(await beepsAfter(30000) === 0, 'no "tung" in the 30s after answering')
  ok(ctxs.length === 0, 'the fallback tone never started')
}

console.log('Answered after the tone stood in for a held-back file')
{
  reset(); mode = 'held'
  const r = createRinger()
  r.start(); await flush()
  await advance(RING_FILE_GRACE_MS + 10)
  ok(ctxs.length === 1 && !ctxs[0].closed, 'the tone rings while the file is held back')
  r.stop(); await flush()
  ok(!soundOn(), 'answering stops the tone and the file')
  audios[0].release(); await flush()   // the browser finally lets the file play
  ok(!audios[0].playing, 'a file that starts after the answer is silenced at once')
  ok(await beepsAfter(30000) === 0, 'no beeps afterwards')
}

console.log('The file takes over from the tone')
{
  reset(); mode = 'held'
  const r = createRinger()
  r.start(); await flush()
  await advance(RING_FILE_GRACE_MS + 10)
  audios[0].release(); await flush()
  ok(audios[0].playing && ctxs[0].closed, 'once the file plays the tone stops (no double ring)')
  r.stop(); await flush()
  ok(!soundOn(), 'stop silences it')
}

console.log('Autoplay blocked: the tone rings, and stops')
{
  reset(); mode = 'blocked'
  const r = createRinger()
  r.start(); await flush()
  ok(ctxs.length === 1 && !ctxs[0].closed, 'tone rings when the file is blocked')
  ok(await beepsAfter(9000) >= 3, 'it beeps every 3s while ringing')
  r.stop(); await flush()
  ok(!soundOn() && await beepsAfter(30000) === 0, 'stop ends it for good')
}

console.log('A call offered twice never leaves an orphan ringing')
{
  reset(); mode = 'plays'
  const r = createRinger()
  r.start(); await flush()
  r.start(); await flush()
  ok(audios.filter(a => a.playing).length === 1, 'only one ringtone plays')
  r.stop(); await flush()
  ok(!soundOn(), 'one stop silences everything')
}

console.log('Safety cap')
{
  reset(); mode = 'blocked'
  const r = createRinger()
  r.start(); await flush()
  await advance(RING_CAP_MS + 10)
  ok(!soundOn(), `a ring nobody stops ends by itself after ${RING_CAP_MS / 1000}s`)
  ok(await beepsAfter(30000) === 0, 'and stays quiet')
}

console.log(failures ? `\n${failures} failed` : '\nall passed')
process.exit(failures ? 1 : 0)
