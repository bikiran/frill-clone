'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { CALL_LANGUAGES, summaryOptions, type CallLanguageCode, type SummaryLanguage, type TranscriptView } from '@/lib/call-languages'

type Saved = { languages: CallLanguageCode[]; summary: SummaryLanguage; view: TranscriptView }

// Calls & SMS → "Call languages": the languages spoken on this business's
// calls besides English, the language call summaries and action items are
// written in, and which version of a translated transcript opens first. Calls
// in any language are transcribed; choosing one here helps recognition and
// turns on its Roman-letters version (lib/call-languages).
export default function CallLanguageSettings({ companyId }: { companyId: string }) {
  const [saved, setSaved] = useState<Saved | null>(null)
  const [f, setF] = useState<Saved | null>(null)
  const [engine, setEngine] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)

  const apply = (d: any) => {
    const v: Saved = { languages: d.languages || [], summary: d.summary || 'en', view: d.view || 'en' }
    setSaved(v); setF(v); setEngine(d.engine ?? null)
  }
  useEffect(() => {
    let live = true
    authFetch(`/api/calls/languages?companyId=${encodeURIComponent(companyId)}`).then(r => r.json())
      .then(d => { if (live && !d.error) apply(d) }).catch(() => {})
    return () => { live = false }
  }, [companyId])

  if (!f || !saved) return null
  const dirty = JSON.stringify(f) !== JSON.stringify(saved)
  const toggle = (c: CallLanguageCode) => setF(p => {
    if (!p) return p
    const languages = p.languages.includes(c) ? p.languages.filter(x => x !== c) : [...p.languages, c]
    // A summary language that was just removed falls back to English.
    return { ...p, languages, summary: summaryOptions(languages).some(o => o.value === p.summary) ? p.summary : 'en' }
  })
  const save = async () => {
    setBusy(true); setMsg(null)
    try {
      const r = await authFetch('/api/calls/languages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, ...f }) })
      const d = await r.json()
      if (!r.ok || d.error) { setMsg({ ok: false, text: d.error || 'Could not save.' }); return }
      apply(d); setMsg({ ok: true, text: 'Saved. New calls use these settings; open an older call and choose Re-transcribe to redo it.' })
    } catch { setMsg({ ok: false, text: 'Could not reach Colvy. Try again.' }) } finally { setBusy(false) }
  }

  const label: React.CSSProperties = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  const chip = (on: boolean): React.CSSProperties => ({ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 10, border: `1px solid ${on ? 'var(--coral)' : 'var(--border)'}`, background: on ? 'var(--peach)' : '#fff', cursor: 'pointer', fontSize: 13.5, color: 'var(--ink)' })
  const summaryOpts = summaryOptions(f.languages)
  const chosen = f.languages.map(c => CALL_LANGUAGES.find(l => l.code === c)!).filter(Boolean)
  const romanOnes = chosen.filter(l => l.roman)
  const views: { value: TranscriptView; label: string }[] = [
    { value: 'en', label: 'English' },
    ...(romanOnes.length ? [{ value: 'roman' as const, label: romanOnes.length === 1 ? romanOnes[0].roman! : 'Roman letters' }] : []),
    ...(chosen.length ? [{ value: 'original' as const, label: chosen.length === 1 ? chosen[0].native : 'As spoken (own script)' }] : []),
  ]
  const addable = CALL_LANGUAGES.filter(l => !f.languages.includes(l.code))

  return (
    <div style={{ border: '1px solid var(--border)', background: '#fff', borderRadius: 14, padding: 16, marginBottom: 18 }}>
      <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Call languages</p>
      <p style={{ margin: '0 0 14px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.45 }}>
        Recorded calls are transcribed and summarised in any language, even when people switch between English and another language mid-sentence. Calls that aren&rsquo;t all English are shown three ways: the language as spoken, in Roman letters, and in English.
      </p>

      <span style={label}>Languages spoken on your calls</span>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 8, alignItems: 'center' }}>
        <span style={{ ...chip(true), cursor: 'default', opacity: 0.75 }}>✓ English</span>
        {chosen.map(l => (
          <span key={l.code} style={chip(true)}>
            {l.name}{l.native !== l.name && <span style={{ color: 'var(--slate)' }}>{l.native}</span>}
            <button type="button" onClick={() => toggle(l.code)} aria-label={`Remove ${l.name}`}
              style={{ border: 'none', background: 'none', padding: '0 0 0 2px', cursor: 'pointer', color: 'var(--slate)', fontSize: 15, lineHeight: 1 }}>×</button>
          </span>
        ))}
        {addable.length > 0 && (
          <select aria-label="Add a language" value="" onChange={e => { if (e.target.value) toggle(e.target.value) }}
            style={{ padding: '8px 12px', borderRadius: 10, border: '1px dashed var(--border)', fontSize: 13.5, background: '#fff', color: 'var(--ink)', cursor: 'pointer' }}>
            <option value="">+ Add a language</option>
            {addable.map(l => <option key={l.code} value={l.code}>{l.name}{l.native !== l.name ? ` · ${l.native}` : ''}</option>)}
          </select>
        )}
      </div>
      <p style={{ margin: '0 0 14px', fontSize: 12, color: 'var(--slate)', lineHeight: 1.45 }}>Calls in other languages are still transcribed and translated. Adding one helps Colvy hear it accurately, lets you get summaries in it and, for languages people type in English letters, adds a Roman-letters version.</p>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, marginBottom: 12 }}>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <label htmlFor="cls-summary" style={label}>Write call summaries and action items in</label>
          <select id="cls-summary" value={f.summary} onChange={e => setF({ ...f, summary: e.target.value as SummaryLanguage })}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, background: '#fff' }}>
            {summaryOpts.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
        </div>
        <div style={{ flex: '1 1 220px', minWidth: 0 }}>
          <label htmlFor="cls-view" style={label}>Show translated transcripts in</label>
          <select id="cls-view" value={views.some(v => v.value === f.view) ? f.view : 'en'} onChange={e => setF({ ...f, view: e.target.value as TranscriptView })}
            style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, background: '#fff' }}>
            {views.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--slate)' }}>Anyone can switch on the call; their choice is remembered.</p>
        </div>
      </div>

      {engine !== 'gemini' && f.languages.length > 0 && (
        <p role="note" style={{ margin: '0 0 12px', fontSize: 12.5, color: '#b45309', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 9, padding: '8px 11px', lineHeight: 1.45 }}>
          {engine ? 'Calls are transcribed with a service that only partly understands these languages, and mixed English may be missed. Ask Colvy support to turn on multilingual transcription.' : 'Call transcription isn’t set up yet.'}
        </p>
      )}

      <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <button onClick={save} disabled={!dirty || busy}
          style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: dirty ? 'var(--coral)' : '#e5e7eb', color: dirty ? '#fff' : '#6b7280', fontSize: 13.5, fontWeight: 700, cursor: dirty && !busy ? 'pointer' : 'default' }}>
          {busy ? 'Saving…' : 'Save'}
        </button>
        {msg && <span role={msg.ok ? 'status' : 'alert'} style={{ fontSize: 12.5, color: msg.ok ? '#15803d' : '#dc2626' }}>{msg.text}</span>}
      </div>
    </div>
  )
}
