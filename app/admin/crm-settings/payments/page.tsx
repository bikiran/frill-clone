'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S, ToggleRow } from '../_shared'
import Link from 'next/link'

export default function PaymentsSettings() {
  const { companyId, loading } = useCompanyUser()
  const [cfg, setCfg] = useState<any>({ invoice_prefix: 'INV', primary_color: '#1E75FF', secondary_color: '#1E75FF', pass_fees: false })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!companyId) return
    ;(async () => {
      const { data } = await (supabase as any).from('companies').select('payment_settings').eq('id', companyId).maybeSingle()
      if (data?.payment_settings) setCfg({ ...cfg, ...data.payment_settings })
    })()
  }, [companyId])

  const set = (k: string, v: any) => setCfg((c: any) => ({ ...c, [k]: v }))
  const save = async () => {
    if (!companyId) return
    setSaving(true)
    await (supabase as any).from('companies').update({ payment_settings: cfg }).eq('id', companyId)
    setSaving(false); setSaved(true); setTimeout(() => setSaved(false), 2000)
  }

  if (loading) return <div style={{ color: 'var(--slate)' }}>Loading…</div>

  return (
    <div style={{ maxWidth: 680 }}>
      <h1 style={S.h1}>Payments</h1>
      <p style={S.sub}>Customise how invoices and transactions look and behave.</p>

      <div style={S.card}>
        <h2 style={S.h2}>Customise Invoice</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
          <div><label style={S.label}>Invoice Prefix</label><input value={cfg.invoice_prefix} onChange={e => set('invoice_prefix', e.target.value)} style={S.input} /></div>
          <div>
            <label style={S.label}>Primary Color</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" value={cfg.primary_color} onChange={e => set('primary_color', e.target.value)} style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }} />
              <input value={cfg.primary_color} onChange={e => set('primary_color', e.target.value)} style={S.input} />
            </div>
          </div>
          <div>
            <label style={S.label}>Secondary Color</label>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input type="color" value={cfg.secondary_color} onChange={e => set('secondary_color', e.target.value)} style={{ width: 40, height: 40, borderRadius: 8, border: '1px solid var(--border)', cursor: 'pointer' }} />
              <input value={cfg.secondary_color} onChange={e => set('secondary_color', e.target.value)} style={S.input} />
            </div>
          </div>
        </div>
        <p style={{ ...S.hint, marginTop: 8 }}>Please make sure uploaded logo is 1:1 aspect ratio.</p>
      </div>

      <div style={S.card}>
        <h2 style={S.h2}>Fees</h2>
        <ToggleRow title="Pass transaction fees to customers" desc="When enabled, card processing fees are added to the customer's total." checked={cfg.pass_fees} onChange={v => set('pass_fees', v)} />
      </div>

      <div style={S.card}>
        <h2 style={S.h2}>Transactions</h2>
        <p style={{ ...S.sub, marginBottom: 12 }}>To manage payments &amp; transactions made via Colvy, use the button below. Log in with your primary user email.</p>
        <Link href="/admin/billing" style={{ ...S.btnGhost, textDecoration: 'none', display: 'inline-block' }}>Manage transactions</Link>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <button onClick={save} disabled={saving} style={S.btn}>{saving ? 'Saving…' : 'Save changes'}</button>
        {saved && <span style={{ fontSize: 13, color: '#059669', fontWeight: 600 }}>✓ Saved</span>}
      </div>
    </div>
  )
}
