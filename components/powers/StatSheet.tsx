'use client'

// The Powers Overview's level card and its three tiles (Coins, Streak, Today),
// each opening a short animated pop-up that says what the number means, as in
// the mobile app (colvy-mobile components/StatHow): coins drop into the wallet
// and the balance counts up; the week's flames light up day by day; today's
// ring fills toward the daily limit; a marker drops onto the ladder of titles.
// A centred card on desktop, a sheet from the bottom on phones. With reduced
// motion everything is simply shown at its final value.

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { SkStyle, SkClose } from '@/components/ui/SheetKit'
import { Coin } from '@/components/powers/PowerIcon'
import { TITLES } from '@/lib/powers/config'
import type { PowersMe } from '@/lib/powers/client'

export type StatKind = 'level' | 'coins' | 'streak' | 'today'

const still = () => typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** A number that counts up to `to` after `delay` ms, easing out. */
function useCountUp(to: number, delay = 250, ms = 900) {
  const [n, setN] = useState(() => (still() ? to : 0))
  useEffect(() => {
    if (still() || to <= 0) { setN(to); return }
    setN(0)
    let raf = 0, t0 = 0
    const start = setTimeout(() => {
      const step = (ts: number) => {
        if (!t0) t0 = ts
        const k = Math.min(1, (ts - t0) / ms)
        setN(Math.round(to * (1 - Math.pow(1 - k, 3))))
        if (k < 1) raf = requestAnimationFrame(step)
      }
      raf = requestAnimationFrame(step)
    }, delay)
    return () => { clearTimeout(start); cancelAnimationFrame(raf) }
  }, [to, delay, ms])
  return n
}

export default function StatSheet({ kind, p, onClose, onShop }: { kind: StatKind; p: PowersMe; onClose: () => void; onShop: () => void }) {
  const w = p.wallet
  const [closing, setClosing] = useState(false)
  const [mounted, setMounted] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const titleId = `pst-${kind}`

  // Slides away first, then unmounts; `after` runs once it's gone (e.g. open the Power Shop).
  const close = (after?: () => void) => {
    if (closing) return
    const done = () => { onClose(); after?.() }
    if (still()) { done(); return }
    setClosing(true)
    setTimeout(done, 190)
  }
  const closeRef = useRef(close)
  closeRef.current = close

  useEffect(() => { setMounted(true) }, [])
  // Esc closes; focus moves into the pop-up and back to the tile afterwards.
  useEffect(() => {
    const back = document.activeElement as HTMLElement | null
    const t = setTimeout(() => card.current?.querySelector<HTMLElement>('.sk-x')?.focus(), 30)
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current() }
    document.addEventListener('keydown', esc)
    return () => { clearTimeout(t); document.removeEventListener('keydown', esc); back?.focus?.() }
  }, [])

  if (!w || !mounted) return null
  const today = p.today || { coins: 0, xp: 0, capCoins: 0, capXp: 0 }
  const title = kind === 'level' ? `Level ${w.level} · ${w.title}` : kind === 'coins' ? 'Your coins' : kind === 'streak' ? 'Your streak' : 'Today'
  const sub = kind === 'level' ? `${w.xp.toLocaleString()} XP`
    : kind === 'coins' ? `${w.earned.toLocaleString()} earned in total`
    : kind === 'streak' ? `Best ${w.bestStreak} ${w.bestStreak === 1 ? 'day' : 'days'}`
    : `Daily limit ${today.capCoins} coins`
  const action = kind === 'coins' ? { label: 'Open the Power Shop', icon: ICON.bolt }
    : kind === 'streak' && !w.savers ? { label: 'Get a Streak Saver', icon: ICON.flame }
    : null

  return createPortal(
    <div className={`sk-scrim pst-scrim${closing ? ' out' : ''}`} onMouseDown={e => { if (e.target === e.currentTarget) close() }}>
      <SkStyle />
      <style>{CSS}</style>
      <div ref={card} className={`sk pst${closing ? ' out' : ''}`} role="dialog" aria-modal="true" aria-labelledby={titleId} style={{ '--sk-w': '440px' } as CSSProperties}>
        <span className="pst-grab" aria-hidden />
        <div className="sk-head">
          <div style={{ minWidth: 0, flex: 1 }}>
            <h2 id={titleId}>{title}</h2>
            <p className="sk-sub">{sub}</p>
          </div>
          <SkClose onClick={() => close()} />
        </div>

        {kind === 'coins' ? <CoinsScene coins={w.coins} earned={w.earned} />
          : kind === 'streak' ? <StreakScene streak={w.streak} best={w.bestStreak} savers={w.savers} />
          : kind === 'today' ? <TodayScene today={today} />
          : <LevelScene level={w.level} xp={w.xp} to={w.to} />}

        {action && (
          <div className="sk-actions">
            <button type="button" className="sk-btn primary pst-go" onClick={() => close(onShop)}>{action.icon}{action.label}</button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

function Facts({ items }: { items: [ReactNode, string][] }) {
  return (
    <ul className="pst-facts">
      {items.map(([icon, text]) => <li key={text}>{icon}<span>{text}</span></li>)}
    </ul>
  )
}

// ── Coins ─────────────────────────────────────────────────────────────────────
function CoinsScene({ coins, earned }: { coins: number; earned: number }) {
  const n = useCountUp(coins)
  return (
    <>
      <div className="pst-stage coins">
        {[-58, -18, 22, 60].map((x, i) => (
          <span key={i} className="pst-drop" style={{ '--x': `${x}px`, '--x2': `${Math.round(x * 0.15)}px`, '--r': `${(i % 2 ? 1 : -1) * 220}deg`, animationDelay: `${70 + i * 170}ms` } as CSSProperties}>
            <Coin size={26} />
          </span>
        ))}
        <div className="pst-wallet">
          <svg width="30" height="30" viewBox="0 0 24 24" aria-hidden className="pst-wallet-ic">
            <path fill="currentColor" d="M5.5 4.5h11a1.5 1.5 0 0 1 1.5 1.5v1.5H5.75a.75.75 0 0 0 0 1.5H19a1.5 1.5 0 0 1 1.5 1.5v8A1.5 1.5 0 0 1 19 20H5.5A2.5 2.5 0 0 1 3 17.5V7a2.5 2.5 0 0 1 2.5-2.5z" />
            <circle cx="16.5" cy="14.25" r="1.35" fill="#fff" />
          </svg>
          <span className="pst-num"><Coin size={20} /><b className="pst-big">{n.toLocaleString()}</b></span>
        </div>
      </div>
      <Facts items={[
        [ICON.sparkles, `You’ve earned ${earned.toLocaleString()} coins so far, for real work only.`],
        [ICON.bolt, 'Spend them on powers in the Power Shop: pins, nudges, crowns, gifts.'],
        [ICON.lock, 'No real money. Coins can’t be bought or cashed out, and XP isn’t spent.'],
      ]} />
    </>
  )
}

// ── Streak ────────────────────────────────────────────────────────────────────
function StreakScene({ streak, best, savers }: { streak: number; best: number; savers: number }) {
  const n = useCountUp(streak, 700, 500)
  // The last seven days, ending today; the streak lights up the newest ones.
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(Date.now() - (6 - i) * 86400_000)
    return { label: d.toLocaleDateString(undefined, { weekday: 'narrow' }), lit: 6 - i < streak, today: i === 6 }
  })
  return (
    <>
      <div className="pst-stage streak">
        <div className="pst-days">
          {days.map((d, i) => (
            <div key={i} className="pst-day">
              <span className={`pst-dot${d.lit ? ' lit' : ''}${d.today ? ' today' : ''}`}>
                {d.lit ? <span className={`pst-flame${d.today ? ' now' : ''}`} style={{ '--d': `${140 + i * 112}ms` } as CSSProperties}>🔥</span> : <i />}
              </span>
              <span className={`pst-dl${d.today ? ' today' : ''}`}>{d.today ? 'Today' : d.label}</span>
            </div>
          ))}
        </div>
        <div className="pst-row pst-pop" style={{ animationDelay: '900ms' }}>
          <b className="pst-big">{n}</b><span className="pst-unit">{streak === 1 ? 'day' : 'days'} in a row</span>
        </div>
      </div>
      <Facts items={[
        [ICON.flame, 'Earn anything on a day and the streak grows. Miss a day and it starts again.'],
        [ICON.trophy, `Your best so far is ${best} ${best === 1 ? 'day' : 'days'}. A week and a month earn badges.`],
        [ICON.shield, savers ? `You hold ${savers} Streak Saver${savers > 1 ? 's' : ''}: one missed day is covered automatically.` : 'A Streak Saver from the Power Shop covers one missed day for you.'],
      ]} />
    </>
  )
}

// ── Today ─────────────────────────────────────────────────────────────────────
function TodayScene({ today }: { today: { coins: number; xp: number; capCoins: number; capXp: number } }) {
  const n = useCountUp(today.coins)
  const pct = today.capCoins ? Math.min(1, today.coins / today.capCoins) : 0
  const xpPct = today.capXp ? Math.min(1, today.xp / today.capXp) : 0
  const size = 128, stroke = 12, r = (size - stroke) / 2, c = 2 * Math.PI * r
  const left = Math.max(0, today.capCoins - today.coins)
  return (
    <>
      <div className="pst-stage today">
        <div className="pst-ring" style={{ width: size, height: size }}>
          <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" strokeOpacity=".1" strokeWidth={stroke} />
            <circle className="pst-arc" cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#22c55e" strokeWidth={stroke} strokeLinecap="round"
              strokeDasharray={`${c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`}
              style={{ strokeDashoffset: c * (1 - pct), '--c': c } as CSSProperties} />
          </svg>
          <span className="pst-num"><Coin size={18} /><b className="pst-big">+{n.toLocaleString()}</b></span>
          <span className="pst-of">of {today.capCoins}</span>
        </div>
        <div className="pst-xp pst-pop" style={{ animationDelay: '700ms' }}>
          <span>XP today</span>
          <span className="pst-track"><i style={{ transform: `scaleX(${Math.max(0.001, xpPct)})` }} /></span>
          <span>{today.xp}/{today.capXp}</span>
        </div>
      </div>
      <Facts items={[
        [ICON.gauge, left > 0 ? `${left.toLocaleString()} more coins can be earned today.` : 'You’ve reached today’s limit. Nice work!'],
        [ICON.moon, 'The limit resets at midnight in your business’s time zone.'],
        [ICON.scale, 'Daily limits keep it fair for everyone. Each reward also has its own per-day limit.'],
      ]} />
    </>
  )
}

// ── Level ─────────────────────────────────────────────────────────────────────
function LevelScene({ level, xp, to }: { level: number; xp: number; to: number }) {
  // Where I sit on the ladder of titles (between two rungs), 0…1.
  const idx = Math.max(0, TITLES.findIndex((x, i) => level >= x.level && (i === TITLES.length - 1 || level < TITLES[i + 1].level)))
  const next = TITLES[idx + 1]
  const frac = next ? (level - TITLES[idx].level) / (next.level - TITLES[idx].level) : 0
  const pos = (idx + frac) / (TITLES.length - 1)
  const at = (f: number) => `calc(22px + (100% - 44px) * ${f.toFixed(4)})`
  return (
    <>
      <div className="pst-stage level">
        <div className="pst-ladder">
          <span className="pst-rail" />
          <span className="pst-fill" style={{ width: `calc((100% - 44px) * ${pos.toFixed(4)})` }} />
          {TITLES.map((ti, i) => (
            <span key={ti.title} className={`pst-rung${level >= ti.level ? ' on' : ''}`}
              style={{ left: `calc(${at(i / (TITLES.length - 1))} - 6px)`, animationDelay: `${140 + i * 98}ms` }} />
          ))}
          <span className="pst-marker" style={{ left: `calc(${at(pos)} - 22px)` }}>{level}</span>
        </div>
        <div className="pst-titles">
          {[TITLES[idx], next].filter(Boolean).map((ti, i) => (
            <div key={ti!.title} style={{ textAlign: i ? 'right' : 'left' }}>
              <b style={i ? undefined : { color: 'var(--coral)' }}>{ti!.title}</b>
              <small>Level {ti!.level}</small>
            </div>
          ))}
        </div>
      </div>
      <Facts items={[
        [ICON.trending, level < 50 ? `${Math.max(0, to - xp).toLocaleString()} XP to level ${level + 1}.${next ? ` ${next.title} at level ${next.level}.` : ''}` : 'Top level. Colvy Master!'],
        [ICON.sparkles, 'XP comes with every reward and is never spent. Double XP and Team Boost speed it up.'],
        [ICON.ribbon, 'Levels unlock looks and badges only, never permissions.'],
      ]} />
    </>
  )
}

const line = (d: string[], size = 17) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    {d.map((x, i) => <path key={i} d={x} />)}
  </svg>
)
const ICON = {
  sparkles: line(['M11 3.5l1.7 4.6 4.6 1.7-4.6 1.7L11 16.1l-1.7-4.6-4.6-1.7 4.6-1.7z', 'M18.5 14.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z']),
  bolt: line(['M13 2.5 4.5 13.5H12L11 21.5l8.5-11H12z']),
  lock: line(['M7 11h10a1 1 0 0 1 1 1v7a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-7a1 1 0 0 1 1-1z', 'M8.5 11V8a3.5 3.5 0 0 1 7 0v3']),
  flame: line(['M12 21a6.5 6.5 0 0 0 6.5-6.5c0-4-3-6-4-9.5-2 2-2.5 4-2.5 5.5-1-1-1.5-2-1.5-3.5-2.5 2-5 4.5-5 7.5A6.5 6.5 0 0 0 12 21z']),
  trophy: line(['M8 4h8v5a4 4 0 0 1-8 0z', 'M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4', 'M12 13v4', 'M8.5 20.5h7', 'M10 17h4v3.5h-4z']),
  shield: line(['M12 3l7.5 3v5.5c0 4.5-3.2 8.2-7.5 9.5-4.3-1.3-7.5-5-7.5-9.5V6z', 'm9 12 2 2 4-4']),
  gauge: line(['M3.5 16a8.5 8.5 0 1 1 17 0', 'm12 16 4-4.5', 'M12 16h.01']),
  moon: line(['M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z']),
  scale: line(['M12 4v16', 'M8 20h8', 'M5 7h14', 'M5 7l-2.5 6a2.5 2.5 0 0 0 5 0z', 'M19 7l-2.5 6a2.5 2.5 0 0 0 5 0z']),
  trending: line(['M3 17l6-6 4 4 8-8', 'M15 7h6v6']),
  ribbon: line(['M12 15a5 5 0 1 0 0-10 5 5 0 0 0 0 10z', 'M8.5 13.5 7 21l5-3 5 3-1.5-7.5']),
}

const CSS = `
.pst.sk{padding:22px 22px 20px;animation-duration:.34s;animation-timing-function:cubic-bezier(.2,1.15,.35,1)}
.pst .sk-head{margin-bottom:16px}
.pst .sk-head h2{font-size:24px}
.pst-scrim.out{animation:pstFadeOut .19s ease both}
.pst.out{animation:pstOut .19s ease-in both}
@keyframes pstFadeOut{to{opacity:0}}
@keyframes pstOut{to{opacity:0;transform:translateY(12px) scale(.97)}}
.pst-grab{display:none}
.pst-stage{position:relative;height:190px;border-radius:22px;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;background:var(--pst-bg);color:var(--ink)}
.pst-stage.coins{--pst-bg:#fff4d6}.pst-stage.streak{--pst-bg:#fff1e6}.pst-stage.today{--pst-bg:#e9f9ef}.pst-stage.level{--pst-bg:#fff4f1}
[data-theme="dark"] .pst-stage.coins{--pst-bg:color-mix(in srgb,#f2a900 14%,var(--card,#18181b))}
[data-theme="dark"] .pst-stage.streak{--pst-bg:color-mix(in srgb,#f97316 14%,var(--card,#18181b))}
[data-theme="dark"] .pst-stage.today{--pst-bg:color-mix(in srgb,#22c55e 13%,var(--card,#18181b))}
[data-theme="dark"] .pst-stage.level{--pst-bg:color-mix(in srgb,#ff6a4d 13%,var(--card,#18181b))}
.pst-big{font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:32px;font-weight:800;letter-spacing:-.04em;line-height:1;color:var(--ink);font-variant-numeric:tabular-nums}
.pst-num{display:inline-flex;align-items:center;gap:6px}
.pst-facts{list-style:none;margin:16px 0 0;padding:0;display:flex;flex-direction:column;gap:11px}
.pst-facts li{display:flex;align-items:flex-start;gap:11px;font-size:14px;line-height:1.45;color:var(--ink)}
.pst-facts svg{flex-shrink:0;margin-top:1px;color:var(--sk-muted)}
.pst-facts li{animation:pstRise .4s cubic-bezier(.22,1,.36,1) both}
.pst-facts li:nth-child(1){animation-delay:.12s}.pst-facts li:nth-child(2){animation-delay:.19s}.pst-facts li:nth-child(3){animation-delay:.26s}
@keyframes pstRise{from{opacity:0;transform:translateY(8px)}}
.pst-go svg{flex-shrink:0}
.pst-pop{animation:pstPop .45s cubic-bezier(.2,1.5,.4,1) both}
@keyframes pstPop{0%{opacity:0;transform:scale(.4)}60%{opacity:1;transform:scale(1.12)}100%{opacity:1;transform:none}}

/* Coins: four coins drop into the wallet, which bumps as each lands. */
.pst-drop{position:absolute;top:70px;left:50%;margin-left:-13px;opacity:0;animation:pstDrop .44s cubic-bezier(.5,0,.75,.35) both}
@keyframes pstDrop{0%{opacity:0;transform:translate(var(--x),-70px) rotate(0)}12%{opacity:1}85%{opacity:1}100%{opacity:0;transform:translate(var(--x2),18px) rotate(var(--r))}}
.pst-wallet{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px;margin-top:40px;padding:12px 22px;border-radius:20px;background:var(--card,#fff);box-shadow:0 10px 24px -14px rgba(176,120,0,.55);animation:pstBump .7s .5s ease-out both}
.pst-wallet-ic{color:#b07800}
[data-theme="dark"] .pst-wallet-ic{color:#f2c14e}
@keyframes pstBump{0%,100%{transform:none}12%{transform:scale(1.07)}25%{transform:none}37%{transform:scale(1.06)}50%{transform:none}62%{transform:scale(1.06)}75%{transform:none}87%{transform:scale(1.05)}}

/* Streak: the week, newest on the right; lit days pop in, today flickers. */
.pst-days{display:flex;gap:6px;padding:0 12px}
.pst-day{display:flex;flex-direction:column;align-items:center;gap:5px}
.pst-dot{width:38px;height:38px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--card,#fff);box-sizing:border-box}
.pst-dot.lit{background:#ffe2c7}
[data-theme="dark"] .pst-dot.lit{background:rgba(249,115,22,.22)}
.pst-dot.today{border:2px solid #f97316}
.pst-dot i{width:8px;height:8px;border-radius:50%;background:rgba(127,127,140,.3)}
.pst-flame{font-size:18px;line-height:1;animation:pstPop .42s var(--d) cubic-bezier(.2,1.5,.4,1) both}
.pst-flame.now{animation:pstPop .42s var(--d) cubic-bezier(.2,1.5,.4,1) both,pstFlick .7s 1.4s ease-in-out infinite alternate}
@keyframes pstFlick{from{transform:scale(1) rotate(-3deg)}to{transform:scale(1.15) rotate(3deg)}}
.pst-dl{font-size:11px;font-weight:700;color:var(--sk-muted)}
.pst-dl.today{color:var(--ink);font-weight:800}
.pst-row{display:flex;align-items:baseline;gap:7px;margin-top:16px}
.pst-unit{font-size:15px;font-weight:700;color:var(--sk-muted)}

/* Today: the ring fills toward the daily limit; XP below. */
.pst-ring{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px}
.pst-ring>svg{position:absolute;inset:0}
.pst-arc{animation:pstArc 1.1s .2s cubic-bezier(.22,1,.36,1) both}
@keyframes pstArc{from{stroke-dashoffset:var(--c)}}
.pst-of{position:relative;font-size:12px;font-weight:700;color:var(--sk-muted)}
.pst-ring .pst-num{position:relative}
.pst-xp{display:flex;align-items:center;gap:8px;align-self:stretch;margin-top:12px;padding:0 24px;font-size:11.5px;font-weight:700;color:var(--sk-muted);font-variant-numeric:tabular-nums}
.pst-track{flex:1;height:6px;border-radius:3px;background:rgba(127,127,140,.2);overflow:hidden}
.pst-track i{display:block;height:100%;width:100%;background:#7c5cff;transform-origin:left;animation:pstGrow .56s .77s cubic-bezier(.22,1,.36,1) both}
@keyframes pstGrow{from{transform:scaleX(0)}}

/* Level: the ladder of titles fills to where you are; your marker drops on. */
.pst-ladder{position:relative;align-self:stretch;height:70px}
.pst-rail,.pst-fill{position:absolute;top:32px;left:22px;height:6px;border-radius:3px}
.pst-rail{right:22px;background:rgba(127,127,140,.2)}
.pst-fill{background:#ff7a5c;transform-origin:left;animation:pstGrow .84s .21s cubic-bezier(.22,1,.36,1) both}
.pst-rung{position:absolute;top:29px;width:12px;height:12px;box-sizing:border-box;border-radius:50%;background:var(--card,#fff);border:2px solid rgba(127,127,140,.4);animation:pstPop .4s cubic-bezier(.2,1.5,.4,1) both}
.pst-rung.on{background:#ff7a5c;border-color:#ff7a5c}
.pst-marker{position:absolute;top:0;width:44px;height:28px;border-radius:14px;display:inline-flex;align-items:center;justify-content:center;background:var(--ink);color:var(--card,#fff);font-size:14px;font-weight:800;animation:pstDropIn .38s .84s cubic-bezier(.2,1.4,.4,1) both}
@keyframes pstDropIn{from{opacity:0;transform:translateY(-14px)}}
.pst-titles{display:flex;justify-content:space-between;align-self:stretch;padding:0 16px;margin-top:6px}
.pst-titles b{display:block;font-size:14.5px;font-weight:800;color:var(--ink)}
.pst-titles small{display:block;font-size:12px;color:var(--sk-muted)}

@media (max-width:560px){
  .pst.sk{padding:10px 18px calc(18px + env(safe-area-inset-bottom));animation-name:pstUp;animation-duration:.38s;animation-timing-function:cubic-bezier(.22,1,.36,1)}
  @keyframes pstUp{from{transform:translateY(100%)}}
  .pst.out{animation:pstDown .2s ease-in both}
  @keyframes pstDown{to{transform:translateY(100%)}}
  .pst-grab{display:block;width:40px;height:5px;margin:0 auto 12px;border-radius:3px;background:rgba(127,127,140,.3)}
  .pst-dot{width:34px;height:34px}
  .pst-days{gap:5px;padding:0 8px}
}
@media (prefers-reduced-motion:reduce){
  .pst.sk,.pst-scrim,.pst *{animation:none!important}
  .pst-drop{display:none}
}
`
