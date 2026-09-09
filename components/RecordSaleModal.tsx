'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/analytics'
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

  const input: React.CSSProperties = { width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, outline: 'none', boxSizing: 'border-box' }
  const label: React.CSSProperties = { display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', margin: '0 0 5px', textTransform: 'uppercase', letterSpacing: '0.03em' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', zIndex: 10000, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ maxWidth: 460, width: '100%', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 16, boxShadow: '0 24px 64px rgba(0,0,0,0.3)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 18px', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800, color: 'var(--ink)' }}>Record a sale</h2>
            <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>Credited to {contact?.name || 'this conversation'}{total > 0 ? ` · ${fmt(total)} logged` : ''}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', display: 'flex', padding: 4 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
          </button>
        </div>

        <div style={{ padding: 18 }}>
          {err && <div style={{ marginBottom: 12, padding: '9px 12px', borderRadius: 9, background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', fontSize: 12.5 }}>{err}</div>}

          <div style={{ marginBottom: 12 }}>
            <label style={label}>Amount ({currency})</label>
            <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" autoFocus style={input} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Payment method</label>
            <PaymentMethodPicker companyId={companyId} value={method} onChange={setMethod} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label style={label}>Sale credited to</label>
            <select value={soldBy} onChange={e => setSoldBy(e.target.value)} style={{ ...input, cursor: 'pointer' }}>
              {meId && <option value={`me:${meId}`}>{meName} (you)</option>}
              {teamMembers.filter(m => m.id !== meId).map(m => <option key={m.id} value={m.id}>{m.name || 'Team member'}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={label}>Note (optional)</label>
            <input value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. paid by bank transfer, invoice #123" style={input} />
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            {editing && <button type="button" onClick={resetForm} style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer' }}>Cancel edit</button>}
            <button type="button" onClick={save} disabled={saving} style={{ flex: 1, padding: '10px 14px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 800, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
              {saving ? 'Saving…' : editing ? 'Update sale' : 'Record sale'}
            </button>
          </div>

          {/* Existing sales on this conversation */}
          {sales && sales.length > 0 && (
            <div style={{ marginTop: 18, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
              <p style={{ margin: '0 0 8px', fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Recorded sales</p>
              {sales.map(s => (
                <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{fmt(Number(s.amount) || 0, s.currency)} <span style={{ fontWeight: 500, color: 'var(--slate)' }}>{s.payment_method ? `· ${s.payment_method}` : ''}</span></p>
                    <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>{s.sold_by_name || '—'} · {new Date(s.sale_at || s.created_at).toLocaleDateString()}{s.note ? ` · ${s.note}` : ''}</p>
                  </div>
                  <button type="button" onClick={() => startEdit(s)} title="Edit" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--slate)', padding: 4 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4z" /></svg>
                  </button>
                  <button type="button" onClick={() => del(s.id)} title="Delete" style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', padding: 4 }}>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
