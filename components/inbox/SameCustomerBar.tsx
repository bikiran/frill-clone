'use client'

// "Same customer?" for a texting number that's the phone on another
// customer's store orders (lib/same-customer). Shown at the top of the thread;
// nothing is merged until someone on the team says so.
//
//   Same customer as Emma Alderson?
//   This number is on 6 of her orders (#130163, #130167…).   [Merge]  [Not the same]
//
// Merge: this conversation joins theirs, and later texts from the number go
// there too. Not the same: never suggested again for this number.

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'

type Suggestion = { contactId: string; name: string; maskedEmail?: string; orderCount: number; orderNumbers: string[]; conversationId: string | null }

export default function SameCustomerBar({ conversationId, enabled, userName, onMerged }: {
  conversationId: string
  /** Only for a texting conversation whose contact has no email yet. */
  enabled: boolean
  userName?: string | null
  /** The conversation to open afterwards (theirs, or this one). */
  onMerged: (conversationId: string) => void
}) {
  const [s, setS] = useState<Suggestion | null>(null)
  const [canEdit, setCanEdit] = useState(true)
  const [busy, setBusy] = useState<'' | 'merge' | 'no'>('')
  const [err, setErr] = useState('')

  useEffect(() => {
    setS(null); setErr(''); setBusy('')
    if (!enabled || !conversationId) return
    let gone = false
    authFetch('/api/inbox/customer-match', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'suggest-phone', conversationId }),
    }).then(r => r.json()).then(d => {
      if (gone) return
      setS(d?.suggestion || null)
      setCanEdit(d?.canEdit !== false)
    }).catch(() => {})
    return () => { gone = true }
  }, [conversationId, enabled])

  if (!s) return null

  const act = async (kind: 'merge' | 'no') => {
    setBusy(kind); setErr('')
    try {
      const res = await authFetch('/api/inbox/customer-match', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: kind === 'merge' ? 'confirm-phone' : 'reject-phone', conversationId, contactId: s.contactId, userName }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'That didn’t work. Try again.')
      setS(null)
      if (kind === 'merge') onMerged(d.conversationId || conversationId)
    } catch (e: any) { setErr(e?.message || 'That didn’t work. Try again.') }
    finally { setBusy('') }
  }

  const first = s.name.split(/\s+/)[0] || s.name
  const nums = s.orderNumbers.map(n => `#${n}`).join(', ')
  return (
    <div className="same-cust" role="region" aria-label="Same customer suggestion">
      <style>{`
        .same-cust { margin: 8px 14px 0; padding: 10px 12px; border-radius: 14px; background: var(--peach, #fff4ee); border: 1px solid color-mix(in srgb, var(--coral, #f2551d) 22%, transparent); display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .same-cust .sc-text { flex: 1 1 260px; min-width: 0; font-size: 13px; color: var(--ink, #1a1a1a); line-height: 1.4; }
        .same-cust .sc-text b { font-weight: 700; }
        .same-cust .sc-sub { display: block; font-size: 12px; color: var(--slate, #6b7280); margin-top: 1px; }
        .same-cust .sc-btns { display: flex; gap: 6px; flex-shrink: 0; }
        .same-cust button { height: 32px; padding: 0 14px; border-radius: 999px; font-size: 12.5px; font-weight: 700; cursor: pointer; border: 1px solid var(--border, #e5e7eb); background: #fff; color: var(--ink, #1a1a1a); }
        .same-cust button.primary { background: var(--coral, #f2551d); border-color: var(--coral, #f2551d); color: #fff; }
        .same-cust button:disabled { opacity: .6; cursor: wait; }
        .same-cust .sc-err { flex-basis: 100%; font-size: 12px; color: #dc2626; }
        @media (prefers-color-scheme: dark) { .same-cust button:not(.primary) { background: transparent; } }
      `}</style>
      <span className="sc-text">
        Same customer as <b>{s.name}</b>?
        <span className="sc-sub">
          This number is on {s.orderCount === 1 ? `${first}’s order` : `${s.orderCount} of ${first}’s orders`}{nums ? ` (${nums}${s.orderCount > s.orderNumbers.length ? '…' : ''})` : ''}.
          {' '}Merging puts these messages in {first}’s conversation, and later texts from this number go there too.
        </span>
      </span>
      {canEdit && (
        <span className="sc-btns">
          <button type="button" className="primary" disabled={!!busy} onClick={() => act('merge')}>{busy === 'merge' ? 'Merging…' : 'Merge'}</button>
          <button type="button" disabled={!!busy} onClick={() => act('no')}>{busy === 'no' ? '…' : 'Not the same'}</button>
        </span>
      )}
      {err && <span className="sc-err">{err}</span>}
    </div>
  )
}
