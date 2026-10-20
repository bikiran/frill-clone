'use client'

// Billing → Business details: the name, ABN and address Colvy's tax invoices
// are made out to (/api/billing/details). The ABN is optional and checked
// (11 digits, ATO check digit) here and on the server. Saved details also go
// to Stripe (name, address, ABN as an au_abn tax ID) so Stripe's own invoices
// match. Documents already issued keep the details they were issued with.

import { useEffect, useState } from 'react'
import { authFetch } from '@/lib/auth-fetch'
import { parseOptionalAbn } from '@/lib/abn'

type Details = { legalName: string; abn: string; email: string; address: { line1: string; line2: string; suburb: string; state: string; postcode: string } }
const EMPTY: Details = { legalName: '', abn: '', email: '', address: { line1: '', line2: '', suburb: '', state: '', postcode: '' } }
const STATES = ['NSW', 'VIC', 'QLD', 'WA', 'SA', 'TAS', 'ACT', 'NT']

const BuildingIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 21V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v16"/><path d="M16 9h2a2 2 0 0 1 2 2v10"/><path d="M8 7h4M8 11h4M8 15h4M3 21h18"/></svg>
)

export default function BillingDetailsCard({ companyId }: { companyId: string }) {
  const [d, setD] = useState<Details>(EMPTY)
  const [defaults, setDefaults] = useState<{ legalName: string; email: string }>({ legalName: '', email: '' })
  const [ready, setReady] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [msg, setMsg] = useState<{ good: boolean; text: string } | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  useEffect(() => {
    let alive = true
    authFetch(`/api/billing/details?companyId=${encodeURIComponent(companyId)}`).then(r => r.json()).then(j => {
      if (!alive) return
      if (j?.details) setD({ ...EMPTY, ...j.details, address: { ...EMPTY.address, ...(j.details.address || {}) } })
      if (j?.defaults) setDefaults(j.defaults)
      setReady(j?.ready !== false)
    }).catch(() => {}).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [companyId])

  const set = (k: keyof Details, v: string) => { setD(p => ({ ...p, [k]: v })); setMsg(null) }
  const setA = (k: keyof Details['address'], v: string) => { setD(p => ({ ...p, address: { ...p.address, [k]: v } })); setMsg(null) }
  const abnCheck = parseOptionalAbn(d.abn)

  async function save() {
    if (!abnCheck.ok) { setErrors({ abn: abnCheck.error }); return }
    setSaving(true); setMsg(null); setErrors({})
    try {
      const res = await authFetch('/api/billing/details', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, ...d }) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { setErrors(j.errors || {}); setMsg({ good: false, text: j.error || 'We couldn’t save that. Try again.' }); if (j.notReady) setReady(false); return }
      if (j.details) setD({ ...EMPTY, ...j.details, address: { ...EMPTY.address, ...(j.details.address || {}) } })
      setMsg({ good: true, text: 'Saved. Your next invoices will show these details.' })
    } catch { setMsg({ good: false, text: 'We couldn’t save that. Check your connection and try again.' }) }
    finally { setSaving(false) }
  }

  const input: React.CSSProperties = { padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--card, #fff)', color: 'var(--ink)', fontSize: 14, width: '100%', marginTop: 4, boxSizing: 'border-box' }
  const label = 'text-xs font-semibold block'
  const err = (k: string) => errors[k] ? <span className="block text-xs mt-1 font-normal" style={{ color: '#b42318' }}>{errors[k]}</span> : null

  return (
    <section id="business-details" className="bg-white rounded-2xl border p-5 md:p-6 mb-6" style={{ borderColor: 'var(--border)', scrollMarginTop: 80 }}>
      <div className="flex items-start gap-3 mb-5" style={{ minWidth: 0 }}>
        <span className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0" style={{ background: 'var(--peach)', color: 'var(--coral)' }}><BuildingIcon /></span>
        <div style={{ minWidth: 0 }}>
          <h2 className="font-bold" style={{ color: 'var(--ink)' }}>Business details for invoices</h2>
          <p className="text-sm mt-0.5" style={{ color: 'var(--slate)', lineHeight: 1.5 }}>Who Colvy’s tax invoices are made out to. Add your ABN to claim the GST on what you pay Colvy.</p>
        </div>
      </div>
      {loading ? (
        <div className="h-24 rounded-xl animate-pulse" style={{ background: 'var(--canvas)' }} />
      ) : (
        <>
          {!ready && <p className="mb-4 p-3.5 rounded-xl text-sm" style={{ background: 'var(--canvas)', border: '1px solid var(--border)', color: 'var(--slate)' }}>Business details can’t be saved just yet. Your invoices use your workspace name for now.</p>}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className={label} style={{ color: 'var(--slate)' }}>Legal business name
              <input value={d.legalName} onChange={e => set('legalName', e.target.value)} placeholder={defaults.legalName || 'e.g. Roxy Aquarium Pty Ltd'} autoComplete="organization" style={input} />
            </label>
            <label className={label} style={{ color: 'var(--slate)' }}>ABN (optional)
              <input value={d.abn} onChange={e => { set('abn', e.target.value); setErrors(x => ({ ...x, abn: '' })) }} onBlur={() => { if (!abnCheck.ok) setErrors(x => ({ ...x, abn: abnCheck.error })) }}
                placeholder="51 824 753 556" inputMode="numeric" aria-invalid={!!errors.abn} style={{ ...input, borderColor: errors.abn ? '#b42318' : 'var(--border)' }} />
              {err('abn')}
            </label>
            <label className={`${label} sm:col-span-2`} style={{ color: 'var(--slate)' }}>Billing email
              <input value={d.email} onChange={e => set('email', e.target.value)} placeholder={defaults.email || 'accounts@yourbusiness.com.au'} type="email" autoComplete="email" style={input} />
              <span className="block text-xs mt-1 font-normal" style={{ color: 'var(--slate)' }}>Where we send your invoices. Leave blank to use the owner’s email.</span>
              {err('email')}
            </label>
            <label className={`${label} sm:col-span-2`} style={{ color: 'var(--slate)' }}>Address
              <input value={d.address.line1} onChange={e => setA('line1', e.target.value)} placeholder="Street address" autoComplete="address-line1" style={input} />
            </label>
            <label className={`${label} sm:col-span-2`} style={{ color: 'var(--slate)' }}><span className="sr-only">Address line 2</span>
              <input value={d.address.line2} onChange={e => setA('line2', e.target.value)} placeholder="Unit, level (optional)" autoComplete="address-line2" style={{ ...input, marginTop: 0 }} />
            </label>
            <label className={label} style={{ color: 'var(--slate)' }}>Suburb
              <input value={d.address.suburb} onChange={e => setA('suburb', e.target.value)} autoComplete="address-level2" style={input} />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <label className={label} style={{ color: 'var(--slate)' }}>State
                <select value={d.address.state} onChange={e => setA('state', e.target.value)} style={input}>
                  <option value="">Choose</option>
                  {STATES.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                {err('state')}
              </label>
              <label className={label} style={{ color: 'var(--slate)' }}>Postcode
                <input value={d.address.postcode} onChange={e => setA('postcode', e.target.value)} inputMode="numeric" maxLength={4} autoComplete="postal-code" style={input} />
                {err('postcode')}
              </label>
            </div>
          </div>
          <div className="mt-4 flex items-center gap-3 flex-wrap">
            <button onClick={save} disabled={saving || !ready}
              className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-bold text-white cursor-pointer transition-opacity hover:opacity-90 disabled:opacity-50 disabled:cursor-default"
              style={{ background: 'var(--coral)' }}>
              {saving ? 'Saving…' : 'Save details'}
            </button>
            {msg && <p role="status" className="text-sm" style={{ color: msg.good ? '#067647' : '#b42318' }}>{msg.text}</p>}
          </div>
          <p className="text-xs mt-3" style={{ color: 'var(--slate)', lineHeight: 1.5 }}>Invoices already issued keep the details they were issued with.</p>
        </>
      )}
    </section>
  )
}
