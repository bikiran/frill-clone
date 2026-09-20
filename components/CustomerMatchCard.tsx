'use client'

import { useCallback, useEffect, useState } from 'react'

type Suggestion = {
  contactId: string
  name: string
  confidence: number
  band: 'confirmed' | 'suggested' | 'weak'
  ambiguous?: boolean
  alreadyLinked?: boolean
  evidence: { signal: string; detail: string; points: number }[]
  maskedEmail?: string
  maskedPhone?: string
  address?: string | null
  lifetime?: number | null
  lastOrder?: { number: number; total: number } | null
}

type Result = { confirmed: Suggestion | null; suggestions: Suggestion[]; currentContactId?: string | null; notApplicable?: boolean; canEdit?: boolean }

const money = (n?: number | null) => (n == null ? null : `$${n.toFixed(2)}`)

function confidenceTone(c: number): { bg: string; fg: string; label: string } {
  if (c >= 95) return { bg: '#dcfce7', fg: '#047857', label: 'Likely match' }
  if (c >= 85) return { bg: 'var(--peach)', fg: 'var(--coral)', label: 'Probable match' }
  return { bg: '#fff7ed', fg: '#c2410c', label: 'Possible match' }
}

export default function CustomerMatchCard({
  conversationId, channel, companyId, userId, userName, onLinked,
}: {
  conversationId: string
  channel: string
  companyId: string | null
  userId?: string | null
  userName?: string | null
  onLinked?: () => void
}) {
  const [result, setResult] = useState<Result | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [showAll, setShowAll] = useState(false)
  const [dupes, setDupes] = useState<{ id: string; name: string; maskedEmail?: string; maskedPhone?: string; reason: string }[] | null>(null)
  const [showMerge, setShowMerge] = useState(false)

  const applicable = ['instagram', 'facebook', 'whatsapp'].includes(String(channel || '').toLowerCase())

  const load = useCallback(async () => {
    if (!applicable) { setResult(null); return }
    setLoading(true); setError('')
    try {
      const res = await fetch('/api/inbox/customer-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'suggest', conversationId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Match lookup failed')
      setResult(data)
    } catch (e: any) { setError(e.message) }
    finally { setLoading(false) }
  }, [conversationId, applicable])

  useEffect(() => { load() }, [load])

  const act = async (action: string, extra: any) => {
    setBusy(action + (extra.contactId || ''))
    try {
      const res = await fetch('/api/inbox/customer-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, conversationId, userId, userName, ...extra }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Action failed')
      setShowAll(false); setShowMerge(false)
      onLinked?.()
      await load()
    } catch (e: any) { setError(e.message) }
    finally { setBusy(null) }
  }

  const confirm = (s: Suggestion) => act('confirm', {
    contactId: s.contactId, confidence: s.confidence, evidence: s.evidence,
    source: 'Confirmed in inbox', display: s.name,
  })
  const reject = (s: Suggestion) => act('reject', { contactId: s.contactId })
  const unlink = (s: Suggestion) => act('unlink', {})
  const requestDetails = () => act('request-details', {})

  const openMerge = async (contactId: string) => {
    setBusy('find-dupes'); setError('')
    try {
      const res = await fetch('/api/inbox/customer-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'find-duplicates', conversationId, contactId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Lookup failed')
      setDupes(data.duplicates || [])
      setShowMerge(true)
    } catch (e: any) { setError(e.message) }
    finally { setBusy(null) }
  }
  const mergeDupe = (primaryContactId: string, mergeContactId: string) =>
    act('merge', { primaryContactId, mergeContactId })

  if (!applicable) return null

  const cardStyle: React.CSSProperties = {
    border: '1px solid var(--border)', borderRadius: 14, padding: 14, marginBottom: 16, background: '#fff',
  }

  if (loading && !result) {
    return <div style={{ ...cardStyle, color: 'var(--slate)', fontSize: 12.5 }}>Looking for a matching customer…</div>
  }
  if (error) {
    return <div style={{ ...cardStyle }}>
      <p style={{ margin: 0, fontSize: 12.5, color: '#b91c1c' }}>{error}</p>
      <button onClick={load} style={linkBtn}>Try again</button>
    </div>
  }
  if (!result) return null
  const canEdit = result.canEdit !== false

  const confirmedLinked = result.confirmed?.alreadyLinked ? result.confirmed : null
  // An auto-match that's ≥95 but not yet linked is shown as the primary suggestion.
  const primary = confirmedLinked ? null : (result.confirmed || result.suggestions[0] || null)
  const others = result.suggestions.filter(s => s.contactId !== primary?.contactId)

  // Already confirmed to a customer.
  if (confirmedLinked) {
    return (
      <div style={{ ...cardStyle, background: 'var(--canvas)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={badge('#dcfce7', '#047857')}>✓ Confirmed customer</span>
        </div>
        <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{confirmedLinked.name}</p>
        {confirmedLinked.evidence?.[0] && (
          <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--slate)' }}>{confirmedLinked.evidence[0].detail}</p>
        )}
        {canEdit && (
          <div style={{ display: 'flex', gap: 12, marginTop: 6, alignItems: 'center' }}>
            <button disabled={!!busy} onClick={() => unlink(confirmedLinked)} style={linkBtn}>Unlink</button>
            <button disabled={!!busy} onClick={() => openMerge(confirmedLinked.contactId)} style={linkBtn}>{busy === 'find-dupes' ? 'Checking…' : 'Merge duplicates'}</button>
          </div>
        )}
        {showMerge && dupes && (
          <MergeModal
            primaryId={confirmedLinked.contactId} primaryName={confirmedLinked.name}
            dupes={dupes} busy={busy} onClose={() => setShowMerge(false)}
            onMerge={(dupId) => mergeDupe(confirmedLinked.contactId, dupId)}
          />
        )}
      </div>
    )
  }

  if (!primary) {
    return (
      <div style={{ ...cardStyle, background: 'var(--canvas)' }}>
        <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--slate)' }}>No matching customer found — this is a new {label(channel)} visitor. You can create or link a customer from the contact panel below.</p>
        {canEdit && <button disabled={!!busy} onClick={requestDetails} style={ghostBtn}>{busy === 'request-details' ? 'Sending…' : 'Request customer details'}</button>}
      </div>
    )
  }

  const renderSuggestion = (s: Suggestion, compact = false) => {
    const tone = confidenceTone(s.confidence)
    return (
      <div key={s.contactId} style={compact ? { padding: '10px 0', borderTop: '1px solid var(--border)' } : {}}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>{s.name}</p>
          <span style={badge(tone.bg, tone.fg)}>{tone.label} · {s.confidence}%</span>
        </div>
        <p style={{ margin: '2px 0 8px', fontSize: 11, color: 'var(--slate)', textTransform: 'capitalize' }}>{label(channel)}{s.ambiguous ? ' · matches several customers' : ''}</p>
        <div style={{ display: 'grid', gap: 3, fontSize: 12, color: 'var(--ink)' }}>
          {s.maskedPhone && <Row k="Phone" v={s.maskedPhone} />}
          {s.maskedEmail && <Row k="Email" v={s.maskedEmail} />}
          {s.address && <Row k="Address" v={s.address} />}
          {s.lastOrder && <Row k="Last order" v={`#${s.lastOrder.number}${money(s.lastOrder.total) ? ` · ${money(s.lastOrder.total)}` : ''}`} />}
          {s.lifetime != null && <Row k="Lifetime spend" v={money(s.lifetime) || ''} />}
        </div>
        {s.evidence?.length > 0 && (
          <ul style={{ margin: '8px 0 0', padding: '0 0 0 14px', fontSize: 11, color: 'var(--slate)' }}>
            {s.evidence.slice(0, 3).map((e, i) => <li key={i}>{e.detail}</li>)}
          </ul>
        )}
        {canEdit ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            <button disabled={!!busy} onClick={() => confirm(s)} style={primaryBtn}>{busy === 'confirm' + s.contactId ? 'Linking…' : 'Confirm match'}</button>
            {!compact && others.length > 0 && <button disabled={!!busy} onClick={() => setShowAll(true)} style={ghostBtn}>Choose another</button>}
            <button disabled={!!busy} onClick={() => reject(s)} style={ghostBtn}>Not this customer</button>
            {!compact && <button disabled={!!busy} onClick={requestDetails} style={ghostBtn}>{busy === 'request-details' ? 'Sending…' : 'Request details'}</button>}
          </div>
        ) : (
          <p style={{ margin: '10px 0 0', fontSize: 11, color: '#9ca3af' }}>View only — ask an editor to confirm this match.</p>
        )}
      </div>
    )
  }

  return (
    <>
      <div style={cardStyle}>
        <p style={{ margin: '0 0 10px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--slate)' }}>Customer match</p>
        {renderSuggestion(primary)}
        <p style={{ margin: '10px 0 0', fontSize: 10.5, color: '#9ca3af' }}>Details are masked until you confirm the match.</p>
      </div>

      {showAll && (
        <div onClick={() => setShowAll(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 22 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Possible customers</h3>
              <button onClick={() => setShowAll(false)} style={{ border: 'none', background: 'none', fontSize: 20, color: 'var(--slate)', cursor: 'pointer' }}>×</button>
            </div>
            <p style={{ margin: '0 0 4px', fontSize: 12, color: 'var(--slate)' }}>Pick the customer this {label(channel)} account belongs to. Details stay masked until you confirm.</p>
            {[primary, ...others].map(s => renderSuggestion(s!, true))}
          </div>
        </div>
      )}
    </>
  )
}

function MergeModal({ primaryId, primaryName, dupes, busy, onClose, onMerge }: {
  primaryId: string; primaryName: string
  dupes: { id: string; name: string; maskedEmail?: string; maskedPhone?: string; reason: string }[]
  busy: string | null; onClose: () => void; onMerge: (dupId: string) => void
}) {
  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '95vw', maxHeight: '85vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 22 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Merge duplicates</h3>
          <button onClick={onClose} style={{ border: 'none', background: 'none', fontSize: 20, color: 'var(--slate)', cursor: 'pointer' }}>×</button>
        </div>
        <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--slate)' }}>
          These records look like the same person as <strong>{primaryName}</strong>. Merging folds a record into {primaryName} — its conversations, orders and history move over, empty fields are filled (never overwritten), and the change is audited. This can’t be undone.
        </p>
        {dupes.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--slate)', padding: '16px 0', textAlign: 'center' }}>No duplicate records found.</p>
        ) : dupes.map(d => (
          <div key={d.id} style={{ padding: '10px 0', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{d.name}</p>
              <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>{[d.maskedEmail, d.maskedPhone].filter(Boolean).join(' · ') || '—'}</p>
              <p style={{ margin: '1px 0 0', fontSize: 11, color: '#9ca3af' }}>{d.reason}</p>
            </div>
            <button disabled={!!busy} onClick={() => onMerge(d.id)}
              style={{ flexShrink: 0, padding: '7px 12px', borderRadius: 9, border: '1px solid var(--coral)', background: 'var(--peach)', color: 'var(--coral)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
              {busy === 'merge' ? 'Merging…' : 'Merge in'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}

function Row({ k, v }: { k: string; v: string }) {
  return <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}><span style={{ color: 'var(--slate)' }}>{k}</span><span style={{ fontWeight: 600, textAlign: 'right', overflowWrap: 'anywhere' }}>{v}</span></div>
}
const label = (ch: string) => ({ instagram: 'Instagram', facebook: 'Messenger', whatsapp: 'WhatsApp' } as any)[String(ch || '').toLowerCase()] || 'social'
const badge = (bg: string, fg: string): React.CSSProperties => ({ fontSize: 10.5, fontWeight: 800, padding: '3px 8px', borderRadius: 20, background: bg, color: fg, whiteSpace: 'nowrap' })
const primaryBtn: React.CSSProperties = { padding: '7px 14px', borderRadius: 9, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }
const ghostBtn: React.CSSProperties = { padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }
const linkBtn: React.CSSProperties = { marginTop: 6, padding: 0, border: 'none', background: 'none', color: 'var(--coral)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }
