'use client'

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { CK_ICON, CkHead, CkSave, CkStyle } from '@/components/calls/CallKit'
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
    <section className="ck-card">
      <CkStyle />
      <style>{CLS_CSS}</style>
      <CkHead icon={CK_ICON.globe} tone="#0891b2" title="Call languages">
        Calls are transcribed and summarised in any language, even when people switch between English and another language mid-sentence. Calls that aren&rsquo;t all English are shown three ways: as spoken, in Roman letters, and in English.
      </CkHead>

      <span className="ck-lbl">Languages spoken on your calls</span>
      <div className="ck-chips">
        <span className="ck-chip on static">English</span>
        {chosen.map(l => (
          <span key={l.code} className="ck-chip on static">
            {l.name}{l.native !== l.name && <small>{l.native}</small>}
            <button type="button" className="ck-chip-x" onClick={() => toggle(l.code)} aria-label={`Remove ${l.name}`}>{CK_ICON.x}</button>
          </span>
        ))}
        {addable.length > 0 && (
          <select aria-label="Add a language" className="cls-add" value="" onChange={e => { if (e.target.value) toggle(e.target.value) }}>
            <option value="">+ Add a language</option>
            {addable.map(l => <option key={l.code} value={l.code}>{l.name}{l.native !== l.name ? ` · ${l.native}` : ''}</option>)}
          </select>
        )}
      </div>
      <p className="ck-hint">Calls in other languages are still transcribed and translated. Adding one helps Colvy hear it accurately, lets you get summaries in it and, for languages people type in English letters, adds a Roman-letters version.</p>

      <div className="cls-grid">
        <div>
          <label htmlFor="cls-summary" className="ck-lbl">Write call summaries and action items in</label>
          <select id="cls-summary" className="ck-in" value={f.summary} onChange={e => setF({ ...f, summary: e.target.value as SummaryLanguage })}>
            {summaryOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div>
          <label htmlFor="cls-view" className="ck-lbl">Show translated transcripts in</label>
          <select id="cls-view" className="ck-in" value={views.some(v => v.value === f.view) ? f.view : 'en'} onChange={e => setF({ ...f, view: e.target.value as TranscriptView })}>
            {views.map(v => <option key={v.value} value={v.value}>{v.label}</option>)}
          </select>
          <p className="ck-hint">Anyone can switch on the call; their choice is remembered.</p>
        </div>
      </div>

      {engine !== 'gemini' && f.languages.length > 0 && (
        <p role="note" className="ck-note">{CK_ICON.warn}<span>
          {engine ? 'Calls are transcribed with a service that only partly understands these languages, and mixed English may be missed. Ask Colvy support to turn on multilingual transcription.' : 'Call transcription isn’t set up yet.'}
        </span></p>
      )}

      <CkSave dirty={dirty} busy={busy} onSave={save} msg={msg} />
    </section>
  )
}

const CLS_CSS = `
.ck-card .ck-chips select.cls-add{min-height:36px;padding:0 14px;border:1.5px dashed var(--ck-fill-2)!important;border-radius:999px!important;background-color:var(--card,#fff)!important;font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer}
.cls-grid{display:flex;flex-wrap:wrap;gap:16px;margin-top:18px}
.cls-grid>div{flex:1 1 240px;min-width:0}
`
