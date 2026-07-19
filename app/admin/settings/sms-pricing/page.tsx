'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'
import { calculateCost, DEFAULT_PRICING, SmsPricing, aud, audRate } from '@/lib/sms-pricing'

export default function SmsPricingSettings() {
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [p, setP] = useState<SmsPricing>(DEFAULT_PRICING)
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState('')
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        let cid: string | null = null
        if (typeof window !== 'undefined') {
          const host = window.location.hostname
          if (host.endsWith('.colvy.com') && host !== 'colvy.com') {
            const slug = host.replace('.colvy.com', '')
            const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
            if (co) cid = co.id
          }
        }
        if (!cid) {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const { data: own } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
            if (own?.id) cid = own.id
            else {
              const { data: mem } = await (supabase as any).from('team_members').select('company_id').eq('user_id', session.user.id).limit(1)
              if (mem?.length) cid = mem[0].company_id
            }
          }
        }
        if (!cid) { setLoading(false); return }
        setCompanyId(cid)
        const { data, error } = await (supabase as any).from('sms_pricing')
          .select('*').eq('company_id', cid).maybeSingle()
        if (error) { setMissing(true); return }
        if (data) {
          setP({
            price_per_part: Number(data.price_per_part),
            gst_rate: Number(data.gst_rate),
            gst_inclusive: data.gst_inclusive !== false,
            carrier_cost: Number(data.carrier_cost),
            carrier_currency: data.carrier_currency || 'USD',
            fx_rate: Number(data.fx_rate),
            volume_tiers: Array.isArray(data.volume_tiers) ? data.volume_tiers : [],
          })
        }
      } finally { setLoading(false) }
    })()
  }, [])

  const save = async () => {
    if (!companyId) return
    setSaving(true)
    try {
      const row = {
        company_id: companyId,
        price_per_part: p.price_per_part,
        gst_rate: p.gst_rate,
        gst_inclusive: p.gst_inclusive,
        carrier_cost: p.carrier_cost,
        carrier_currency: p.carrier_currency,
        fx_rate: p.fx_rate,
        fx_updated_at: new Date().toISOString(),
        volume_tiers: p.volume_tiers,
        updated_at: new Date().toISOString(),
      }
      const { error } = await (supabase as any).from('sms_pricing')
        .upsert(row, { onConflict: 'company_id' })
      if (error) throw error
      setSavedAt(new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }))
    } catch (e: any) { alert('Could not save: ' + e.message) }
    finally { setSaving(false) }
  }

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, background: '#fff', padding: 18, marginBottom: 14 }
  const input: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box' }
  const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 6 }

  // Cost per part in AUD, and margin at each price point.
  const costAud = p.fx_rate > 0 ? p.carrier_cost / p.fx_rate : 0
  const marginAt = (price: number) => {
    const ex = p.gst_inclusive ? price / (1 + p.gst_rate) : price
    const m = ex - costAud
    return { ex, m, pct: ex > 0 ? (m / ex) * 100 : 0 }
  }
  const std = marginAt(p.price_per_part)

  if (loading) return <SkeletonList rows={5} />

  return (
    <div style={{ maxWidth: 820, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>SMS pricing</h1>
      <p style={{ color: 'var(--slate)', fontSize: 13.5, margin: '6px 0 18px' }}>
        What you charge per SMS part, and what it costs you. Campaign cost estimates use these figures.
      </p>

      {missing && (
        <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2' }}>
          <strong style={{ color: '#dc2626', fontSize: 13.5 }}>Pricing table not found</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#7f1d1d' }}>
            Run <code>migrations/COLVY_V196_SMS_PRICING.sql</code> in Supabase, then reload.
          </p>
        </div>
      )}

      <div style={card}>
        <label style={label}>Your price</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <span style={{ fontSize: 12.5, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>Per SMS part (AUD)</span>
            <input type="number" step="0.001" value={p.price_per_part}
              onChange={e => setP(v => ({ ...v, price_per_part: parseFloat(e.target.value) || 0 }))} style={input} />
          </div>
          <div>
            <span style={{ fontSize: 12.5, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>GST rate</span>
            <input type="number" step="0.01" value={p.gst_rate}
              onChange={e => setP(v => ({ ...v, gst_rate: parseFloat(e.target.value) || 0 }))} style={input} />
          </div>
        </div>
        <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, cursor: 'pointer' }}>
          <input type="checkbox" checked={p.gst_inclusive}
            onChange={e => setP(v => ({ ...v, gst_inclusive: e.target.checked }))} />
          <span style={{ fontSize: 13, color: 'var(--ink)' }}>Price includes GST</span>
        </label>
      </div>

      <div style={card}>
        <label style={label}>Your cost</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <div>
            <span style={{ fontSize: 12.5, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>Carrier cost / part</span>
            <input type="number" step="0.001" value={p.carrier_cost}
              onChange={e => setP(v => ({ ...v, carrier_cost: parseFloat(e.target.value) || 0 }))} style={input} />
          </div>
          <div>
            <span style={{ fontSize: 12.5, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>Currency</span>
            <input value={p.carrier_currency}
              onChange={e => setP(v => ({ ...v, carrier_currency: e.target.value }))} style={input} />
          </div>
          <div>
            <span style={{ fontSize: 12.5, color: 'var(--slate)', display: 'block', marginBottom: 5 }}>AUD/{p.carrier_currency} rate</span>
            <input type="number" step="0.001" value={p.fx_rate}
              onChange={e => setP(v => ({ ...v, fx_rate: parseFloat(e.target.value) || 0 }))} style={input} />
          </div>
        </div>
        <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>
          Cost per part in AUD: <strong style={{ color: 'var(--ink)' }}>{audRate(costAud)}</strong>
          {' · '}margin at your standard rate: <strong style={{ color: std.pct > 25 ? '#15803d' : std.pct > 10 ? '#b45309' : '#dc2626' }}>
            {audRate(std.m)} ({std.pct.toFixed(1)}%)
          </strong>
        </p>
      </div>

      <div style={card}>
        <label style={label}>Volume discounts</label>
        <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--slate)' }}>
          Applied per campaign, based on total message parts (segments × recipients).
        </p>
        {p.volume_tiers.map((t, i) => {
          const m = marginAt(t.price)
          return (
            <div key={i} style={{ display: 'flex', gap: 10, alignItems: 'center', marginBottom: 8, flexWrap: 'wrap' }}>
              <input type="number" value={t.min} placeholder="From parts"
                onChange={e => setP(v => {
                  const tiers = [...v.volume_tiers]
                  tiers[i] = { ...tiers[i], min: parseInt(e.target.value) || 0 }
                  return { ...v, volume_tiers: tiers }
                })}
                style={{ ...input, width: 120 }} />
              <span style={{ fontSize: 12.5, color: 'var(--slate)' }}>parts and above →</span>
              <input type="number" step="0.001" value={t.price}
                onChange={e => setP(v => {
                  const tiers = [...v.volume_tiers]
                  tiers[i] = { ...tiers[i], price: parseFloat(e.target.value) || 0 }
                  return { ...v, volume_tiers: tiers }
                })}
                style={{ ...input, width: 110 }} />
              <span style={{ fontSize: 12, color: m.pct > 25 ? '#15803d' : m.pct > 10 ? '#b45309' : '#dc2626', fontWeight: 600 }}>
                {m.pct.toFixed(1)}% margin
              </span>
              <button type="button" onClick={() => setP(v => ({ ...v, volume_tiers: v.volume_tiers.filter((_, j) => j !== i) }))}
                style={{ border: 'none', background: 'none', color: '#dc2626', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
                Remove
              </button>
            </div>
          )
        })}
        <button type="button"
          onClick={() => setP(v => ({ ...v, volume_tiers: [...v.volume_tiers, { min: 1000, price: v.price_per_part }] }))}
          style={{ padding: '7px 14px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', fontSize: 12.5, fontWeight: 700, cursor: 'pointer', color: 'var(--slate)' }}>
          + Add tier
        </button>
      </div>

      {/* Worked examples, so the tiers can be sanity-checked */}
      <div style={{ ...card, background: 'var(--canvas)' }}>
        <label style={label}>What campaigns would cost</label>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
          <thead><tr style={{ textAlign: 'left', color: 'var(--slate)' }}>
            <th style={{ padding: '5px 6px' }}>Campaign</th>
            <th style={{ padding: '5px 6px' }}>Parts</th>
            <th style={{ padding: '5px 6px' }}>Rate</th>
            <th style={{ padding: '5px 6px' }}>Charged</th>
            <th style={{ padding: '5px 6px' }}>Margin</th>
          </tr></thead>
          <tbody>
            {[[1, 300], [1, 842], [1, 1240], [3, 200], [1, 5000]].map(([seg, rec], i) => {
              const c = calculateCost(p, seg, rec)
              return (
                <tr key={i} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ padding: '6px', color: 'var(--ink)' }}>{seg} seg × {rec.toLocaleString()}</td>
                  <td style={{ padding: '6px', color: 'var(--slate)' }}>{c.parts.toLocaleString()}</td>
                  <td style={{ padding: '6px', color: 'var(--slate)' }}>{audRate(c.pricePerPart)}</td>
                  <td style={{ padding: '6px', color: 'var(--ink)', fontWeight: 600 }}>{aud(c.totalIncGst)}</td>
                  <td style={{ padding: '6px', color: c.marginPct > 25 ? '#15803d' : c.marginPct > 10 ? '#b45309' : '#dc2626', fontWeight: 600 }}>
                    {aud(c.margin)} ({c.marginPct.toFixed(0)}%)
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
        <button onClick={save} disabled={saving}
          style={{ padding: '11px 20px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
          {saving ? 'Saving…' : 'Save pricing'}
        </button>
        {savedAt && <span style={{ fontSize: 12.5, color: '#15803d' }}>Saved at {savedAt}</span>}
      </div>
    </div>
  )
}
