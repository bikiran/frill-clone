'use client'

// Using a power: who it's for, a short note when it carries one, the price,
// and one button. Opens from the Power Shop and from a conversation ("Pin for
// a teammate"). A sheet from the bottom on phones, a small card on desktop.
// The coins come off on the server in one step; a double click uses it once.

import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { powersApi, refreshPowers, clickKey, celebrate, pingTeam, type PowersMe } from '@/lib/powers/client'
import { powerDef, COSMETICS } from '@/lib/powers/config'
import { Coin, PowerIcon } from '@/components/powers/PowerIcon'

const EMOJIS = ['🎯', '☕️', '🚀', '🎧', '🌴', '🔥', '💪', '🧠', '🎉', '🙌']

export default function UseSheet({ power, companyId, me, conversationId, conversationLabel, onClose }: {
  power: string
  companyId: string
  me: PowersMe
  conversationId?: string | null
  conversationLabel?: string | null
  onClose: () => void
}) {
  const def = powerDef(power)!
  const price = me.powers?.find(p => p.id === power)?.price ?? def.price
  const balance = me.wallet?.coins ?? 0
  const team = useMemo(() => (me.team || []).filter(t => t.id !== me.me?.id), [me])
  const [target, setTarget] = useState<string>('')
  const [note, setNote] = useState('')
  const [emoji, setEmoji] = useState('🎯')
  const [amount, setAmount] = useState(Math.min(25, price))
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [done, setDone] = useState<null | { line: string }>(null)
  const key = useRef(clickKey())
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', esc)
    return () => document.removeEventListener('keydown', esc)
  }, [onClose])

  const needsTarget = def.target === 'teammate'
  const cost = power === 'gift' ? amount : price
  const short = cost > balance
  const needsNote = power === 'spotlight'
  const canGo = !busy && !short && (!needsTarget || !!target) && (!needsNote || note.trim().length >= 3) && (power !== 'priority_pin' || !!conversationId) && (power !== 'custom_status' || !!(emoji || note.trim()))

  const go = async () => {
    if (!canGo) return
    setBusy(true); setErr('')
    const r = await powersApi('/api/powers/use', {
      companyId, power, key: key.current, target: target || undefined, conversationId: conversationId || undefined,
      note: note.trim() || undefined, emoji: power === 'custom_status' ? emoji : undefined, text: power === 'custom_status' ? note.trim() : undefined,
      amount: power === 'gift' ? amount : undefined,
    })
    setBusy(false)
    if (!r.ok) { setErr(r.data?.error || 'That didn’t work. Try again.'); key.current = clickKey(); return }
    celebrate({ kind: 'spent', coins: cost })
    const who = team.find(t => t.id === target)?.name?.split(' ')[0]
    const cosmetic = r.data?.cosmetic ? COSMETICS.find(c => c.id === r.data.cosmetic.id) : null
    const line: Record<string, string> = {
      priority_pin: `Pinned to the top of ${who}’s inbox for 30 minutes.`,
      nudge: `${who} got your nudge.`,
      vip_crown: 'Your crown is on for 24 hours.',
      confetti: 'Confetti’s on its way to the team.',
      focus_shield: 'Focus Shield is up for 30 minutes. Customer messages still come through.',
      double_xp: 'Double XP for the next hour.',
      spotlight: `${who} is in the spotlight today.`,
      streak_saver: 'Streak Saver ready. It’s used for you if you miss a day.',
      team_boost: 'Team Boost is on: +50% XP for everyone for an hour.',
      custom_status: 'Your status is set for 24 hours.',
      gift: `${amount} coins sent to ${who}.`,
      mystery_box: cosmetic ? `You got: ${cosmetic.label}!` : 'Opened!',
    }
    setDone({ line: line[power] || 'Done.' })
    void refreshPowers(true)
    pingTeam()
    window.setTimeout(onClose, power === 'mystery_box' ? 2600 : 1700)
  }

  if (!mounted) return null
  return createPortal(
    <div className="pus-back" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <style>{CSS}</style>
      <div className="pus" role="dialog" aria-label={def.name} style={{ ['--pc' as any]: def.color }}>
        {done ? (
          <div className="pus-done">
            <span className="pus-done-ic"><PowerIcon name={def.icon} size={30} stroke={2} /></span>
            <b>{power === 'mystery_box' ? 'Surprise!' : 'Done'}</b>
            <p>{done.line}</p>
          </div>
        ) : (
          <>
            <div className="pus-h">
              <span className="pus-ic"><PowerIcon name={def.icon} size={22} stroke={2} /></span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <b>{def.name}</b>
                <p>{def.blurb}</p>
              </div>
              <button type="button" className="pus-x" aria-label="Close" onClick={onClose}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>

            {power === 'priority_pin' && (
              conversationId
                ? <div className="pus-ctx"><PowerIcon name="pin" size={14} /> {conversationLabel || 'This conversation'}</div>
                : <div className="pus-ctx muted">Open a conversation, then use <b>More → Pin for a teammate</b>.</div>
            )}

            {needsTarget && (
              <div className="pus-f">
                <label>{power === 'gift' ? 'Send to' : 'For'}</label>
                {team.length ? (
                  <div className="pus-team">
                    {team.map(t => (
                      <button type="button" key={t.id} className={target === t.id ? 'on' : ''} onClick={() => setTarget(t.id)}>
                        <span className="pus-av">{t.avatar ? <img src={t.avatar} alt="" /> : t.name.slice(0, 1).toUpperCase()}</span>
                        {t.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                ) : <p className="pus-hint">No teammates are taking part yet.</p>}
              </div>
            )}

            {power === 'gift' && (
              <div className="pus-f">
                <label>Coins</label>
                <div className="pus-amt">
                  {[10, 25, 50, 100].filter(n => n <= price).map(n => (
                    <button type="button" key={n} className={amount === n ? 'on' : ''} onClick={() => setAmount(n)}><Coin size={13} />{n}</button>
                  ))}
                </div>
              </div>
            )}

            {power === 'custom_status' && (
              <div className="pus-f">
                <label>Status</label>
                <div className="pus-emo">{EMOJIS.map(e => <button type="button" key={e} className={emoji === e ? 'on' : ''} onClick={() => setEmoji(e)}>{e}</button>)}</div>
              </div>
            )}

            {['nudge', 'spotlight', 'confetti', 'priority_pin', 'gift', 'custom_status'].includes(power) && (
              <div className="pus-f">
                <label>{power === 'spotlight' ? 'What did they do?' : power === 'custom_status' ? 'A few words' : 'Note (optional)'}</label>
                <input value={note} onChange={e => setNote(e.target.value)} maxLength={power === 'custom_status' ? 40 : power === 'confetti' ? 80 : 140}
                  placeholder={power === 'spotlight' ? 'Turned an upset customer into a 5-star review' : power === 'custom_status' ? 'Deep in quotes today' : power === 'confetti' ? 'Record week, team!' : power === 'priority_pin' ? 'Can you take this one?' : 'Thanks for the help!'} />
              </div>
            )}

            {err && <p className="pus-err" role="alert">{err}</p>}
            <div className="pus-foot">
              <span className="pus-bal"><Coin size={14} />{balance.toLocaleString()} <small>you have</small></span>
              <button type="button" className="pus-go" disabled={!canGo} onClick={go}>
                {busy ? 'Using…' : short ? 'Not enough coins' : <>Use for <Coin size={14} />{cost}</>}
              </button>
            </div>
          </>
        )}
      </div>
    </div>,
    document.body,
  )
}

const CSS = `
.pus-back{--f:#f4f4f5;--line:#ececee;--mut:#71717a;--soft:#8e8e93}
[data-theme="dark"] .pus-back{--f:#2a2a2e;--line:#2e2e33;--mut:#a1a1aa;--soft:#8b8b90}
.pus-back{position:fixed;inset:0;z-index:9500;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(10,12,20,.32);animation:pusFade .2s ease}
@keyframes pusFade{from{opacity:0}}
.pus{width:min(440px,100%);max-height:calc(100vh - 32px);overflow:auto;padding:18px;border-radius:24px;background:var(--card,#fff);color:var(--ink);box-shadow:0 30px 80px -24px rgba(10,12,20,.45);animation:pusIn .32s cubic-bezier(.2,1.1,.35,1)}
@keyframes pusIn{from{opacity:0;transform:translateY(14px) scale(.97)}to{opacity:1;transform:none}}
.pus button::before{display:none!important}
.pus-h{display:flex;gap:12px;align-items:flex-start;margin-bottom:14px}
.pus-ic{width:44px;height:44px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:15px;background:var(--pc);color:#fff;box-shadow:0 8px 20px -10px var(--pc)}
.pus-h b{display:block;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:19px;font-weight:700;letter-spacing:-.03em}
.pus-h p{margin:3px 0 0;font-size:13.5px;line-height:1.45;color:#8e8e93}
.pus-x{width:32px;height:32px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:rgba(127,127,140,.1);color:#8e8e93;cursor:pointer}
.pus-ctx{display:flex;align-items:center;gap:7px;margin:0 0 12px;padding:10px 12px;border-radius:14px;background:rgba(127,127,140,.08);font-size:13.5px;font-weight:600;overflow:hidden;white-space:nowrap;text-overflow:ellipsis}
.pus-ctx.muted{font-weight:500;color:#8e8e93;white-space:normal}
.pus-ctx svg{color:var(--pc);flex-shrink:0}
.pus-f{margin:0 0 12px}
.pus-f label{display:block;margin:0 0 7px;font-size:12.5px;font-weight:650;color:#8e8e93}
.pus-team{display:flex;flex-wrap:wrap;gap:6px}
.pus-team button{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 13px 0 4px;border:none;border-radius:999px;background:rgba(127,127,140,.1);color:var(--ink);font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;transition:background .15s,box-shadow .15s}
.pus-team button.on{background:color-mix(in srgb,var(--pc) 14%,transparent);box-shadow:0 0 0 2px var(--pc)}
.pus-av{width:30px;height:30px;border-radius:50%;overflow:hidden;display:inline-flex;align-items:center;justify-content:center;background:var(--card,#fff);font-size:12px;font-weight:800;color:#8e8e93}
.pus-av img{width:100%;height:100%;object-fit:cover}
.pus-amt,.pus-emo{display:flex;flex-wrap:wrap;gap:6px}
.pus-amt button,.pus-emo button{display:inline-flex;align-items:center;gap:5px;height:36px;padding:0 13px;border:none;border-radius:999px;background:rgba(127,127,140,.1);color:var(--ink);font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
.pus-emo button{width:38px;padding:0;justify-content:center;font-size:18px}
.pus-amt button.on,.pus-emo button.on{box-shadow:0 0 0 2px var(--pc);background:color-mix(in srgb,var(--pc) 12%,transparent)}
.pus input{width:100%;height:44px;padding:0 14px;border:none;border-radius:14px;background:rgba(127,127,140,.1);color:var(--ink);font:inherit;font-size:14.5px;outline:none;box-sizing:border-box}
.pus input:focus{box-shadow:0 0 0 2px color-mix(in srgb,var(--pc) 45%,transparent)}
.pus-hint{margin:0;font-size:13px;color:#8e8e93}
.pus-err{margin:0 0 10px;padding:9px 12px;border-radius:12px;background:#fef2f2;color:#b42318;font-size:13px}
.pus-foot{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:6px}
.pus-bal{display:inline-flex;align-items:center;gap:5px;font-size:14px;font-weight:700;font-variant-numeric:tabular-nums}
.pus-bal small{font-size:12px;font-weight:500;color:#8e8e93}
.pus-go{display:inline-flex;align-items:center;gap:6px;height:44px;padding:0 20px;border:none;border-radius:999px;background:var(--ink);color:var(--card,#fff);font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;transition:transform .12s,filter .15s}
.pus-go:hover:not(:disabled){filter:brightness(1.15)}
.pus-go:active:not(:disabled){transform:scale(.97)}
.pus-go:disabled{opacity:.45;cursor:default}
.pus-done{display:flex;flex-direction:column;align-items:center;text-align:center;padding:22px 8px 14px}
.pus-done-ic{width:64px;height:64px;display:inline-flex;align-items:center;justify-content:center;border-radius:22px;background:var(--pc);color:#fff;animation:pusPop .6s cubic-bezier(.2,1.4,.4,1)}
@keyframes pusPop{0%{transform:scale(.3) rotate(-30deg);opacity:0}60%{transform:scale(1.12) rotate(6deg);opacity:1}100%{transform:none}}
.pus-done b{margin-top:12px;font-family:var(--font-display),-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;font-size:22px;font-weight:700;letter-spacing:-.03em}
.pus-done p{margin:4px 0 0;font-size:14px;color:#8e8e93}
@media (max-width:640px){
  .pus-back{align-items:flex-end;padding:0}
  .pus{width:100%;border-radius:24px 24px 0 0;padding:18px 16px calc(18px + env(safe-area-inset-bottom));animation-name:pusUp}
  @keyframes pusUp{from{transform:translateY(100%)}to{transform:none}}
}
@media (prefers-reduced-motion:reduce){.pus,.pus-back,.pus-done-ic{animation:none}}
`
