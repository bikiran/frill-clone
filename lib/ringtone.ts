// The incoming-call ringtone, browser only. Plays the branded ringtone file
// (the same one the mobile app rings with, so a call sounds the same on web
// and phone) and falls back to a soft WebAudio tone only when the file can't
// play (autoplay blocked, decode error).
//
// `quietWhenHidden` (phones and tablets): the tab says nothing while it's in
// the background (the Colvy app rings there), rings if it's brought to the
// front while the call is still ringing, and goes quiet again if it's hidden.
// Desktop browsers keep ringing in a background tab, so a reception computer
// still hears calls.
//
// Every ring belongs to a generation: stop() moves to the next one and
// silences every sound it has ever started. Anything still in flight from an
// older ring (a late play() failure, a held-back file starting, a beep timer)
// sees it's stale and stops itself. Before this, stopping a ring while the
// file was still loading made play() fail with "interrupted", which started
// the fallback tone AFTER the call was answered: a "tung… tung…" every 3s that
// nothing ever stopped.

export type Ringer = { start: () => void; stop: () => void }

/** A ring never outlives a realistic ring window, whatever else fails. */
export const RING_CAP_MS = 60000

export function createRinger(src = '/ringtone.mp3', opts: { quietWhenHidden?: boolean } = {}): Ringer {
  let gen = 0
  const live = new Set<() => void>()     // everything a ring set up; stop() undoes it all
  const sounds = new Set<() => void>()   // the part of that making a noise
  let cap: ReturnType<typeof setTimeout> | null = null

  // Registers an undo; calling the returned function runs it once and forgets it.
  const keep = (undo: () => void, isSound: boolean) => {
    const off = () => { live.delete(off); sounds.delete(off); undo() }
    live.add(off)
    if (isSound) sounds.add(off)
    return off
  }
  const hidden = () => typeof document !== 'undefined' && document.visibilityState === 'hidden'
  const silent = (g: number) => g !== gen || (!!opts.quietWhenHidden && hidden())

  const tone = (g: number) => {
    if (silent(g)) return
    try {
      const AC = (window as any).AudioContext || (window as any).webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      let timer: ReturnType<typeof setInterval> | null = null
      const off = keep(() => { if (timer) clearInterval(timer); try { ctx.close?.() } catch {} }, true)
      const beep = () => {
        if (g !== gen || !sounds.has(off)) { off(); return }
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
    } catch {}
  }

  const sound = (g: number) => {
    if (silent(g)) return
    try {
      const a = new Audio(src)
      a.loop = true
      a.volume = 0.6
      const off = keep(() => { try { a.pause(); a.removeAttribute('src'); a.load() } catch {} }, true)
      // Held-back media that starts after the ring is over (or was silenced) stays silent.
      a.addEventListener('playing', () => { if (g !== gen || !sounds.has(off)) off() })
      // Only fall back while this ring is still wanted. An AbortError is our
      // own stop interrupting play(), not a failure.
      a.play().catch((err: any) => {
        if (g !== gen || !sounds.has(off) || err?.name === 'AbortError') return
        off(); tone(g)
      })
    } catch { tone(g) }
  }

  const stop = () => {
    gen++
    if (cap) { clearTimeout(cap); cap = null }
    for (const off of [...live]) off()
  }

  const start = () => {
    // Never two rings at once: a second offer of a call (another registration,
    // a promoted waiting call) replaces the first instead of orphaning it.
    stop()
    const g = gen
    cap = setTimeout(() => { if (g === gen) stop() }, RING_CAP_MS)
    if (opts.quietWhenHidden && typeof document !== 'undefined') {
      const onVisibility = () => {
        if (g !== gen) return
        if (hidden()) for (const off of [...sounds]) off()
        else if (!sounds.size) sound(g)
      }
      document.addEventListener('visibilitychange', onVisibility)
      keep(() => document.removeEventListener('visibilitychange', onVisibility), false)
    }
    sound(g)
  }

  return { start, stop }
}
