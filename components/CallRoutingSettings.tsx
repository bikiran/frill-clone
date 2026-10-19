'use client'

import { useEffect, useMemo, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import {
  STRATEGIES, MENU_ACTIONS, MENU_KEYS, MAX_ORDER_STEPS, MAX_GREETING, MAX_LABEL, MAX_MESSAGE, STEP_SECONDS, MENU_TIMEOUT,
  auForwardNumber, formatAu, defaultForward, defaultOrder, defaultMenu, menuSpeech, routingSummary, validateRouting,
  type CallRouting, type RingStrategy, type RingOrder, type ForwardTarget, type ForwardWhen, type Menu, type MenuAction,
  type MenuActionType, type MenuKey,
} from '@/lib/call-routing'

type Num = { id: string | null; phoneNumber: string; label: string | null; primary: boolean; supported: boolean; config: CallRouting; saved: boolean }
type Data = {
  available: boolean; canEdit: boolean; businessName: string
  numbers: Num[]; team: { id: string; name: string }[]
  ringSeconds: number; voicemailEnabled: boolean
  ai: { enabled: boolean; mode: string; alsoNoAnswer: boolean; paused: boolean; available: boolean }
  hoursKnown: boolean; forwardAllowed: boolean
}

const SECONDS = [5, 10, 15, 20, 25, 30, 40, 50, 60]
const TIMEOUTS = [3, 4, 5, 6, 8, 10, 12, 15]

const Info = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
)
const Arrow = ({ up }: { up?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {up ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
  </svg>
)
const Cross = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
)
const Speaker = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" /><path d="M15.54 8.46a5 5 0 0 1 0 7.07" /><path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
  </svg>
)

const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
const hint: React.CSSProperties = { margin: '0 0 12px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.45 }
const warn: React.CSSProperties = { display: 'flex', gap: 7, margin: '0 0 12px', fontSize: 12.5, color: '#b45309', lineHeight: 1.45 }
const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, background: '#fff', fontFamily: 'inherit', minWidth: 0 }
const small: React.CSSProperties = { ...field, width: 'auto', padding: '7px 10px', fontSize: 13 }
const iconBtn: React.CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', cursor: 'pointer', flexShrink: 0, padding: 0 }
const addBtn: React.CSSProperties = { padding: '7px 12px', borderRadius: 9, border: '1px dashed var(--coral)', background: '#fff', color: 'var(--coral)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const box: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 11, padding: 12, marginBottom: 10, background: '#fff', minWidth: 0 }

function Check({ on, onChange, text, sub, disabled }: { on: boolean; onChange: (v: boolean) => void; text: React.ReactNode; sub?: React.ReactNode; disabled?: boolean }) {
  return (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13.5, color: 'var(--ink)', marginBottom: 10, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, accentColor: 'var(--coral)' }} />
      <span style={{ minWidth: 0 }}>{text}{sub ? <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)', marginTop: 2, lineHeight: 1.4 }}>{sub}</span> : null}</span>
    </label>
  )
}

function SecondsSelect({ value, onChange, id, aria }: { value: number; onChange: (n: number) => void; id?: string; aria?: string }) {
  const opts = SECONDS.includes(value) ? SECONDS : [...SECONDS, value].sort((a, b) => a - b)
  return (
    <select id={id} aria-label={aria} value={value} onChange={e => onChange(Number(e.target.value))} style={small}>
      {opts.map(s => <option key={s} value={s}>{s}s</option>)}
    </select>
  )
}

// ── An outside number to forward to ──────────────────────────────────────────

function ForwardFields({ value, onChange, idp, when, onWhen, hoursKnown }: {
  value: ForwardTarget; onChange: (v: ForwardTarget) => void; idp: string
  when?: ForwardWhen; onWhen?: (w: ForwardWhen) => void; hoursKnown?: boolean
}) {
  const [text, setText] = useState(value.number ? formatAu(value.number) : '')
  // Follow a number set from outside (undo, a save), never what's being typed.
  useEffect(() => {
    setText(t => (value.number && auForwardNumber(t) !== value.number ? formatAu(value.number) : t))
  }, [value.number])
  const parsed = auForwardNumber(text)
  return (
    <div>
      <div className="crs-row">
        <div style={{ flex: '1 1 200px', minWidth: 0 }}>
          <label htmlFor={`${idp}-num`} style={label}>Australian mobile or landline</label>
          <input id={`${idp}-num`} value={text} inputMode="tel" placeholder="0412 345 678" autoComplete="off"
            onChange={e => { setText(e.target.value); onChange({ ...value, number: auForwardNumber(e.target.value) || '' }) }}
            aria-invalid={!!text && !parsed} style={{ ...field, borderColor: text && !parsed ? '#f59e0b' : 'var(--border)' }} />
        </div>
        <div>
          <label htmlFor={`${idp}-sec`} style={label}>Ring for</label>
          <SecondsSelect id={`${idp}-sec`} value={value.seconds} onChange={n => onChange({ ...value, seconds: n })} />
        </div>
      </div>
      <p style={{ ...hint, color: text && !parsed ? '#b45309' : 'var(--slate)', marginTop: 4 }}>
        {!text ? 'Not 13, 1300 or 1800 numbers, and not overseas.' : parsed ? `Calls go to ${formatAu(parsed)}.` : 'Enter an Australian mobile (04…) or landline with its area code (02, 03, 07, 08). Not 13, 1300, 1800 or overseas numbers.'}
      </p>
      <Check on={value.screen} onChange={v => onChange({ ...value, screen: v })}
        text="Ask the person who answers to press 1"
        sub="They hear who the call is for before it connects. Without this, the phone’s own voicemail can pick up and the call counts as answered, so it never reaches your voicemail." />
      <label htmlFor={`${idp}-cid`} style={label}>The phone shows</label>
      <select id={`${idp}-cid`} value={value.callerId} onChange={e => onChange({ ...value, callerId: e.target.value === 'caller' ? 'caller' : 'business' })} style={{ ...field, marginBottom: 4 }}>
        <option value="business">Your Colvy number (recommended)</option>
        <option value="caller">The caller’s number, when it’s an Australian number</option>
      </select>
      <p style={hint}>Your Colvy number always gets through. The caller’s own number helps you call back, but some networks may not show it; hidden and overseas callers always show your Colvy number.</p>
      {when && onWhen && (
        <>
          <p style={label}>Forward</p>
          <div role="radiogroup" aria-label="When to forward" className="crs-choices">
            <label className={`crs-choice${when === 'always' ? ' on' : ''}`}>
              <input type="radio" name={`${idp}-when`} checked={when === 'always'} onChange={() => onWhen('always')} />
              <span><b>Every call</b><span>Your team’s phones don’t ring.</span></span>
            </label>
            <label className={`crs-choice${when === 'closed' ? ' on' : ''}`} style={!hoursKnown && when !== 'closed' ? { opacity: 0.6 } : undefined}>
              <input type="radio" name={`${idp}-when`} checked={when === 'closed'} disabled={!hoursKnown && when !== 'closed'} onChange={() => onWhen('closed')} />
              <span><b>Only when you’re closed</b><span>{hoursKnown ? 'By your opening hours (Google Business Profile first). While you’re open, everyone rings at once.' : 'We can’t find your opening hours. Connect Google Business Profile to use this.'}</span></span>
            </label>
          </div>
        </>
      )}
    </div>
  )
}

// ── People in order ──────────────────────────────────────────────────────────

function OrderEditor({ value, onChange, team, idp, forwardAllowed, allowForward = true }: {
  value: RingOrder; onChange: (v: RingOrder) => void; team: Data['team']; idp: string; forwardAllowed: boolean; allowForward?: boolean
}) {
  const used = new Set(value.steps.map(s => s.userId))
  const nameOf = (id: string) => team.find(t => t.id === id)?.name || 'Someone who has left'
  const move = (i: number, d: number) => {
    const steps = [...value.steps]
    const j = i + d
    if (j < 0 || j >= steps.length) return
    ;[steps[i], steps[j]] = [steps[j], steps[i]]
    onChange({ ...value, steps })
  }
  const next = team.find(t => !used.has(t.id))
  return (
    <div>
      {value.steps.length === 0 && <p style={hint}>Add the people to ring, first to last.</p>}
      <ol style={{ listStyle: 'none', margin: '0 0 8px', padding: 0 }}>
        {value.steps.map((s, i) => (
          <li key={s.userId + i} className="crs-step">
            <span className="crs-num" aria-hidden="true">{i + 1}</span>
            <select aria-label={`Person ${i + 1}`} value={s.userId} onChange={e => onChange({ ...value, steps: value.steps.map((x, k) => k === i ? { ...x, userId: e.target.value } : x) })} style={{ ...small, flex: '1 1 140px' }}>
              {!team.some(t => t.id === s.userId) && <option value={s.userId}>{nameOf(s.userId)}</option>}
              {team.map(t => <option key={t.id} value={t.id} disabled={used.has(t.id) && t.id !== s.userId}>{t.name}</option>)}
            </select>
            <SecondsSelect aria={`Ring ${nameOf(s.userId)} for`} value={s.seconds} onChange={n => onChange({ ...value, steps: value.steps.map((x, k) => k === i ? { ...x, seconds: n } : x) })} />
            <span style={{ display: 'inline-flex', gap: 4 }}>
              <button type="button" style={iconBtn} onClick={() => move(i, -1)} disabled={i === 0} aria-label={`Move ${nameOf(s.userId)} up`}><Arrow up /></button>
              <button type="button" style={iconBtn} onClick={() => move(i, 1)} disabled={i === value.steps.length - 1} aria-label={`Move ${nameOf(s.userId)} down`}><Arrow /></button>
              <button type="button" style={iconBtn} onClick={() => onChange({ ...value, steps: value.steps.filter((_, k) => k !== i) })} aria-label={`Remove ${nameOf(s.userId)}`}><Cross /></button>
            </span>
          </li>
        ))}
      </ol>
      {next && value.steps.length < MAX_ORDER_STEPS && (
        <button type="button" style={{ ...addBtn, marginBottom: 12 }} onClick={() => onChange({ ...value, steps: [...value.steps, { userId: next.id, seconds: STEP_SECONDS.def }] })}>+ Add a person</button>
      )}
      {!team.length && <p style={warn}><Info /><span>Nobody on your team can take calls yet. Check Team permissions.</span></p>}
      <p style={hint}>Anyone offline or already on a call is skipped. Each person’s browser and the Colvy app ring together.</p>
      <div className="crs-row" style={{ alignItems: 'flex-start' }}>
        <Check on={value.thenAll} onChange={v => onChange({ ...value, thenAll: v })} text="Then ring everyone at once" />
        {value.thenAll && <SecondsSelect aria="Ring everyone for" value={value.thenAllSeconds} onChange={n => onChange({ ...value, thenAllSeconds: n })} />}
      </div>
      {allowForward && (
        <>
          <Check on={!!value.thenForward} disabled={!forwardAllowed && !value.thenForward} onChange={v => onChange({ ...value, thenForward: v ? defaultForward() : null })}
            text="Then forward to an outside number" sub={!forwardAllowed ? 'Call forwarding isn’t available on your plan.' : undefined} />
          {value.thenForward && (
            <div style={{ ...box, marginLeft: 25 }}>
              <ForwardFields idp={`${idp}-tf`} value={value.thenForward} onChange={v => onChange({ ...value, thenForward: v })} />
            </div>
          )}
        </>
      )}
    </div>
  )
}

// ── One menu action ──────────────────────────────────────────────────────────

function blankAction(type: MenuActionType): MenuAction {
  switch (type) {
    case 'ring_order': return { type, order: { ...defaultOrder(), thenAll: true } }
    case 'forward': return { type, forward: defaultForward() }
    case 'message': return { type, text: '', then: 'menu' }
    case 'sms': return { type, text: '', then: 'hangup' }
    default: return { type } as MenuAction
  }
}

function ActionFields({ value, onChange, idp, d, isDefault }: { value: MenuAction; onChange: (a: MenuAction) => void; idp: string; d: Data; isDefault?: boolean }) {
  const types = MENU_ACTIONS.filter(a => !(isDefault && a.id === 'sms'))
  return (
    <div>
      <label htmlFor={`${idp}-type`} style={label}>{isDefault ? 'When nobody presses a key (twice)' : 'What happens'}</label>
      <select id={`${idp}-type`} value={value.type} onChange={e => onChange(blankAction(e.target.value as MenuActionType))} style={{ ...field, marginBottom: 10 }}>
        {types.map(a => <option key={a.id} value={a.id} disabled={(a.id === 'forward' && !d.forwardAllowed && value.type !== 'forward')}>{a.label}{a.id === 'forward' && !d.forwardAllowed ? ' (not on your plan)' : ''}{a.id === 'ai' && !d.ai.enabled ? ' (switch it on below first)' : ''}</option>)}
      </select>
      {value.type === 'ring_order' && <OrderEditor idp={`${idp}-o`} value={value.order} onChange={o => onChange({ ...value, order: o })} team={d.team} forwardAllowed={d.forwardAllowed} />}
      {value.type === 'forward' && <ForwardFields idp={`${idp}-f`} value={value.forward} onChange={f => onChange({ ...value, forward: f })} />}
      {value.type === 'voicemail' && <p style={hint}>{isDefault ? 'The caller leaves a voicemail with your usual greeting.' : 'The caller leaves a voicemail with your usual greeting. It shows in the inbox tagged with this option’s name.'}</p>}
      {value.type === 'ai' && <p style={hint}>{d.ai.enabled ? 'The AI receptionist answers, with its usual greeting and skills.' : 'Switch the AI receptionist on below first.'}{d.ai.paused ? ' All agents are paused right now, so the caller rings everyone instead until you resume them.' : ''}</p>}
      {(value.type === 'message' || value.type === 'sms') && (
        <>
          <label htmlFor={`${idp}-text`} style={label}>{value.type === 'sms' ? 'Text to send' : 'Message (read aloud)'}</label>
          <textarea id={`${idp}-text`} value={value.text} maxLength={MAX_MESSAGE} rows={2}
            placeholder={value.type === 'sms' ? 'Book online at roxyaquarium.com.au/book' : 'We’re at 12 Smith Street, Richmond, open 9 to 5 every day.'}
            onChange={e => onChange({ ...value, text: e.target.value })} style={{ ...field, lineHeight: 1.5, resize: 'vertical', marginBottom: 4 }} />
          <p style={hint}>
            {value.type === 'sms'
              ? 'Sent once per call from your texting number, to Australian mobiles only (not landlines, hidden or overseas numbers, or anyone who has opted out). Paid for like any text.'
              : `${'{business}'} becomes your business name.`}
          </p>
          {!isDefault && (
            <>
              <label htmlFor={`${idp}-then`} style={label}>Then</label>
              <select id={`${idp}-then`} value={value.then} onChange={e => onChange({ ...value, then: e.target.value === 'hangup' ? 'hangup' : 'menu' })} style={{ ...field, marginBottom: 10 }}>
                <option value="menu">Play the menu again</option>
                <option value="hangup">End the call</option>
              </select>
            </>
          )}
        </>
      )}
    </div>
  )
}

// ── A whole menu ─────────────────────────────────────────────────────────────

function MenuEditor({ value, onChange, idp, d }: { value: Menu; onChange: (m: Menu) => void; idp: string; d: Data }) {
  const used = new Set(value.options.map(o => o.key))
  const nextKey = MENU_KEYS.find(k => !used.has(k))
  const speech = menuSpeech(value, d.businessName || 'your business')
  const [speaking, setSpeaking] = useState(false)
  const canSpeak = typeof window !== 'undefined' && 'speechSynthesis' in window
  const preview = () => {
    try {
      const s = window.speechSynthesis
      if (speaking) { s.cancel(); setSpeaking(false); return }
      const u = new SpeechSynthesisUtterance(speech)
      const voice = s.getVoices().find(v => /en-AU/i.test(v.lang)) || s.getVoices().find(v => /^en/i.test(v.lang))
      if (voice) u.voice = voice
      u.lang = 'en-AU'
      u.onend = () => setSpeaking(false)
      u.onerror = () => setSpeaking(false)
      s.cancel(); s.speak(u); setSpeaking(true)
    } catch { setSpeaking(false) }
  }
  const setOpt = (i: number, patch: Partial<Menu['options'][number]>) => onChange({ ...value, options: value.options.map((o, k) => k === i ? { ...o, ...patch } : o) })
  return (
    <div>
      <label htmlFor={`${idp}-greet`} style={label}>Greeting</label>
      <textarea id={`${idp}-greet`} value={value.greeting} maxLength={MAX_GREETING} rows={2} onChange={e => onChange({ ...value, greeting: e.target.value })}
        placeholder="Thanks for calling {business}." style={{ ...field, lineHeight: 1.5, resize: 'vertical', marginBottom: 4 }} />
      <p style={hint}>Read aloud in the same voice as your voicemail greeting. {'{business}'} becomes {d.businessName || 'your business name'}.</p>
      <Check on={value.announce} onChange={v => onChange({ ...value, announce: v })} text="Read out the options after the greeting" sub="“For Sales, press 1.” Turn off if your greeting already says them." />
      <div style={{ background: 'var(--canvas, #f8fafc)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', marginBottom: 12 }}>
        <p style={{ margin: '0 0 6px', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '.04em' }}>Callers hear</p>
        <p style={{ margin: '0 0 8px', fontSize: 13, color: 'var(--ink)', lineHeight: 1.5, overflowWrap: 'anywhere' }}>{speech || 'Nothing yet.'}</p>
        {canSpeak && speech && (
          <button type="button" onClick={preview} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '6px 11px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            <Speaker /> {speaking ? 'Stop' : 'Preview'}
          </button>
        )}
        {canSpeak && <span style={{ marginLeft: 8, fontSize: 11.5, color: 'var(--slate)' }}>Approximate: your browser’s voice, not the phone’s.</span>}
      </div>

      <p style={label}>Options</p>
      {value.options.map((o, i) => (
        <div key={o.key + i} style={box}>
          <div className="crs-row" style={{ marginBottom: 10 }}>
            <div>
              <label htmlFor={`${idp}-k${i}`} style={{ ...label, marginBottom: 4 }}>Key</label>
              <select id={`${idp}-k${i}`} value={o.key} onChange={e => setOpt(i, { key: e.target.value as MenuKey })} style={small}>
                {MENU_KEYS.map(k => <option key={k} value={k} disabled={used.has(k) && k !== o.key}>{k}</option>)}
              </select>
            </div>
            <div style={{ flex: '1 1 160px', minWidth: 0 }}>
              <label htmlFor={`${idp}-l${i}`} style={{ ...label, marginBottom: 4 }}>Name</label>
              <input id={`${idp}-l${i}`} value={o.label} maxLength={MAX_LABEL} placeholder="Sales" onChange={e => setOpt(i, { label: e.target.value })} style={field} />
            </div>
            <button type="button" style={{ ...iconBtn, alignSelf: 'flex-end' }} onClick={() => onChange({ ...value, options: value.options.filter((_, k) => k !== i) })} aria-label={`Remove option ${o.key}`}><Cross /></button>
          </div>
          <ActionFields idp={`${idp}-a${i}`} value={o.action} onChange={a => setOpt(i, { action: a })} d={d} />
        </div>
      ))}
      {nextKey && (
        <button type="button" style={{ ...addBtn, marginBottom: 14 }} onClick={() => onChange({ ...value, options: [...value.options, { key: nextKey, label: '', action: { type: 'ring_all' } }] })}>+ Add an option</button>
      )}

      <div className="crs-row" style={{ marginBottom: 6 }}>
        <div>
          <label htmlFor={`${idp}-to`} style={label}>Wait for a key</label>
          <select id={`${idp}-to`} value={value.timeout} onChange={e => onChange({ ...value, timeout: Number(e.target.value) })} style={small}>
            {(TIMEOUTS.includes(value.timeout) ? TIMEOUTS : [...TIMEOUTS, value.timeout].sort((a, b) => a - b)).filter(t => t >= MENU_TIMEOUT.min && t <= MENU_TIMEOUT.max).map(t => <option key={t} value={t}>{t} seconds</option>)}
          </select>
        </div>
      </div>
      <p style={hint}>No key or a wrong key plays the menu once more, then:</p>
      <div style={box}>
        <ActionFields idp={`${idp}-def`} value={value.defaultAction} isDefault d={d}
          onChange={a => onChange({ ...value, defaultAction: a.type === 'message' ? { ...a, then: 'hangup' } : a })} />
      </div>
    </div>
  )
}

// ── The card ─────────────────────────────────────────────────────────────────

// Calls & SMS → "Call routing": for each number, how an incoming call is
// handled before the "when nobody answers" settings above take over.
export default function CallRoutingSettings({ companyId }: { companyId: string }) {
  const [d, setD] = useState<Data | null>(null)
  const [sel, setSel] = useState('')
  const [drafts, setDrafts] = useState<Record<string, CallRouting>>({})
  const [saved, setSaved] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string; list?: string[] } | null>(null)

  useEffect(() => {
    let live = true
    authFetch(`/api/call-routing?companyId=${encodeURIComponent(companyId)}`).then(r => r.json()).then((x: Data & { error?: string }) => {
      if (!live || x.error || !Array.isArray(x.numbers)) return
      setD(x)
      setDrafts(Object.fromEntries(x.numbers.map(n => [n.phoneNumber, n.config])))
      setSaved(Object.fromEntries(x.numbers.map(n => [n.phoneNumber, JSON.stringify(n.config)])))
      setSel((x.numbers.find(n => n.supported) || x.numbers[0])?.phoneNumber || '')
    }).catch(() => {})
    // Ring time and voicemail are saved on the card above; keep the summary in step.
    const onCalls = (e: Event) => {
      const c = (e as CustomEvent<{ ringSeconds?: number; voicemailEnabled?: boolean }>).detail || {}
      setD(p => p ? { ...p, ringSeconds: c.ringSeconds ?? p.ringSeconds, voicemailEnabled: c.voicemailEnabled ?? p.voicemailEnabled } : p)
    }
    window.addEventListener('colvy:call-settings', onCalls)
    return () => { live = false; window.removeEventListener('colvy:call-settings', onCalls) }
  }, [companyId])

  const num = d?.numbers.find(n => n.phoneNumber === sel) || null
  const c = num ? drafts[num.phoneNumber] : null
  const names = useMemo(() => Object.fromEntries((d?.team || []).map(t => [t.id, t.name])), [d])
  const check = useMemo(() => d && c ? validateRouting(c, {
    members: new Set(d.team.map(t => t.id)), ownNumbers: new Set(d.numbers.map(n => n.phoneNumber)), forwardAllowed: d.forwardAllowed, aiAvailable: d.ai.enabled,
  }) : null, [d, c])

  if (!d || !d.numbers.length || !num || !c) return null
  const set = (patch: Partial<CallRouting>) => { setDrafts({ ...drafts, [num.phoneNumber]: { ...c, ...patch } }); setMsg(null) }
  const dirty = JSON.stringify(c) !== saved[num.phoneNumber]
  const problems = check && 'problems' in check ? check.problems : []
  const aiNoAnswer = d.ai.available && (d.ai.mode === 'no_answer' || (d.ai.mode === 'after_hours' && d.ai.alsoNoAnswer))
  const summary = routingSummary(c, { names, ringSeconds: d.ringSeconds, voicemailEnabled: d.voicemailEnabled, aiOnNoAnswer: aiNoAnswer })
  const editable = d.available && d.canEdit && num.supported

  const save = async () => {
    if (problems.length) { setMsg({ ok: false, text: 'Fix these first:', list: problems }); return }
    setBusy(true); setMsg(null)
    try {
      const r = await authFetch('/api/call-routing', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, phoneNumber: num.phoneNumber, config: c }) })
      const x = await r.json()
      if (!r.ok || x.error) { setMsg({ ok: false, text: x.error || 'Could not save.', list: (x.problems || []).slice(1) }); return }
      setDrafts({ ...drafts, [num.phoneNumber]: x.config })
      setSaved({ ...saved, [num.phoneNumber]: JSON.stringify(x.config) })
      setMsg({ ok: true, text: 'Saved. The next call follows it.' })
    } catch { setMsg({ ok: false, text: 'Could not reach Colvy. Try again.' }) } finally { setBusy(false) }
  }

  return (
    <div className="crs" style={{ border: '1px solid var(--border)', background: '#fff', borderRadius: 14, padding: 16, marginBottom: 18, minWidth: 0 }}>
      <style>{`
        .crs-tabs { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 14px; }
        .crs-tab { padding: 6px 12px; border-radius: 999px; border: 1px solid var(--border); background: #fff; font-size: 12.5px; font-weight: 700; color: var(--ink); cursor: pointer; }
        .crs-tab.on { border-color: var(--coral); background: var(--peach, #fff7f3); color: var(--coral); }
        .crs-choices { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 8px; margin-bottom: 14px; }
        .crs-choice { display: flex; gap: 9px; align-items: flex-start; border: 1px solid var(--border); border-radius: 11px; padding: 11px 12px; cursor: pointer; background: #fff; min-width: 0; }
        .crs-choice.on { border-color: var(--coral); background: var(--peach, #fff7f3); }
        .crs-choice input { accent-color: var(--coral); margin-top: 2px; flex-shrink: 0; }
        .crs-choice > span { min-width: 0; }
        .crs-choice b { display: block; font-size: 13.5px; font-weight: 700; color: var(--ink); }
        .crs-choice > span > span { display: block; font-size: 12px; color: var(--slate); line-height: 1.4; margin-top: 2px; }
        .crs-row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; }
        .crs-step { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 8px 0; border-bottom: 1px solid var(--border); }
        .crs-num { display: inline-flex; align-items: center; justify-content: center; width: 22px; height: 22px; border-radius: 50%; background: var(--peach, #fff7f3); color: var(--coral); font-size: 12px; font-weight: 800; flex-shrink: 0; }
        .crs button:disabled { opacity: .45; cursor: default; }
      `}</style>
      <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Call routing</p>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45 }}>
        Who an incoming call rings first. When nothing here answers, your &ldquo;When nobody answers&rdquo; settings above take over (voicemail, the missed-call text{aiNoAnswer ? ', the AI receptionist' : ''}).
      </p>

      {d.numbers.length > 1 && (
        <div className="crs-tabs" role="tablist" aria-label="Your numbers">
          {d.numbers.map(n => (
            <button key={n.phoneNumber} type="button" role="tab" aria-selected={n.phoneNumber === sel} className={`crs-tab${n.phoneNumber === sel ? ' on' : ''}`}
              onClick={() => { setSel(n.phoneNumber); setMsg(null) }}>
              {formatAu(n.phoneNumber)}{n.label ? ` · ${n.label}` : ''}
            </button>
          ))}
        </div>
      )}

      {!num.supported ? (
        <p style={warn}><Info /><span>{formatAu(num.phoneNumber)} is on Colvy’s older voice network, so its calls ring everyone at once. Ring order, forwarding and phone menus work on numbers on Colvy’s main voice network (every number Colvy sells now). Contact Colvy to move this number across.</span></p>
      ) : (
        <>
          {!d.available && <p style={warn}><Info /><span>Call routing needs a quick database update before it can be saved (COLVY_V399_CALL_ROUTING.sql). Until then, calls ring everyone at once.</span></p>}
          {d.available && !d.canEdit && <p style={warn}><Info /><span>Only the owner or an admin can change call routing.</span></p>}

          <fieldset disabled={!editable} style={{ border: 'none', margin: 0, padding: 0, minWidth: 0 }}>
            <legend style={{ ...label, padding: 0 }}>When someone calls {formatAu(num.phoneNumber)}</legend>
            <div className="crs-choices" role="radiogroup">
              {STRATEGIES.map(s => {
                const off = s.id === 'forward' && !d.forwardAllowed && c.strategy !== 'forward'
                return (
                  <label key={s.id} className={`crs-choice${c.strategy === s.id ? ' on' : ''}`} style={off ? { opacity: 0.6, cursor: 'default' } : undefined}>
                    <input type="radio" name={`crs-strategy-${num.phoneNumber}`} checked={c.strategy === s.id} disabled={off} onChange={() => set({ strategy: s.id as RingStrategy })} />
                    <span><b>{s.label}{s.id === 'simultaneous' ? ' (default)' : ''}</b><span>{off ? 'Call forwarding isn’t available on your plan.' : s.about}</span></span>
                  </label>
                )
              })}
            </div>

            {c.strategy === 'in_order' && (
              <OrderEditor idp="crs-order" value={c.order} onChange={o => set({ order: o })} team={d.team} forwardAllowed={d.forwardAllowed} />
            )}
            {c.strategy === 'forward' && (
              <ForwardFields idp="crs-fwd" value={c.forward} onChange={f => set({ forward: { ...f, when: c.forward.when } })}
                when={c.forward.when} onWhen={w => set({ forward: { ...c.forward, when: w } })} hoursKnown={d.hoursKnown} />
            )}
            {c.strategy === 'menu' && (
              <>
                {d.ai.enabled && (
                  <p style={warn}><Info /><span>
                    Your phone menu plays first, even when the AI receptionist is set to answer every call: add &ldquo;AI receptionist&rdquo; as an option to reach it.
                    {d.ai.mode === 'after_hours' ? ' Out of hours, the AI answers instead, unless you add an after-hours menu below.' : ''} Your test numbers still get the AI straight away.
                  </span></p>
                )}
                <MenuEditor idp="crs-menu" value={c.menu} onChange={m => set({ menu: m })} d={d} />
                <div style={{ borderTop: '1px solid var(--border)', margin: '14px -16px 12px', padding: '14px 16px 0' }}>
                  <Check on={c.afterHours.enabled} disabled={!d.hoursKnown && !c.afterHours.enabled}
                    onChange={v => set({ afterHours: { enabled: v, menu: c.afterHours.menu.options.length ? c.afterHours.menu : { ...defaultMenu(), greeting: 'Thanks for calling {business}. We’re closed right now.', defaultAction: { type: 'voicemail' } } } })}
                    text={<strong style={{ fontWeight: 700 }}>A different menu when you’re closed</strong>}
                    sub={d.hoursKnown ? 'By your opening hours (Google Business Profile first, including holiday hours).' : 'We can’t find your opening hours. Connect Google Business Profile to use this.'} />
                  {c.afterHours.enabled && <MenuEditor idp="crs-ah" value={c.afterHours.menu} onChange={m => set({ afterHours: { ...c.afterHours, menu: m } })} d={d} />}
                </div>
              </>
            )}
            {(c.strategy === 'in_order' || c.strategy === 'forward') && d.ai.enabled && d.ai.mode === 'always' && !d.ai.paused && (
              <p style={warn}><Info /><span>The AI receptionist is set to answer every call, so this won&rsquo;t be used until you change that below.</span></p>
            )}
            {(c.strategy === 'in_order' || c.strategy === 'forward') && d.ai.enabled && d.ai.mode === 'after_hours' && (
              <p style={warn}><Info /><span>Out of hours the AI receptionist answers first, as it does now.</span></p>
            )}
          </fieldset>

          <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', margin: '6px 0 14px', fontSize: 13, color: 'var(--ink)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>
            <Info /><span>{summary}</span>
          </div>
          {(c.strategy === 'forward' || (c.strategy === 'in_order' && c.order.thenForward)) && (
            <p style={hint}>Forwarded calls are recorded and summarised like any other call when your calls are recorded, and the forwarded minutes show on each call.</p>
          )}

          {editable && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <button type="button" onClick={save} disabled={!dirty || busy}
                style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: dirty && !busy ? 'pointer' : 'default', opacity: dirty && !busy ? 1 : 0.55 }}>
                {busy ? 'Saving…' : 'Save'}
              </button>
              {dirty && <button type="button" onClick={() => { setDrafts({ ...drafts, [num.phoneNumber]: JSON.parse(saved[num.phoneNumber]) }); setMsg(null) }}
                style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Undo changes</button>}
              {msg && <span role="status" style={{ fontSize: 12.5, color: msg.ok ? '#15803d' : '#b42318' }}>{msg.text}</span>}
            </div>
          )}
          {msg && !msg.ok && msg.list?.length ? (
            <ul style={{ margin: '8px 0 0', paddingLeft: 18, fontSize: 12.5, color: '#b42318', lineHeight: 1.5 }}>{msg.list.map((p, i) => <li key={i}>{p}</li>)}</ul>
          ) : null}
        </>
      )}
    </div>
  )
}
