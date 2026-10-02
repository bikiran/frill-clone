'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { confirmDialog } from '@/components/ConfirmDialog'

// "✨ Draft reply" — AI writes the next reply from your help centre, product
// catalogue, the customer's orders and the thread; you review and send.
// Shared by the inbox (chat/SMS + email composers) and the ticket page.

export type DraftSource = { id: string; kind: 'knowledge' | 'product' | 'order'; label: string; url?: string | null }
export type DraftInfo = { sources: DraftSource[]; caution: string }

export function useAiDraft(opts: {
  companyId: string | null
  conversationId?: string | null
  ticketId?: string | null
  onDraft: (text: string) => void
  getText?: () => string            // the composer's current text
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [info, setInfo] = useState<DraftInfo | null>(null)

  // A different conversation/ticket → forget the last draft's sources.
  useEffect(() => { setInfo(null); setError('') }, [opts.conversationId, opts.ticketId])

  const run = async (instruction?: string) => {
    if (!opts.companyId || (!opts.conversationId && !opts.ticketId) || busy) return
    const current = (opts.getText?.() || '').trim()
    if (!instruction && current && !await confirmDialog('Replace what you’ve typed with an AI draft?')) return
    setBusy(true); setError('')
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      const res = await fetch('/api/ai/draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ companyId: opts.companyId, conversationId: opts.conversationId || null, ticketId: opts.ticketId || null, instruction: instruction || null, previousDraft: instruction ? current || null : null }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok || !d.draft) throw new Error(d.error || 'Couldn’t draft a reply right now')
      opts.onDraft(d.draft)
      setInfo({ sources: d.sources || [], caution: d.caution || '' })
    } catch (e: any) { setError(e.message || 'Couldn’t draft a reply right now') } finally { setBusy(false) }
  }

  return { busy, error, info, run, clear: () => { setInfo(null); setError('') } }
}

const Sparkle = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z"/><path d="M19 3v4M21 5h-4"/></svg>
)

export function AiDraftButton({ busy, onClick, height = 32 }: { busy: boolean; onClick: () => void; height?: number }) {
  return (
    <button type="button" onClick={onClick} disabled={busy} title="Draft a reply with AI from your help centre, products and this customer's orders"
      style={{ height, display: 'inline-flex', alignItems: 'center', gap: 5, padding: '0 11px', borderRadius: 8, border: '1px solid #e9d5ff', background: '#faf5ff', color: '#7c3aed', fontSize: 12.5, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
      <Sparkle /> {busy ? 'Drafting…' : 'Draft reply'}
    </button>
  )
}

const BookIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z" /><path d="M4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5" /></svg>
const TagIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M20.6 13.4 13.4 20.6a2 2 0 0 1-2.8 0L3 13V3h10l7.6 7.6a2 2 0 0 1 0 2.8z" /><circle cx="7.5" cy="7.5" r="1.5" /></svg>
const BoxIcon = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></svg>
const KIND_ICON: Record<string, React.ReactNode> = { knowledge: <BookIcon />, product: <TagIcon />, order: <BoxIcon /> }

export function AiDraftInfo({ info, error, busy, onRedo, onClose }: {
  info: DraftInfo | null
  error: string
  busy: boolean
  onRedo: (instruction: string) => void
  onClose: () => void
}) {
  const [tweak, setTweak] = useState('')
  if (!info && !error) return null
  if (error) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', color: '#b91c1c', fontSize: 12.5, marginBottom: 8 }}>
        <span style={{ flex: 1 }}>{error}</span>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 14 }}>×</button>
      </div>
    )
  }
  return (
    <div style={{ padding: '8px 10px', borderRadius: 10, background: '#faf5ff', border: '1px solid #ede9fe', marginBottom: 8 }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 6, flexWrap: 'wrap' }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, color: '#7c3aed', padding: '3px 0' }}>✨ AI draft — review before sending.</span>
        {info!.sources.length
          ? info!.sources.map(s => {
              const chip = (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 11.5, fontWeight: 600, color: 'var(--ink)', background: '#fff', border: '1px solid #ede9fe', borderRadius: 999, padding: '2px 8px', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <span style={{ color: '#7c3aed', display: 'inline-flex' }}>{KIND_ICON[s.kind]}</span> {s.label}
                </span>
              )
              return s.url ? <a key={s.id} href={s.url} target="_blank" rel="noreferrer" style={{ textDecoration: 'none' }}>{chip}</a> : <span key={s.id}>{chip}</span>
            })
          : <span style={{ fontSize: 11.5, color: 'var(--slate)', padding: '3px 0' }}>Written from the conversation only — no matching help article, product or order.</span>}
        <button type="button" onClick={onClose} title="Dismiss" style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#a78bfa', cursor: 'pointer', fontSize: 14, lineHeight: 1 }}>×</button>
      </div>
      {info!.caution && (
        <div style={{ marginTop: 6, fontSize: 12, color: '#92400e', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '5px 8px', display: 'flex', gap: 6, alignItems: 'flex-start' }}><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }}><path d="M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><path d="M12 9.5v4M12 17h.01" /></svg>{info!.caution}</div>
      )}
      <div style={{ display: 'flex', gap: 6, marginTop: 7 }}>
        <input value={tweak} onChange={e => setTweak(e.target.value)} placeholder="Adjust it: shorter, more formal, mention free delivery…"
          onKeyDown={e => { if (e.key === 'Enter' && tweak.trim()) { e.preventDefault(); onRedo(tweak.trim()); setTweak('') } }}
          style={{ flex: 1, minWidth: 0, padding: '6px 9px', borderRadius: 8, border: '1px solid #ede9fe', fontSize: 12.5, outline: 'none', fontFamily: 'inherit', background: '#fff' }} />
        <button type="button" disabled={busy} onClick={() => { onRedo(tweak.trim() || 'Try a different version'); setTweak('') }}
          style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid #e9d5ff', background: '#fff', color: '#7c3aed', fontSize: 12, fontWeight: 700, cursor: busy ? 'wait' : 'pointer', whiteSpace: 'nowrap' }}>
          {busy ? '…' : '↻ Redraft'}
        </button>
      </div>
    </div>
  )
}
