'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useCompanyUser, S, ToggleRow } from '../_shared'
import Link from 'next/link'
import RefundSecurity from '@/components/settings/RefundSecurity'

export default function PaymentsSettings() {
  const { companyId, loading } = useCompanyUser()
  const [cfg, setCfg] = useState<any>({ invoice_prefix: 'INV', primary_color: '#1E75FF', secondary_color: '#1E75FF', pass_fees: false, paylink_fill_contact: true, paylink_address: 'none', paylink_phone: false, paylink_save_card: 'ask', paylink_countries: ['AU'], paylink_receipt: true })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [countriesText, setCountriesText] = useState<string | null>(null)

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

      <div className="st-sec">
        <h2 style={S.h2}>Customise Invoice</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
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

      <div className="st-sec">
        <h2 style={S.h2}>Fees</h2>
        <ToggleRow title="Pass transaction fees to customers" desc="When enabled, card processing fees are added to the customer's total." checked={cfg.pass_fees} onChange={v => set('pass_fees', v)} />
      </div>

      <div className="st-sec">
        <h2 style={{ ...S.h2, marginBottom: 4 }}>Payment links</h2>
        <p style={{ ...S.hint, margin: '0 0 6px' }}>What the secure Stripe page asks for when a customer pays a link from the inbox, and what Colvy keeps afterwards.</p>
        <ToggleRow title="Fill in customer details from payments"
          desc="When a customer pays, their name, email and phone from Stripe fill any blanks on their contact. Details you already have are never changed."
          checked={cfg.paylink_fill_contact !== false} onChange={v => set('paylink_fill_contact', v)} />
        <div style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Ask for an address</p>
          <p style={{ margin: '3px 0 10px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.4 }}>Saved to the customer&rsquo;s addresses. Each extra box means a few people don&rsquo;t finish paying, so only ask when you need it. You can change this for each link.</p>
          <Seg value={cfg.paylink_address || 'none'} onChange={v => set('paylink_address', v)} options={[['none', 'Don\u2019t ask'], ['billing', 'Billing address'], ['shipping', 'Delivery address']]} />
          {cfg.paylink_address === 'shipping' && (
            <div style={{ marginTop: 12, maxWidth: 320 }}>
              <label style={S.label}>Deliver to countries</label>
              <input value={countriesText ?? (cfg.paylink_countries || ['AU']).join(', ')} onChange={e => { setCountriesText(e.target.value); set('paylink_countries', e.target.value.split(/[,\s]+/).map((c: string) => c.trim().toUpperCase()).filter((c: string) => /^[A-Z]{2}$/.test(c))) }} placeholder="AU, NZ" style={S.input} />
              <p style={S.hint}>Two-letter country codes, e.g. AU, NZ.</p>
            </div>
          )}
        </div>
        <ToggleRow title="Email the customer a receipt" desc="Stripe emails a receipt to the address they paid with, even if receipts are switched off in your Stripe settings."
          checked={cfg.paylink_receipt !== false} onChange={v => set('paylink_receipt', v)} />
        <ToggleRow title="Ask for a phone number" desc="Useful when a customer pays from an email or chat and you don&rsquo;t have their number yet."
          checked={!!cfg.paylink_phone} onChange={v => set('paylink_phone', v)} />
        <div style={{ padding: '14px 0 2px' }}>
          <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Save the card for later</p>
          <p style={{ margin: '3px 0 10px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.4 }}>A saved card appears under &ldquo;Charge saved card&rdquo; in the chat. Stripe keeps the card; Colvy only keeps its type and last 4 digits.</p>
          <Seg value={cfg.paylink_save_card || 'ask'} onChange={v => set('paylink_save_card', v)} options={[['off', 'Don\u2019t save'], ['ask', 'Customer chooses'], ['always', 'Always save']]} />
          <p style={S.hint}>{(cfg.paylink_save_card || 'ask') === 'ask' ? 'Stripe shows a \u201cSave my card for future payments\u201d tick box. Only customers who tick it get a saved card.' : cfg.paylink_save_card === 'always' ? 'Every card is kept. Stripe shows wording that you may charge it later. Only use this if your terms say so.' : 'Cards are used for this payment only.'}</p>
        </div>
      </div>

      {/* Who may refund, and the refund PIN (saved on its own, not with Save changes). */}
      <RefundSecurity companyId={companyId} />

      <div className="st-sec">
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

// A small segmented choice (Apple-style).
function Seg({ value, onChange, options }: { value: string; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <div role="radiogroup" className="pay-seg">
      <style>{`.pay-seg{display:inline-flex;flex-wrap:wrap;gap:4px;padding:3px;border-radius:11px;background:var(--canvas);max-width:100%}.pay-seg button{padding:8px 14px;border:none;border-radius:8px;background:transparent;font-size:13px;font-weight:600;color:var(--slate);cursor:pointer;font-family:inherit;transition:background .2s ease,color .2s ease,box-shadow .2s ease}.pay-seg button.on{background:#fff;color:var(--ink);box-shadow:0 1px 3px rgba(15,23,42,.12)}@media (max-width:560px){.pay-seg{display:flex;width:100%;flex-wrap:nowrap}.pay-seg button{flex:1 1 0;padding:8px 4px;font-size:12px;line-height:1.25}}`}</style>
      {options.map(([v, label]) => (
        <button key={v} type="button" role="radio" aria-checked={value === v} className={value === v ? 'on' : ''} onClick={() => onChange(v)}>{label}</button>
      ))}
    </div>
  )
}
