'use client'

import { useCallback, useEffect, useState } from 'react'

type Address = {
  id: string
  formatted?: string | null
  line1?: string | null; line2?: string | null; suburb?: string | null
  city?: string | null; state?: string | null; postcode?: string | null; country?: string | null
  label?: string | null
  source?: string | null
  is_default?: boolean
  last_used_at?: string | null
}

// Multi-address book for a customer: every delivery address they've used, each
// with its source + last-used date, with a default the agent can switch.
export default function CustomerAddresses({ contactId, canEdit = true, userName }: {
  contactId?: string | null
  canEdit?: boolean
  userName?: string | null
}) {
  const [addresses, setAddresses] = useState<Address[]>([])
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ line1: '', suburb: '', city: '', state: '', postcode: '', country: '' })

  const load = useCallback(async () => {
    if (!contactId) { setAddresses([]); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/contacts/addresses?contactId=${contactId}`)
      const d = await res.json()
      setAddresses(d.addresses || [])
    } catch {} finally { setLoading(false) }
  }, [contactId])

  useEffect(() => { load() }, [load])

  const post = async (payload: any, key: string) => {
    setBusy(key)
    try {
      await fetch('/api/contacts/addresses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      await load()
    } catch {} finally { setBusy(null) }
  }
  const setDefault = (a: Address) => post({ action: 'set-default', addressId: a.id, contactId }, 'def' + a.id)
  const remove = (a: Address) => post({ action: 'delete', addressId: a.id }, 'del' + a.id)
  const add = async () => {
    if (!form.line1.trim() && !form.city.trim()) return
    await post({ action: 'add', contactId, userName, ...form }, 'add')
    setForm({ line1: '', suburb: '', city: '', state: '', postcode: '', country: '' }); setAdding(false)
  }

  const fmtDate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : '')

  if (!contactId) return null
  if (!loading && addresses.length === 0 && !canEdit) return null

  return (
    <div style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ margin: 0, fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.4, color: 'var(--slate)' }}>Addresses</p>
        {canEdit && <button type="button" onClick={() => setAdding(v => !v)} style={{ border: 'none', background: 'none', color: 'var(--coral)', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>{adding ? 'Cancel' : '+ Add'}</button>}
      </div>

      {loading && addresses.length === 0 && <p style={{ fontSize: 12, color: 'var(--slate)', margin: 0 }}>Loading…</p>}
      {!loading && addresses.length === 0 && !adding && <p style={{ fontSize: 12, color: 'var(--slate)', margin: 0 }}>No addresses on record.</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {addresses.map(a => (
          <div key={a.id} style={{ border: '1px solid var(--border)', borderRadius: 10, padding: '9px 11px', background: a.is_default ? 'var(--canvas)' : '#fff' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 8 }}>
              <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.45, overflowWrap: 'anywhere' }}>{a.formatted || [a.line1, a.city, a.postcode].filter(Boolean).join(', ')}</p>
              {a.is_default && <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 800, color: '#047857', background: '#dcfce7', padding: '2px 7px', borderRadius: 20 }}>DEFAULT</span>}
            </div>
            {(a.source || a.last_used_at) && (
              <p style={{ margin: '4px 0 0', fontSize: 10.5, color: '#9ca3af' }}>
                {a.source}{a.source && a.last_used_at ? ' · ' : ''}{a.last_used_at ? `used ${fmtDate(a.last_used_at)}` : ''}
              </p>
            )}
            {canEdit && (
              <div style={{ display: 'flex', gap: 12, marginTop: 6 }}>
                {!a.is_default && <button type="button" disabled={!!busy} onClick={() => setDefault(a)} style={link}>{busy === 'def' + a.id ? '…' : 'Set default'}</button>}
                <button type="button" disabled={!!busy} onClick={() => remove(a)} style={{ ...link, color: '#dc2626' }}>{busy === 'del' + a.id ? '…' : 'Delete'}</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {adding && canEdit && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
          <input value={form.line1} onChange={e => setForm({ ...form, line1: e.target.value })} placeholder="Street address" style={inp} />
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={form.suburb} onChange={e => setForm({ ...form, suburb: e.target.value })} placeholder="Suburb" style={inp} />
            <input value={form.postcode} onChange={e => setForm({ ...form, postcode: e.target.value })} placeholder="Postcode" style={{ ...inp, maxWidth: 110 }} />
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="State" style={inp} />
            <input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="Country" style={inp} />
          </div>
          <button type="button" disabled={busy === 'add'} onClick={add} style={{ alignSelf: 'flex-start', padding: '7px 14px', borderRadius: 9, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>{busy === 'add' ? 'Saving…' : 'Save address'}</button>
        </div>
      )}
    </div>
  )
}

const link: React.CSSProperties = { border: 'none', background: 'none', color: 'var(--coral)', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', padding: 0 }
const inp: React.CSSProperties = { flex: 1, minWidth: 0, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13 }
