'use client'

import { authFetch } from '@/lib/auth-fetch'
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
  // The address fields fold away until wanted (a scanned card that fills them opens them).
  const [addrOpen, setAddrOpen] = useState(false)

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
      const res = await authFetch('/api/contacts/scan-card', {
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
            .select('*').eq('company_id', companyId).ilike('email', em).limit(1)
          if (data?.length) dupe = data[0]
        }
        if (!dupe && digits.length >= 8) {
          const { data } = await (supabase as any).from('contacts')
            .select('*').eq('company_id', companyId).ilike('phone', `%${digits.slice(-9)}%`).limit(1)
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

  const showAddr = addrOpen || !!(address || city || state || postcode)
  const opt = <span style={{ fontWeight: 400, color: '#8e8e93' }}> (optional)</span>

  return (
    <div className="acm-scrim" onClick={onClose}>
      <style>{`
        .acm-scrim { position: fixed; inset: 0; z-index: 500; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(17,17,20,.32); animation: acmFade .18s ease both; }
        .acm-card { position: relative; width: 460px; max-width: 95vw; max-height: 90dvh; overflow-y: auto; padding: 26px 26px 0; border-radius: 22px; background: #fff; box-shadow: 0 24px 64px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.04); animation: acmIn .28s cubic-bezier(.22,1,.36,1) both; }
        @keyframes acmFade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes acmIn { from { opacity: 0; transform: translateY(10px) scale(.98) } to { opacity: 1; transform: none } }
        .acm-x { position: absolute; top: 18px; right: 18px; width: 34px; height: 34px; border: none; border-radius: 999px; background: #f4f4f5; color: #52525b; cursor: pointer; display: flex; align-items: center; justify-content: center; }
        .acm-x:hover { background: #ececef; color: #18181b; }
        .acm-label { display: block; margin: 18px 0 7px; font-size: 13.5px; font-weight: 600; color: #18181b; }
        .acm-input { width: 100%; box-sizing: border-box; height: 42px; padding: 0 14px; border: 1.5px solid transparent; border-radius: 12px; background: #f4f4f5; font: inherit; font-size: 14px; color: #111; outline: none; transition: background .15s, border-color .15s, box-shadow .15s; }
        textarea.acm-input { height: auto; min-height: 64px; padding: 11px 14px; resize: vertical; line-height: 1.45; }
        .acm-input:focus { background: #fff; border-color: #d4d4d8; box-shadow: 0 0 0 3px color-mix(in srgb, var(--coral) 16%, transparent); }
        .acm-input::placeholder { color: #a1a1aa; }
        .acm-scan { margin-top: 18px; width: 100%; display: flex; align-items: center; gap: 12px; padding: 12px 14px; border: none; border-radius: 14px; background: #f6f6f7; font: inherit; text-align: left; cursor: pointer; transition: background .15s; }
        .acm-scan:hover:not(:disabled) { background: #efeff1; }
        .acm-scan:disabled { cursor: default; opacity: .75; }
        .acm-scan-ic { width: 40px; height: 40px; flex-shrink: 0; border-radius: 12px; display: flex; align-items: center; justify-content: center; background: #fff; color: var(--coral); box-shadow: 0 1px 2px rgba(0,0,0,.06); }
        .acm-pills { display: flex; flex-wrap: wrap; gap: 6px; }
        .acm-pill { height: 34px; padding: 0 14px; border: none; border-radius: 999px; background: #f4f4f5; color: #52525b; font: inherit; font-size: 13.5px; font-weight: 600; cursor: pointer; transition: background .15s, color .15s; }
        .acm-pill:hover { background: #ececef; color: #18181b; }
        .acm-pill.on { background: #18181b; color: #fff; }
        .acm-pill:focus-visible, .acm-more:focus-visible, .acm-scan:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
        .acm-more { margin-top: 16px; display: inline-flex; align-items: center; gap: 6px; padding: 0; border: none; background: none; font: inherit; font-size: 13.5px; font-weight: 600; color: var(--coral); cursor: pointer; }
        .acm-spin { width: 16px; height: 16px; border-radius: 50%; border: 2px solid #e4e4e7; border-top-color: var(--coral); animation: acmSpin .7s linear infinite; }
        @keyframes acmSpin { to { transform: rotate(360deg) } }
        .acm-card .modal-sticky-foot { border-top-color: #f0f0f2; }
        @media (prefers-reduced-motion: reduce) { .acm-scrim, .acm-card { animation: none; } }
      `}</style>
      <div className="acm-card" role="dialog" aria-modal="true" aria-labelledby="acm-title" onClick={e => e.stopPropagation()}>
        <button type="button" className="acm-x" onClick={onClose} aria-label="Close">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <h3 id="acm-title" style={{ margin: '0 44px 3px 0', fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: '#111' }}>New contact</h3>
        <p style={{ margin: 0, fontSize: 13.5, color: '#71717a' }}>Added by hand. You can message them through Colvy.</p>

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
        <button type="button" className="acm-scan" onClick={() => fileRef.current?.click()} disabled={scanning}>
          <span className="acm-scan-ic">
            {scanning ? <span className="acm-spin" /> : <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>}
          </span>
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: 'block', fontSize: 14.5, fontWeight: 650, color: '#18181b' }}>{scanning ? 'Reading the photo…' : 'Scan a business card'}</span>
            <span style={{ display: 'block', marginTop: 1, fontSize: 12.5, color: '#71717a' }}>Snap or upload one and Colvy fills in the form</span>
          </span>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#a1a1aa" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><polyline points="9 18 15 12 9 6" /></svg>
        </button>
        {scanError && <p style={{ margin: '8px 2px 0', fontSize: 13, color: '#dc2626' }}>{scanError}</p>}
        {scanNote && !scanError && <p style={{ margin: '8px 2px 0', fontSize: 13, color: '#047857', fontWeight: 600 }}>{scanNote}</p>}

        <label className="acm-label" htmlFor="acm-name">Name</label>
        <input id="acm-name" className="acm-input" value={name} onChange={e => setName(e.target.value)} placeholder="Full name" autoFocus />

        <span className="acm-label">Who are they?</span>
        <div className="acm-pills" role="radiogroup" aria-label="Relationship">
          {RELATIONSHIPS.map(r => (
            <button key={r.key} type="button" role="radio" aria-checked={relationship === r.key} className={`acm-pill${relationship === r.key ? ' on' : ''}`} onClick={() => setRelationship(r.key)}>
              {r.label}
            </button>
          ))}
        </div>
        {relationship !== 'customer' && (
          <p style={{ margin: '8px 2px 0', fontSize: 12.5, color: '#8e8e93' }}>
            Left out of marketing by default. You can opt them in later on their profile.
          </p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
          <div>
            <label className="acm-label" htmlFor="acm-phone">Phone</label>
            <input id="acm-phone" className="acm-input" value={phone} onChange={e => setPhone(e.target.value)} placeholder="+61…" inputMode="tel" />
          </div>
          <div>
            <label className="acm-label" htmlFor="acm-email">Email</label>
            <input id="acm-email" className="acm-input" value={email} onChange={e => setEmail(e.target.value)} placeholder="name@example.com" inputMode="email" />
          </div>
        </div>

        <label className="acm-label" htmlFor="acm-co">Business name{opt}</label>
        <input id="acm-co" className="acm-input" value={companyName} onChange={e => setCompanyName(e.target.value)} placeholder="e.g. Aqua Supplies Pty Ltd" />

        {!showAddr ? (
          <button type="button" className="acm-more" onClick={() => setAddrOpen(true)}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></svg>
            Add an address
          </button>
        ) : (
          <>
            <label className="acm-label" htmlFor="acm-addr">Address</label>
            <input id="acm-addr" className="acm-input" value={address} onChange={e => setAddress(e.target.value)} placeholder="5 Clunes Avenue" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginTop: 10 }}>
              <input className="acm-input" aria-label="City or suburb" value={city} onChange={e => setCity(e.target.value)} placeholder="Suburb" />
              <input className="acm-input" aria-label="State" value={state} onChange={e => setState(e.target.value)} placeholder="State" />
              <input className="acm-input" aria-label="Postcode" value={postcode} onChange={e => setPostcode(e.target.value)} placeholder="Postcode" inputMode="numeric" />
              <input className="acm-input" aria-label="Country" value={country} onChange={e => setCountry(e.target.value)} placeholder="Country" />
            </div>
          </>
        )}

        <label className="acm-label" htmlFor="acm-notes">Notes{opt}</label>
        <textarea id="acm-notes" className="acm-input" value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder="Anything worth remembering…" />

        {existingMatch && (
          <div style={{ marginTop: 16, padding: '14px 16px', borderRadius: 14, background: '#fff7e6' }}>
            <p style={{ margin: '0 0 3px', fontSize: 14, fontWeight: 650, color: '#92400e' }}>This contact already exists</p>
            <p style={{ margin: '0 0 12px', fontSize: 13, color: '#92400e', lineHeight: 1.45 }}>
              {existingMatch.name || 'Unnamed'}{existingMatch.email ? ` · ${existingMatch.email}` : ''}{existingMatch.phone ? ` · ${existingMatch.phone}` : ''}
              {existingMatch.source ? ` (added via ${existingMatch.source})` : ''}
            </p>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" onClick={() => { onCreated(existingMatch); }} className="cv-btn cv-btn-dark" style={{ flex: 1, height: 36, fontSize: 13.5 }}>Open existing</button>
              <button type="button" onClick={() => { setAllowDuplicate(true); setExistingMatch(null) }} className="cv-btn" style={{ flex: 1, height: 36, fontSize: 13.5 }}>Add anyway</button>
            </div>
          </div>
        )}

        {error && <p style={{ margin: '12px 2px 0', fontSize: 13, color: '#dc2626' }}>{error}</p>}

        <div className="modal-sticky-foot">
          <button type="button" onClick={onClose} className="cv-btn" style={{ flex: 1, height: 44 }}>Cancel</button>
          <button type="button" onClick={save} disabled={saving} className="cv-btn cv-btn-primary" style={{ flex: 2, height: 44 }}>
            {saving ? 'Saving…' : 'Create contact'}
          </button>
        </div>
      </div>
    </div>
  )
}
