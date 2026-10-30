'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/analytics'
import { SkClose, SkIcon, SkStyle } from '@/components/ui/SheetKit'
import PaymentMethodPicker from '@/components/PaymentMethodPicker'

// Records a sale attributed to this conversation — the revenue Colvy helped
// generate, including bank-transfer / off-Stripe sales that only live in the
// chat. A conversation can have several sales; existing ones can be edited or
// removed. Sold-by defaults to the conversation's assignee (falling back to the
// current agent) but is editable, since the person who took the bank transfer
// isn't always the one who chatted.

type Member = { id: string; name?: string | null }
type Sale = {
  id: string; amount: number; currency: string | null; payment_method: string | null
  sold_by_user_id: string | null; sold_by_name: string | null; note: string | null
  sale_at: string | null; created_at: string
}

export default function RecordSaleModal({
  companyId, conversation, contact, teamMembers, currentUser, currency = 'AUD', onClose, onSaved,
}: {
  companyId: string
  conversation: any
  contact: any
  teamMembers: Member[]
  currentUser: { id?: string; name?: string | null }
  currency?: string
  onClose: () => void
  onSaved?: () => void
}) {
  const meId = currentUser?.id || ''
  const meName = currentUser?.name || 'You'
  // Default the sale to whoever's handling the chat.
  const defaultSoldBy = (() => {
    const a = conversation?.assignee_id
    if (a && teamMembers.some(m => m.id === a)) return a
    return meId ? `me:${meId}` : (teamMembers[0]?.id || '')
  })()

  const [sales, setSales] = useState<Sale[] | null>(null)
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState('')
  const [soldBy, setSoldBy] = useState(defaultSoldBy)
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [editing, setEditing] = useState<string | null>(null)
  const [err, setErr] = useState('')

  const fmt = (n: number, c?: string | null) => {
    try { return new Intl.NumberFormat('en-AU', { style: 'currency', currency: c || currency, currencyDisplay: 'narrowSymbol' }).format(n) }
    catch { return `$${(n || 0).toFixed(2)}` }
  }

  const load = async () => {
    try {
      const { data } = await (supabase as any).from('conversation_sales')
        .select('*').eq('company_id', companyId).eq('conversation_id', conversation?.id)
        .order('created_at', { ascending: false })
      setSales(data || [])
    } catch { setSales([]) }
  }
  useEffect(() => { load() }, [conversation?.id])

  const total = useMemo(() => (sales || []).reduce((s, r) => s + (Number(r.amount) || 0), 0), [sales])

  const resolveSeller = (val: string): { id: string | null; name: string } => {
    if (val.startsWith('me:')) return { id: meId || null, name: meName }
    const m = teamMembers.find(t => t.id === val)
    return { id: m?.id || null, name: m?.name || 'Team member' }
  }

  const resetForm = () => { setAmount(''); setMethod(''); setSoldBy(defaultSoldBy); setNote(''); setEditing(null); setErr('') }

  const save = async () => {
    const amt = parseFloat(amount)
    if (!isFinite(amt) || amt <= 0) { setErr('Enter a sale amount.'); return }
    setSaving(true); setErr('')
    const seller = resolveSeller(soldBy)
    const row: any = {
      company_id: companyId,
      conversation_id: conversation?.id || null,
      contact_id: contact?.id || null,
      amount: amt,
      currency,
      payment_method: method.trim() || null,
      sold_by_user_id: seller.id,
      sold_by_name: seller.name,
    }
    try {
      if (editing) {
        await (supabase as any).from('conversation_sales').update({ ...row, note: note.trim() || null }).eq('id', editing)
      } else {
        row.recorded_by_user_id = meId || null
        row.recorded_by_name = meName
        row.note = note.trim() || null
        await (supabase as any).from('conversation_sales').insert(row)
        try { track('sale_recorded', { amount: amt, currency, payment_method: row.payment_method || 'unspecified' }) } catch {}
        // Surface the sale in the conversation: a pill in the message stream and
        // an entry in the Timeline. Best-effort — never block the save on these.
        if (conversation?.id) {
          const money = fmt(amt)
          const methodLabel = row.payment_method ? ` · ${row.payment_method}` : ''
          try {
            await (supabase as any).from('messages').insert({
              conversation_id: conversation.id, company_id: companyId, sender_type: 'system',
              content: `Sale recorded · ${money}${methodLabel}`,
              metadata: { sale_event: true, amount: amt, method: row.payment_method || null, sold_by: seller.name },
            })
          } catch {}
          try {
            await (supabase as any).from('conversation_events').insert({
              conversation_id: conversation.id, company_id: companyId, event_type: 'sale', actor_name: meName,
              detail: `Sale recorded · ${money}${methodLabel} — credited to ${seller.name}${row.note ? ` · ${row.note}` : ''}`,
            })
          } catch {}
        }
      }
      resetForm()
      await load()
      onSaved?.()
    } catch (e: any) {
      setErr(e?.message?.includes('conversation_sales') ? 'Run COLVY_V295 on Supabase to enable sales recording.' : (e?.message || 'Could not save'))
    }
    setSaving(false)
  }

  const startEdit = (s: Sale) => {
    setEditing(s.id)
    setAmount(String(s.amount ?? ''))
    setMethod(s.payment_method || '')
    setSoldBy(s.sold_by_user_id && teamMembers.some(t => t.id === s.sold_by_user_id) ? s.sold_by_user_id : (s.sold_by_user_id === meId ? `me:${meId}` : (s.sold_by_user_id || defaultSoldBy)))
    setNote(s.note || '')
    setErr('')
  }
  const del = async (id: string) => {
    try { await (supabase as any).from('conversation_sales').delete().eq('id', id); await load(); onSaved?.() } catch {}
  }

  return (
    <div className="sk-scrim" onClick={onClose}>
      <SkStyle />
      <div className="sk" role="dialog" aria-modal="true" aria-labelledby="rs-title" onClick={e => e.stopPropagation()} onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
        <div className="sk-head">
          <span className="sk-badge" aria-hidden>{SkIcon.sale}</span>
          <div style={{ minWidth: 0 }}>
            <h3 id="rs-title">{editing ? 'Edit sale' : 'Record a sale'}</h3>
            <p className="sk-sub">Credited to {contact?.name || 'this conversation'}{total > 0 ? ` · ${fmt(total)} logged so far` : ''}</p>
          </div>
          <SkClose onClick={onClose} />
        </div>

        <label className="sk-lbl" htmlFor="rs-amount">Amount</label>
        <span className="sk-field">
          <span className="sk-pre">{currency === 'AUD' || currency === 'USD' || currency === 'NZD' || currency === 'CAD' ? '$' : currency}</span>
          <input id="rs-amount" type="number" inputMode="decimal" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus />
          <span className="sk-opt">{currency}</span>
        </span>

        <span className="sk-lbl">Payment method</span>
        <PaymentMethodPicker companyId={companyId} value={method} onChange={setMethod} />

        <label className="sk-lbl" htmlFor="rs-by">Sale credited to</label>
        <select id="rs-by" className="sk-in" value={soldBy} onChange={e => setSoldBy(e.target.value)}>
          {meId && <option value={`me:${meId}`}>{meName} (you)</option>}
          {teamMembers.filter(m => m.id !== meId).map(m => <option key={m.id} value={m.id}>{m.name || 'Team member'}</option>)}
        </select>

        <label className="sk-lbl" htmlFor="rs-note">Note <span className="sk-opt">optional</span></label>
        <input id="rs-note" className="sk-in" value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. paid by bank transfer, invoice #123" />

        {err && <p className="sk-err" role="alert">{err}</p>}

        <div className="sk-actions">
          {editing ? <button type="button" className="sk-btn" onClick={resetForm}>Cancel edit</button> : <button type="button" className="sk-btn" onClick={onClose}>Cancel</button>}
          <button type="button" className="sk-btn primary" onClick={save} disabled={saving}>
            {saving ? 'Saving…' : editing ? 'Update sale' : 'Record sale'}
          </button>
        </div>

        {/* Sales already recorded on this conversation */}
        {sales && sales.length > 0 && (
          <>
            <div className="sk-sep" />
            <span className="sk-lbl">Recorded sales</span>
            {sales.map(s => (
              <div key={s.id} className="sk-item">
                <span className="sk-item-t">
                  <b>{fmt(Number(s.amount) || 0, s.currency)}{s.payment_method ? <span style={{ fontWeight: 500, color: 'var(--sk-muted)' }}> · {s.payment_method}</span> : null}</b>
                  <small>{s.sold_by_name || '—'} · {new Date(s.sale_at || s.created_at).toLocaleDateString()}{s.note ? ` · ${s.note}` : ''}</small>
                </span>
                <button type="button" className="sk-icon-btn" onClick={() => startEdit(s)} title="Edit" aria-label="Edit sale">{SkIcon.edit}</button>
                <button type="button" className="sk-icon-btn danger" onClick={() => del(s.id)} title="Delete" aria-label="Delete sale">{SkIcon.trash}</button>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  )
}
