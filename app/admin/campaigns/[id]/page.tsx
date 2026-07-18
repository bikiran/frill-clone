'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'

const AUDIENCE_TYPES: [string, string, string][] = [
  ['all_subscribed', 'All subscribed contacts', 'Everyone with marketing consent'],
  ['segment', 'Customer segment', 'Target by loyalty (RFM) segment'],
  ['woocommerce', 'WooCommerce customers', 'Contacts matched to a store customer'],
  ['purchased_category', 'Purchased a product or category', 'Bought a specific SKU or product'],
  ['lapsed', 'Have not purchased recently', 'No order in the last N days'],
  ['outlet', 'Customers from an outlet', 'Belong to a specific location'],
  ['tags', 'Customers with specific tags', 'Match any of the selected tags'],
  ['clicked_campaign', 'Clicked a previous campaign', 'Engaged with an earlier send'],
  ['abandoned_checkout', 'Abandoned checkout', 'Left an unrecovered cart'],
  ['manual', 'Manual contact selection', 'Pick contacts by hand'],
]

const SEGMENTS = ['Champions', 'Loyal Customers', 'Potential Loyalists', 'At Risk', 'Lost']

const SKIP_LABEL: Record<string, string> = {
  unsubscribed: 'unsubscribed',
  no_consent: 'have no marketing consent',
  blocked: 'are blocked',
  invalid_number: 'have no valid mobile number',
  duplicate: 'are duplicates',
}

export default function CampaignEditorPage() {
  const router = useRouter()
  const params = useParams()
  const campaignId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [campaign, setCampaign] = useState<any>(null)
  const [outlets, setOutlets] = useState<any[]>([])
  const [allTags, setAllTags] = useState<string[]>([])
  const [pastCampaigns, setPastCampaigns] = useState<any[]>([])
  const [saving, setSaving] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)

  // Audience state
  const [audType, setAudType] = useState('all_subscribed')
  const [segment, setSegment] = useState('Champions')
  const [productQuery, setProductQuery] = useState('')
  const [lapsedDays, setLapsedDays] = useState(90)
  const [locationId, setLocationId] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [priorCampaign, setPriorCampaign] = useState('')
  const [minSpend, setMinSpend] = useState('')
  const [minOrders, setMinOrders] = useState('')

  const [preview, setPreview] = useState<any>(null)
  const [previewing, setPreviewing] = useState(false)
  const [previewError, setPreviewError] = useState('')
  const debounce = useRef<any>(null)

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

        const { data: c } = await (supabase as any).from('campaigns')
          .select('*').eq('id', campaignId).maybeSingle()
        if (c) {
          setCampaign(c)
          const f = c.audience_filter || {}
          setAudType(c.audience_type || 'all_subscribed')
          if (f.segment) setSegment(f.segment)
          if (f.productQuery) setProductQuery(f.productQuery)
          if (f.lapsedDays) setLapsedDays(f.lapsedDays)
          if (f.locationId) setLocationId(f.locationId)
          if (f.tags) setTags(f.tags)
          if (f.campaignId) setPriorCampaign(f.campaignId)
          if (f.minSpend != null) setMinSpend(String(f.minSpend))
          if (f.minOrders != null) setMinOrders(String(f.minOrders))
        }

        const { data: outs } = await (supabase as any).from('company_locations')
          .select('id, label, suburb').eq('company_id', cid)
        setOutlets(outs || [])

        const { data: cts } = await (supabase as any).from('contacts')
          .select('tags').eq('company_id', cid).not('tags', 'is', null).limit(2000)
        const t = new Set<string>()
        for (const row of (cts || [])) for (const x of (row.tags || [])) t.add(String(x))
        setAllTags(Array.from(t).sort())

        const { data: prior } = await (supabase as any).from('campaigns')
          .select('id, name').eq('company_id', cid).eq('status', 'sent').limit(50)
        setPastCampaigns(prior || [])
      } finally { setLoading(false) }
    })()
  }, [campaignId])

  /** The filter spec as the resolver expects it. */
  const buildFilter = useCallback(() => {
    const f: any = { type: audType }
    if (audType === 'segment') f.segment = segment
    if (audType === 'purchased_category') f.productQuery = productQuery
    if (audType === 'lapsed') f.lapsedDays = lapsedDays
    if (audType === 'outlet') f.locationId = locationId
    if (audType === 'tags') f.tags = tags
    if (audType === 'clicked_campaign' && priorCampaign) f.campaignId = priorCampaign
    if (minSpend) f.minSpend = parseFloat(minSpend)
    if (minOrders) f.minOrders = parseInt(minOrders)
    return f
  }, [audType, segment, productQuery, lapsedDays, locationId, tags, priorCampaign, minSpend, minOrders])

  // Live recipient count, debounced so typing doesn't hammer the endpoint.
  useEffect(() => {
    if (!companyId) return
    if (audType === 'manual') { setPreview(null); return }
    clearTimeout(debounce.current)
    debounce.current = setTimeout(async () => {
      setPreviewing(true); setPreviewError('')
      try {
        const res = await fetch('/api/campaigns/audience', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, filter: buildFilter(), channel: campaign?.channel || 'sms' }),
        })
        const d = await res.json()
        if (!res.ok) throw new Error(d.error || 'Could not work out the audience')
        setPreview(d)
      } catch (e: any) { setPreviewError(e.message); setPreview(null) }
      finally { setPreviewing(false) }
    }, 450)
    return () => clearTimeout(debounce.current)
  }, [companyId, buildFilter, audType, campaign?.channel])

  const saveAudience = async () => {
    if (!campaignId) return
    setSaving(true)
    try {
      await (supabase as any).from('campaigns').update({
        audience_type: audType,
        audience_filter: buildFilter(),
        audience_count: preview?.recipients || 0,
        excluded_count: preview?.excludedTotal || 0,
        updated_at: new Date().toISOString(),
      }).eq('id', campaignId)
      setSavedAt(new Date().toLocaleTimeString('en-AU', { hour: 'numeric', minute: '2-digit' }))
    } catch (e: any) { alert('Could not save: ' + e.message) }
    finally { setSaving(false) }
  }

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, background: '#fff', padding: 18 }
  const input: React.CSSProperties = { width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, boxSizing: 'border-box', background: '#fff' }
  const label: React.CSSProperties = { fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', display: 'block', marginBottom: 6 }

  if (loading) return <SkeletonList rows={6} />
  if (!campaign) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--slate)' }}>
      Campaign not found. <a href="/admin/campaigns" style={{ color: 'var(--coral)' }}>Back to campaigns</a>
    </div>
  )

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <button onClick={() => router.push('/admin/campaigns')}
        style={{ border: 'none', background: 'none', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        ← Back to campaigns
      </button>

      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 23, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>{campaign.name}</h1>
        <p style={{ color: 'var(--slate)', fontSize: 13, margin: '5px 0 0' }}>
          Step 2 of 6 — choose who this campaign goes to.
        </p>
      </div>

      {/* Step rail */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, overflowX: 'auto', paddingBottom: 2 }}>
        {['Details', 'Audience', 'Message', 'Links & offers', 'Schedule', 'Review'].map((s, i) => (
          <div key={s} style={{
            flexShrink: 0, padding: '6px 13px', borderRadius: 20, fontSize: 12, fontWeight: 700,
            background: i === 1 ? 'var(--peach)' : '#fff',
            color: i === 1 ? 'var(--coral)' : '#9ca3af',
            border: '1px solid ' + (i === 1 ? 'var(--coral)' : 'var(--border)'),
          }}>
            {i + 1}. {s}
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 320px', gap: 16, alignItems: 'start' }}
        className="campaign-grid">
        {/* ── Left: audience selection ─────────────────────────────────────── */}
        <div style={card}>
          <label style={label}>Who should receive this?</label>
          <div style={{ display: 'grid', gap: 6, marginBottom: 16 }}>
            {AUDIENCE_TYPES.map(([val, title, desc]) => (
              <button key={val} type="button" onClick={() => setAudType(val)}
                style={{
                  textAlign: 'left', padding: '11px 13px', borderRadius: 10, cursor: 'pointer',
                  border: '1px solid ' + (audType === val ? 'var(--coral)' : 'var(--border)'),
                  background: audType === val ? 'var(--peach)' : '#fff',
                }}>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: audType === val ? 'var(--coral)' : 'var(--ink)' }}>{title}</div>
                <div style={{ fontSize: 11.5, color: 'var(--slate)', marginTop: 2 }}>{desc}</div>
              </button>
            ))}
          </div>

          {/* Type-specific options */}
          {audType === 'segment' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Segment</label>
              <select value={segment} onChange={e => setSegment(e.target.value)} style={input}>
                {SEGMENTS.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          )}
          {audType === 'purchased_category' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Product SKU or name</label>
              <input value={productQuery} onChange={e => setProductQuery(e.target.value)}
                placeholder="e.g. Discus, or 0001" style={input} />
            </div>
          )}
          {audType === 'lapsed' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>No order in the last</label>
              <select value={lapsedDays} onChange={e => setLapsedDays(parseInt(e.target.value))} style={input}>
                {[30, 60, 90, 180, 365].map(d => <option key={d} value={d}>{d} days</option>)}
              </select>
            </div>
          )}
          {audType === 'outlet' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Outlet</label>
              <select value={locationId} onChange={e => setLocationId(e.target.value)} style={input}>
                <option value="">Select an outlet…</option>
                {outlets.map(o => <option key={o.id} value={o.id}>{o.label || o.suburb}</option>)}
              </select>
            </div>
          )}
          {audType === 'tags' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Tags (match any)</label>
              {allTags.length === 0
                ? <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: 0 }}>No tags on any contacts yet.</p>
                : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                    {allTags.map(t => (
                      <button key={t} type="button"
                        onClick={() => setTags(cur => cur.includes(t) ? cur.filter(x => x !== t) : [...cur, t])}
                        style={{
                          padding: '5px 11px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                          border: '1px solid ' + (tags.includes(t) ? 'var(--coral)' : 'var(--border)'),
                          background: tags.includes(t) ? 'var(--peach)' : '#fff',
                          color: tags.includes(t) ? 'var(--coral)' : 'var(--slate)',
                        }}>
                        {t}
                      </button>
                    ))}
                  </div>
                )}
            </div>
          )}
          {audType === 'clicked_campaign' && (
            <div style={{ marginBottom: 14 }}>
              <label style={label}>Previous campaign</label>
              <select value={priorCampaign} onChange={e => setPriorCampaign(e.target.value)} style={input}>
                <option value="">Any previous campaign</option>
                {pastCampaigns.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
          )}
          {audType === 'manual' && (
            <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: 'var(--canvas)', fontSize: 12.5, color: 'var(--slate)' }}>
              Hand-picking contacts is coming with the contact picker. For now, use tags or a segment
              to define the group.
            </div>
          )}

          {/* Extra narrowing that applies to most types */}
          {audType !== 'manual' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
              <div>
                <label style={label}>Min. total spend</label>
                <input value={minSpend} onChange={e => setMinSpend(e.target.value)} type="number" placeholder="Any" style={input} />
              </div>
              <div>
                <label style={label}>Min. orders</label>
                <input value={minOrders} onChange={e => setMinOrders(e.target.value)} type="number" placeholder="Any" style={input} />
              </div>
            </div>
          )}
        </div>

        {/* ── Right: live count ────────────────────────────────────────────── */}
        <div style={{ display: 'grid', gap: 12, position: 'sticky', top: 16 }}>
          <div style={card}>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>
              Estimated recipients
            </div>
            <p style={{ fontSize: 34, fontWeight: 800, color: 'var(--ink)', margin: '6px 0 0', lineHeight: 1 }}>
              {previewing ? '…' : (preview?.recipients ?? 0).toLocaleString()}
            </p>
            {preview && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--slate)' }}>
                {preview.matched.toLocaleString()} matched this filter
                {preview.excludedTotal > 0 && `, ${preview.excludedTotal.toLocaleString()} excluded`}
              </p>
            )}
            {previewError && (
              <p style={{ margin: '8px 0 0', fontSize: 12, color: '#dc2626' }}>{previewError}</p>
            )}
          </div>

          {/* Exclusions — the compliance-relevant part */}
          {preview && preview.excludedTotal > 0 && (
            <div style={{ ...card, borderColor: '#fde68a', background: '#fffbeb' }}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: '#b45309', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>
                Excluded contacts
              </div>
              {Object.entries(preview.excluded as Record<string, number>)
                .filter(([, n]) => n > 0)
                .map(([reason, n]) => (
                  <p key={reason} style={{ margin: '0 0 5px', fontSize: 12.5, color: '#78350f' }}>
                    <strong>{n.toLocaleString()}</strong> {SKIP_LABEL[reason] || reason}
                  </p>
                ))}
              <p style={{ margin: '8px 0 0', fontSize: 11.5, color: '#92400e' }}>
                These are removed automatically and can't be messaged.
              </p>
            </div>
          )}

          {/* Sample so staff can sanity-check the targeting */}
          {preview?.sample?.length > 0 && (
            <div style={card}>
              <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em', marginBottom: 8 }}>
                Sample recipients
              </div>
              {preview.sample.map((s: any, i: number) => (
                <div key={i} style={{ fontSize: 12.5, color: 'var(--ink)', padding: '3px 0' }}>
                  {s.name || 'Unnamed'} <span style={{ color: '#9ca3af' }}>· {s.destination}</span>
                </div>
              ))}
            </div>
          )}

          <button onClick={saveAudience} disabled={saving}
            style={{ padding: '11px 16px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? 'Saving…' : 'Save audience'}
          </button>
          {savedAt && (
            <p style={{ margin: 0, fontSize: 12, color: '#15803d', textAlign: 'center' }}>Saved at {savedAt}</p>
          )}
          <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.5 }}>
            The audience is stored as a filter, not a fixed list. Recipients are worked out again when
            the campaign sends, so anyone who unsubscribes in the meantime is still excluded.
          </p>
        </div>
      </div>

      <style jsx>{`
        @media (max-width: 900px) {
          .campaign-grid { grid-template-columns: 1fr !important; }
        }
      `}</style>
    </div>
  )
}
