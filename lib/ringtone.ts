// The incoming-call ringtone, browser only. Prefers the branded ringtone file
// (the same one the mobile app rings with, so a call sounds the same on web
// and phone) and falls back to a soft WebAudio tone when the file can't play
// (autoplay blocked, decode error) or hasn't started after a moment (Chrome
// holds media back in a background tab), so a call is never silent before
// it's answered.
//
// Every ring belongs to a generation: stop() moves to the next one and
// silences every sound it has ever started. Anything still in flight from an
// older ring (a late play() failure, a held-back file starting, a beep timer)
// sees it's stale and stops itself. Before this, stopping a ring while the
// file was still loading made play() fail with "interrupted", which started
// the fallback tone AFTER the call was answered: a "tung… tung…" every 3s that
// nothing ever stopped.

export type Ringer = { start: () => void; stop: () => void }

/** How long the file gets to start before the tone stands in for it. */
export const RING_FILE_GRACE_MS = 2500
/** A ring never outlives a realistic ring window, whatever else fails. */
export const RING_CAP_MS = 60000

export function createRinger(src = '/ringtone.mp3'): Ringer {
  let gen = 0
  const live = new Set<() => void>()
  let cap: ReturnType<typeof setTimeout> | null = null

  const tone = (g: number): (() => void) | undefined => {
    if (g !== gen) return
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      let timer: ReturnType<typeof setInterval> | null = null
      const stopTone = () => { live.delete(stopTone); if (timer) clearInterval(timer); try { ctx.close?.() } catch {} }
      live.add(stopTone)
      const beep = () => {
        if (g !== gen) { stopTone(); return }
        const o = ctx.createOscillator(); const v = ctx.createGain()
        o.frequency.value = 440; o.type = 'sine'
        v.gain.setValueAtTime(0.0001, ctx.currentTime)
        v.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.05)
        v.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.9)
        o.connect(v); v.connect(ctx.destination)
        o.start(); o.stop(ctx.currentTime + 1)
      }
      beep()
      timer = setInterval(beep, 3000)
      return stopTone
    } catch { return undefined }
  }

  const stop = () => {
    gen++
    if (cap) { clearTimeout(cap); cap = null }
    for (const s of [...live]) s()
  }

  const start = () => {
    // Never two rings at once: a second offer of a call (another registration,
    // a promoted waiting call) replaces the first instead of orphaning it.
    stop()
    const g = gen
    cap = setTimeout(() => { if (g === gen) stop() }, RING_CAP_MS)
    try {
      const a = new Audio(src)
      a.loop = true
      a.volume = 0.6
      let toneStop: (() => void) | undefined
      const fallBack = () => { if (!toneStop) toneStop = tone(g) }
      const slow = setTimeout(fallBack, RING_FILE_GRACE_MS)
      const stopFile = () => { live.delete(stopFile); clearTimeout(slow); try { a.pause(); a.removeAttribute('src'); a.load() } catch {} }
      live.add(stopFile)
      a.addEventListener('playing', () => {
        // Held-back media that starts after the ring is over stays silent.
        if (g !== gen) { stopFile(); return }
        clearTimeout(slow)
        if (toneStop) { toneStop(); toneStop = undefined }   // the file takes over
      })
      // Only fall back while this ring is still wanted. An AbortError is our
      // own stop interrupting play(), not a failure.
      a.play().catch((err: any) => {
        if (g !== gen || err?.name === 'AbortError') return
        stopFile(); fallBack()
      })
    } catch { tone(g) }
  }

  return { start, stop }
}
