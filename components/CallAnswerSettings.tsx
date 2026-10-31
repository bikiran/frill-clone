'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { analyseSms } from '@/lib/sms-segments'
import { CK_ICON, CkHead, CkOption, CkSave, CkStyle, CkToggle } from '@/components/calls/CallKit'
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
  const preview = renderMissedCallText(textMsg, business)
  const seg = analyseSms(preview)
  const afterHoursOff = !hours.known && textWhen !== 'after_hours'
  const RINGS = [20, 25, 30, 40, 50, 60]
  return (
    <section className="ck-card cas">
      <CkStyle />
      <style>{CAS_CSS}</style>
      <CkHead icon={CK_ICON.voicemail} tone="#7c3aed" title="When nobody answers">
        Calls ring your team as set under Call routing. If nobody picks up, the caller hears your greeting and can leave a voicemail (or the AI receptionist answers, if you&rsquo;ve set it to). You&rsquo;re notified of missed calls and voicemails, and voicemails are transcribed.
      </CkHead>

      <span className="ck-lbl" id="cas-ring">Ring for</span>
      <div className="ck-chips" role="radiogroup" aria-labelledby="cas-ring">
        {(RINGS.includes(ring) ? RINGS : [...RINGS, ring].sort((x, y) => x - y)).map(sec => (
          <button key={sec} type="button" role="radio" aria-checked={ring === sec} className={`ck-chip${ring === sec ? ' on' : ''}`} onClick={() => setRing(sec)}>{sec} sec</button>
        ))}
      </div>

      <div className="ck-gap" />
      <CkToggle on={vmOn} onChange={setVmOn} title="Let callers leave a voicemail"
        sub={vmOn ? 'Read your greeting, then record up to 3 minutes.' : 'Unanswered calls end after ringing. You still get a missed-call notification.'} />
      {vmOn && (
        <div className="cas-in">
          <label htmlFor="cas-greeting" className="ck-lbl">Voicemail greeting</label>
          <textarea id="cas-greeting" className="ck-in" value={greeting} onChange={e => setGreeting(e.target.value)} maxLength={500} rows={3}
            placeholder="Hi, you've reached Roxy Aquarium. Sorry we missed you — leave your name, number and what it's about and we'll call you back." />
          <p className="ck-hint">Read aloud to the caller.</p>
        </div>
      )}

      {/* ── Missed-call text back ── */}
      <div className="ck-sec">
        <CkToggle on={textOn} onChange={setTextOn} title="Text back missed calls"
          sub="When nobody picks up, the caller gets one text from your number so they can reply instead of trying someone else. Their reply lands in the same conversation as the call." />

        {textOn && (
          <div className="cas-in">
            {!smsReady && (
              <p role="alert" className="ck-note" style={{ marginTop: 0, marginBottom: 14 }}>{CK_ICON.warn}<span>Texting isn&rsquo;t set up on your number yet, so nothing will be sent until it is.</span></p>
            )}
            <div className="cas-text">
              <div>
                <label htmlFor="cas-text-msg" className="ck-lbl">Message</label>
                <textarea id="cas-text-msg" className="ck-in" value={textMsg} onChange={e => setTextMsg(e.target.value)} maxLength={MISSED_CALL_TEXT_MAX} rows={4} />
                <p className="ck-hint">
                  <code className="cas-code">{'{business}'}</code> becomes {business || 'your business name'}.
                  {textMsg !== MISSED_CALL_TEXT_DEFAULT && (
                    <> <button type="button" className="cas-link" onClick={() => setTextMsg(MISSED_CALL_TEXT_DEFAULT)}>Use the suggested text</button></>
                  )}
                </p>

                <span className="ck-lbl" id="cas-when" style={{ marginTop: 16 }}>Send it</span>
                <div className="ck-opts cas-when" role="radiogroup" aria-labelledby="cas-when">
                  <CkOption name="cas-when" checked={textWhen === 'always'} onChange={() => setTextWhen('always')} title="For every missed call" />
                  <CkOption name="cas-when" checked={textWhen === 'after_hours'} disabled={afterHoursOff} onChange={() => setTextWhen('after_hours')} title="Only when you’re closed"
                    sub={hours.known
                      ? <>Uses your opening hours from {hours.source}{hours.summary ? `: ${hours.summary}` : ''}.</>
                      : <>We couldn&rsquo;t find your opening hours. Connect your Google Business Profile to use this.</>} />
                </div>
              </div>

              {/* What the caller sees on their phone. */}
              <div>
                <span className="ck-lbl">Preview</span>
                <div className="cas-phone">
                  <span className="cas-phone-from"><i aria-hidden>{(business || 'Y').slice(0, 1).toUpperCase()}</i>{business || 'Your business'}</span>
                  <div className="cas-bubble">{preview}</div>
                  <span className="cas-phone-meta">Text message · now</span>
                </div>
                <p className="ck-hint" style={seg.segments > 1 ? { color: '#b45309' } : undefined}>
                  {seg.segments > 1 ? `Sends as ${seg.segments} text messages` : 'Sends as 1 text message'} · {preview.length} characters
                </p>
              </div>
            </div>
            <p className="ck-note info">{CK_ICON.info}<span>Each caller gets at most one text every 12 hours. Never sent when someone answered, to hidden or overseas numbers, landlines, your team, or anyone who has opted out.</span></p>
          </div>
        )}
      </div>

      <CkSave dirty={dirty} busy={busy} onSave={save} msg={msg} />
    </section>
  )
}

const CAS_CSS = `
.cas-in{margin-top:14px}
.cas-text{display:flex;flex-wrap:wrap;gap:20px;align-items:flex-start}
.cas-text>div{flex:1 1 280px;min-width:0}
.cas-when{grid-template-columns:1fr}
.cas-code{font-size:12px;padding:1px 6px;border-radius:6px;background:var(--ck-fill)}
.cas-link{padding:0;border:0;background:none;font:inherit;font-weight:650;color:var(--coral);cursor:pointer}
.cas-phone{display:flex;flex-direction:column;gap:8px;padding:16px 14px 14px;border-radius:24px;background:var(--ck-soft);box-shadow:inset 0 0 0 1px var(--ck-line)}
.cas-phone-from{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:12px;font-weight:600;color:var(--ck-muted)}
.cas-phone-from i{width:34px;height:34px;border-radius:50%;background:linear-gradient(160deg,#a1a1aa,#71717a);color:#fff;font-style:normal;font-size:14px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.cas-bubble{align-self:flex-start;max-width:88%;padding:10px 13px;border-radius:20px 20px 20px 6px;background:var(--ck-fill-2);font-size:14px;line-height:1.45;color:var(--ink);white-space:pre-wrap;overflow-wrap:anywhere}
.cas-phone-meta{font-size:11px;color:var(--ck-muted);padding-left:4px}
`
