'use client'

import { useMemo, useState, type ReactNode } from 'react'
import TickSlider from '@/components/TickSlider'
import { track } from '@/lib/analytics'
import InviteCta from '@/components/InviteCta'
import { CHANNELS, EXTRAS, FREE_SEATS, SMS_INCLUDED, recommendPlan, smsOverage, type Brand, type FinderAnswers, type PlanId } from '@/lib/plan-finder'

const CORAL = '#ff6a4d'
const MONO = 'ui-monospace, "SF Mono", SFMono-Regular, Menlo, Consolas, monospace'

type Tier = { id: string; name: string; tagline: string; accent: string; monthly: number; annual: number; cta: string }

// Line glyphs for the chips (same drawing style as the landing page's channel row).
const GLYPHS: Record<string, ReactNode> = {
  chat: <><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.6A8 8 0 1 1 21 12z" /><line x1="9" y1="11" x2="9.01" y2="11" /><line x1="13" y1="11" x2="13.01" y2="11" /><line x1="17" y1="11" x2="17.01" y2="11" /></>,
  sms: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />,
  calls: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" />,
  email: <><rect x="3" y="5" width="18" height="14" rx="2" /><polyline points="3 7 12 13 21 7" /></>,
  instagram: <><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4" /><circle cx="17.5" cy="6.5" r="0.8" fill="currentColor" /></>,
  messenger: <><path d="M12 3C7 3 3 6.7 3 11.3c0 2.6 1.3 4.9 3.3 6.4V21l3-1.7c.9.3 1.8.4 2.7.4 5 0 9-3.7 9-8.3S17 3 12 3z" /><polyline points="7.5 13.5 10.5 10.5 13 12.5 16.5 9" /></>,
  bookings: <><rect x="3" y="4" width="18" height="17" rx="2" /><line x1="3" y1="9" x2="21" y2="9" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="16" y1="2" x2="16" y2="6" /></>,
  store: <><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z" /><line x1="3" y1="6" x2="21" y2="6" /><path d="M16 10a4 4 0 0 1-8 0" /></>,
  campaigns: <><path d="M3 11v2a1 1 0 0 0 1 1h3l5 4V6L7 10H4a1 1 0 0 0-1 1z" /><path d="M16 8a5 5 0 0 1 0 8" /><path d="M19 5a9 9 0 0 1 0 14" /></>,
  agents: <><rect x="4" y="7" width="16" height="12" rx="3" /><line x1="12" y1="3" x2="12" y2="7" /><circle cx="9" cy="13" r="1.2" fill="currentColor" /><circle cx="15" cy="13" r="1.2" fill="currentColor" /></>,
  ideas: <><path d="M9 18h6" /><path d="M10 22h4" /><path d="M12 2a7 7 0 0 0-4 12.7V16h8v-1.3A7 7 0 0 0 12 2z" /></>,
  surveys: <><rect x="5" y="3" width="14" height="18" rx="2" /><polyline points="8.5 9 10 10.5 12.5 8" /><line x1="14" y1="9.5" x2="16" y2="9.5" /><polyline points="8.5 15 10 16.5 12.5 14" /><line x1="14" y1="15.5" x2="16" y2="15.5" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2.5-3 4" /><line x1="12" y1="17" x2="12.01" y2="17" /></>,
  insights: <><line x1="4" y1="20" x2="4" y2="12" /><line x1="10" y1="20" x2="10" y2="6" /><line x1="16" y1="20" x2="16" y2="14" /><line x1="21" y1="20" x2="3" y2="20" /></>,
}

const BRANDS: { id: Brand; label: string; hint: string }[] = [
  { id: 'colvy', label: 'A small Colvy badge is fine', hint: 'Keeps costs down' },
  { id: 'mine', label: 'My brand only', hint: 'No Colvy badge anywhere' },
  { id: 'domain', label: 'My brand on my own domain', hint: 'help.yourshop.com.au' },
]

const HEADLINES: Record<PlanId, { title: string; line: string }> = {
  free: { title: 'Start free, stay free', line: 'Everything you need to hear from customers, at no cost. Upgrade the day you outgrow it.' },
  feedback: { title: 'Hear every customer', line: 'Collect ideas, run surveys and show what’s coming, with your whole team on board.' },
  omnichannel: { title: 'Every conversation, one inbox', line: 'Chat, texts, calls and orders in one place, so nobody waits and nothing slips.' },
  everything: { title: 'All of Colvy, working as one', line: 'Every conversation and every piece of feedback in one place, under your own brand.' },
}

type Step = 'channels' | 'extras' | 'texts' | 'brand' | 'team' | 'result'

const short = (n: number) => n >= 1000 ? `${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k` : String(n)
const aud = (n: number) => `A$${n.toLocaleString('en-AU')}`

export default function PlanFinder({ dark, annual, setAnnual, tiers, onChoose, onMatch, onCompare }: {
  dark: boolean
  annual: boolean
  setAnnual: (v: boolean) => void
  tiers: Tier[]
  onChoose: (tierId: string) => void
  onMatch: (plan: PlanId | null) => void
  onCompare: () => void
}) {
  const [a, setA] = useState<FinderAnswers>({ channels: [], extras: [], texts: 1000, brand: 'colvy', team: 3 })
  const [noChannels, setNoChannels] = useState(false)
  const [i, setI] = useState(0)

  const texting = a.channels.includes('sms') || a.extras.includes('campaigns')
  const steps: Step[] = ['channels', 'extras', ...(texting ? ['texts' as Step] : []), 'brand', 'team', 'result']
  const step = steps[Math.min(i, steps.length - 1)]
  const questions = steps.length - 1
  const rec = useMemo(() => recommendPlan(a), [a])
  const tier = tiers.find(t => t.id === rec.plan)
  const overage = texting ? smsOverage(a.texts) : null

  const text = dark ? '#f4f5fb' : '#0f1119'
  const muted = dark ? 'rgba(244,245,251,0.6)' : 'rgba(15,17,25,0.58)'
  const line = dark ? 'rgba(255,255,255,0.1)' : 'rgba(15,17,25,0.1)'
  const card = dark ? 'rgba(255,255,255,0.04)' : '#ffffff'
  const chipOn = dark ? 'rgba(255,106,77,0.14)' : '#fff3ef'
  const ink = dark ? '#f4f5fb' : '#0f1119'
  const onInk = dark ? '#0f1119' : '#ffffff'

  const toggle = (key: 'channels' | 'extras', id: string) => {
    if (key === 'channels') setNoChannels(false)
    setA(p => ({ ...p, [key]: p[key].includes(id) ? p[key].filter(x => x !== id) : [...p[key], id] }))
  }
  const canNext = step === 'channels' ? a.channels.length > 0 || noChannels
    : step === 'extras' ? a.channels.length > 0 || a.extras.length > 0
    : true
  const next = () => {
    if (!canNext) return
    const n = Math.min(i + 1, steps.length - 1)
    setI(n)
    if (steps[n] === 'result') { onMatch(rec.plan); track('plan_finder_completed', { plan: rec.plan, channels: a.channels.length, extras: a.extras.join(','), team: a.team }) }
  }
  const back = () => { setI(Math.max(0, i - 1)); onMatch(null) }
  const restart = () => { setI(0); onMatch(null) }

  const chip = (on: boolean, id: string, label: string, onClick: () => void, soon?: boolean) => (
    <button key={id} type="button" aria-pressed={on} onClick={onClick} className="pf-chip" style={{ display: 'inline-flex', alignItems: 'center', gap: 10, padding: '10px 14px 10px 12px', borderRadius: 14, border: `1.5px solid ${on ? CORAL : line}`, background: on ? chipOn : 'transparent', color: text, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer' }}>
      {GLYPHS[id] && <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={on ? CORAL : 'currentColor'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden style={{ flexShrink: 0, opacity: on ? 1 : 0.75 }}>{GLYPHS[id]}</svg>}
      <span>{label}{soon && <span style={{ marginLeft: 6, fontSize: 11, color: muted }}>soon</span>}</span>
      <span aria-hidden style={{ width: 16, display: 'inline-flex', justifyContent: 'center', color: on ? CORAL : muted, transition: 'transform 0.25s cubic-bezier(0.16,1,0.3,1)', transform: on ? 'rotate(0deg)' : 'rotate(-90deg)' }}>
        {on
          ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>}
      </span>
    </button>
  )

  // A number box over a pill-thumbed slider, like a dial. `max` is the
  // slider's end ("10k+"); the box takes any number up to `cap`.
  const dial = (value: number, set: (n: number) => void, opts: { min: number; max: number; step: number; cap: number; ticks: number[]; label: string; fmt?: (n: number) => string }) => {
    const fmt = opts.fmt || String
    return (
      <div>
        <div style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.08em', textTransform: 'uppercase', color: muted, marginBottom: 10 }}>{opts.label}</div>
        <input type="number" inputMode="numeric" aria-label={opts.label} value={value} min={opts.min} max={opts.cap}
          onChange={e => { const n = Math.round(Number(e.target.value)); set(Number.isFinite(n) ? Math.max(opts.min, Math.min(opts.cap, n)) : opts.min) }}
          style={{ width: '100%', boxSizing: 'border-box', padding: '16px 20px', borderRadius: 16, border: `1.5px solid ${line}`, background: 'transparent', color: text, fontFamily: 'inherit', fontSize: 34, fontWeight: 900, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', outline: 'none' }} />
        <div style={{ margin: '16px 0 8px' }}>
          <TickSlider ariaLabel={`${opts.label} slider`} min={opts.min} max={opts.max} step={opts.step} value={Math.min(value, opts.max)} onChange={set} showMax={false} color={CORAL} dark={dark} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: muted, fontVariantNumeric: 'tabular-nums', padding: '0 4px' }}>
          {opts.ticks.map((t, k) => <span key={t}>{fmt(t)}{k === opts.ticks.length - 1 ? '+' : ''}</span>)}
        </div>
      </div>
    )
  }

  const heading = (title: ReactNode, sub: string) => (
    <>
      <h3 style={{ fontSize: 'clamp(30px, 5vw, 42px)', fontWeight: 900, letterSpacing: '-0.035em', lineHeight: 1.02, margin: '0 0 12px', color: text }}>{title}</h3>
      <p style={{ fontSize: 16, lineHeight: 1.55, color: muted, margin: '0 0 26px', maxWidth: 520 }}>{sub}</p>
    </>
  )

  let body: ReactNode
  if (step === 'channels') {
    body = <>
      {heading('Where do customers find you?', 'Pick every place people message, text or call you. Colvy brings them into one inbox.')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {CHANNELS.map(c => chip(a.channels.includes(c.id), c.id, c.label, () => toggle('channels', c.id)))}
        {chip(noChannels, 'none', 'None yet, just feedback', () => { setNoChannels(v => !v); setA(p => ({ ...p, channels: [] })) })}
      </div>
    </>
  } else if (step === 'extras') {
    body = <>
      {heading('What else should Colvy run?', a.channels.length ? 'Optional. Add anything you’d like handled in the same place.' : 'Pick at least one, so we know what you’re here for.')}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        {EXTRAS.map(e => chip(a.extras.includes(e.id), e.id, e.label, () => toggle('extras', e.id)))}
      </div>
    </>
  } else if (step === 'texts') {
    const covered = a.texts <= SMS_INCLUDED
    body = <>
      {heading('How many texts a month?', 'Replies, reminders and campaigns, all counted together. A rough guess is fine.')}
      {dial(a.texts, n => setA(p => ({ ...p, texts: n })), { min: 0, max: 10000, step: 250, cap: 500000, ticks: [0, 2500, 5000, 7500, 10000], label: 'SMS each month', fmt: short })}
      <div style={{ marginTop: 22, display: 'flex', alignItems: 'center', gap: 10, fontSize: 14, color: muted }}>
        <span aria-hidden style={{ width: 8, height: 8, borderRadius: '50%', background: covered ? '#00c48c' : CORAL, flexShrink: 0 }} />
        {covered
          ? <span><b style={{ color: text }}>Covered.</b> {SMS_INCLUDED.toLocaleString('en-AU')} texts a month come with the plan.</span>
          : <span><b style={{ color: text }}>{SMS_INCLUDED.toLocaleString('en-AU')} included</b>, then about {aud(overage!.cost)} a month in prepaid credits for the other {overage!.extra.toLocaleString('en-AU')} (A${overage!.rate.toFixed(3).replace(/0$/, '')} each).</span>}
      </div>
    </>
  } else if (step === 'brand') {
    body = <>
      {heading('Whose name is on it?', 'Your chat widget, booking page, help center and feedback board, as your customers see them.')}
      <div role="radiogroup" aria-label="Branding" style={{ display: 'grid', gap: 10 }}>
        {BRANDS.map(b => {
          const on = a.brand === b.id
          return (
            <button key={b.id} type="button" role="radio" aria-checked={on} onClick={() => setA(p => ({ ...p, brand: b.id }))} className="pf-chip" style={{ display: 'flex', alignItems: 'center', gap: 14, textAlign: 'left', padding: '15px 18px', borderRadius: 16, border: `1.5px solid ${on ? CORAL : line}`, background: on ? chipOn : 'transparent', color: text, fontFamily: 'inherit', cursor: 'pointer' }}>
              <span aria-hidden style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${on ? CORAL : line}`, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{on && <span style={{ width: 8, height: 8, borderRadius: '50%', background: CORAL }} />}</span>
              <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                <span style={{ fontSize: 15.5, fontWeight: 700 }}>{b.label}</span>
                <span style={{ fontSize: 13, color: muted, fontFamily: b.id === 'domain' ? MONO : 'inherit' }}>{b.hint}</span>
              </span>
            </button>
          )
        })}
      </div>
    </>
  } else if (step === 'team') {
    body = <>
      {heading('Who’s in this with you?', 'Everyone who needs their own login to reply, book, or keep things moving.')}
      {dial(a.team, n => setA(p => ({ ...p, team: Math.max(1, n) })), { min: 1, max: 10, step: 1, cap: 999, ticks: [1, 3, 5, 7, 10], label: 'People with a login' })}
      <div style={{ marginTop: 22, fontSize: 14, color: muted }}>Every paid plan includes <b style={{ color: text }}>unlimited team members</b>. Free covers {FREE_SEATS}.</div>
    </>
  } else {
    const price = tier ? (annual ? tier.annual : tier.monthly) : 0
    const h = HEADLINES[rec.plan]
    body = <>
      <div style={{ fontSize: 16, fontWeight: 800, color: text, marginBottom: 10 }}>Your plan is <span style={{ color: tier?.accent || CORAL }}>{tier?.name}</span></div>
      {heading(h.title, h.line)}
      <ul style={{ listStyle: 'none', padding: 0, margin: '0 0 26px', display: 'grid', gap: 0 }}>
        {rec.reasons.map((r, k) => (
          <li key={r} style={{ display: 'flex', alignItems: 'baseline', gap: 14, padding: '12px 0', borderTop: `1px solid ${line}`, fontSize: 15.5, fontWeight: 600, color: text }}>
            <span style={{ fontFamily: MONO, fontSize: 12, color: CORAL, fontWeight: 600 }}>{String(k + 1).padStart(2, '0')}</span>{r}
          </li>
        ))}
      </ul>

      <div style={{ borderRadius: 20, border: `1px solid ${line}`, padding: 'clamp(18px, 3vw, 24px)', background: dark ? 'rgba(255,255,255,0.03)' : '#fbfaf9' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <div role="radiogroup" aria-label="Billing period" style={{ display: 'inline-flex', padding: 4, borderRadius: 999, background: dark ? 'rgba(255,255,255,0.06)' : 'rgba(15,17,25,0.05)' }}>
            {[false, true].map(yr => (
              <button key={String(yr)} type="button" role="radio" aria-checked={annual === yr} onClick={() => setAnnual(yr)} style={{ padding: '8px 16px', borderRadius: 999, border: 'none', cursor: 'pointer', fontFamily: MONO, fontSize: 12, letterSpacing: '0.08em', textTransform: 'uppercase', background: annual === yr ? ink : 'transparent', color: annual === yr ? onInk : text, transition: 'background 0.2s, color 0.2s' }}>{yr ? 'Annual' : 'Monthly'}</button>
            ))}
          </div>
          {tier && tier.monthly > 0 && annual && <span style={{ fontSize: 13, fontWeight: 700, color: '#00a676' }}>Save {aud((tier.monthly - tier.annual) * 12)} a year</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 'clamp(40px, 7vw, 52px)', fontWeight: 900, letterSpacing: '-0.04em', color: text, fontVariantNumeric: 'tabular-nums' }}>{price === 0 ? 'Free' : aud(price)}</span>
          {price > 0 && <span style={{ fontSize: 15, color: muted }}>/mo{annual ? `, ${aud(price * 12)} billed yearly` : ''}</span>}
        </div>
        <div style={{ fontSize: 13, color: muted, marginTop: 4 }}>
          {price === 0 ? 'No card, no time limit.' : 'Inc. GST · 14-day free trial, no card.'}
          {overage && (rec.plan === 'omnichannel' || rec.plan === 'everything') && <> Plus about {aud(overage.cost)}/mo in SMS credits at {a.texts.toLocaleString('en-AU')} texts.</>}
        </div>
        <InviteCta onClick={() => tier && onChoose(tier.id)} className="pf-go" style={{ marginTop: 20, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '16px 0', borderRadius: 999, border: 'none', background: CORAL, color: '#fff', fontFamily: 'inherit', fontSize: 16, fontWeight: 800, cursor: 'pointer', boxShadow: '0 14px 34px rgba(255,106,77,0.3)' }}>{tier?.cta || 'Get started'}</InviteCta>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginTop: 18, fontSize: 14 }}>
        <button type="button" onClick={restart} style={{ background: 'none', border: 'none', padding: 0, color: muted, fontFamily: 'inherit', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>↺ Start over</button>
        <button type="button" onClick={onCompare} style={{ background: 'none', border: 'none', padding: 0, color: text, fontFamily: 'inherit', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Compare all plans ↓</button>
      </div>
    </>
  }

  const done = step === 'result'
  return (
    <div style={{ position: 'relative', maxWidth: 640, margin: '0 auto', borderRadius: 28, border: `1px solid ${line}`, background: card, padding: 'clamp(24px, 5vw, 44px)', boxShadow: dark ? 'none' : '0 30px 80px rgba(15,17,25,0.07)' }}>
      <style>{`
        .pf-chip{transition:border-color .2s, background .2s, transform .2s cubic-bezier(0.16,1,0.3,1)}
        .pf-chip:hover{transform:translateY(-1px)}
        .pf-chip:focus-visible,.pf-nav:focus-visible,.pf-go:focus-visible{outline:2px solid ${CORAL};outline-offset:2px}
        .pf-nav,.pf-go{transition:transform .2s cubic-bezier(0.16,1,0.3,1), opacity .2s}
        .pf-go:hover,.pf-nav:hover:not(:disabled){transform:translateY(-1px)}
        .pf-step{animation:pfIn .45s cubic-bezier(0.16,1,0.3,1)}
        @keyframes pfIn{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:none}}
        input[type=number]::-webkit-inner-spin-button,input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;margin:0}
        input[type=number]{-moz-appearance:textfield}
        @media (prefers-reduced-motion: reduce){.pf-step{animation:none}.pf-chip,.pf-nav,.pf-go{transition:none}}
      `}</style>

      {/* progress: one dash per question, the current one long */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 28 }}>
        <div style={{ display: 'flex', gap: 6 }} aria-hidden>
          {Array.from({ length: questions }).map((_, k) => (
            <span key={k} style={{ height: 5, borderRadius: 5, width: k === i ? 40 : 18, background: k === i || (done && k < questions) ? ink : line, opacity: done ? 0.35 : 1, transition: 'width .35s cubic-bezier(0.16,1,0.3,1), background .3s' }} />
          ))}
        </div>
        <span style={{ fontFamily: MONO, fontSize: 11.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: muted }}>
          {done ? 'Your match' : `Plan finder · ${String(i + 1).padStart(2, '0')}/${String(questions).padStart(2, '0')}`}
        </span>
      </div>

      <div key={step} className="pf-step" aria-live="polite">{body}</div>

      {!done && (
        <div style={{ display: 'flex', gap: 12, marginTop: 34 }}>
          {i > 0 && <button type="button" onClick={back} className="pf-nav" style={{ flex: '0 0 auto', padding: '15px 26px', borderRadius: 999, border: `1.5px solid ${text}`, background: 'transparent', color: text, fontFamily: MONO, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: 'pointer' }}>Back</button>}
          <button type="button" onClick={next} disabled={!canNext} className="pf-nav" style={{ flex: 1, padding: '15px 26px', borderRadius: 999, border: 'none', background: ink, color: onInk, fontFamily: MONO, fontSize: 13, letterSpacing: '0.1em', textTransform: 'uppercase', cursor: canNext ? 'pointer' : 'not-allowed', opacity: canNext ? 1 : 0.35 }}>
            {steps[i + 1] === 'result' ? 'See my plan' : 'Next step'}
          </button>
        </div>
      )}
    </div>
  )
}
