// Waveform bars for the voice players (VoicePlayer, AudioDock), decoded from the recording itself (cached per
// URL). If the file can't be fetched or decoded here, a steady pseudo-wave
// seeded from the URL stands in, so a player always has a waveform to scrub.
export const BARS = 56
const peaksCache = new Map<string, Promise<number[]>>()
export function fallbackPeaks(src: string, n: number = BARS): number[] {
  let h = 2166136261
  for (let i = 0; i < src.length; i++) h = Math.imul(h ^ src.charCodeAt(i), 16777619)
  return Array.from({ length: n }, (_, i) => {
    h = Math.imul(h ^ (h >>> 13), 1274126177)
    const r = ((h >>> 0) % 1000) / 1000
    return 0.25 + 0.55 * Math.abs(Math.sin(i * 0.45)) * (0.55 + 0.45 * r)
  })
}
export function loadPeaks(src: string, n: number = BARS): Promise<number[]> {
  if (!src) return Promise.resolve(fallbackPeaks('x', n))
  const key = `${n}|${src}`
  const hit = peaksCache.get(key); if (hit) return hit
  const job = (async () => {
    const AC = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!AC) throw new Error('no audio context')
    const buf = await (await fetch(src)).arrayBuffer()
    const ctx = new AC()
    try {
      const audio: AudioBuffer = await new Promise((res, rej) => { const p = ctx.decodeAudioData(buf, res, rej); if (p?.then) p.then(res, rej) })
      const data = audio.getChannelData(0)
      const step = Math.max(1, Math.floor(data.length / n))
      const out: number[] = []
      for (let b = 0; b < n; b++) {
        let sum = 0, cnt = 0
        for (let i = b * step; i < Math.min(data.length, (b + 1) * step); i += 16) { sum += data[i] * data[i]; cnt++ }
        out.push(Math.sqrt(sum / Math.max(1, cnt)))
      }
      const max = Math.max(...out, 1e-4)
      return out.map(v => 0.14 + 0.86 * Math.min(1, v / max))
    } finally { try { ctx.close() } catch {} }
  })().catch(() => fallbackPeaks(src, n))
  peaksCache.set(key, job)
  return job
}
