'use client'

import { useEffect, useRef, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { CALL_LANGUAGES, hasRomanForm, languageName } from '@/lib/call-languages'

// Inbox → reply in the customer's language. Type in English, press Translate
// (the globe), and the reply becomes the customer's language, chosen from
// what they write in (or picked from the list). Your English stays one click
// away (Undo). Server: /api/inbox/translate.

/** The language the customer writes in: their latest message Colvy detected as not English. */
export function customerLanguage(messages: any[]): string | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m?.sender_type === 'agent' || m?.sender_type === 'system') continue
    const l = String(m?.content_lang || '').toLowerCase()
    if (l && l !== 'unknown') return l.startsWith('en') ? null : l
  }
  return null
}

export function useReplyTranslate(opts: { companyId: string | null; conversationId: string | null; getText: () => string; setText: (t: string) => void }) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState<{ english: string; language: string; result: string } | null>(null)
  useEffect(() => { setDone(null); setError('') }, [opts.conversationId])

  const translate = async (to: string, roman = false) => {
    const text = opts.getText().trim()
    if (!opts.companyId || !text || busy) { if (!text) setError('Type your reply in English first.'); return }
    setBusy(true); setError('')
    try {
      const r = await authFetch('/api/inbox/translate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: opts.companyId, text, to, roman }) })
      const d = await r.json().catch(() => ({}))
      if (!r.ok || !d.translated) throw new Error(d.error || 'Couldn’t translate that just now.')
      // Keep the English from before the first translation, so Undo always gets it back.
      setDone(prev => ({ english: prev && prev.result === text ? prev.english : text, language: `${d.language}${roman ? ' (Roman letters)' : ''}`, result: d.translated }))
      opts.setText(d.translated)
    } catch (e: any) { setError(e.message || 'Couldn’t translate that just now.') } finally { setBusy(false) }
  }
  const undo = () => { if (done) { opts.setText(done.english); setDone(null) } }
  return { busy, error, done, translate, undo, clear: () => { setDone(null); setError('') } }
}

const Globe = ({ size = 16 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></svg>
)

/** The composer's Translate button: the customer's language first, then any other. */
export function TranslateButton({ t, suggested, style, className }: { t: ReturnType<typeof useReplyTranslate>; suggested: string | null; style?: React.CSSProperties; className?: string }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const off = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', off)
    return () => document.removeEventListener('mousedown', off)
  }, [open])
  const go = (code: string, roman = false) => { setOpen(false); t.translate(code, roman) }
  const others = CALL_LANGUAGES.filter(l => l.code !== suggested)
  const item: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, width: '100%', textAlign: 'left', padding: '8px 12px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--ink)' }
  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-flex' }}>
      <button type="button" className={className} onClick={() => setOpen(v => !v)} disabled={t.busy}
        title={suggested ? `Translate your reply to ${languageName(suggested)}` : 'Translate your reply'} aria-label="Translate your reply" aria-haspopup="menu" aria-expanded={open}
        style={{ ...style, opacity: t.busy ? 0.6 : 1, cursor: t.busy ? 'wait' : 'pointer' }}>
        <Globe />
      </button>
      {open && (
        <div role="menu" style={{ position: 'absolute', bottom: 'calc(100% + 6px)', left: 0, width: 250, maxHeight: 320, overflowY: 'auto', background: '#fff', border: '1px solid var(--border)', borderRadius: 12, boxShadow: '0 12px 32px rgba(0,0,0,0.16)', zIndex: 80, padding: '6px 0' }}>
          <p style={{ margin: 0, padding: '4px 12px 6px', fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Translate your reply to</p>
          {suggested && (
            <>
              <button type="button" role="menuitem" onClick={() => go(suggested)} style={{ ...item, fontWeight: 700 }}>
                <span>{languageName(suggested)}</span><span style={{ fontSize: 11, color: 'var(--coral)', fontWeight: 700 }}>Customer’s language</span>
              </button>
              {hasRomanForm(suggested) && (
                <button type="button" role="menuitem" onClick={() => go(suggested, true)} style={item}>
                  <span>{languageName(suggested)} in Roman letters</span>
                </button>
              )}
              <div style={{ height: 1, background: 'var(--border)', margin: '6px 0' }} />
            </>
          )}
          {others.map(l => (
            <button key={l.code} type="button" role="menuitem" onClick={() => go(l.code)} style={item}>
              <span>{l.name}</span>{l.native !== l.name && <span style={{ color: 'var(--slate)', fontSize: 12 }}>{l.native}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Above the composer: what was translated (with your English and Undo), or why it couldn't be. */
export function TranslateStrip({ t, suggested, hasText }: { t: ReturnType<typeof useReplyTranslate>; suggested: string | null; hasText: boolean }) {
  if (t.busy) return <div role="status" style={strip('#eff6ff', '#1d4ed8')}>Translating…</div>
  if (t.error) return <div role="alert" style={strip('#fef2f2', '#b91c1c')}>{t.error}<button type="button" onClick={t.clear} style={linkBtn}>Dismiss</button></div>
  if (t.done) return (
    <div role="status" style={strip('#eff6ff', '#1d4ed8')}>
      <span style={{ minWidth: 0, flex: 1 }}>
        <strong>Translated to {t.done.language}.</strong>{' '}
        <span style={{ color: 'var(--slate)' }}>Your English: “{t.done.english.length > 120 ? `${t.done.english.slice(0, 120)}…` : t.done.english}”</span>
      </span>
      <button type="button" onClick={t.undo} style={linkBtn}>Undo</button>
    </div>
  )
  // The customer writes in another language: offer it once something's typed.
  if (suggested && hasText) return (
    <div style={strip('var(--canvas)', 'var(--slate)')}>
      <span style={{ flex: 1 }}>This customer writes in {languageName(suggested)}.</span>
      <button type="button" onClick={() => t.translate(suggested)} style={linkBtn}>Translate my reply</button>
    </div>
  )
  return null
}

const strip = (bg: string, c: string): React.CSSProperties => ({ display: 'flex', alignItems: 'center', gap: 10, margin: '0 0 8px', padding: '8px 12px', borderRadius: 10, background: bg, color: c, fontSize: 12.5, lineHeight: 1.45 })
const linkBtn: React.CSSProperties = { background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--coral)', fontWeight: 700, fontSize: 12.5, whiteSpace: 'nowrap' }
