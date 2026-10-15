'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import {
  PHONE_MODES, PHONE_SKILLS, DUE_HOURS, MAX_GREETING, MAX_NEVER_LINES, defaultGreeting, greetingSaysAi, receptionistSummary,
  type PhoneMode, type PhoneSkill, type PhoneSkills,
} from '@/lib/phone-receptionist'

// Calls & SMS → "AI receptionist". The owner decides when the AI answers
// (test numbers only, out of hours, when nobody picks up, or always), what it
// says first, what it can help with, what it never discusses and how its
// call-back tasks are filed. Everything starts as it was: test numbers only.

type Form = {
  enabled: boolean; numbers: string; voice: string; stt: string
  mode: PhoneMode; alsoNoAnswer: boolean; greeting: string; skills: PhoneSkills; never: string
  assigneeId: string; urgentPriority: 'high' | 'normal'; dueHours: string
}

// What /api/phone-agent sends: the saved settings plus what the card needs to explain them.
type Option = { id: string; label: string }
type Data = {
  enabled: boolean; testNumbers: string[]; voice: string; stt: string; mode: PhoneMode; alsoNoAnswer: boolean; greeting: string
  skills: PhoneSkills; neverDiscuss: string[]; tasks: { assigneeId: string | null; urgentPriority: 'high' | 'normal'; dueHours: number | null }
  voices: Option[]; sttOptions: Option[]; maxTestNumbers: number; supported: boolean; realtime: boolean; productNames: number
  companyName: string; ringSeconds: number; voicemailEnabled: boolean; paused: boolean; bookable: boolean; hoursKnown: boolean
  team: { id: string; name: string }[]
}

const toForm = (x: Data): Form => ({
  enabled: !!x.enabled, numbers: (x.testNumbers || []).join(', '), voice: x.voice || '', stt: x.stt || '',
  mode: x.mode || 'test', alsoNoAnswer: !!x.alsoNoAnswer, greeting: x.greeting || '', skills: { ...x.skills }, never: (x.neverDiscuss || []).join('\n'),
  assigneeId: x.tasks?.assigneeId || '', urgentPriority: x.tasks?.urgentPriority === 'normal' ? 'normal' : 'high', dueHours: x.tasks?.dueHours ? String(x.tasks.dueHours) : '',
})

const Info = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ flexShrink: 0, marginTop: 1 }}>
    <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
)

export default function AiReceptionistCard({ companyId }: { companyId: string }) {
  const [d, setD] = useState<Data | null>(null)
  const [f, setF] = useState<Form | null>(null)
  const [saved, setSaved] = useState<Form | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const apply = (x: Data) => { const v = toForm(x); setF(v); setSaved(v) }
  useEffect(() => {
    let live = true
    authFetch(`/api/phone-agent?companyId=${encodeURIComponent(companyId)}`).then(r => r.json())
      .then(x => { if (live && !x.error) { setD(x); apply(x) } }).catch(() => {})
    // The ring time and voicemail are saved on the card above; keep the summary in step.
    const onCalls = (e: Event) => {
      const c = (e as CustomEvent<{ ringSeconds?: number; voicemailEnabled?: boolean }>).detail || {}
      setD(p => p ? { ...p, ringSeconds: c.ringSeconds ?? p.ringSeconds, voicemailEnabled: c.voicemailEnabled ?? p.voicemailEnabled } : p)
    }
    window.addEventListener('colvy:call-settings', onCalls)
    return () => { live = false; window.removeEventListener('colvy:call-settings', onCalls) }
  }, [companyId])

  if (!d || !f) return null
  const set = (patch: Partial<Form>) => setF({ ...f, ...patch })
  const dirty = JSON.stringify(f) !== JSON.stringify(saved)
  const testNumbers = f.numbers.split(/[,\n]/).map(n => n.trim()).filter(n => n.replace(/\D/g, '').length >= 8)
  const summary = receptionistSummary({ enabled: f.enabled, testNumbers, mode: f.mode, alsoNoAnswer: f.alsoNoAnswer }, { ringSeconds: d.ringSeconds, paused: d.paused, voicemailEnabled: d.voicemailEnabled })
  const standard = defaultGreeting(d.companyName || 'your business', { reason: f.mode === 'test' ? 'no_answer' : f.mode, skills: f.skills, bookable: !!d.bookable })
  const status = !saved?.enabled ? { t: 'Off', c: '#475569', b: '#f1f5f9' } : saved.mode === 'test' ? { t: 'Test', c: '#7c3aed', b: '#f3e8ff' } : { t: 'Live', c: '#15803d', b: '#dcfce7' }

  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await authFetch('/api/phone-agent', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, enabled: f.enabled, testNumbers: f.numbers, voice: f.voice, stt: f.stt,
          mode: f.mode, alsoNoAnswer: f.alsoNoAnswer, greeting: f.greeting, skills: f.skills, neverDiscuss: f.never,
          tasks: { assigneeId: f.assigneeId || null, urgentPriority: f.urgentPriority, dueHours: f.dueHours ? Number(f.dueHours) : null },
        }),
      })
      const x = await r.json()
      if (!r.ok || x.error) { setMsg({ ok: false, text: x.error || 'Could not save.' }); return }
      setD({ ...d, ...x }); apply(x)
      setMsg({ ok: true, text: x.enabled ? (x.mode === 'test' ? 'Saved. Call your business number from a test number to try it.' : 'Saved. The AI receptionist is live.') : 'Saved.' })
    } catch { setMsg({ ok: false, text: 'Could not reach Colvy. Try again.' }) } finally { setBusy(false) }
  }

  const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  const hint: React.CSSProperties = { margin: '0 0 14px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.45 }
  const warn: React.CSSProperties = { display: 'flex', gap: 7, margin: '0 0 12px', fontSize: 12.5, color: '#b45309', lineHeight: 1.45 }
  const field: React.CSSProperties = { width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, background: '#fff', fontFamily: 'inherit' }
  const section: React.CSSProperties = { margin: '18px 0 8px', paddingTop: 14, borderTop: '1px solid var(--border)', fontSize: 13, fontWeight: 800, color: 'var(--ink)' }
  const check = (on: boolean, onChange: (v: boolean) => void, text: React.ReactNode, sub?: React.ReactNode, disabled?: boolean) => (
    <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: 13.5, color: 'var(--ink)', marginBottom: 10, cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.6 : 1 }}>
      <input type="checkbox" checked={on} disabled={disabled} onChange={e => onChange(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, flexShrink: 0, accentColor: 'var(--coral)' }} />
      <span style={{ minWidth: 0 }}>{text}{sub ? <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)', marginTop: 2, lineHeight: 1.4 }}>{sub}</span> : null}</span>
    </label>
  )

  return (
    <div className="arc" style={{ border: '1px solid var(--border)', background: '#fff', borderRadius: 14, padding: 16, marginBottom: 18 }}>
      <style>{`
        .arc-modes { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; margin-bottom: 12px; }
        .arc-mode { display: flex; gap: 9px; align-items: flex-start; border: 1px solid var(--border); border-radius: 11px; padding: 11px 12px; cursor: pointer; background: #fff; min-width: 0; }
        .arc-mode.on { border-color: var(--coral); background: var(--peach, #fff7f3); }
        .arc-mode input { accent-color: var(--coral); margin-top: 2px; flex-shrink: 0; }
        .arc-rules { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 10px; margin-bottom: 6px; }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>AI receptionist</p>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: status.c, background: status.b, borderRadius: 6, padding: '2px 7px' }}>{status.t}</span>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45 }}>
        Answers the phone, says it&rsquo;s an AI, and helps with opening hours, orders, stock, bookings and your AI Knowledge. If it can&rsquo;t help it takes a message and creates a call-back task. Callers can press 0 for voicemail. The full conversation is saved as a note in the caller&rsquo;s conversation.
      </p>
      {!d.supported ? (
        <p style={{ margin: 0, fontSize: 12.5, color: '#b45309' }}>The AI receptionist works with Twilio numbers for now. Your calls carry on as they do today.</p>
      ) : (
        <>
          {check(f.enabled, v => set({ enabled: v }), <strong style={{ fontWeight: 700 }}>Turn on the AI receptionist</strong>)}

          <p style={{ ...label, marginTop: 4 }} id="arc-when">When the AI answers</p>
          <div className="arc-modes" role="radiogroup" aria-labelledby="arc-when">
            {PHONE_MODES.map(m => (
              <label key={m.id} className={`arc-mode${f.mode === m.id ? ' on' : ''}`}>
                <input type="radio" name="arc-mode" value={m.id} checked={f.mode === m.id} onChange={() => set({ mode: m.id })} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{m.label}</span>
                  <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)', lineHeight: 1.4, marginTop: 2 }}>{m.about}</span>
                </span>
              </label>
            ))}
          </div>
          {f.mode === 'after_hours' && check(f.alsoNoAnswer, v => set({ alsoNoAnswer: v }), `Also answer during opening hours when nobody picks up within ${d.ringSeconds || 25} seconds`)}
          {f.mode === 'after_hours' && !d.hoursKnown && (
            <p style={warn}><Info /><span>We can&rsquo;t tell your opening hours right now, so the AI won&rsquo;t know when you&rsquo;re closed. Connect Google Business Profile so it has your hours.</span></p>
          )}
          {f.mode === 'always' && <p style={warn}><Info /><span>Your team&rsquo;s phones won&rsquo;t ring at all while this is on.</span></p>}
          {d.paused && f.mode !== 'test' && <p style={warn}><Info /><span>All agents are paused, so only your test numbers get the AI until you resume them.</span></p>}

          <div role="status" style={{ display: 'flex', gap: 8, alignItems: 'flex-start', background: '#f8fafc', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px', margin: '2px 0 14px', fontSize: 13, color: 'var(--ink)', lineHeight: 1.45 }}>
            <Info /><span>{summary}</span>
          </div>

          <label htmlFor="arc-nums" style={label}>Test numbers</label>
          <input id="arc-nums" value={f.numbers} onChange={e => set({ numbers: e.target.value })} placeholder="0412 345 678" style={{ ...field, marginBottom: 4 }} />
          <p style={hint}>Calls from these numbers always get the AI straight away, whatever you pick above. Up to {d.maxTestNumbers}, separated by commas.</p>

          <p style={section}>What it says and does</p>
          <label htmlFor="arc-greet" style={label}>Greeting</label>
          <textarea id="arc-greet" value={f.greeting} onChange={e => set({ greeting: e.target.value })} maxLength={MAX_GREETING} rows={3} placeholder={standard}
            style={{ ...field, lineHeight: 1.5, resize: 'vertical', marginBottom: 4 }} />
          <p style={hint}>Leave it blank for the standard greeting (shown in grey, it changes with when the AI answers). Write {'{business}'} for your business name.</p>
          {f.greeting.trim() && !greetingSaysAi(f.greeting) && (
            <p style={warn}><Info /><span>Tip: say it&rsquo;s an AI assistant, so callers know who they&rsquo;re talking to.</span></p>
          )}

          <p style={label}>It can help with</p>
          {PHONE_SKILLS.map(s => (
            <div key={s.id}>
              {check(f.skills[s.id], v => set({ skills: { ...f.skills, [s.id as PhoneSkill]: v } }), s.label,
                s.id === 'booking' && !d.bookable ? `${s.about} Add an active service in Bookings first.` : s.about)}
            </div>
          ))}

          <label htmlFor="arc-never" style={{ ...label, marginTop: 6 }}>Never discuss</label>
          <textarea id="arc-never" value={f.never} onChange={e => set({ never: e.target.value })} rows={3}
            placeholder={'Wholesale prices\nStaff rosters\nOther shops’ prices'}
            style={{ ...field, lineHeight: 1.5, resize: 'vertical', marginBottom: 4 }} />
          <p style={hint}>One per line, up to {MAX_NEVER_LINES}. The AI politely says it can&rsquo;t help with these on the phone. Your rules and facts in Business Memory already apply.</p>

          <p style={section}>Call-back tasks</p>
          {!f.skills.message && <p style={warn}><Info /><span>Taking messages is off, so the AI won&rsquo;t create call-back tasks.</span></p>}
          <div className="arc-rules">
            <div>
              <label htmlFor="arc-assign" style={label}>Assign to</label>
              <select id="arc-assign" value={f.assigneeId} onChange={e => set({ assigneeId: e.target.value })} style={field}>
                <option value="">Nobody (the whole team sees it)</option>
                {(d.team || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="arc-urgent" style={label}>Urgent messages</label>
              <select id="arc-urgent" value={f.urgentPriority} onChange={e => set({ urgentPriority: e.target.value === 'normal' ? 'normal' : 'high' })} style={field}>
                <option value="high">High priority</option>
                <option value="normal">Normal priority</option>
              </select>
            </div>
            <div>
              <label htmlFor="arc-due" style={label}>Due</label>
              <select id="arc-due" value={f.dueHours} onChange={e => set({ dueHours: e.target.value })} style={field}>
                <option value="">No due time</option>
                {DUE_HOURS.map(h => <option key={h} value={String(h)}>Within {h} hour{h === 1 ? '' : 's'} of the call</option>)}
              </select>
            </div>
          </div>
          <p style={hint}>Every message also alerts the team, as it does now.</p>

          <p style={section}>Voice</p>
          <label htmlFor="arc-voice" style={label}>Voice</label>
          <select id="arc-voice" value={f.voice} onChange={e => set({ voice: e.target.value })} style={{ ...field, width: 'auto', maxWidth: '100%', marginBottom: 14 }}>
            {(d.voices || []).map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          {d.realtime && (d.sttOptions || []).length ? (
            <>
              <label htmlFor="arc-stt" style={label}>Speech recognition</label>
              <select id="arc-stt" value={f.stt} onChange={e => set({ stt: e.target.value })} style={{ ...field, width: 'auto', maxWidth: '100%', marginBottom: 4 }}>
                {(d.sttOptions || []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
              </select>
              <p style={hint}>
                {f.stt === 'google'
                  ? 'Doesn’t know your product names, so it can mishear them.'
                  : d.productNames
                    ? `Knows ${d.productNames.toLocaleString()} of your product names, so it hears and finds them. If a test call ends with “an application error”, switch to another option.`
                    : 'Your product names load when you save (from your connected store), so the AI can hear and find them.'}
              </p>
            </>
          ) : null}
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: d.realtime ? '#15803d' : 'var(--slate)' }}>
            {d.realtime
              ? 'Real-time: on. Replies start speaking as they’re written, and callers can talk over the AI.'
              : 'Real-time: off. Replies take a few seconds each. Real-time needs the voice relay server set up (see voice-server/README.md).'}
          </p>
          <p style={{ ...hint, marginBottom: 12 }}>Works with Twilio numbers. Calls to Telnyx numbers carry on as they do today.</p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <button type="button" onClick={save} disabled={!dirty || busy}
              style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: dirty && !busy ? 'pointer' : 'default', opacity: dirty && !busy ? 1 : 0.55 }}>
              {busy ? 'Saving…' : 'Save'}
            </button>
            {msg && <span role="status" style={{ fontSize: 12.5, color: msg.ok ? '#15803d' : '#b42318' }}>{msg.text}</span>}
          </div>
        </>
      )}
    </div>
  )
}
