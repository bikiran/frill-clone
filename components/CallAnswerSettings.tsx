'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { analyseSms } from '@/lib/sms-segments'
import {
  MISSED_CALL_TEXT_DEFAULT, MISSED_CALL_TEXT_MAX, renderMissedCallText, type MissedCallTextWhen,
} from '@/lib/missed-call-text-settings'

type Saved = { ring: number; vmOn: boolean; greeting: string; textOn: boolean; textMsg: string; textWhen: MissedCallTextWhen }
type Hours = { known: boolean; source?: string; summary?: string }

// Calls & SMS → "When nobody answers": how long phones ring before the call
// goes to voicemail, whether callers can leave one, and what they hear. Then the
// missed-call text back: whether a caller nobody answered gets a text, what it
// says (with a live preview), and whether only while the business is closed.
export default function CallAnswerSettings({ companyId }: { companyId: string }) {
  const [loaded, setLoaded] = useState(false)
  const [connected, setConnected] = useState(true)
  const [ring, setRing] = useState(25)
  const [vmOn, setVmOn] = useState(true)
  const [greeting, setGreeting] = useState('')
  const [textOn, setTextOn] = useState(false)
  const [textMsg, setTextMsg] = useState(MISSED_CALL_TEXT_DEFAULT)
  const [textWhen, setTextWhen] = useState<MissedCallTextWhen>('always')
  const [business, setBusiness] = useState('')
  const [hours, setHours] = useState<Hours>({ known: false })
  const [smsReady, setSmsReady] = useState(true)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const apply = (d: any) => {
    const t = d.missedCallText || {}
    const next: Saved = {
      ring: d.ringSeconds, vmOn: d.voicemailEnabled, greeting: d.voicemailGreeting,
      textOn: t.enabled === true, textMsg: t.message || MISSED_CALL_TEXT_DEFAULT, textWhen: t.when === 'after_hours' ? 'after_hours' : 'always',
    }
    setRing(next.ring); setVmOn(next.vmOn); setGreeting(next.greeting)
    setTextOn(next.textOn); setTextMsg(next.textMsg); setTextWhen(next.textWhen)
    setSaved(next)
  }
  useEffect(() => {
    let live = true
    authFetch(`/api/calls/settings?companyId=${encodeURIComponent(companyId)}`)
      .then(r => r.json()).then(d => {
        if (!live) return
        if (!d.error) {
          setConnected(d.connected !== false); apply(d)
          setBusiness(d.businessName || ''); setHours(d.hours || { known: false }); setSmsReady(d.smsReady !== false)
        }
        setLoaded(true)
      })
      .catch(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [companyId])

  const dirty = !!saved && (saved.ring !== ring || saved.vmOn !== vmOn || saved.greeting !== greeting
    || saved.textOn !== textOn || saved.textMsg !== textMsg || saved.textWhen !== textWhen)
  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await authFetch('/api/calls/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId, ringSeconds: ring, voicemailEnabled: vmOn, voicemailGreeting: greeting,
          missedCallText: { enabled: textOn, message: textMsg, when: textWhen },
        }),
      })
      const d = await r.json()
      if (!r.ok || d.error) { setMsg({ ok: false, text: d.error || 'Could not save.' }); return }
      apply(d); setMsg({ ok: true, text: 'Saved.' })
      // The AI receptionist card's summary mentions the ring time.
      try { window.dispatchEvent(new CustomEvent('colvy:call-settings', { detail: { ringSeconds: d.ringSeconds, voicemailEnabled: d.voicemailEnabled } })) } catch {}
    } catch { setMsg({ ok: false, text: 'Could not reach Colvy. Try again.' }) } finally { setBusy(false) }
  }

  if (!loaded || !connected) return null
  const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  const preview = renderMissedCallText(textMsg, business)
  const seg = analyseSms(preview)
  const afterHoursOff = !hours.known && textWhen !== 'after_hours'
  return (
    <div style={{ border: '1px solid var(--border)', background: '#fff', borderRadius: 14, padding: 16, marginBottom: 18 }}>
      <style>{`
        .cas-text { display: flex; flex-wrap: wrap; gap: 16px; align-items: flex-start; }
        .cas-text > div { flex: 1 1 260px; min-width: 0; }
        .cas-when { display: flex; gap: 9px; align-items: flex-start; padding: 9px 11px; border: 1px solid var(--border); border-radius: 10px; cursor: pointer; }
        .cas-when[data-on="1"] { border-color: var(--coral); background: var(--peach); }
        .cas-when[data-off="1"] { cursor: default; opacity: .6; }
      `}</style>
      <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>When nobody answers</p>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45 }}>
        Incoming calls ring the customer&rsquo;s preferred person first, then everyone available. If nobody picks up, the caller hears your greeting and can leave a voicemail (or the AI receptionist answers, if you&rsquo;ve set it to below). You get a notification for missed calls and voicemails, and voicemails are transcribed.
      </p>

      <label htmlFor="cas-ring" style={label}>Ring for</label>
      <select id="cas-ring" value={ring} onChange={e => setRing(Number(e.target.value))}
        style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, background: '#fff' }}>
        {[20, 25, 30, 40, 50, 60].map(s => <option key={s} value={s}>{s} seconds</option>)}
      </select>

      <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--ink)', marginBottom: 12, cursor: 'pointer' }}>
        <input type="checkbox" checked={vmOn} onChange={e => setVmOn(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--coral)' }} />
        Let callers leave a voicemail
      </label>

      {vmOn ? (
        <>
          <label htmlFor="cas-greeting" style={label}>Voicemail greeting</label>
          <textarea id="cas-greeting" value={greeting} onChange={e => setGreeting(e.target.value)} maxLength={500} rows={3}
            placeholder="Hi, you've reached Roxy Aquarium. Sorry we missed you — leave your name, number and what it's about and we'll call you back."
            style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', marginBottom: 4 }} />
          <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--slate)' }}>Read aloud to the caller. Messages can be up to 3 minutes.</p>
        </>
      ) : (
        <p style={{ margin: '0 0 14px', fontSize: 12.5, color: '#b45309' }}>Unanswered calls end after ringing. You still get a missed-call notification.</p>
      )}

      {/* ── Missed-call text back ── */}
      <div style={{ borderTop: '1px solid var(--border)', margin: '4px -16px 14px', padding: '14px 16px 0' }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer' }}>
          <input type="checkbox" checked={textOn} onChange={e => setTextOn(e.target.checked)} style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--coral)', flexShrink: 0 }} />
          <span>
            <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>Text back missed calls</span>
            <span style={{ display: 'block', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45, marginTop: 2 }}>
              When nobody picks up, the caller gets one text from your number so they can reply instead of trying someone else. Their reply lands in the same conversation as the call.
            </span>
          </span>
        </label>

        {textOn && (
          <div style={{ marginTop: 14 }}>
            {!smsReady && (
              <p role="alert" style={{ margin: '0 0 12px', fontSize: 12.5, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '8px 11px' }}>
                Texting isn&rsquo;t set up on your number yet, so nothing will be sent until it is.
              </p>
            )}
            <div className="cas-text">
              <div>
                <label htmlFor="cas-text-msg" style={label}>Message</label>
                <textarea id="cas-text-msg" value={textMsg} onChange={e => setTextMsg(e.target.value)} maxLength={MISSED_CALL_TEXT_MAX} rows={4}
                  style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, fontFamily: 'inherit', lineHeight: 1.5, resize: 'vertical', marginBottom: 4 }} />
                <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.45 }}>
                  <code style={{ fontSize: 11.5, background: 'var(--canvas)', padding: '1px 5px', borderRadius: 5 }}>{'{business}'}</code> becomes {business || 'your business name'}.
                  {textMsg !== MISSED_CALL_TEXT_DEFAULT && (
                    <> <button type="button" onClick={() => setTextMsg(MISSED_CALL_TEXT_DEFAULT)}
                      style={{ border: 'none', background: 'none', padding: 0, color: 'var(--coral)', fontWeight: 700, fontSize: 12, cursor: 'pointer' }}>Use the suggested text</button></>
                  )}
                </p>

                <p style={label}>Send it</p>
                <div role="radiogroup" aria-label="When to send the text" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label className="cas-when" data-on={textWhen === 'always' ? '1' : '0'}>
                    <input type="radio" name="cas-when" checked={textWhen === 'always'} onChange={() => setTextWhen('always')} style={{ marginTop: 2, accentColor: 'var(--coral)' }} />
                    <span style={{ fontSize: 13, color: 'var(--ink)' }}>For every missed call</span>
                  </label>
                  <label className="cas-when" data-on={textWhen === 'after_hours' ? '1' : '0'} data-off={afterHoursOff ? '1' : '0'}>
                    <input type="radio" name="cas-when" checked={textWhen === 'after_hours'} disabled={afterHoursOff} onChange={() => setTextWhen('after_hours')} style={{ marginTop: 2, accentColor: 'var(--coral)' }} />
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13, color: 'var(--ink)' }}>Only when you&rsquo;re closed</span>
                      <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)', lineHeight: 1.45, marginTop: 2 }}>
                        {hours.known
                          ? <>Uses your opening hours from {hours.source}{hours.summary ? `: ${hours.summary}` : ''}.</>
                          : <>We couldn&rsquo;t find your opening hours. Connect your Google Business Profile to use this.</>}
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              {/* What the caller sees on their phone. */}
              <div>
                <p style={label}>Preview</p>
                <div style={{ background: 'var(--canvas)', border: '1px solid var(--border)', borderRadius: 14, padding: '14px 12px' }}>
                  <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 700, color: 'var(--slate)', textAlign: 'center' }}>{business || 'Your business'}</p>
                  <div style={{ maxWidth: '85%', background: '#e5e7eb', color: '#111827', borderRadius: '16px 16px 16px 4px', padding: '9px 12px', fontSize: 13.5, lineHeight: 1.45, whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
                    {preview}
                  </div>
                </div>
                <p style={{ margin: '6px 0 0', fontSize: 12, color: seg.segments > 1 ? '#b45309' : 'var(--slate)', lineHeight: 1.45 }}>
                  {seg.segments > 1 ? `Sends as ${seg.segments} text messages` : 'Sends as 1 text message'} · {preview.length} characters
                </p>
              </div>
            </div>
            <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--slate)', lineHeight: 1.45 }}>
              Each caller gets at most one text every 12 hours. Never sent when someone answered, to hidden or overseas numbers, landlines, your team, or anyone who has opted out.
            </p>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <button type="button" onClick={save} disabled={!dirty || busy}
          style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: dirty && !busy ? 'pointer' : 'default', opacity: dirty && !busy ? 1 : 0.55 }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg && <span role="status" style={{ fontSize: 12.5, color: msg.ok ? '#15803d' : '#b42318' }}>{msg.text}</span>}
      </div>
    </div>
  )
}
