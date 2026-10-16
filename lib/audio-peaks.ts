// Waveform bars for the voice players (VoicePlayer, AudioDock), decoded from the recording itself (cached per
// URL). If the file can't be fetched or decoded here, a steady pseudo-wave
// seeded from the URL stands in, so a player always has a waveform to scrub.
//
// Memory: decoding is the expensive part. A live AudioContext decodes at the
// sound card's rate (48 kHz float), so one 10-minute call became ~115 MB of PCM,
// and every player on screen decoded at once — a thread or Calls timeline with a
// few recordings pushed the tab past 1 GB. So: decode at a low rate in an
// OfflineAudioContext (no audio device, a few MB per call), one file at a time,
// skip very large files, and keep only the small bar arrays (bounded LRU).
export const BARS = 56
// Plenty for ≤192 bars; the lowest rate every browser accepts is 3000 Hz.
const DECODE_RATE = 3000
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
export function loadPeaks(src: string, n: number = BARS): Promise<number[]> {
  if (!src) return Promise.resolve(fallbackPeaks('x', n))
  const key = `${n}|${src}`
  const hit = peaksCache.get(key)
  if (hit) { cacheSet(key, hit); return hit }
  const job = serial(async () => {
    const res = await fetch(src)
    const len = Number(res.headers.get('content-length') || 0)
    if (!res.ok || len > MAX_BYTES) { try { await res.body?.cancel() } catch {} ; throw new Error('skip') }
    let buf: ArrayBuffer | null = await res.arrayBuffer()
    if (buf.byteLength > MAX_BYTES) throw new Error('skip')
    let audio: AudioBuffer | null = await decodeLowRate(buf)
    buf = null
    const data = audio.getChannelData(0)
    audio = null
    const step = Math.max(1, Math.floor(data.length / n))
    const out: number[] = []
    for (let b = 0; b < n; b++) {
      let sum = 0, cnt = 0
      for (let i = b * step; i < Math.min(data.length, (b + 1) * step); i += 4) { sum += data[i] * data[i]; cnt++ }
      out.push(Math.sqrt(sum / Math.max(1, cnt)))
    }
    const max = Math.max(...out, 1e-4)
    return out.map(v => 0.14 + 0.86 * Math.min(1, v / max))
  }).catch(() => fallbackPeaks(src, n))
  cacheSet(key, job)
  return job
}
