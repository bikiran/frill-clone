// Waveform bars for the voice players (VoicePlayer, AudioDock), decoded from the recording itself (cached per
// URL). If the file can't be fetched or decoded here, a steady pseudo-wave
// seeded from the URL stands in, so a player always has a waveform to scrub.
//
// Memory: decoding is the expensive part. A live AudioContext decodes at the
// sound card's rate (48 kHz float), so one 10-minute call became ~115 MB of PCM,
// and every player on screen decoded at once — a thread or Calls timeline with a
// few recordings pushed the tab past 1 GB. So: decode at a low rate in an
// OfflineAudioContext (no audio device, a few MB per call), one file at a time,
// skip very large files, drop queued work for players that have gone, and keep
// only the small bar arrays (bounded LRU).
export const BARS = 56
// Plenty for ≤192 bars at a fraction of the sound card's 48 kHz.
const DECODE_RATE = 8000
// Give up on a slow download rather than hold the queue.
const FETCH_TIMEOUT_MS = 20_000
// Bigger than this (a very long WAV) isn't worth downloading for a picture.
const MAX_BYTES = 25 * 1024 * 1024
const CACHE_MAX = 300
const peaksCache = new Map<string, Promise<number[]>>()
function cacheSet(key: string, job: Promise<number[]>) {
  peaksCache.delete(key)
  peaksCache.set(key, job)
  while (peaksCache.size > CACHE_MAX) {
    const oldest = peaksCache.keys().next().value
    if (oldest === undefined) break
    peaksCache.delete(oldest)
  }
}
// One download + decode at a time, so a screen full of players never holds
// several decoded recordings in memory at once.
let queue: Promise<unknown> = Promise.resolve()
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const run = queue.then(fn, fn)
  queue = run.catch(() => {})
  return run
}
export function fallbackPeaks(src: string, n: number = BARS): number[] {
  let h = 2166136261
  for (let i = 0; i < src.length; i++) h = Math.imul(h ^ src.charCodeAt(i), 16777619)
  return Array.from({ length: n }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    const r = ((h >>> 0) % 1000) / 1000
    return 0.25 + 0.55 * Math.abs(Math.sin(i * 0.45)) * (0.55 + 0.45 * r)
  })
}
async function decodeLowRate(buf: ArrayBuffer): Promise<AudioBuffer> {
  const w = window as any
  const OAC = w.OfflineAudioContext || w.webkitOfflineAudioContext
  if (OAC) {
    let ctx: any = null
    try { ctx = new OAC(1, 1, DECODE_RATE) } catch { ctx = null }
    if (ctx) return await new Promise<AudioBuffer>((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); if (p?.then) p.then(res, rej) })
  }
  // Very old browsers: a live context (closed straight after).
  const AC = w.AudioContext || w.webkitAudioContext
  if (!AC) throw new Error('no audio context')
  const ctx = new AC()
  try {
    return await new Promise<AudioBuffer>((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); if (p?.then) p.then(res, rej) })
  } finally { try { ctx.close() } catch {} }
}
// Queued/running work per key, so players that unmount can cancel it.
const pending = new Map<string, { users: number; ctrl: AbortController }>()

/**
 * Waveform bars for `src`. Pass the player's AbortSignal: when every player
 * waiting on a file has gone, its queued (or running) download is cancelled
 * and nothing is cached, so it's simply retried next time. Callers without a
 * signal keep the work alive.
 */
export function loadPeaks(src: string, n: number = BARS, signal?: AbortSignal): Promise<number[]> {
  if (!src) return Promise.resolve(fallbackPeaks('x', n))
  const key = `${n}|${src}`
  const hit = peaksCache.get(key)
  const watch = (jp: Promise<number[]>) => {
    const p = pending.get(key)
    if (!p) return
    if (!signal) { p.users = Infinity; return }
    p.users++
    signal.addEventListener('abort', () => {
      const q = pending.get(key)
      if (q !== p) return
      q.users--
      if (q.users <= 0) { pending.delete(key); q.ctrl.abort(); if (peaksCache.get(key) === jp) peaksCache.delete(key) }
    }, { once: true })
  }
  if (hit) { cacheSet(key, hit); if (!signal?.aborted) watch(hit); return hit }
  if (signal?.aborted) return Promise.resolve(fallbackPeaks(src, n))
  const ctrl = new AbortController()
  pending.set(key, { users: 0, ctrl })
  const job: Promise<number[]> = serial(async () => {
    if (ctrl.signal.aborted) throw new Error('gone')   // every player left while queued
    const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS)
    let buf: ArrayBuffer | null
    try {
      const res = await fetch(src, { signal: ctrl.signal })
      const len = Number(res.headers.get('content-length') || 0)
      if (!res.ok || len > MAX_BYTES) { try { await res.body?.cancel() } catch {} ; throw new Error('skip') }
      buf = await res.arrayBuffer()
    } finally { clearTimeout(timer) }
    if (!buf || buf.byteLength > MAX_BYTES || ctrl.signal.aborted) throw new Error('skip')
    let audio: AudioBuffer | null = await decodeLowRate(buf)
    buf = null
    const data = audio.getChannelData(0)
    audio = null
    const step = Math.max(1, Math.floor(data.length / n))
    const out: number[] = []
    for (let b = 0; b < n; b++) {
      let sum = 0, cnt = 0
      for (let i = b * step; i < Math.min(data.length, (b + 1) * step); i += 8) { sum += data[i] * data[i]; cnt++ }
      out.push(Math.sqrt(sum / Math.max(1, cnt)))
    }
    const max = Math.max(...out, 1e-4)
    return out.map(v => 0.14 + 0.86 * Math.min(1, v / max))
  }).catch(() => {
    // Cancelled (no player left): don't remember a stand-in for next time.
    if (ctrl.signal.aborted && peaksCache.get(key) === job) peaksCache.delete(key)
    return fallbackPeaks(src, n)
  }).finally(() => { if (pending.get(key)?.ctrl === ctrl) pending.delete(key) })
  cacheSet(key, job)
  watch(job)
  return job
}
