'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { CK_ICON, CkHead, CkOption, CkSave, CkStyle, CkToggle } from '@/components/calls/CallKit'
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

  const note = (text: React.ReactNode) => <p className="ck-note">{CK_ICON.warn}<span>{text}</span></p>

  return (
    <section className="ck-card arc">
      <CkStyle />
      <style>{ARC_CSS}</style>
      <CkHead icon={CK_ICON.sparkle} tone="#db2777" title="AI receptionist"
        badge={<span className="ck-badge" style={{ color: status.c, background: status.b }}><i aria-hidden />{status.t}</span>}>
        Answers the phone, says it&rsquo;s an AI, and helps with opening hours, orders, stock, bookings and your AI Knowledge. If it can&rsquo;t help it takes a message and creates a call-back task. {d.voicemailEnabled ? 'Callers can press 0 for voicemail. ' : 'Voicemail is off, so a caller who presses 0 is asked to call back. '}The full conversation is saved as a note in the caller&rsquo;s conversation.
      </CkHead>
      {!d.supported ? (
        <p className="ck-note" style={{ marginTop: 0 }}>{CK_ICON.info}<span>The AI receptionist works with Twilio numbers for now. Your calls carry on as they do today.</span></p>
      ) : (
        <>
          <CkToggle on={f.enabled} onChange={v => set({ enabled: v })} title="Turn on the AI receptionist" sub={f.enabled ? undefined : 'Off: your calls ring as they do now.'} />

          <span className="ck-lbl" id="arc-when" style={{ marginTop: 18 }}>When the AI answers</span>
          <div className="ck-opts" role="radiogroup" aria-labelledby="arc-when">
            {PHONE_MODES.map(m => (
              <CkOption key={m.id} name="arc-mode" checked={f.mode === m.id} onChange={() => set({ mode: m.id })} title={m.label} sub={m.about} />
            ))}
          </div>
          {f.mode === 'after_hours' && (
            <div style={{ marginTop: 8 }}>
              <CkToggle plain on={f.alsoNoAnswer} onChange={v => set({ alsoNoAnswer: v })} title={`Also answer during opening hours when nobody picks up within ${d.ringSeconds || 25} seconds`} />
            </div>
          )}
          {f.mode === 'after_hours' && !d.hoursKnown && note(<>We can&rsquo;t tell your opening hours right now, so the AI won&rsquo;t know when you&rsquo;re closed. Connect Google Business Profile so it has your hours.</>)}
          {f.mode === 'always' && note(<>Your team&rsquo;s phones won&rsquo;t ring at all while this is on.</>)}
          {d.paused && f.mode !== 'test' && note(<>All agents are paused, so only your test numbers get the AI until you resume them.</>)}

          <div role="status" className="ck-summary">{CK_ICON.info}<span>{summary}</span></div>

          <div className="ck-gap" />
          <label htmlFor="arc-nums" className="ck-lbl">Test numbers</label>
          <input id="arc-nums" className="ck-in" value={f.numbers} onChange={e => set({ numbers: e.target.value })} placeholder="0412 345 678" />
          <p className="ck-hint">Calls from these numbers always get the AI straight away, whatever you pick above. Up to {d.maxTestNumbers}, separated by commas.</p>

          <div className="ck-sec">
            <p className="ck-sec-t">What it says and does</p>
            <label htmlFor="arc-greet" className="ck-lbl">Greeting</label>
            <textarea id="arc-greet" className="ck-in" value={f.greeting} onChange={e => set({ greeting: e.target.value })} maxLength={MAX_GREETING} rows={3} placeholder={standard} />
            <p className="ck-hint">Leave it blank for the standard greeting (shown in grey, it changes with when the AI answers). Write {'{business}'} for your business name.</p>
            {f.greeting.trim() && !greetingSaysAi(f.greeting) && note(<>Tip: say it&rsquo;s an AI assistant, so callers know who they&rsquo;re talking to.</>)}

            <span className="ck-lbl" style={{ marginTop: 18 }}>It can help with</span>
            <div className="arc-skills">
              {PHONE_SKILLS.map(sk => (
                <CkToggle key={sk.id} on={f.skills[sk.id]} onChange={v => set({ skills: { ...f.skills, [sk.id as PhoneSkill]: v } })} title={sk.label}
                  sub={sk.id === 'booking' && !d.bookable ? `${sk.about} Add an active service in Bookings first.` : sk.about} />
              ))}
            </div>

            <label htmlFor="arc-never" className="ck-lbl" style={{ marginTop: 18 }}>Never discuss</label>
            <textarea id="arc-never" className="ck-in" value={f.never} onChange={e => set({ never: e.target.value })} rows={3}
              placeholder={'Wholesale prices\nStaff rosters\nOther shops’ prices'} />
            <p className="ck-hint">One per line, up to {MAX_NEVER_LINES}. The AI politely says it can&rsquo;t help with these on the phone. Your rules and facts in Business Memory already apply.</p>
          </div>

          <div className="ck-sec">
            <p className="ck-sec-t">Call-back tasks</p>
            {!f.skills.message && <div style={{ marginBottom: 12 }}>{note(<>Taking messages is off, so the AI won&rsquo;t create call-back tasks.</>)}</div>}
            <div className="arc-rules">
              <div>
                <label htmlFor="arc-assign" className="ck-lbl">Assign to</label>
                <select id="arc-assign" className="ck-in" value={f.assigneeId} onChange={e => set({ assigneeId: e.target.value })}>
                  <option value="">Nobody (the whole team sees it)</option>
                  {(d.team || []).map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="arc-urgent" className="ck-lbl">Urgent messages</label>
                <select id="arc-urgent" className="ck-in" value={f.urgentPriority} onChange={e => set({ urgentPriority: e.target.value === 'normal' ? 'normal' : 'high' })}>
                  <option value="high">High priority</option>
                  <option value="normal">Normal priority</option>
                </select>
              </div>
              <div>
                <label htmlFor="arc-due" className="ck-lbl">Due</label>
                <select id="arc-due" className="ck-in" value={f.dueHours} onChange={e => set({ dueHours: e.target.value })}>
                  <option value="">No due time</option>
                  {DUE_HOURS.map(h => <option key={h} value={String(h)}>Within {h} hour{h === 1 ? '' : 's'} of the call</option>)}
                </select>
              </div>
            </div>
            <p className="ck-hint">Every message also alerts the team, as it does now.</p>
          </div>

          <div className="ck-sec">
            <p className="ck-sec-t">Voice</p>
            <div className="arc-rules">
              <div>
                <label htmlFor="arc-voice" className="ck-lbl">Voice</label>
                <select id="arc-voice" className="ck-in" value={f.voice} onChange={e => set({ voice: e.target.value })}>
                  {(d.voices || []).map(v => <option key={v.id} value={v.id}>{v.label}</option>)}
                </select>
              </div>
              {d.realtime && (d.sttOptions || []).length ? (
                <div>
                  <label htmlFor="arc-stt" className="ck-lbl">Speech recognition</label>
                  <select id="arc-stt" className="ck-in" value={f.stt} onChange={e => set({ stt: e.target.value })}>
                    {(d.sttOptions || []).map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                </div>
              ) : null}
            </div>
            {d.realtime && (d.sttOptions || []).length ? (
              <p className="ck-hint">
                {f.stt === 'google'
                  ? 'Doesn’t know your product names, so it can mishear them.'
                  : d.productNames
                    ? `Knows ${d.productNames.toLocaleString()} of your product names, so it hears and finds them. If a test call ends with “an application error”, switch to another option.`
                    : 'Your product names load when you save (from your connected store), so the AI can hear and find them.'}
              </p>
            ) : null}
            <p className={`arc-rt${d.realtime ? ' on' : ''}`}><i aria-hidden />
              {d.realtime
                ? 'Real-time is on. Replies start speaking as they’re written, and callers can talk over the AI.'
                : 'Real-time is off. Replies take a few seconds each. Real-time needs the voice relay server set up (see voice-server/README.md).'}
            </p>
            <p className="ck-hint">Works with Twilio numbers. Calls to Telnyx numbers carry on as they do today.</p>
          </div>

          <CkSave dirty={dirty} busy={busy} onSave={save} msg={msg} />
        </>
      )}
    </section>
  )
}

const ARC_CSS = `
.arc-skills{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}
.arc-skills .ck-row+.ck-row{margin-top:0}
.arc-rules{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}
.arc-rt{display:flex;align-items:center;gap:8px;margin:14px 0 0;font-size:13px;font-weight:500;color:var(--ck-muted)}
.arc-rt i{width:8px;height:8px;flex-shrink:0;border-radius:50%;background:#a1a1aa}
.arc-rt.on{color:#15803d}
.arc-rt.on i{background:#22c55e;box-shadow:0 0 0 3px color-mix(in srgb,#22c55e 22%,transparent)}
[data-theme="dark"] .arc-rt.on{color:#4ade80}
`
