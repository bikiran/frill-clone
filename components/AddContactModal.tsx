'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

const RELATIONSHIPS = [
  { key: 'customer', label: 'Customer' },
  { key: 'supplier', label: 'Supplier' },
  { key: 'wholesaler', label: 'Wholesaler' },
  { key: 'business', label: 'Business contact' },
] as const

/**
 * Add a contact by hand (source = 'manual').
 *
 * These are people the business wants to reach through Colvy who didn't arrive
 * via a chat, order, or channel — a supplier, a wholesaler, a business contact.
 * They're labelled 'manual' so they're distinguishable from channel-sourced
 * contacts, and non-customers are excluded from marketing by default.
 */
export default function AddContactModal({
  companyId, onClose, onCreated, defaultPhone, defaultName,
}: {
  companyId: string
  onClose: () => void
  onCreated: (contact: any) => void
  defaultPhone?: string
  defaultName?: string
}) {
  const [name, setName] = useState(defaultName || '')
  const [phone, setPhone] = useState(defaultPhone || '')
  const [email, setEmail] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [state, setState] = useState('')
  const [postcode, setPostcode] = useState('')
  const [country, setCountry] = useState('Australia')
  const [relationship, setRelationship] = useState<string>('customer')
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const normPhone = (p: string) => p.replace(/[^\d+]/g, '')

  const save = async () => {
    if (!name.trim() && !phone.trim() && !email.trim()) {
      setError('Add at least a name, phone, or email.')
      return
    }
    setSaving(true); setError('')
    // Non-customers are not marketed to unless explicitly opted in later.
    const isCustomer = relationship === 'customer'
    const row: any = {
      company_id: companyId,
      name: name.trim() || null,
      phone: phone.trim() ? normPhone(phone) : null,
      email: email.trim() ? email.trim().toLowerCase() : null,
      company_name: companyName.trim() || null,
      // Street line goes in `address`; the profile panel shows address, city
      // and country the same way, so keep the same shape.
      address: address.trim() || null,
      city: city.trim() || null,
      state: state.trim() || null,
      postcode: postcode.trim() || null,
      country: country.trim() || null,
      relationship_type: relationship,
      source: 'manual',
      notes: notes.trim() || null,
      subscribed_to_marketing: isCustomer,
    }
    try {
      // Try the full insert; if a newer column is missing, retry without the
      // extras so a contact is still created.
      let { data, error: insErr } = await (supabase as any).from('contacts').insert(row).select().maybeSingle()
      if (insErr) {
        const minimal: any = {
          company_id: companyId, name: row.name, phone: row.phone, email: row.email, source: 'manual',
          // address/city/country have existed since the original schema, so
          // they're safe to keep even in the fallback.
          address: row.address, city: row.city, country: row.country,
        }
        const retry = await (supabase as any).from('contacts').insert(minimal).select().maybeSingle()
        if (retry.error) throw retry.error
        data = retry.data
      }
      onCreated(data)
    } catch (e: any) {
      setError(e.message || 'Could not create contact')
      setSaving(false)
    }
  }

  const L: React.CSSProperties = { fontSize: 12, fontWeight: 700, color: 'var(--slate)', display: 'block', margin: '14px 0 6px' }
  const I: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }

  return (
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500, padding: 20 }}>
      <div onClick={e => e.stopPropagation()} style={{ width: 440, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', background: '#fff', borderRadius: 18, padding: 24 }}>
        <h3 style={{ margin: '0 0 2px', fontSize: 18, fontWeight: 800, color: 'var(--ink)' }}>New contact</h3>
        <p style={{ margin: 0, fontSize: 13, color: 'var(--slate)' }}>Added manually — you can message them through Colvy.</p>

        <label style={L}>Name</label>
        <input value={name} onChange={e => setName(e.target.value)} placeholder="Full name" style={I} autoFocus />

        <label style={L}>Relationship</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 7 }}>
          {RELATIONSHIPS.map(r => {
            const on = relationship === r.key
            return (
              <button key={r.key} type="button" onClick={() => setRelationship(r.key)}
                style={{ padding: '9px 0', borderRadius: 9, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                  border: '1px solid ' + (on ? 'var(--coral)' : 'var(--border)'),
                  background: on ? 'var(--peach)' : '#fff', color: on ? 'var(--coral)' : 'var(--slate)' }}>
                {r.label}
              </button>
            )
          })}
        </div>
        {relationship !== 'customer' && (
          <p style={{ margin: '7px 0 0', fontSize: 11.5, color: 'var(--slate)' }}>
            Excluded from marketing by default. You can opt them in later on their profile.
          </p>
        )}

        <label style={L}>Phone</label>
        <input value={phone} onChange={e => setPhone(e.target.value)} placeholder="+61…" style={I} />

        <label style={L}>Email</label>
        <input value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" style={I} />

        <label style={L}>Company / business name <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <input value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Aqua Supplies Pty Ltd" style={I} />

        <label style={L}>Address</label>
        <input value={address} onChange={e => setAddress(e.target.value)} placeholder="5 Clunes Avenue" style={I} />

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={L}>City / suburb</label>
            <input value={city} onChange={e => setCity(e.target.value)} placeholder="Dallas" style={I} />
          </div>
          <div>
            <label style={L}>State</label>
            <input value={state} onChange={e => setState(e.target.value)} placeholder="VIC" style={I} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label style={L}>Postcode</label>
            <input value={postcode} onChange={e => setPostcode(e.target.value)} placeholder="3047" style={I} />
          </div>
          <div>
            <label style={L}>Country</label>
            <input value={country} onChange={e => setCountry(e.target.value)} placeholder="Australia" style={I} />
          </div>
        </div>

        <label style={L}>Notes <span style={{ fontWeight: 400 }}>(optional)</span></label>
        <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Anything worth remembering…" style={{ ...I, resize: 'vertical', fontFamily: 'inherit' }} />

        {error && <p style={{ margin: '12px 0 0', fontSize: 13, color: '#dc2626' }}>{error}</p>}

        <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
          <button type="button" onClick={onClose} style={{ flex: 1, padding: '11px 0', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--slate)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} style={{ flex: 2, padding: '11px 0', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Create contact'}
          </button>
        </div>
      </div>
    </div>
  )
}
