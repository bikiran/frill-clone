'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'

// Calls & SMS → "AI phone agent (test)". While testing, the agent answers
// only calls from the numbers listed here, straight away.
export default function PhoneAgentTestCard({ companyId }: { companyId: string }) {
  const [d, setD] = useState<any>(null)
  const [enabled, setEnabled] = useState(false)
  const [numbers, setNumbers] = useState('')
  const [voice, setVoice] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const apply = (x: any) => { setEnabled(!!x.enabled); setNumbers((x.testNumbers || []).join(', ')); setVoice(x.voice || '') }
  useEffect(() => {
    let live = true
    authFetch(`/api/phone-agent?companyId=${encodeURIComponent(companyId)}`).then(r => r.json())
      .then(x => { if (live && !x.error) { setD(x); apply(x) } }).catch(() => {})
    return () => { live = false }
  }, [companyId])

  if (!d) return null
  const dirty = enabled !== !!d.enabled || numbers.trim() !== (d.testNumbers || []).join(', ') || voice !== d.voice
  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await authFetch('/api/phone-agent', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, enabled, testNumbers: numbers, voice }) })
      const x = await r.json()
      if (!r.ok || x.error) { setMsg({ ok: false, text: x.error || 'Could not save.' }); return }
      setD({ ...d, ...x }); apply(x); setMsg({ ok: true, text: x.enabled ? 'Saved. Call your business number from a test number to try it.' : 'Saved.' })
    } catch { setMsg({ ok: false, text: 'Could not reach Colvy. Try again.' }) } finally { setBusy(false) }
  }
  const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  return (
    <div style={{ border: '1px solid var(--border)', background: '#fff', borderRadius: 14, padding: 16, marginBottom: 18 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
        <p style={{ margin: 0, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>AI phone agent</p>
        <span style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: '.04em', textTransform: 'uppercase', color: '#7c3aed', background: '#f3e8ff', borderRadius: 6, padding: '2px 7px' }}>Test</span>
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45 }}>
        Answers the phone, says it&rsquo;s an AI, and checks opening hours, the caller&rsquo;s orders, stock and your AI Knowledge. If it can&rsquo;t help it takes a message and creates a call-back task. Callers can press 0 for voicemail. While testing it only answers calls from the numbers below, straight away; everyone else is handled as normal. The full conversation is saved as a note in the caller&rsquo;s conversation.
      </p>
      {!d.supported ? (
        <p style={{ margin: 0, fontSize: 12.5, color: '#b45309' }}>The phone agent works with Twilio numbers for now.</p>
      ) : (
        <>
          <label style={{ display: 'flex', alignItems: 'center', gap: 9, fontSize: 13.5, color: 'var(--ink)', marginBottom: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={enabled} onChange={e => setEnabled(e.target.checked)} style={{ width: 16, height: 16, accentColor: 'var(--coral)' }} />
            Answer calls from my test numbers with the AI
          </label>
          <label htmlFor="pa-nums" style={label}>Test numbers</label>
          <input id="pa-nums" value={numbers} onChange={e => setNumbers(e.target.value)} placeholder="0412 345 678"
            style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 4 }} />
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--slate)' }}>Up to {d.maxTestNumbers}, separated by commas.</p>
          <label htmlFor="pa-voice" style={label}>Voice</label>
          <select id="pa-voice" value={voice} onChange={e => setVoice(e.target.value)}
            style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, marginBottom: 14, background: '#fff' }}>
            {(d.voices || []).map((v: any) => <option key={v.id} value={v.id}>{v.label}</option>)}
          </select>
          <p style={{ margin: '0 0 12px', fontSize: 12.5, color: d.realtime ? '#15803d' : 'var(--slate)' }}>
            {d.realtime
              ? 'Real-time: on. Replies start speaking as they’re written, and callers can talk over the AI.'
              : 'Real-time: off. Replies take a few seconds each. Real-time needs the voice relay server set up (see voice-server/README.md).'}
          </p>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
