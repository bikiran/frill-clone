'use client'

import { useRef, useState } from 'react'
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
  const [existingMatch, setExistingMatch] = useState<any>(null)
  const [allowDuplicate, setAllowDuplicate] = useState(false)

  // Scan a photo (business card, signature, handwritten details) → fill the form.
  const fileRef = useRef<HTMLInputElement>(null)
  const [scanning, setScanning] = useState(false)
  const [scanError, setScanError] = useState('')
  const [scanNote, setScanNote] = useState('')

  const normPhone = (p: string) => p.replace(/[^\d+]/g, '')

  // Downscale a camera photo to a sane size before upload — a raw phone shot is
  // several MB, most of which is wasted on the model and slows the request. Cap
  // the long edge at 1600px and re-encode as JPEG. Returns { data, mediaType }.
  const toScaledImage = (file: File): Promise<{ data: string; mediaType: string }> =>
    new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onerror = () => reject(new Error('Could not read that file'))
      reader.onload = () => {
        const img = new Image()
        img.onerror = () => reject(new Error('That file is not a readable image'))
        img.onload = () => {
          const MAX = 1600
          let { width, height } = img
          if (width > MAX || height > MAX) {
            const scale = MAX / Math.max(width, height)
            width = Math.round(width * scale)
            height = Math.round(height * scale)
          }
          const canvas = document.createElement('canvas')
          canvas.width = width; canvas.height = height
          const ctx = canvas.getContext('2d')
          if (!ctx) { reject(new Error('Could not process that image')); return }
          ctx.drawImage(img, 0, 0, width, height)
          resolve({ data: canvas.toDataURL('image/jpeg', 0.8), mediaType: 'image/jpeg' })
        }
        img.src = reader.result as string
      }
      reader.readAsDataURL(file)
    })

  // Fill a field only when it's still empty, so a scan never clobbers something
  // the user already typed. Country is special-cased: it's pre-filled with the
  // 'Australia' default, so allow the scan to correct it while it's untouched.
  const fillEmpty = (cur: string, val: string | null, set: (v: string) => void) => {
    if (val && !cur.trim()) set(val)
  }

  const runScan = async (file: File) => {
    setScanError(''); setScanNote(''); setError('')
    if (!file.type.startsWith('image/')) { setScanError('Choose a photo or image file.'); return }
    setScanning(true)
    try {
      const { data, mediaType } = await toScaledImage(file)
      const res = await fetch('/api/contacts/scan-card', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ companyId, image: data, mediaType }),
      })
      const json = await res.json().catch(() => ({}))
      if (!res.ok || !json?.ok) {
        setScanError(json?.error || 'Could not scan that photo. Try a clearer, well-lit shot.')
        return
      }
      const f = json.fields || {}
      fillEmpty(name, f.name, setName)
      fillEmpty(phone, f.phone, setPhone)
      fillEmpty(email, f.email, setEmail)
      fillEmpty(companyName, f.company_name, setCompanyName)
      fillEmpty(address, f.address, setAddress)
      fillEmpty(city, f.city, setCity)
      fillEmpty(state, f.state, setState)
      fillEmpty(postcode, f.postcode, setPostcode)
      // Country carries an 'Australia' default; let a scan overwrite it while
      // it's still the untouched default, but never once the user has changed it.
      if (f.country && (!country.trim() || country.trim() === 'Australia')) setCountry(f.country)
      fillEmpty(notes, f.notes, setNotes)

      const filled = ['name', 'phone', 'email', 'company_name', 'address', 'city', 'state', 'postcode', 'country', 'notes']
        .filter(k => f[k]).length
      setScanNote(filled ? 'Filled from photo — check the details before saving.' : 'No new details found in that photo.')
    } catch (e: any) {
      setScanError(e?.message || 'Could not scan that photo.')
    } finally {
      setScanning(false)
    }
  }

  const save = async () => {
    if (!name.trim() && !phone.trim() && !email.trim()) {
      setError('Add at least a name, phone, or email.')
      return
    }
    setSaving(true); setError('')

    // Don't quietly create a second record for someone already on file — match
    // on email, or on the last 9 phone digits so 0405… and +61405… count as the
    // same person.
    if (!allowDuplicate) {
      try {
        const em = email.trim().toLowerCase()
        const digits = phone.replace(/\D/g, '')
        let dupe: any = null
        if (em) {
          const { data } = await (supabase as any).from('contacts')
            .select('id, name, email, phone, source').eq('company_id', companyId).ilike('email', em).limit(1)
          if (data?.length) dupe = data[0]
        }
        if (!dupe && digits.length >= 8) {
          const { data } = await (supabase as any).from('contacts')
            .select('id, name, email, phone, source').eq('company_id', companyId).ilike('phone', `%${digits.slice(-9)}%`).limit(1)
          if (data?.length) dupe = data[0]
        }
        if (dupe) {
          setExistingMatch(dupe)
          setSaving(false)
          return
        }
      } catch { /* if the check fails, continue and create */ }
    }
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

        {/* Scan a photo → auto-fill. A hidden input drives both file pick and,
            on mobile, the camera (capture="environment"). */}
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          capture="environment"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0]
            if (file) runScan(file)
            e.target.value = '' // allow re-selecting the same file
          }}
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={scanning}
          style={{
            marginTop: 14, width: '100%', padding: '11px 12px', borderRadius: 11,
            border: '1px dashed var(--coral)', background: 'var(--peach)', color: 'var(--coral)',
            fontSize: 13.5, fontWeight: 700, cursor: scanning ? 'default' : 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: scanning ? 0.7 : 1,
          }}
        >
          {scanning ? 'Scanning photo…' : '📇 Scan a business card or photo'}
        </button>
        <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--slate)', textAlign: 'center' }}>
          Upload or snap a card — Colvy reads the details and fills the form below.
        </p>
        {scanError && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#dc2626' }}>{scanError}</p>}
        {scanNote && !scanError && <p style={{ margin: '8px 0 0', fontSize: 12.5, color: '#047857', fontWeight: 600 }}>{scanNote}</p>}

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

        {existingMatch && (
          <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 11, background: '#fffbeb', border: '1px solid #fde68a' }}>
            <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: '#92400e' }}>This contact already exists</p>
            <p style={{ margin: '0 0 10px', fontSize: 12.5, color: '#92400e', lineHeight: 1.45 }}>
              {existingMatch.name || 'Unnamed'}{existingMatch.email ? ` · ${existingMatch.email}` : ''}{existingMatch.phone ? ` · ${existingMatch.phone}` : ''}
              {existingMatch.source ? ` (added via ${existingMatch.source})` : ''}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { onCreated(existingMatch); }}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Open existing
              </button>
              <button type="button" onClick={() => { setAllowDuplicate(true); setExistingMatch(null) }}
                style={{ flex: 1, padding: '8px 0', borderRadius: 8, border: '1px solid #fde68a', background: '#fff', color: '#92400e', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Add anyway
              </button>
            </div>
          </div>
        )}

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
