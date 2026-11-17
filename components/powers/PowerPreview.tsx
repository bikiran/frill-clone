'use client'

// "How it works" for a power: a small looping scene that shows what happens
// when you use it, three short steps that light up in time with the scene,
// the price, and one button (use it, or how to earn the coins you're short).
// Opens from any Power Shop card, including when you can't afford it yet.
// Pure CSS animation; with reduced motion the scene sits still on its
// finished frame, which says the same thing.

import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { powerDef } from '@/lib/powers/config'
import { Coin, PowerIcon } from '@/components/powers/PowerIcon'

type Names = { me: string; mate: string }

const STEPS: Record<string, (n: Names) => [string, string, string]> = {
  priority_pin: n => ['In a conversation, choose Pin for a teammate.', `It jumps to the top of ${n.mate}’s inbox with your pin.`, 'After 30 minutes it drops back. They can unpin it any time.'],
  nudge: n => [`Pick a teammate and add a short note.`, `A small tap shows at the side of ${n.mate}’s screen.`, 'One click and it’s gone. It never covers their work.'],
  vip_crown: () => ['Use it on yourself.', 'A small crown sits by your name for 24 hours.', 'Teammates see it on the leaderboard and your profile.'],
  confetti: () => ['Write a short message, if you like.', 'Confetti bursts on everyone’s screen, off to the side.', 'It clears itself in a few seconds.'],
  focus_shield: () => ['Turn it on for 30 minutes.', 'Nudges and confetti from teammates wait.', 'Customer messages and real alerts still come straight through.'],
  double_xp: () => ['Turn it on for an hour.', 'Every reward gives twice the XP.', 'Coins stay the same. You just level up faster.'],
  spotlight: n => [`Pick a teammate and say what they did.`, `${n.mate}’s name shows on everyone’s screen.`, 'It stays up for a day.'],
  streak_saver: () => ['Buy one and keep it.', 'Miss a day and it’s used for you automatically.', 'Your streak carries on.'],
  team_boost: () => ['Turn it on for the whole team.', 'For an hour everyone’s rewards give 50% more XP.', 'Coins stay the same for everyone.'],
  custom_status: () => ['Pick an emoji and a few words.', 'It sits next to your name for 24 hours.', 'Teammates see it on the leaderboard and your profile.'],
  gift: n => [`Pick a teammate and how many coins.`, `The coins move from your wallet to ${n.mate}’s.`, 'Coins only, never XP.'],
  mystery_box: () => ['Open a box.', 'Out comes a surprise look: a ring or a name colour.', 'Looks only. Nothing at work changes.'],
}

const dur = (m: number) => (m >= 60 ? `${m % 60 ? (m / 60).toFixed(1) : m / 60}h` : `${m} min`)

export default function PowerPreview({ power, price, cooldown, daily, coins, names, onUse, onEarn, onClose }: {
  power: string
  price: number
  cooldown: number
  daily: number
  coins: number
  names: Names
  onUse: () => void
  onEarn: () => void
  onClose: () => void
}) {
  const def = powerDef(power)
  const close = useRef<HTMLButtonElement>(null)
  useEffect(() => {
    close.current?.focus()
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])
  if (!def || typeof document === 'undefined') return null
  const gift = power === 'gift'
  const need = gift ? 1 : price
  const short = Math.max(0, need - coins)
  const steps = (STEPS[power] || STEPS.nudge)({ me: first(names.me) || 'you', mate: first(names.mate) || 'a teammate' })
  const meta = [def.minutes ? `Lasts ${dur(def.minutes)}` : 'Instant', cooldown ? `every ${dur(cooldown)}` : '', daily ? `${daily} a day` : ''].filter(Boolean).join(' · ')

  return createPortal(
    <div className="pv-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <style>{CSS}</style>
      <div className="pv" role="dialog" aria-modal="true" aria-labelledby="pv-t" style={{ ['--pc' as any]: def.color }}>
        <button ref={close} type="button" className="pv-x" aria-label="Close" onClick={onClose}>×</button>
        <div className="pv-stage" aria-hidden><Scene power={power} names={names} /></div>
        <div className="pv-body">
          <div className="pv-head">
            <span className="pv-ic"><PowerIcon name={def.icon} size={20} stroke={2} /></span>
            <div className="pv-ht">
              <h3 id="pv-t">{def.name}</h3>
              <span>{meta}</span>
            </div>
            <span className="pv-price"><Coin size={16} />{gift ? `up to ${price}` : price}</span>
          </div>
          <ol className="pv-steps">
            {steps.map((s, i) => <li key={i} className={`s${i + 1}`}><i>{i + 1}</i><span>{s}</span></li>)}
          </ol>
          {short > 0 ? (
            <div className="pv-short">
              <div className="pv-have"><span><Coin size={14} />You have {coins.toLocaleString()}</span><span>{gift ? 'Gifts start at 1' : `${price.toLocaleString()} needed`}</span></div>
              <div className="pv-bar"><i style={{ width: `${Math.round(Math.min(1, coins / need) * 100)}%` }} /></div>
              <div className="pv-foot">
                <p>Earn <b>{short.toLocaleString()} more</b> {short === 1 ? 'coin' : 'coins'} to use it.</p>
                <button type="button" className="ak-btn" onClick={onEarn}>How you earn</button>
              </div>
            </div>
          ) : power === 'priority_pin' ? (
            <div className="pv-foot">
              <p>Pin from a conversation: <b>More → Pin for a teammate</b>.</p>
              <Link href="/admin/inbox" className="ak-btn dark" onClick={onClose}>Go to the inbox</Link>
            </div>
          ) : (
            <div className="pv-foot">
              <p>{power === 'streak_saver' ? 'Kept until you need it.' : gift ? `Up to ${price.toLocaleString()} coins in one go.` : def.target === 'teammate' ? 'They can always dismiss it.' : 'Just for fun. Nothing at work changes.'}</p>
              <button type="button" className="ak-btn dark" onClick={onUse}>{gift ? 'Send a gift' : <>Use for <Coin size={14} />{price}</>}</button>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  )
}

const first = (s: string) => (s || '').trim().split(/\s+/)[0] || ''
const Av = ({ n, c, cls = '' }: { n: string; c: string; cls?: string }) => <span className={`pv-av ${cls}`} style={{ background: c }}>{n.slice(0, 1).toUpperCase()}</span>
const Lines = ({ w = 70 }: { w?: number }) => <span className="pv-lines"><i style={{ width: `${w}%` }} /><i style={{ width: `${w - 25}%` }} /></span>

/** The little animated example for each power. */
function Scene({ power, names }: { power: string; names: Names }) {
  const me = first(names.me) || 'You', mate = first(names.mate) || 'Sam'
  switch (power) {
    case 'priority_pin':
      return (
        <div className="sc sc-pin">
          <div className="pv-app">
            <div className="pv-row a"><Av n="M" c="#94a3b8" /><Lines w={62} /></div>
            <div className="pv-row b"><Av n="R" c="#a3a3a3" /><Lines w={74} /></div>
            <div className="pv-row p"><Av n="K" c="#ff6a4d" /><Lines w={68} /><span className="pin"><PowerIcon name="pin" size={13} stroke={2.3} /></span><span className="tag">Pinned by {me} · 30 min</span></div>
          </div>
          <span className="who">{mate}’s inbox</span>
        </div>
      )
    case 'nudge':
      return (
        <div className="sc sc-nudge">
          <div className="pv-app"><div className="pv-row"><Av n="M" c="#94a3b8" /><Lines w={64} /></div><div className="pv-row"><Av n="R" c="#a3a3a3" /><Lines w={52} /></div></div>
          <div className="toast"><span className="tic"><PowerIcon name="nudge" size={15} stroke={2.1} /></span><span><b>{me} nudged you</b><small>Could you check this morning’s order?</small></span><span className="tx">×</span></div>
        </div>
      )
    case 'vip_crown':
      return (
        <div className="sc sc-crown">
          <div className="person"><span className="crown">👑</span><Av n={me} c="#f5b400" cls="lg" /><b>{me}</b></div>
          <span className="sp s1">✦</span><span className="sp s2">✦</span><span className="sp s3">✦</span>
          <span className="chip">24 hours</span>
        </div>
      )
    case 'confetti':
      return (
        <div className="sc sc-conf">
          <div className="pv-app"><div className="pv-row"><Av n="M" c="#94a3b8" /><Lines w={64} /></div><div className="pv-row"><Av n="R" c="#a3a3a3" /><Lines w={52} /></div></div>
          {Array.from({ length: 16 }).map((_, i) => (
            <span key={i} className="bit" style={{ ['--x' as any]: `${Math.round(Math.cos((i / 16) * Math.PI * 1.1 + 2.0) * (70 + (i % 4) * 22))}px`, ['--y' as any]: `${Math.round(-60 - (i % 5) * 14)}px`, ['--r' as any]: `${(i % 2 ? 1 : -1) * (120 + i * 25)}deg`, background: ['#ff6a4d', '#f5b400', '#7c5cff', '#22c55e', '#0ea5e9', '#ec4899'][i % 6], animationDelay: `${(i % 4) * 0.03}s` }} />
          ))}
          <div className="toast"><span className="emo">🎉</span><span><b>{me} threw confetti</b><small>Great week, team!</small></span></div>
        </div>
      )
    case 'focus_shield':
      return (
        <div className="sc sc-shield">
          <div className="pv-app">
            <div className="pv-row in"><Av n="C" c="#22c55e" /><span className="msg">New customer message</span></div>
            <div className="pv-row"><Av n="M" c="#94a3b8" /><Lines w={64} /></div>
          </div>
          <span className="dome"><PowerIcon name="shield" size={26} stroke={2} /></span>
          <span className="ping">👋 Nudge</span>
          <span className="chip">1 nudge waiting</span>
        </div>
      )
    case 'double_xp':
      return (
        <div className="sc sc-dxp">
          <div className="reward"><span className="v a">+10 XP</span><span className="v b">+20 XP</span><span className="x2">×2</span></div>
          <div className="bar"><i /></div>
          <span className="cap">Coins stay the same</span>
        </div>
      )
    case 'spotlight':
      return (
        <div className="sc sc-spot">
          <span className="beam" />
          <div className="card"><Av n={mate} c="#f97316" /><span><b>{mate}</b><small>Turned a refund into a 5-star review</small></span><span className="star">★</span></div>
          <span className="banner">Spotlight on {mate}</span>
        </div>
      )
    case 'streak_saver':
      return (
        <div className="sc sc-streak">
          <div className="days">
            {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
              <span key={i} className={`day d${i}${i === 4 ? ' miss' : ''}`}><span className="fl">{i === 4 ? <span className="save"><PowerIcon name="flame" size={14} stroke={2.2} /></span> : '🔥'}</span><small>{d}</small></span>
            ))}
          </div>
          <span className="chip">🔥 7-day streak kept</span>
        </div>
      )
    case 'team_boost':
      return (
        <div className="sc sc-boost">
          <span className="rocket"><PowerIcon name="rocket" size={22} stroke={2} /></span>
          <div className="row3">
            {[me, mate, 'A'].map((n, i) => (
              <span key={i} className={`mate m${i}`}><span className="xp"><span className="v a">+10</span><span className="v b">+15</span> XP</span><Av n={n} c={['#6366f1', '#0ea5e9', '#14b8a6'][i]} /></span>
            ))}
          </div>
          <span className="cap">Everyone, for an hour</span>
        </div>
      )
    case 'custom_status':
      return (
        <div className="sc sc-status">
          <div className="namechip"><Av n={me} c="#64748b" /><b>{me}</b><span className="bubble"><span className="type">🌴 Back Monday</span></span></div>
          <span className="cap">Next to your name for 24 hours</span>
        </div>
      )
    case 'gift':
      return (
        <div className="sc sc-gift">
          <div className="side l"><Av n={me} c="#e11d48" cls="lg" /><b>{me}</b><span className="wal"><Coin size={12} /><span className="v a">240</span><span className="v b">190</span></span></div>
          <span className="c c1"><Coin size={18} /></span><span className="c c2"><Coin size={18} /></span><span className="c c3"><Coin size={18} /></span>
          <div className="side r"><span className="plus">+50</span><Av n={mate} c="#0ea5e9" cls="lg" /><b>{mate}</b><span className="wal"><Coin size={12} /><span className="v a">80</span><span className="v b">130</span></span></div>
        </div>
      )
    case 'mystery_box':
      return (
        <div className="sc sc-box">
          <span className="box"><PowerIcon name="box" size={40} stroke={1.8} /></span>
          <div className="reveal"><span className="ring"><Av n={me} c="#64748b" cls="lg" /></span><b>Sunset ring</b></div>
        </div>
      )
    default:
      return null
  }
}

// Every scene loops over the same 6.6s as the steps (thirds: set up, happen,
// result). Base styles are the finished frame; keyframes start from "before".
const CSS = `
/* Portalled to <body>, outside the admin page that defines these. */
.pv-back{--f:#f4f4f5;--line:#ececee;--mut:#71717a;--soft:#8e8e93}
[data-theme="dark"] .pv-back{--f:#2a2a2e;--line:#2e2e33;--mut:#a1a1aa;--soft:#8b8b90}
.pv-back{position:fixed;inset:0;z-index:9450;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,12,20,.34);animation:pvFade .2s ease}
@keyframes pvFade{from{opacity:0}}
.pv{--T:6.6s;position:relative;width:min(440px,100%);max-height:calc(100dvh - 32px);overflow:auto;border-radius:28px;background:var(--card,#fff);color:var(--ink);box-shadow:0 30px 80px -24px rgba(10,12,20,.5);animation:pvPop .32s cubic-bezier(.2,1.1,.35,1)}
@keyframes pvPop{from{opacity:0;transform:translateY(14px) scale(.97)}}
.pv-x{position:absolute;top:12px;right:12px;z-index:3;width:32px;height:32px;border:none;border-radius:50%;background:color-mix(in srgb,var(--card,#fff) 80%,transparent);color:var(--mut);font-size:20px;line-height:1;cursor:pointer;backdrop-filter:blur(6px)}
.pv-x::before{display:none!important}
.pv-stage{position:relative;height:210px;margin:8px 8px 0;border-radius:22px;overflow:hidden;background:radial-gradient(120% 120% at 50% 0%,color-mix(in srgb,var(--pc) 16%,var(--card,#fff)),color-mix(in srgb,var(--pc) 6%,var(--f,#f4f4f6)))}
.pv-body{padding:16px 20px 20px}
.pv-head{display:flex;align-items:center;gap:12px}
.pv-ic{width:40px;height:40px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:14px;background:var(--pc);color:#fff;box-shadow:0 8px 18px -10px var(--pc)}
.pv-ht{flex:1;min-width:0}
.pv-ht h3{margin:0;font-family:var(--font-display),sans-serif;font-size:20px;letter-spacing:-.03em;line-height:1.15}
.pv-ht span{font-size:12.5px;color:var(--soft)}
.pv-price{display:inline-flex;align-items:center;gap:5px;font-weight:800;font-size:15px;font-variant-numeric:tabular-nums;white-space:nowrap}
.pv-steps{list-style:none;margin:14px 0 0;padding:0;display:flex;flex-direction:column;gap:4px}
.pv-steps li{display:flex;align-items:flex-start;gap:10px;padding:8px 10px;border-radius:14px;font-size:14px;line-height:1.45;color:var(--mut);animation:pvStep var(--T) linear infinite}
.pv-steps li i{flex-shrink:0;width:22px;height:22px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--f);font-style:normal;font-size:12px;font-weight:800;color:var(--mut);animation:pvStepN var(--T) linear infinite}
.pv-steps li.s2,.pv-steps li.s2 i{animation-delay:calc(var(--T) * -2 / 3)}
.pv-steps li.s3,.pv-steps li.s3 i{animation-delay:calc(var(--T) * -1 / 3)}
@keyframes pvStep{0%,31%{background:color-mix(in srgb,var(--pc) 9%,transparent);color:var(--ink)}34%,100%{background:transparent;color:var(--mut)}}
@keyframes pvStepN{0%,31%{background:var(--pc);color:#fff}34%,100%{background:var(--f);color:var(--mut)}}
.pv-foot{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-top:14px}
.pv-foot p{margin:0;font-size:13px;line-height:1.45;color:var(--soft)}
.pv-foot p b{color:var(--ink);font-weight:700}
.pv-foot .ak-btn{flex-shrink:0}
.pv-short{margin-top:14px;padding:14px;border-radius:18px;background:var(--f)}
.pv-short .pv-foot{margin-top:10px}
.pv-have{display:flex;justify-content:space-between;gap:8px;font-size:13px;color:var(--mut);font-variant-numeric:tabular-nums}
.pv-have span{display:inline-flex;align-items:center;gap:5px}
.pv-bar{height:8px;margin-top:8px;border-radius:999px;background:rgba(127,127,140,.18);overflow:hidden}
.pv-bar i{display:block;height:100%;border-radius:inherit;background:linear-gradient(90deg,#ffd75e,#f2a900);transform-origin:left;animation:pvGrow .9s cubic-bezier(.22,1,.36,1) both}
@keyframes pvGrow{from{transform:scaleX(0)}}

/* shared bits */
.sc{position:absolute;inset:0;display:flex;align-items:center;justify-content:center}
.sc *{animation-duration:var(--T);animation-iteration-count:infinite;animation-timing-function:cubic-bezier(.22,1,.36,1)}
.pv-app{position:relative;width:min(300px,80%);display:flex;flex-direction:column;gap:7px;padding:12px;border-radius:18px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 14px 34px -22px rgba(16,24,40,.45)}
.pv-row{position:relative;display:flex;align-items:center;gap:9px;height:38px;padding:0 9px;border-radius:12px;background:var(--f)}
.pv-av{width:24px;height:24px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;color:#fff;font-size:11px;font-weight:800;box-shadow:0 0 0 2px var(--card,#fff)}
.pv-av.lg{width:52px;height:52px;font-size:21px}
.pv-lines{flex:1;display:flex;flex-direction:column;gap:5px}
.pv-lines i{display:block;height:5px;border-radius:9px;background:rgba(127,127,140,.28)}
.pv-lines i+i{opacity:.6}
.sc .chip,.sc .cap{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);white-space:nowrap;font-size:12px;font-weight:650;color:var(--mut)}
.sc .chip,.sc .cap{animation-name:pvInC}
@keyframes pvInC{0%,55%{opacity:0;transform:translate(-50%,4px)}66%,100%{opacity:1;transform:translateX(-50%)}}
.sc .chip{padding:5px 11px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06);color:var(--ink)}
.toast{position:absolute;bottom:14px;right:14px;display:flex;align-items:center;gap:9px;max-width:240px;padding:9px 11px;border-radius:16px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 16px 34px -18px rgba(16,24,40,.5);text-align:left}
.toast b{display:block;font-size:12.5px}
.toast small{display:block;font-size:11.5px;color:var(--mut);line-height:1.35}
.toast .tic{width:28px;height:28px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--pc);color:#fff}
.toast .emo{font-size:20px}
.toast .tx{align-self:flex-start;color:var(--soft);font-size:15px;line-height:1}
.v{display:inline-block}
.v.a{position:absolute;opacity:0;animation-name:pvSwapA}
.v.b{animation-name:pvSwapB}
@keyframes pvSwapA{0%,40%{opacity:1;transform:none}48%,100%{opacity:0;transform:translateY(-8px)}}
@keyframes pvSwapB{0%,42%{opacity:0;transform:translateY(8px)}52%,100%{opacity:1;transform:none}}

/* Priority Pin: the pinned conversation rises to the top */
.sc-pin .pv-app{height:148px}
.sc-pin .pv-row{position:absolute;left:12px;right:12px}
.sc-pin .pv-row.p{top:12px;background:color-mix(in srgb,var(--pc) 12%,var(--card,#fff));box-shadow:0 0 0 1.5px color-mix(in srgb,var(--pc) 55%,transparent);z-index:1;animation-name:pvPinUp}
.sc-pin .pv-row.a{top:57px;animation-name:pvPinDown}
.sc-pin .pv-row.b{top:102px;animation-name:pvPinDown}
@keyframes pvPinUp{0%,30%{transform:translateY(90px);background:var(--f);box-shadow:none}44%{transform:translateY(-4px) scale(1.03)}52%,100%{transform:none}}
@keyframes pvPinDown{0%,32%{transform:translateY(-45px)}48%,100%{transform:none}}
.sc-pin .pin{display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:50%;background:var(--pc);color:#fff;animation-name:pvPop1}
@keyframes pvPop1{0%,18%{transform:scale(0)}26%{transform:scale(1.35)}32%,100%{transform:none}}
.sc-pin .tag{position:absolute;right:8px;top:-9px;padding:2px 8px;border-radius:999px;background:var(--pc);color:#fff;font-size:10.5px;font-weight:700;white-space:nowrap;animation-name:pvIn}
@keyframes pvIn{0%,55%{opacity:0;transform:translateY(4px)}66%,100%{opacity:1;transform:none}}
.sc-pin .who{position:absolute;top:10px;left:16px;font-size:11.5px;font-weight:700;color:var(--mut)}

/* Nudge: a small tap at the side, then dismissed */
.sc-nudge .pv-app{transform:translate(-30px,-18px)}
.sc-nudge .toast{animation-name:pvToast}
@keyframes pvToast{0%,28%{opacity:0;transform:translateX(40px)}38%{opacity:1;transform:translateX(-4px)}44%,84%{opacity:1;transform:none}92%,100%{opacity:0;transform:translateX(30px)}}
.sc-nudge .tic{animation-name:pvWiggle}
@keyframes pvWiggle{0%,38%,60%,100%{transform:none}42%{transform:rotate(-16deg)}46%{transform:rotate(14deg)}50%{transform:rotate(-10deg)}54%{transform:rotate(6deg)}}

/* VIP Crown: drops onto your name */
.sc-crown .person{position:relative;display:flex;flex-direction:column;align-items:center;gap:7px;margin-top:-14px}
.sc-crown .person b{font-size:15px}
.sc-crown .crown{position:absolute;top:-24px;font-size:26px;transform:rotate(-10deg);animation-name:pvCrown}
@keyframes pvCrown{0%,30%{opacity:0;transform:translateY(-60px) rotate(20deg)}44%{opacity:1;transform:translateY(5px) rotate(-14deg)}52%,100%{opacity:1;transform:rotate(-10deg)}}
.sc-crown .sp{position:absolute;color:#f5b400;font-size:14px;animation-name:pvSpark}
.sc-crown .s1{top:42px;left:calc(50% - 56px)}.sc-crown .s2{top:34px;left:calc(50% + 40px);animation-delay:.12s}.sc-crown .s3{top:92px;left:calc(50% + 52px);animation-delay:.22s}
@keyframes pvSpark{0%,42%{opacity:0;transform:scale(0)}50%{opacity:1;transform:scale(1.4)}62%,100%{opacity:.75;transform:none}}

/* Confetti: a burst, then it clears */
.sc-conf .pv-app{transform:translate(-30px,-18px)}
.sc-conf .bit{position:absolute;left:62%;top:62%;width:7px;height:11px;border-radius:2px;opacity:.9;transform:translate(var(--x),var(--y)) rotate(var(--r));animation-name:pvBit;animation-timing-function:cubic-bezier(.2,.8,.4,1)}
@keyframes pvBit{0%,30%{opacity:0;transform:none}34%{opacity:1}52%{opacity:1;transform:translate(var(--x),var(--y)) rotate(calc(var(--r) / 2))}88%{opacity:0;transform:translate(var(--x),calc(var(--y) + 130px)) rotate(var(--r))}100%{opacity:0}}
.sc-conf .toast{animation-name:pvToast}

/* Focus Shield: pings bounce off, customers get through */
.sc-shield .pv-app{transform:translateX(-24px)}
.sc-shield .dome{position:absolute;left:calc(50% - 24px);top:50%;width:250px;height:150px;margin:-75px 0 0 -125px;display:flex;align-items:flex-start;justify-content:flex-end;padding:8px 14px;border-radius:40px;box-shadow:0 0 0 2px color-mix(in srgb,var(--pc) 55%,transparent),inset 0 0 40px color-mix(in srgb,var(--pc) 22%,transparent);color:var(--pc);animation-name:pvDome;pointer-events:none}
@keyframes pvDome{0%,14%{opacity:0;transform:scale(.8)}26%,100%{opacity:1;transform:none}}
.sc-shield .ping{position:absolute;right:10px;top:42%;padding:5px 10px;border-radius:999px;background:#7c5cff;color:#fff;font-size:11.5px;font-weight:700;opacity:0;animation-name:pvPing}
@keyframes pvPing{0%,30%{opacity:0;transform:translateX(40px)}38%{opacity:1;transform:translateX(0)}44%{opacity:1;transform:translateX(-14px)}52%{opacity:1;transform:translateX(16px) rotate(10deg)}60%,100%{opacity:0;transform:translateX(40px) rotate(14deg)}}
.sc-shield .pv-row.in{background:color-mix(in srgb,#22c55e 13%,var(--card,#fff));animation-name:pvMsg}
.sc-shield .msg{font-size:12px;font-weight:650}
@keyframes pvMsg{0%,62%{opacity:0;transform:translateX(150px)}76%,100%{opacity:1;transform:none}}

/* Double XP */
.sc-dxp{flex-direction:column;gap:16px}
.sc-dxp .reward{position:relative;display:inline-flex;align-items:center;justify-content:center;min-width:120px;height:52px;padding:0 20px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 14px 30px -18px var(--pc);font-family:var(--font-display),sans-serif;font-size:24px;font-weight:800;letter-spacing:-.03em;color:var(--pc);animation-name:pvRise}
@keyframes pvRise{0%,6%{opacity:0;transform:translateY(16px) scale(.9)}16%,100%{opacity:1;transform:none}}
.sc-dxp .x2{position:absolute;top:-12px;right:-16px;padding:3px 9px;border-radius:999px;background:var(--pc);color:#fff;font-family:inherit;font-size:14px;transform:rotate(12deg);animation-name:pvStamp}
@keyframes pvStamp{0%,34%{opacity:0;transform:scale(2.4) rotate(-10deg)}42%{opacity:1;transform:scale(.9) rotate(14deg)}48%,100%{opacity:1;transform:rotate(12deg)}}
.sc-dxp .bar{width:min(240px,70%);height:9px;border-radius:999px;background:rgba(127,127,140,.18);overflow:hidden}
.sc-dxp .bar i{display:block;height:100%;width:88%;border-radius:inherit;background:var(--pc);transform-origin:left;animation:pvXp var(--T) cubic-bezier(.22,1,.36,1) infinite}
@keyframes pvXp{0%,10%{transform:scaleX(.3)}22%,40%{transform:scaleX(.45)}58%,100%{transform:none}}

/* Spotlight */
.sc-spot .beam{position:absolute;top:-30px;left:50%;width:200px;height:260px;margin-left:-100px;background:radial-gradient(60% 55% at 50% 72%,color-mix(in srgb,#ffd166 50%,transparent),transparent 70%);clip-path:polygon(44% 0,56% 0,100% 100%,0 100%);transform-origin:50% 0;animation-name:pvBeam}
@keyframes pvBeam{0%,8%{opacity:0;transform:rotate(-40deg)}30%{opacity:1;transform:rotate(-12deg)}42%,100%{opacity:1;transform:none}}
.sc-spot .card{position:relative;display:flex;align-items:center;gap:10px;margin-top:22px;padding:11px 14px;border-radius:18px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 16px 34px -18px var(--pc);text-align:left;max-width:80%}
.sc-spot .card b{display:block;font-size:13.5px}
.sc-spot .card small{display:block;font-size:11.5px;color:var(--mut)}
.sc-spot .star{position:absolute;top:-10px;right:-8px;width:26px;height:26px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--pc);color:#fff;font-size:14px;animation-name:pvPop2}
@keyframes pvPop2{0%,40%{transform:scale(0)}48%{transform:scale(1.35)}54%,100%{transform:none}}
.sc-spot .banner{position:absolute;top:12px;left:50%;transform:translateX(-50%);padding:5px 12px;border-radius:999px;background:var(--pc);color:#fff;font-size:12px;font-weight:700;white-space:nowrap;animation-name:pvDrop}
@keyframes pvDrop{0%,52%{opacity:0;transform:translate(-50%,-24px)}64%,100%{opacity:1;transform:translateX(-50%)}}

/* Streak Saver */
.sc-streak .days{display:flex;gap:8px;margin-top:-18px}
.sc-streak .day{display:flex;flex-direction:column;align-items:center;gap:5px}
.sc-streak .day small{font-size:11px;font-weight:700;color:var(--soft)}
.sc-streak .fl{width:34px;height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06);font-size:16px;animation-name:pvDay}
.sc-streak .d1 .fl{animation-delay:.25s}.sc-streak .d2 .fl{animation-delay:.5s}.sc-streak .d3 .fl{animation-delay:.75s}.sc-streak .d5 .fl{animation-delay:1.9s}.sc-streak .d6 .fl{animation-delay:2.15s}
@keyframes pvDay{0%{opacity:.25;transform:scale(.7)}6%{opacity:1;transform:scale(1.15)}10%,100%{opacity:1;transform:none}}
.sc-streak .miss .fl{animation-name:pvMiss;animation-delay:0s}
@keyframes pvMiss{0%,22%{opacity:.4;transform:scale(.85);box-shadow:0 0 0 1px rgba(0,0,0,.06)}38%{opacity:1;transform:scale(1.2)}46%,100%{opacity:1;transform:none;box-shadow:0 0 0 2px var(--pc)}}
.sc-streak .save{display:inline-flex;color:var(--pc)}

/* Team Boost */
.sc-boost .row3{display:flex;gap:22px;margin-top:6px}
.sc-boost .mate{position:relative;display:flex;flex-direction:column;align-items:center;gap:6px}
.sc-boost .mate .pv-av{width:42px;height:42px;font-size:16px;animation-name:pvGlow}
@keyframes pvGlow{0%,40%{box-shadow:0 0 0 2px var(--card,#fff)}52%,100%{box-shadow:0 0 0 2px var(--card,#fff),0 0 0 5px color-mix(in srgb,var(--pc) 40%,transparent)}}
.sc-boost .xp{position:relative;display:inline-flex;gap:3px;padding:3px 8px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06);font-size:11.5px;font-weight:800;color:var(--pc);font-variant-numeric:tabular-nums}
.sc-boost .m1 .v,.sc-boost .m1 .pv-av{animation-delay:.12s}.sc-boost .m2 .v,.sc-boost .m2 .pv-av{animation-delay:.24s}
.sc-boost .rocket{position:absolute;top:24px;left:-30px;color:var(--pc);transform:translateX(360px) rotate(45deg);opacity:0;animation-name:pvRocket;animation-timing-function:ease-in-out}
@keyframes pvRocket{0%,24%{opacity:0;transform:translate(0,40px) rotate(45deg)}30%{opacity:1}48%{opacity:1;transform:translate(260px,0) rotate(45deg)}56%,100%{opacity:0;transform:translate(420px,-20px) rotate(45deg)}}

/* Custom Status */
.sc-status .namechip{display:inline-flex;align-items:center;gap:9px;padding:7px 8px 7px 7px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.05),0 14px 30px -18px rgba(16,24,40,.45);margin-top:-14px}
.sc-status .namechip .pv-av{width:30px;height:30px;font-size:13px}
.sc-status .namechip b{font-size:14px}
.sc-status .bubble{display:inline-flex;padding:5px 10px;border-radius:999px;background:var(--f);font-size:12.5px;font-weight:650;animation-name:pvIn2}
@keyframes pvIn2{0%,22%{opacity:0;transform:scale(.6)}30%,100%{opacity:1;transform:none}}
.sc-status .type{white-space:nowrap;overflow:hidden;clip-path:inset(0);animation-name:pvType;animation-timing-function:steps(13,end)}
@keyframes pvType{0%,30%{clip-path:inset(0 100% 0 0)}60%,100%{clip-path:inset(0)}}

/* Coin Gift: coins hop across */
.sc-gift{--g:120px;--hop:calc(var(--g) + 52px);gap:var(--g)}
.sc-gift .side{position:relative;display:flex;flex-direction:column;align-items:center;gap:5px}
.sc-gift .side b{font-size:13.5px}
.sc-gift .wal{position:relative;display:inline-flex;align-items:center;gap:4px;padding:2px 9px;border-radius:999px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06);font-size:12px;font-weight:800;font-variant-numeric:tabular-nums}
.sc-gift .c{position:absolute;left:calc(50% - var(--hop) / 2 - 9px);top:calc(50% - 30px);opacity:0;animation-name:pvHop;animation-timing-function:ease-in-out}
.sc-gift .c2{animation-delay:.14s}.sc-gift .c3{animation-delay:.28s}
@keyframes pvHop{0%,28%{opacity:0;transform:none}32%{opacity:1}42%{transform:translate(calc(var(--hop) / 2),-46px)}54%{opacity:1;transform:translate(var(--hop),0)}58%,100%{opacity:0;transform:translate(var(--hop),0)}}
.sc-gift .plus{position:absolute;top:-22px;font-size:13px;font-weight:800;color:#b07800;animation-name:pvPlus}
@keyframes pvPlus{0%,54%{opacity:0;transform:translateY(8px)}62%,86%{opacity:1;transform:none}96%,100%{opacity:0;transform:translateY(-8px)}}

/* Mystery Box */
.sc-box .box{position:absolute;width:76px;height:76px;display:inline-flex;align-items:center;justify-content:center;border-radius:22px;background:var(--pc);color:#fff;box-shadow:0 14px 30px -14px var(--pc);opacity:0;animation-name:pvBox}
@keyframes pvBox{0%{opacity:1;transform:none}8%{transform:rotate(-8deg)}12%{transform:rotate(8deg)}16%{transform:rotate(-6deg)}20%{transform:rotate(6deg)}24%{transform:rotate(-3deg)}30%{opacity:1;transform:scale(1)}38%{opacity:0;transform:scale(1.5)}100%{opacity:0;transform:scale(1.5)}}
.sc-box .reveal{display:flex;flex-direction:column;align-items:center;gap:8px;animation-name:pvReveal}
@keyframes pvReveal{0%,32%{opacity:0;transform:scale(.4)}44%{opacity:1;transform:scale(1.12)}52%,100%{opacity:1;transform:none}}
.sc-box .ring{display:inline-flex;padding:3px;border-radius:50%;background:linear-gradient(135deg,#ff6a4d,#f5b400)}
.sc-box .reveal b{font-size:13.5px}

@media (max-width:640px){
  .pv-back{align-items:flex-end;padding:0}
  .pv{width:100%;max-height:92dvh;border-radius:26px 26px 0 0;animation-name:pvUp}
  @keyframes pvUp{from{transform:translateY(40px);opacity:0}}
  .pv-stage{height:190px}
  .pv-foot{flex-direction:column;align-items:stretch}
  .pv-foot .ak-btn{width:100%}
  .sc-gift{--g:84px}
}
@media (prefers-reduced-motion:reduce){
  .pv,.pv-back,.pv-bar i,.pv-steps li,.pv-steps li i,.sc,.sc *{animation:none!important}
  .sc-shield .ping,.sc-boost .rocket,.sc-gift .c{display:none}
}
`
