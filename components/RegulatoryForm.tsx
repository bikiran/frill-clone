'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

// Collects the AU regulatory bundle Telnyx requires before a number can be
// activated. Shown BEFORE checkout — the buyer can't pay until this is
// complete. Landline needs identity + AU address + proof; mobile also needs a
// date of birth and (later) Onfido ID verification.
export default function RegulatoryForm({ companyId, numberType, provider = 'telnyx', free = false, onComplete, onCancel }: {
  companyId: string
  numberType: 'local' | 'mobile' | 'tollfree'
  provider?: 'telnyx' | 'twilio'
  free?: boolean
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
        const res = await authFetch(`/api/${provider}/regulatory?companyId=${companyId}`)
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
      const res = await authFetch(`/api/${provider}/regulatory`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not save details')
      onComplete(data.bundleId)
    } catch (e: any) { setError(e.message) } finally { setSaving(false) }
  }

  // Three short steps instead of one long form: who it's for, the address, then proof.
  const [step, setStep] = useState(0)
  const [tried, setTried] = useState(false)
  const kindWord = numberType === 'mobile' ? 'mobile' : numberType === 'tollfree' ? '1800' : 'landline'
  const need: string[][] = [
    [...(form.entity_type === 'business' ? ['business_name'] : []), 'first_name', 'last_name', ...(numberType === 'mobile' ? ['date_of_birth'] : []), 'contact_phone'],
    ['address_line1', 'city', 'state', 'postal_code'],
    [],
  ]
  const missing = (k: string) => tried && !String(form[k] || '').trim()
  const next = () => {
    if (need[step].some(k => !String(form[k] || '').trim())) { setTried(true); return }
    setTried(false); setStep(s => Math.min(2, s + 1))
  }
  const STEPS = ['About you', 'Address', 'Proof']
  const field = (k: string, label: string, opts: { placeholder?: string; type?: string; half?: boolean } = {}) => (
    <label className={`rgf-f${opts.half ? ' half' : ''}${missing(k) ? ' bad' : ''}`}>
      <span>{label}</span>
      <input type={opts.type || 'text'} value={form[k] || ''} placeholder={opts.placeholder} onChange={e => set(k, e.target.value)} />
    </label>
  )

  return (
    <div className="rgf-back" role="dialog" aria-modal="true" aria-labelledby="rgf-title">
      <style>{RGF_CSS}</style>
      <div className="rgf">
        <div className="rgf-head">
          <div className="rgf-steps" aria-label={`Step ${step + 1} of 3`}>
            {STEPS.map((t, i) => (
              <span key={t} className={i === step ? 'on' : i < step ? 'done' : ''}><i>{i < step ? '✓' : i + 1}</i>{t}</span>
            ))}
          </div>
          <h2 id="rgf-title">Verify your details</h2>
          <p>Australian rules (ACMA) need these before we can switch on your {kindWord} number. Checks usually take up to 72 hours.</p>
        </div>

        <div className="rgf-body" key={step}>
          {error && <div className="rgf-err" role="alert">{error}</div>}
          {tried && <div className="rgf-err soft">Fill in the highlighted fields to continue.</div>}

          {step === 0 && (<>
            <div className="rgf-f">
              <span>This number is for</span>
              <div className="rgf-seg" role="radiogroup" aria-label="This number is for">
                {(['business', 'individual'] as const).map(t => (
                  <button key={t} type="button" role="radio" aria-checked={form.entity_type === t} className={form.entity_type === t ? 'on' : ''} onClick={() => set('entity_type', t)}>
                    {t === 'business' ? 'A business' : 'An individual'}
                  </button>
                ))}
              </div>
            </div>
            {form.entity_type === 'business' && field('business_name', 'Business name', { placeholder: 'As registered with ASIC' })}
            <div className="rgf-row">
              {field('first_name', form.entity_type === 'business' ? 'Representative first name' : 'First name', { half: true })}
              {field('last_name', 'Last name', { half: true })}
            </div>
            <div className="rgf-row">
              {numberType === 'mobile' && field('date_of_birth', 'Date of birth', { type: 'date', half: true })}
              {field('contact_phone', 'Contact phone', { placeholder: '+61 4XX XXX XXX', half: numberType === 'mobile' })}
            </div>
          </>)}

          {step === 1 && (<>
            <p className="rgf-note">Must be an address in Australia.</p>
            {field('address_line1', 'Street address', { placeholder: '12 Collins St' })}
            {field('address_line2', 'Unit or level (optional)', { placeholder: 'Level 3' })}
            <div className="rgf-row three">
              {field('city', 'City', { placeholder: 'Melbourne' })}
              <label className={`rgf-f${missing('state') ? ' bad' : ''}`}>
                <span>State</span>
                <select value={form.state || ''} onChange={e => set('state', e.target.value)}>
                  <option value="">Choose</option>
                  {['VIC', 'NSW', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT'].map(st => <option key={st} value={st}>{st}</option>)}
                </select>
              </label>
              {field('postal_code', 'Postcode', { placeholder: '3000' })}
            </div>
          </>)}

          {step === 2 && (<>
            <div className="rgf-f">
              <span>Proof of address</span>
              <p className="rgf-note" style={{ margin: '0 0 8px' }}>A utility bill or bank statement from the last 3 months, showing {form.address_line1 ? <b>{form.address_line1}{form.city ? `, ${form.city}` : ''}</b> : 'the address you entered'}.</p>
              <FileDrop file={proofFile} existingUrl={form.proof_of_address_url} onPick={f => setProofFile(f)} />
            </div>
            {numberType === 'mobile' && (
              <div className="rgf-id">
                <span className="rgf-id-ic" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="9" cy="12" r="2" /><path d="M14 10h4 M14 14h3" /></svg>
                </span>
                <div><b>One more thing after this: photo ID</b><span>We’ll send you a secure link (powered by Onfido) to verify your identity. Australian law requires it for mobile numbers.</span></div>
              </div>
            )}
          </>)}
        </div>

        <div className="rgf-foot">
          <button type="button" className="rgf-btn ghost" onClick={() => (step === 0 ? onCancel() : (setTried(false), setStep(st => st - 1)))}>{step === 0 ? 'Cancel' : 'Back'}</button>
          {step < 2 ? (
            <button type="button" className="rgf-btn" onClick={next}>Continue</button>
          ) : (
            <button type="button" className="rgf-btn" onClick={submit} disabled={saving || uploading}>
              {uploading ? 'Uploading…' : saving ? 'Saving…' : free ? 'Save & get my number' : 'Save & continue to payment'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

const RGF_CSS = `
.rgf-back{position:fixed;inset:0;z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(17,17,20,.45);animation:rgfFade .2s ease both}
.rgf{display:flex;flex-direction:column;width:100%;max-width:540px;max-height:min(760px,92vh);background:#fff;border-radius:24px;box-shadow:0 30px 80px -20px rgba(0,0,0,.35);overflow:hidden;animation:rgfIn .35s cubic-bezier(.22,1,.36,1) both}
.rgf button::before{display:none!important}
.rgf-head{padding:22px 26px 6px}
.rgf-steps{display:flex;gap:6px;margin-bottom:16px}
.rgf-steps span{display:inline-flex;align-items:center;gap:6px;padding:4px 10px 4px 4px;border-radius:999px;background:#f4f4f5;font-size:12px;font-weight:600;color:#8e8e93}
.rgf-steps i{width:20px;height:20px;border-radius:50%;background:#fff;color:#8e8e93;font-style:normal;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.rgf-steps span.on{background:color-mix(in srgb,var(--coral) 12%,#fff);color:#18181b}
.rgf-steps span.on i{background:var(--coral);color:#fff;box-shadow:none}
.rgf-steps span.done{color:#15803d}
.rgf-steps span.done i{background:#dcfce7;color:#15803d;box-shadow:none}
.rgf-head h2{margin:0 0 4px;font-size:22px;font-weight:800;letter-spacing:-.02em;color:#111}
.rgf-head p{margin:0;font-size:13.5px;line-height:1.5;color:#71717a}
.rgf-body{flex:1;min-height:0;overflow-y:auto;padding:14px 26px 20px;display:flex;flex-direction:column;gap:14px;animation:rgfStep .3s cubic-bezier(.22,1,.36,1) both}
.rgf-row{display:flex;gap:10px}
.rgf-row>*{flex:1;min-width:0}
.rgf-row.three>:first-child{flex:1.6}
.rgf-f{display:flex;flex-direction:column;gap:6px}
.rgf-f>span{font-size:13px;font-weight:600;color:#18181b}
.rgf-f input,.rgf-f select{width:100%;box-sizing:border-box;height:46px;padding:0 14px;border:0;border-radius:12px;background:#f4f4f5;font:inherit;font-size:14.5px;color:#111;outline:none;transition:background .15s,box-shadow .15s}
.rgf-f input::placeholder{color:#a1a1aa}
.rgf-f input:focus,.rgf-f select:focus{background:#fff;box-shadow:0 0 0 2px color-mix(in srgb,var(--coral) 55%,transparent)}
.rgf-f.bad input,.rgf-f.bad select{background:#fef2f2;box-shadow:0 0 0 1.5px #fca5a5}
.rgf-seg{display:flex;padding:4px;border-radius:14px;background:#f4f4f5}
.rgf-seg button{flex:1;height:38px;border:0;border-radius:10px;background:none;font:inherit;font-size:14px;font-weight:600;color:#71717a;cursor:pointer;transition:background .2s,color .2s,box-shadow .2s}
.rgf-seg button.on{background:#fff;color:#111;box-shadow:0 1px 3px rgba(0,0,0,.08),0 0 0 1px rgba(0,0,0,.04)}
.rgf-note{margin:0;font-size:12.5px;line-height:1.5;color:#71717a}
.rgf-note b{color:#3f3f46}
.rgf-err{padding:10px 12px;border-radius:12px;background:#fef2f2;color:#b91c1c;font-size:13px}
.rgf-err.soft{background:#fff7ed;color:#c2410c}
.rgf-id{display:flex;gap:12px;align-items:flex-start;padding:14px;border-radius:16px;background:#f7f7f8}
.rgf-id-ic{width:36px;height:36px;border-radius:11px;background:#fff;color:var(--coral);display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;box-shadow:0 0 0 1px rgba(0,0,0,.06)}
.rgf-id b{display:block;font-size:13.5px;color:#111}
.rgf-id span:not(.rgf-id-ic){display:block;margin-top:2px;font-size:12.5px;line-height:1.5;color:#71717a}
.rgf-foot{display:flex;gap:10px;padding:14px 26px 20px;border-top:1px solid #f0f0f2;background:#fff}
.rgf-btn{flex:2;height:48px;border:0;border-radius:999px;background:var(--coral);color:#fff;font:inherit;font-size:14.5px;font-weight:700;cursor:pointer;box-shadow:inset 0 1px 0 rgba(255,255,255,.22),0 1px 2px rgba(16,24,40,.12)}
.rgf-btn.ghost{flex:1;background:#fff;color:#18181b;box-shadow:0 0 0 1.5px #e4e4e7}
.rgf-btn:disabled{opacity:.6;cursor:default}
.rgf-btn:focus-visible,.rgf-seg button:focus-visible{outline:2px solid var(--coral);outline-offset:2px}
@keyframes rgfFade{from{opacity:0}to{opacity:1}}
@keyframes rgfIn{from{opacity:0;transform:translateY(12px) scale(.98)}to{opacity:1;transform:none}}
@keyframes rgfStep{from{opacity:0;transform:translateX(10px)}to{opacity:1;transform:none}}
@media (max-width:520px){.rgf{border-radius:20px}.rgf-head,.rgf-body,.rgf-foot{padding-left:18px;padding-right:18px}.rgf-row{flex-direction:column;gap:14px}.rgf-steps span{font-size:11px}}
@media (prefers-reduced-motion:reduce){.rgf-back,.rgf,.rgf-body{animation:none}}
`

// A friendlier replacement for the raw <input type="file">. Renders a
// click-or-drag dropzone with an explicit Browse button, the picked file's name
// and size, a preview thumbnail for images, and a clear/remove control. Falls
// back to "already on file" state when a document was uploaded previously.
function FileDrop({ file, existingUrl, onPick }: {
  file: File | null
  existingUrl?: string
  onPick: (f: File | null) => void
}) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const fmtSize = (b: number) => b < 1024 ? `${b} B` : b < 1024 * 1024 ? `${(b / 1024).toFixed(0)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`
  const isImg = file && file.type.startsWith('image/')
  const [thumb, setThumb] = useState<string>('')
  useEffect(() => {
    if (isImg && file) { const u = URL.createObjectURL(file); setThumb(u); return () => URL.revokeObjectURL(u) }
    setThumb('')
  }, [file])

  const open = () => inputRef.current?.click()

  // Picked (or already-on-file) — show a compact card instead of the dropzone.
  if (file || (existingUrl && !file)) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: 12, borderRadius: 12, border: '1px solid var(--border)', background: 'var(--canvas, #fafafa)' }}>
        <input ref={inputRef} type="file" accept="image/*,application/pdf" onChange={e => onPick(e.target.files?.[0] || null)} style={{ display: 'none' }} />
        <div style={{ width: 44, height: 44, borderRadius: 9, flexShrink: 0, background: thumb ? `center/cover no-repeat url(${thumb})` : '#eef2f7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20 }}>
          {!thumb && (file ? '📄' : '✓')}
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p style={{ margin: 0, fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {file ? file.name : 'Document on file'}
          </p>
          <p style={{ margin: '2px 0 0', fontSize: 11.5, color: file ? 'var(--slate)' : '#059669' }}>
            {file ? fmtSize(file.size) : '✓ Already uploaded — pick a new file to replace it'}
          </p>
        </div>
        <button type="button" onClick={open} style={{ padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: 'var(--ink)', fontSize: 12.5, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}>Change</button>
        {file && (
          <button type="button" onClick={() => onPick(null)} aria-label="Remove file" style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: '#fff', color: '#dc2626', fontSize: 14, fontWeight: 700, cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}>×</button>
        )}
      </div>
    )
  }

  return (
    <div
      onClick={open}
      onDragOver={e => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) onPick(f) }}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
        padding: '22px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'center',
        border: `1.5px dashed ${dragOver ? 'var(--coral)' : '#d4d4d8'}`,
        background: dragOver ? 'var(--peach, #fff5f2)' : '#f7f7f8',
        transition: 'border-color .15s, background .15s',
      }}
    >
      <input ref={inputRef} type="file" accept="image/*,application/pdf" onChange={e => onPick(e.target.files?.[0] || null)} style={{ display: 'none' }} />
      <div style={{ fontSize: 22, lineHeight: 1 }}>📎</div>
      <p style={{ margin: 0, fontSize: 13.5, color: 'var(--ink)' }}>
        <span style={{ color: 'var(--coral)', fontWeight: 700 }}>Click to upload</span>{' '}or drag &amp; drop
      </p>
      <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>PNG, JPG or PDF · max ~10&nbsp;MB</p>
    </div>
  )
}
