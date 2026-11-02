'use client'

import { authFetch } from '@/lib/auth-fetch'
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
      const res = await authFetch(`/api/contacts/addresses?contactId=${contactId}`)
      const d = await res.json()
      setAddresses(d.addresses || [])
    } catch {} finally { setLoading(false) }
  }, [contactId])

  useEffect(() => { load() }, [load])

  const post = async (payload: any, key: string) => {
    setBusy(key)
    try {
      await authFetch('/api/contacts/addresses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
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
    <div className="cad">
      <style href="colvy-customer-addresses" precedence="default">{CAD_CSS}</style>
      <div className="cad-h">
        <h3>Saved addresses</h3>
        {addresses.length > 0 && <span className="cad-count">{addresses.length}</span>}
        {canEdit && (
          <button type="button" className={`cad-add${adding ? '' : ' accent'}`} onClick={() => setAdding(v => !v)} aria-expanded={adding}>
            {adding ? 'Cancel' : <><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" aria-hidden><path d="M12 5v14M5 12h14" /></svg>Add</>}
          </button>
        )}
      </div>

      {loading && addresses.length === 0 && <p className="cad-empty">Loading…</p>}
      {!loading && addresses.length === 0 && !adding && <p className="cad-empty">No saved addresses yet. Delivery addresses from orders land here too.</p>}

      {addresses.length > 0 && (
        <div className="cad-list">
          {addresses.map(a => (
            <div key={a.id} className={`cad-card${a.is_default ? ' def' : ''}`}>
              <div className="cad-top">
                <svg className="cad-pin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg>
                <p className="cad-addr">{a.formatted || [a.line1, a.city, a.postcode].filter(Boolean).join(', ')}</p>
                {a.is_default && <span className="cad-def">Default</span>}
              </div>
              {(a.source || a.last_used_at) && (
                <p className="cad-src">{a.source}{a.source && a.last_used_at ? ' · ' : ''}{a.last_used_at ? `used ${fmtDate(a.last_used_at)}` : ''}</p>
              )}
              {canEdit && (
                <div className="cad-acts">
                  {!a.is_default && <button type="button" disabled={!!busy} onClick={() => setDefault(a)}>{busy === 'def' + a.id ? '…' : 'Set default'}</button>}
                  <button type="button" className="del" disabled={!!busy} onClick={() => remove(a)}>{busy === 'del' + a.id ? '…' : 'Delete'}</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {adding && canEdit && (
        <div className="cad-form">
          <input value={form.line1} onChange={e => setForm({ ...form, line1: e.target.value })} placeholder="Street address" aria-label="Street address" autoFocus />
          <div className="cad-2">
            <input value={form.suburb} onChange={e => setForm({ ...form, suburb: e.target.value })} placeholder="Suburb" aria-label="Suburb" />
            <input value={form.postcode} onChange={e => setForm({ ...form, postcode: e.target.value })} placeholder="Postcode" aria-label="Postcode" />
          </div>
          <div className="cad-2">
            <input value={form.state} onChange={e => setForm({ ...form, state: e.target.value })} placeholder="State" aria-label="State" />
            <input value={form.country} onChange={e => setForm({ ...form, country: e.target.value })} placeholder="Country" aria-label="Country" />
          </div>
          <button type="button" className="cad-save" disabled={busy === 'add' || (!form.line1.trim() && !form.city.trim())} onClick={add}>{busy === 'add' ? 'Saving…' : 'Save address'}</button>
        </div>
      )}
    </div>
  )
}

const CAD_CSS = `
.cad{--cad-fill:#f4f4f5;--cad-soft:#71717a;margin-top:18px}
[data-theme="dark"] .cad{--cad-fill:#2a2a2e;--cad-soft:#a1a1aa}
.cad-h{display:flex;align-items:center;gap:8px;margin-bottom:10px}
.cad-h h3{margin:0;font-size:15px;font-weight:700;color:var(--ink)}
.cad-count{min-width:20px;height:20px;padding:0 6px;border-radius:999px;background:var(--cad-fill);color:var(--cad-soft);font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.cad-add{margin-left:auto;display:inline-flex;align-items:center;gap:5px;height:30px;padding:0 12px;border:none;border-radius:999px;background:var(--cad-fill);color:var(--ink);font:inherit;font-size:12.5px;font-weight:650;cursor:pointer}
.cad-add.accent{background:color-mix(in srgb,var(--coral) 12%,transparent);color:var(--coral)}
.cad-add:hover{filter:brightness(.97)}
.cad-empty{margin:0;padding:12px 14px;border-radius:16px;background:var(--cad-fill);font-size:12.5px;line-height:1.45;color:var(--cad-soft)}
.cad-list{display:flex;flex-direction:column;gap:8px}
.cad-card{padding:11px 12px 11px 13px;border-radius:16px;background:var(--cad-fill)}
.cad-card.def{box-shadow:inset 0 0 0 1.5px color-mix(in srgb,#10b981 45%,transparent)}
.cad-top{display:flex;align-items:flex-start;gap:9px}
.cad-pin{flex-shrink:0;margin-top:2px;color:var(--cad-soft)}
.cad-addr{margin:0;flex:1;min-width:0;font-size:13.5px;line-height:1.45;color:var(--ink);overflow-wrap:anywhere}
.cad-def{flex-shrink:0;height:22px;padding:0 9px;border-radius:999px;background:color-mix(in srgb,#10b981 15%,transparent);color:#047857;font-size:11.5px;font-weight:700;display:inline-flex;align-items:center}
[data-theme="dark"] .cad-def{color:#6ee7b7}
.cad-src{margin:4px 0 0 24px;font-size:11.5px;color:var(--cad-soft)}
.cad-acts{display:flex;gap:6px;margin:8px 0 0 24px}
.cad-acts button{height:28px;padding:0 11px;border:none;border-radius:999px;background:var(--card,#fff);color:var(--ink);font:inherit;font-size:12px;font-weight:650;cursor:pointer}
.cad-acts button.del{color:#dc2626}
.cad-acts button:disabled{opacity:.55;cursor:default}
.cad-form{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.cad-2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.cad-form input{width:100%;min-width:0;box-sizing:border-box;height:42px;padding:0 13px;border:1.5px solid transparent;border-radius:14px;background:var(--cad-fill);color:var(--ink);font:inherit;font-size:13.5px;outline:none}
.cad-form input:focus{background:var(--card,#fff);border-color:color-mix(in srgb,var(--coral) 55%,transparent)}
.cad-save{align-self:flex-start;height:38px;padding:0 16px;border:none;border-radius:999px;background:var(--coral);color:#fff;font:inherit;font-size:13.5px;font-weight:700;cursor:pointer}
.cad-save:disabled{opacity:.55;cursor:default}
.cad button:focus-visible{outline:2px solid color-mix(in srgb,var(--coral) 55%,transparent);outline-offset:2px}
`
