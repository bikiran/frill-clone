'use client'

// Colvy Powers in the top bar: a small pill with your level ring and coins.
// It only appears when the business has Colvy Powers on and you take part.
// Earning makes a coin float up and the number tick over; a level-up glows
// once. Click for your level, streak and today's coins. It also carries the
// light, dismissable moments teammates send (a nudge, team confetti, a
// spotlight), all off to the side so they never cover work, and quiet while
// your Focus Shield is up. Reduced motion: no movement, same information.

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePowers, usePowersHeartbeat, powersApi, refreshPowers, type PowersEvent } from '@/lib/powers/client'
import { Coin, LevelRing, PowerIcon } from '@/components/powers/PowerIcon'

type Toast = { id: string; icon: React.ReactNode; title: string; body?: string; tone?: string; action?: { label: string; href: string }; dismissId?: string; ttl?: number }

const seenKey = 'colvy:powers-seen'
const readSeen = (): Set<string> => { try { return new Set(JSON.parse(sessionStorage.getItem(seenKey) || '[]')) } catch { return new Set() } }
const writeSeen = (s: Set<string>) => { try { sessionStorage.setItem(seenKey, JSON.stringify(Array.from(s).slice(-200))) } catch {} }

export default function PowersChip({ companyId }: { companyId: string | null }) {
  const p = usePowers(companyId)
  usePowersHeartbeat(companyId, !!(p?.enabled && p.eligible))
  const [open, setOpen] = useState(false)
  const [shown, setShown] = useState<number | null>(null)       // the coin count on screen (ticks toward the real one)
  const [floats, setFloats] = useState<{ id: number; text: string; neg?: boolean }[]>([])
  const [glow, setGlow] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [burst, setBurst] = useState<number>(0)
  const [mounted, setMounted] = useState(false)
  const wrap = useRef<HTMLDivElement>(null)
  const still = useRef(false)

  useEffect(() => { setMounted(true); still.current = !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches }, [])

  const coins = p?.wallet?.coins ?? 0
  // Tick the number toward the balance.
  useEffect(() => {
    if (!p?.wallet) return
    if (shown === null || still.current) { setShown(coins); return }
    if (shown === coins) return
    const from = shown, to = coins, t0 = performance.now()
    let raf = 0
    const step = (t: number) => {
      const k = Math.min(1, (t - t0) / 650)
      setShown(Math.round(from + (to - from) * (1 - Math.pow(1 - k, 3))))
      if (k < 1) raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coins, !!p?.wallet])

  const toast = (t: Toast) => {
    setToasts(list => [...list.filter(x => x.id !== t.id), t].slice(-3))
    if (t.ttl !== 0) window.setTimeout(() => setToasts(list => list.filter(x => x.id !== t.id)), t.ttl || 4200)
  }

  // Rewards, reversals and badges, from anywhere in the app.
  useEffect(() => {
    const on = (ev: Event) => {
      const e = (ev as CustomEvent<PowersEvent>).detail
      if (!e) return
      if (e.kind === 'earned') {
        const id = Date.now() + Math.random()
        setFloats(f => [...f, { id, text: `+${e.coins}` }])
        window.setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1300)
        if (e.leveledUp) {
          setGlow(true); window.setTimeout(() => setGlow(false), 1600)
          toast({ id: `lv${e.level}`, icon: <span className="pwt-emo">🎉</span>, title: `Level ${e.level} · ${e.title}`, body: 'Nice work. New looks unlock as you go.' })
        }
        void refreshPowers(true)
      } else if (e.kind === 'reversed') {
        const id = Date.now() + Math.random()
        setFloats(f => [...f, { id, text: `${e.coins}`, neg: true }])
        window.setTimeout(() => setFloats(f => f.filter(x => x.id !== id)), 1300)
        void refreshPowers(true)
      } else if (e.kind === 'badge') {
        toast({ id: `b${e.name}`, icon: <span className="pwt-emo">{e.icon}</span>, title: `New badge: ${e.name}`, action: { label: 'See badges', href: '/admin/powers?tab=badges' } })
      }
    }
    window.addEventListener('colvy:powers', on)
    return () => window.removeEventListener('colvy:powers', on)
  }, [])

  // What teammates sent: nudges, confetti, spotlights. Each shows once.
  const live = p?.live
  useEffect(() => {
    if (!live || !p?.enabled) return
    const seen = readSeen()
    const focus = live.focusUntil && Date.parse(live.focusUntil) > Date.now()
    for (const n of live.nudges || []) {
      if (seen.has(n.id)) continue
      seen.add(n.id)
      if (focus) continue
      toast({ id: n.id, icon: <span className="pwt-ic" style={{ background: '#7c5cff' }}><PowerIcon name="nudge" size={16} /></span>, title: `${n.from} nudged you`, body: n.note || undefined, dismissId: n.id, ttl: 0 })
    }
    for (const c of live.confetti || []) {
      if (seen.has(c.id)) continue
      seen.add(c.id)
      if (focus) continue
      if (!still.current) setBurst(Date.now())
      toast({ id: c.id, icon: <span className="pwt-emo">🎉</span>, title: `${c.from} threw confetti`, body: c.note || undefined })
    }
    const s = live.spotlight
    if (s && !seen.has(s.id)) {
      seen.add(s.id)
      if (!focus) toast({ id: s.id, icon: <span className="pwt-ic" style={{ background: '#f97316' }}><PowerIcon name="spot" size={16} /></span>, title: `Spotlight on ${s.name}`, body: s.note ? `“${s.note}” · from ${s.from}` : `from ${s.from}`, ttl: 7000 })
    }
    writeSeen(seen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live])

  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', off); document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', off); document.removeEventListener('keydown', esc) }
  }, [open])

  if (!p?.enabled || !p.eligible || !p.wallet) return null
  const w = p.wallet
  const toNext = Math.max(0, w.to - w.xp)
  const focusOn = !!(live?.focusUntil && Date.parse(live.focusUntil) > Date.now())
  const dismiss = (t: Toast) => {
    setToasts(list => list.filter(x => x.id !== t.id))
    if (t.dismissId) void powersApi('/api/powers/dismiss', { companyId, id: t.dismissId })
  }

  return (
    <div ref={wrap} className="pw-wrap">
      <style>{CSS}</style>
      <button type="button" className={`pw-chip${glow ? ' glow' : ''}`} onClick={() => setOpen(o => !o)} aria-haspopup="dialog" aria-expanded={open}
        aria-label={`Colvy Powers: level ${w.level}, ${coins} coins`} title="Colvy Powers">
        <LevelRing level={w.level} progress={w.progress} size={24} stroke={2.6} />
        <Coin size={15} />
        <span className="pw-num">{(shown ?? coins).toLocaleString()}</span>
        {focusOn && <span className="pw-shield" title="Focus Shield is on"><PowerIcon name="shield" size={13} stroke={2.2} /></span>}
        {floats.map(f => <span key={f.id} className={`pw-float${f.neg ? ' neg' : ''}`} aria-hidden>{!f.neg && <Coin size={13} />}{f.text}</span>)}
      </button>

      {open && (
        <div className="pw-pop" role="dialog" aria-label="Colvy Powers">
          <div className="pw-pop-top">
            <LevelRing level={w.level} progress={w.progress} size={54} stroke={4} />
            <div style={{ minWidth: 0 }}>
              <b className="pw-title">{w.title}</b>
              <span className="pw-sub">Level {w.level}{w.level < 50 ? ` · ${toNext.toLocaleString()} XP to level ${w.level + 1}` : ' · top level'}</span>
              <span className="pw-bar"><i style={{ width: `${Math.round(w.progress * 100)}%` }} /></span>
            </div>
          </div>
          <div className="pw-stats">
            <div><Coin size={16} /><b>{coins.toLocaleString()}</b><span>coins</span></div>
            <div><span className="pw-emo">🔥</span><b>{w.streak}</b><span>{w.streak === 1 ? 'day streak' : 'day streak'}</span></div>
            <div><span className="pw-plus">+</span><b>{p.today?.coins ?? 0}</b><span>today</span></div>
          </div>
          <div className="pw-acts">
            <Link href="/admin/powers?tab=shop" onClick={() => setOpen(false)} className="pw-act"><PowerIcon name="bolt" size={17} />Power Shop</Link>
            <Link href="/admin/powers?tab=thanks" onClick={() => setOpen(false)} className="pw-act"><PowerIcon name="thanks" size={17} />Say thanks</Link>
            {p.leaderboard !== 'off' && <Link href="/admin/powers?tab=leaderboard" onClick={() => setOpen(false)} className="pw-act"><PowerIcon name="trophy" size={17} />Leaderboard</Link>}
          </div>
          <Link href="/admin/powers" onClick={() => setOpen(false)} className="pw-more">Open Colvy Powers</Link>
        </div>
      )}

      {mounted && createPortal(
        <>
          {burst > 0 && <Confetti key={burst} />}
          <div className="pwt-stack" aria-live="polite">
            {toasts.map(t => (
              <div key={t.id} className="pwt">
                {t.icon}
                <div className="pwt-t"><b>{t.title}</b>{t.body && <span>{t.body}</span>}</div>
                {t.action && <Link href={t.action.href} className="pwt-a" onClick={() => dismiss(t)}>{t.action.label}</Link>}
                <button type="button" className="pwt-x" aria-label="Dismiss" onClick={() => dismiss(t)}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
                </button>
              </div>
            ))}
          </div>
        </>,
        document.body,
      )}
    </div>
  )
}

// A short burst from the top edge: ~2 seconds, never in the way (no clicks).
const CONFETTI_COLORS = ['#ff6a4d', '#f5b400', '#7c5cff', '#22c55e', '#38bdf8', '#ec4899']
function Confetti() {
  const [on, setOn] = useState(true)
  useEffect(() => { const t = window.setTimeout(() => setOn(false), 2600); return () => window.clearTimeout(t) }, [])
  if (!on) return null
  return (
    <div className="pwc" aria-hidden>
      {Array.from({ length: 46 }, (_, i) => (
        <i key={i} style={{
          left: `${(i * 37) % 100}%`, background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          animationDelay: `${(i % 9) * 0.06}s`, animationDuration: `${1.6 + (i % 5) * 0.18}s`,
          ['--dx' as any]: `${((i * 53) % 120) - 60}px`, ['--r' as any]: `${(i * 97) % 720 - 360}deg`,
          width: i % 3 ? 7 : 5, height: i % 3 ? 11 : 5, borderRadius: i % 3 ? 2 : 999,
        } as React.CSSProperties} />
      ))}
    </div>
  )
}

const CSS = `
.pw-wrap{position:relative;display:inline-flex}
.pw-chip{position:relative;display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 12px 0 6px;border:none;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.08);color:var(--ink);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer;transition:box-shadow .2s,transform .12s}
.pw-chip::before{display:none!important}
.pw-chip:hover{box-shadow:0 0 0 1px rgba(0,0,0,.14),0 4px 14px -6px rgba(15,17,25,.25)}
.pw-chip:active{transform:scale(.97)}
.pw-chip.glow{animation:pwGlow 1.5s ease-out}
@keyframes pwGlow{0%{box-shadow:0 0 0 1px rgba(0,0,0,.08),0 0 0 0 rgba(255,106,77,.55)}40%{box-shadow:0 0 0 1px rgba(255,106,77,.5),0 0 0 9px rgba(255,106,77,0)}100%{box-shadow:0 0 0 1px rgba(0,0,0,.08)}}
.pw-num{font-variant-numeric:tabular-nums;letter-spacing:-.01em}
.pw-chip .pw-shield{display:inline-flex;color:#0ea5e9;margin-left:-1px}
.pw-ring{position:relative;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;color:var(--ink)}
.pw-ring svg{position:absolute;inset:0}
.pw-ring b{position:relative;font-weight:800;line-height:1;font-variant-numeric:tabular-nums}
.pw-float{position:absolute;left:50%;top:calc(100% + 4px);display:inline-flex;align-items:center;gap:3px;padding:2px 7px 2px 3px;border-radius:999px;background:var(--card,#fff);box-shadow:0 4px 14px -4px rgba(15,17,25,.3);font-size:12px;font-weight:800;color:#b07800;pointer-events:none;white-space:nowrap;animation:pwUp 1.25s cubic-bezier(.2,.8,.3,1) forwards}
.pw-float.neg{color:#8e8e93;padding:2px 8px}
@keyframes pwUp{0%{opacity:0;transform:translate(-50%,14px) scale(.6)}20%{opacity:1;transform:translate(-50%,0) scale(1.08)}35%{transform:translate(-50%,0) scale(1)}75%{opacity:1;transform:translate(-50%,-10px)}100%{opacity:0;transform:translate(-50%,-22px) scale(.9)}}
.pw-pop{position:absolute;top:calc(100% + 8px);right:0;z-index:60;width:304px;padding:16px;border-radius:22px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 22px 50px -18px rgba(15,17,25,.35);color:var(--ink);animation:pwPop .22s cubic-bezier(.22,1,.36,1)}
@keyframes pwPop{from{opacity:0;transform:translateY(-6px) scale(.98)}to{opacity:1;transform:none}}
.pw-pop-top{display:flex;align-items:center;gap:13px}
.pw-title{display:block;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:19px;font-weight:700;letter-spacing:-.03em}
.pw-sub{display:block;margin-top:1px;font-size:12.5px;color:#8e8e93}
.pw-bar{display:block;height:5px;margin-top:8px;border-radius:999px;background:rgba(127,127,140,.16);overflow:hidden}
.pw-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ff6a4d,#ff9a5c);transition:width .8s cubic-bezier(.22,1,.36,1)}
.pw-stats{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin:14px 0 10px}
.pw-stats>div{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 4px;border-radius:14px;background:rgba(127,127,140,.08)}
.pw-stats b{font-size:16px;font-weight:800;font-variant-numeric:tabular-nums}
.pw-stats span{font-size:11.5px;color:#8e8e93}
.pw-stats .pw-emo{font-size:15px;line-height:16px;color:inherit}
.pw-stats .pw-plus{font-size:15px;line-height:16px;font-weight:800;color:#16a34a}
.pw-acts{display:flex;flex-direction:column;gap:2px}
.pw-act{display:flex;align-items:center;gap:10px;height:40px;padding:0 10px;border-radius:12px;font-size:14px;font-weight:600;color:var(--ink);text-decoration:none}
.pw-act:hover{background:rgba(127,127,140,.1)}
.pw-act svg{color:var(--coral)}
.pw-more{display:flex;align-items:center;justify-content:center;height:38px;margin-top:8px;border-radius:999px;background:var(--ink);color:var(--card,#fff);font-size:13.5px;font-weight:650;text-decoration:none}
.pw-more:hover{filter:brightness(1.15)}
.pwt-stack{position:fixed;right:18px;bottom:18px;z-index:9000;display:flex;flex-direction:column;gap:8px;width:min(340px,calc(100vw - 32px));pointer-events:none}
.pwt{display:flex;align-items:center;gap:11px;padding:11px 10px 11px 12px;border-radius:18px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 18px 40px -16px rgba(15,17,25,.4);color:var(--ink);pointer-events:auto;animation:pwtIn .38s cubic-bezier(.2,1.2,.4,1)}
@keyframes pwtIn{from{opacity:0;transform:translateY(12px) scale(.96)}to{opacity:1;transform:none}}
.pwt-emo{width:34px;height:34px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;background:rgba(127,127,140,.1);font-size:18px}
.pwt-ic{width:34px;height:34px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;color:#fff}
.pwt-t{flex:1;min-width:0}
.pwt-t b{display:block;font-size:13.5px;font-weight:700}
.pwt-t span{display:block;margin-top:1px;font-size:12.5px;line-height:1.4;color:#8e8e93;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.pwt-a{flex-shrink:0;height:30px;padding:0 11px;display:inline-flex;align-items:center;border-radius:999px;background:rgba(127,127,140,.12);font-size:12.5px;font-weight:650;color:var(--ink);text-decoration:none}
.pwt-x{width:28px;height:28px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:none;color:#8e8e93;cursor:pointer}
.pwt-x::before{display:none!important}
.pwt-x:hover{background:rgba(127,127,140,.12);color:var(--ink)}
.pwc{position:fixed;inset:0 0 auto 0;height:100vh;z-index:8999;pointer-events:none;overflow:hidden}
.pwc i{position:absolute;top:-16px;opacity:0;animation-name:pwFall;animation-timing-function:cubic-bezier(.25,.6,.4,1);animation-fill-mode:forwards}
@keyframes pwFall{0%{opacity:1;transform:translate(0,0) rotate(0)}85%{opacity:1}100%{opacity:0;transform:translate(var(--dx),70vh) rotate(var(--r))}}
@media (max-width:640px){
  .pw-chip{height:34px;padding:0 10px 0 5px;gap:5px}
  .pw-pop{position:fixed;top:64px;left:8px;right:8px;width:auto}
  .pwt-stack{left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom));width:auto}
}
@media (prefers-reduced-motion:reduce){.pw-chip.glow,.pw-pop,.pwt,.pw-float{animation:none}.pw-float{display:none}.pwc{display:none}}
`
