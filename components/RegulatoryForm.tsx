'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

// Collects the AU regulatory bundle Telnyx requires before a number can be
// activated. Shown BEFORE checkout — the buyer can't pay until this is
// complete. Landline needs identity + AU address + proof; mobile also needs a
// date of birth and (later) Onfido ID verification.
export default function RegulatoryForm({ companyId, numberType, onComplete, onCancel }: {
  companyId: string
  numberType: 'local' | 'mobile'
  onComplete: (bundleId: string) => void
  onCancel: () => void
}) {
  const [form, setForm] = useState<any>({
    entity_type: 'business', country: 'AU', number_type: numberType,
  })
  const [proofFile, setProofFile] = useState<File | null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    // Prefill from any existing bundle
    ;(async () => {
      try {
        const res = await fetch(`/api/telnyx/regulatory?companyId=${companyId}`)
        const data = await res.json()
        if (data.bundle) setForm((f: any) => ({ ...f, ...data.bundle, number_type: numberType }))
      } catch {}
    })()
  }, [companyId, numberType])

  const set = (k: string, v: any) => setForm((f: any) => ({ ...f, [k]: v }))

  const uploadProof = async (): Promise<string | null> => {
    if (!proofFile) return form.proof_of_address_url || null
    setUploading(true)
    try {
      const path = `regulatory/${companyId}/${Date.now()}-${proofFile.name}`
      const { error: upErr } = await supabase.storage.from('documents').upload(path, proofFile, { upsert: true })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('documents').getPublicUrl(path)
      return data.publicUrl
    } catch (e: any) {
      // Storage bucket may need creating — surface a clear message
      setError(`Could not upload proof of address: ${e.message}. Ensure a "documents" storage bucket exists.`)
      return null
    } finally { setUploading(false) }
  }

  const submit = async () => {
    setError(''); setSaving(true)
    try {
      const proofUrl = await uploadProof()
      const payload = { ...form, companyId, number_type: numberType, proof_of_address_url: proofUrl, action: 'submit' }
      const res = await fetch('/api/telnyx/regulatory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save details')
      onComplete(data.bundleId)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  const L = ({ children }: { children: React.ReactNode }) => (
    <label style={{ display: 'block', fontSize: 12.5, fontWeight: 600, color: 'var(--ink)', marginBottom: 5, marginTop: 14 }}>{children}</label>
  )
  const inputStyle: React.CSSProperties = { width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box' }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: '#fff', borderRadius: 18, maxWidth: 520, width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: 26 }}>
        <h2 style={{ margin: '0 0 4px', fontSize: 20, fontWeight: 800, color: 'var(--ink)' }}>Verify your details</h2>
        <p style={{ margin: '0 0 4px', fontSize: 13.5, color: 'var(--slate)', lineHeight: 1.5 }}>
          Australian regulations (ACMA) require these details before we can activate your {numberType === 'mobile' ? 'mobile' : 'landline'} number. Verification typically takes up to 72 hours.
        </p>

        {error && <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10, padding: '10px 12px', margin: '12px 0', fontSize: 13, color: '#dc2626' }}>{error}</div>}

        <L>This number is for</L>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['business', 'individual'] as const).map(t => (
            <button key={t} type="button" onClick={() => set('entity_type', t)}
              style={{ flex: 1, padding: '10px', borderRadius: 10, border: form.entity_type === t ? '2px solid var(--coral)' : '1px solid var(--border)', background: form.entity_type === t ? 'var(--peach)' : '#fff', cursor: 'pointer', fontSize: 13, fontWeight: 600, textTransform: 'capitalize' }}>
              {t === 'business' ? 'A business' : 'An individual'}
            </button>
          ))}
        </div>

        {form.entity_type === 'business' && (<><L>Business name</L><input style={inputStyle} value={form.business_name || ''} onChange={e => set('business_name', e.target.value)} /></>)}

        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 1 }}><L>{form.entity_type === 'business' ? 'Representative first name' : 'First name'}</L><input style={inputStyle} value={form.first_name || ''} onChange={e => set('first_name', e.target.value)} /></div>
          <div style={{ flex: 1 }}><L>Last name</L><input style={inputStyle} value={form.last_name || ''} onChange={e => set('last_name', e.target.value)} /></div>
        </div>

        {numberType === 'mobile' && (<><L>Date of birth (required for mobile)</L><input type="date" style={inputStyle} value={form.date_of_birth || ''} onChange={e => set('date_of_birth', e.target.value)} /></>)}

        <L>Contact phone</L>
        <input style={inputStyle} value={form.contact_phone || ''} onChange={e => set('contact_phone', e.target.value)} placeholder="+61…" />

        <div style={{ marginTop: 20, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
          <p style={{ margin: '0 0 2px', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>Australian address</p>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)' }}>Must be an address in Australia.</p>
        </div>
        <L>Street address</L>
        <input style={inputStyle} value={form.address_line1 || ''} onChange={e => set('address_line1', e.target.value)} placeholder="12 Collins St" />
        <input style={{ ...inputStyle, marginTop: 8 }} value={form.address_line2 || ''} onChange={e => set('address_line2', e.target.value)} placeholder="Unit / level (optional)" />
        <div style={{ display: 'flex', gap: 10 }}>
          <div style={{ flex: 2 }}><L>City</L><input style={inputStyle} value={form.city || ''} onChange={e => set('city', e.target.value)} placeholder="Melbourne" /></div>
          <div style={{ flex: 1 }}><L>State</L>
            <select style={inputStyle} value={form.state || ''} onChange={e => set('state', e.target.value)}>
              <option value="">—</option>
              {['VIC', 'NSW', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div style={{ flex: 1 }}><L>Postcode</L><input style={inputStyle} value={form.postal_code || ''} onChange={e => set('postal_code', e.target.value)} placeholder="3000" /></div>
        </div>

        <L>Proof of address</L>
        <p style={{ margin: '0 0 8px', fontSize: 11.5, color: 'var(--slate)' }}>A utility bill or bank statement dated within the last 3 months, showing the address above.</p>
        <input type="file" accept="image/*,application/pdf" onChange={e => setProofFile(e.target.files?.[0] || null)} style={{ fontSize: 13 }} />
        {form.proof_of_address_url && !proofFile && <p style={{ fontSize: 11.5, color: 'var(--green, #059669)', marginTop: 6 }}>✓ A document is already on file</p>}

        {numberType === 'mobile' && (
          <div style={{ marginTop: 18, padding: 14, borderRadius: 12, background: 'var(--peach)', fontSize: 12.5, color: 'var(--ink)', lineHeight: 1.5 }}>
            <strong>ID verification:</strong> After you submit, you'll receive a secure link (powered by Onfido) to verify your identity with a photo ID. This is required by Australian law for mobile numbers.
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 24 }}>
          <button type="button" onClick={onCancel} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
          <button type="button" onClick={submit} disabled={saving || uploading}
            style={{ flex: 2, padding: '12px', borderRadius: 10, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 14, fontWeight: 700, cursor: 'pointer', opacity: (saving || uploading) ? 0.7 : 1 }}>
            {uploading ? 'Uploading…' : saving ? 'Saving…' : 'Save & continue to payment'}
          </button>
        </div>
      </div>
    </div>
  )
}
