'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'

// Calls & SMS → "When nobody answers": how long phones ring before the call
// goes to voicemail, whether callers can leave one, and what they hear.
export default function CallAnswerSettings({ companyId }: { companyId: string }) {
  const [loaded, setLoaded] = useState(false)
  const [connected, setConnected] = useState(true)
  const [ring, setRing] = useState(25)
  const [vmOn, setVmOn] = useState(true)
  const [greeting, setGreeting] = useState('')
  const [saved, setSaved] = useState<{ ring: number; vmOn: boolean; greeting: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const apply = (d: any) => {
    setRing(d.ringSeconds); setVmOn(d.voicemailEnabled); setGreeting(d.voicemailGreeting)
    setSaved({ ring: d.ringSeconds, vmOn: d.voicemailEnabled, greeting: d.voicemailGreeting })
  }
  useEffect(() => {
    let live = true
    authFetch(`/api/calls/settings?companyId=${encodeURIComponent(companyId)}`)
      .then(r => r.json()).then(d => { if (!live) return; if (!d.error) { setConnected(d.connected !== false); apply(d) } setLoaded(true) })
      .catch(() => { if (live) setLoaded(true) })
    return () => { live = false }
  }, [companyId])

  const dirty = !!saved && (saved.ring !== ring || saved.vmOn !== vmOn || saved.greeting !== greeting)
  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await authFetch('/api/calls/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, ringSeconds: ring, voicemailEnabled: vmOn, voicemailGreeting: greeting }),
      })
      const d = await r.json()
      if (!r.ok || d.error) { setMsg({ ok: false, text: d.error || 'Could not save.' }); return }
      apply(d); setMsg({ ok: true, text: 'Saved.' })
    } catch { setMsg({ ok: false, text: 'Could not reach Colvy. Try again.' }) } finally { setBusy(false) }
  }

  if (!loaded || !connected) return null
  const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  return (
    <div style={{ border: '1px solid var(--border)', background: '#fff', borderRadius: 14, padding: 16, marginBottom: 18 }}>
      <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>When nobody answers</p>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45 }}>
        Incoming calls ring the customer&rsquo;s preferred person first, then everyone available. If nobody picks up, the caller hears your greeting and can leave a voicemail. You get a notification for missed calls and voicemails, and voicemails are transcribed.
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
