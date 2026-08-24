'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// Create a payment link from the Payments page: pick a customer, enter the
// amount + description, and Colvy opens (or reuses) their conversation and
// posts a Stripe payment request into it — the same flow the inbox uses.
export default function CreatePaymentLinkModal({
  companyId, accent = 'var(--coral)', senderName, onClose, onCreated,
}: {
  companyId: string
  accent?: string
  senderName?: string
  onClose: () => void
  onCreated: (info: { checkoutUrl?: string }) => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<any[]>([])
  const [picked, setPicked] = useState<any>(null)
  const [amount, setAmount] = useState('')
  const [description, setDescription] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    if (picked || search.trim().length < 2) { setResults([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      const q = search.trim()
      const { data } = await (supabase as any).from('contacts')
        .select('id, name, email, phone').eq('company_id', companyId)
        .or(`name.ilike.%${q}%,email.ilike.%${q}%,phone.ilike.%${q}%`).limit(8)
      if (!cancelled) setResults(data || [])
    }, 250)
    return () => { cancelled = true; clearTimeout(t) }
  }, [search, companyId, picked])

  const create = async () => {
    setError('')
    if (!picked) { setError('Pick a customer first.'); return }
    const amt = parseFloat(amount)
    if (!amt || amt < 1) { setError('Enter an amount of at least $1.00.'); return }
    if (!picked.phone && !picked.email) { setError('This customer has no phone or email to send the link to.'); return }
    setBusy(true)
    try {
      // Find-or-create a conversation for the contact (same shape the inbox uses).
      let convId: string | null = null
      const { data: existing } = await (supabase as any).from('conversations')
        .select('id').eq('company_id', companyId).eq('contact_id', picked.id)
        .order('last_message_at', { ascending: false }).limit(1)
      convId = existing?.[0]?.id || null
      const channel = picked.phone ? 'sms' : 'email'
      if (!convId) {
        const { data: created } = await (supabase as any).from('conversations').insert({
          company_id: companyId, contact_id: picked.id, channel,
          sms_number: picked.phone || null, subject: picked.name || picked.email || picked.phone || 'Payment',
          status: 'open', is_unread: false, last_message: '', last_message_at: new Date().toISOString(),
        }).select('id').maybeSingle()
        convId = created?.id || null
      }
      if (!convId) throw new Error('Could not open a conversation for that customer')

      const res = await fetch('/api/stripe/chat-payment', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, conversationId: convId, amount: amt, description: description.trim() || null, senderName, channel }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok || j.error) { setError(j.error || 'Could not create the payment link'); setBusy(false); return }

      // Deliver the pay link over the customer's channel so it actually reaches them.
      const payLink = j.checkoutUrl || j.fullUrl
      if (payLink) {
        try {
          if (channel === 'sms' && picked.phone) {
            await fetch('/api/telnyx/sms/send', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyId, conversationId: convId, to: picked.phone, text: `Here's your secure payment link${description.trim() ? ` for ${description.trim()}` : ''}: ${payLink}`, senderName, skipChatMessage: true }),
            })
          } else if (channel === 'email' && picked.email) {
            await fetch('/api/email/send', {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyId, conversationId: convId, to: picked.email, subject: 'Your payment link', text: `Here's your secure payment link${description.trim() ? ` for ${description.trim()}` : ''}: ${payLink}`, senderName }),
            })
          }
        } catch { /* the card is already in the thread; delivery is best-effort */ }
      }
      onCreated({ checkoutUrl: payLink })
    } catch (e: any) {
      setError(e?.message || 'Could not create the payment link'); setBusy(false)
    }
  }

  const L: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--slate)', display: 'block', margin: '14px 0 6px' }
  const I: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', outline: 'none' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 6100, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', background: 'var(--card,#fff)', borderRadius: 18, padding: 24 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
          <h3 style={{ margin: 0, fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>Create payment link</h3>
          <button type="button" onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', cursor: 'pointer' }}>✕</button>
        </div>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>Colvy sends the customer a secure Stripe link over their channel.</p>

        {!picked ? (
          <>
            <label style={L}>Customer</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, phone or email…" style={I} autoFocus />
            {results.length > 0 && (
              <div style={{ marginTop: 8, border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                {results.map(c => (
                  <button key={c.id} type="button" onClick={() => { setPicked(c); setResults([]) }}
                    style={{ display: 'flex', flexDirection: 'column', width: '100%', textAlign: 'left', padding: '9px 12px', border: 'none', borderBottom: '1px solid var(--border)', background: 'var(--card,#fff)', cursor: 'pointer' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{c.name || 'Unnamed'}</span>
                    <span style={{ fontSize: 12, color: 'var(--slate)' }}>{c.phone || c.email || ''}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        ) : (
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--canvas)' }}>
            <div style={{ minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{picked.name || 'Unnamed'}</p>
              <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>{picked.phone || picked.email}{picked.phone && picked.email ? '' : ''} · via {picked.phone ? 'SMS' : 'email'}</p>
            </div>
            <button type="button" onClick={() => { setPicked(null); setSearch('') }} style={{ fontSize: 12, fontWeight: 700, color: accent, background: 'none', border: 'none', cursor: 'pointer' }}>Change</button>
          </div>
        )}

        <label style={L}>Amount (AUD)</label>
        <div style={{ position: 'relative' }}>
          <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 14, color: 'var(--slate)' }}>$</span>
          <input value={amount} onChange={e => setAmount(e.target.value.replace(/[^\d.]/g, ''))} placeholder="0.00" style={{ ...I, paddingLeft: 24 }} inputMode="decimal" />
        </div>

        <label style={L}>Description <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input value={description} onChange={e => setDescription(e.target.value)} placeholder="e.g. Aquarium tank" style={I} />

        {error && <p style={{ margin: '12px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card,#fff)', color: 'var(--slate)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={create} disabled={busy} style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: accent, color: '#fff', fontSize: 14, fontWeight: 700, cursor: busy ? 'default' : 'pointer', opacity: busy ? 0.6 : 1 }}>
            {busy ? 'Creating…' : 'Create & send link'}
          </button>
        </div>
      </div>
    </div>
  )
}
