'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter, useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'
import { aud } from '@/lib/sms-pricing'

function parseTs(d: string | null | undefined): Date | null {
  if (!d) return null
  let s = String(d).trim()
  if (!s) return null
  s = s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
  const p = new Date(s)
  return isNaN(p.getTime()) ? null : p
}
const fmt = (d: string | null | undefined) => {
  const p = parseTs(d)
  return p ? p.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'
}

const SKIP_LABEL: Record<string, string> = {
  unsubscribed: 'Unsubscribed', no_consent: 'No marketing consent', blocked: 'Blocked',
  invalid_number: 'No valid mobile', duplicate: 'Duplicate contact',
}

export default function CampaignReportPage() {
  const router = useRouter()
  const params = useParams()
  const campaignId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [campaign, setCampaign] = useState<any>(null)
  const [recipients, setRecipients] = useState<any[]>([])
  const [links, setLinks] = useState<any[]>([])
  const [clicks, setClicks] = useState<any[]>([])
  const [conversions, setConversions] = useState<any[]>([])
  const [contacts, setContacts] = useState<Record<string, any>>({})
  const [outlets, setOutlets] = useState<Record<string, string>>({})
  const [creatingSegment, setCreatingSegment] = useState(false)

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
        setCampaign(c)

        const { data: rs } = await (supabase as any).from('campaign_recipients')
          .select('*').eq('campaign_id', campaignId).limit(20000)
        setRecipients(rs || [])

        const { data: ls } = await (supabase as any).from('short_links')
          .select('*').eq('campaign_id', campaignId)
        setLinks(ls || [])
        const linkIds = (ls || []).map((l: any) => l.id)
        if (linkIds.length) {
          const { data: cl } = await (supabase as any).from('link_clicks')
            .select('*').in('link_id', linkIds.slice(0, 200))
          setClicks(cl || [])
          const { data: cv } = await (supabase as any).from('link_conversions')
            .select('*').in('link_id', linkIds.slice(0, 200))
          setConversions(cv || [])
        }

        const ids = Array.from(new Set((rs || []).map((r: any) => r.contact_id).filter(Boolean)))
        if (ids.length) {
          const m: Record<string, any> = {}
          for (let i = 0; i < ids.length; i += 200) {
            const { data: cts } = await (supabase as any).from('contacts')
              .select('id, name, phone, email, location_id').in('id', ids.slice(i, i + 200))
            for (const x of (cts || [])) m[x.id] = x
          }
          setContacts(m)
        }

        const { data: outs } = await (supabase as any).from('company_locations')
          .select('id, label, suburb').eq('company_id', cid)
        const om: Record<string, string> = {}
        for (const o of (outs || [])) om[o.id] = o.label || o.suburb || 'Outlet'
        setOutlets(om)
      } finally { setLoading(false) }
    })()
  }, [campaignId])

  // ── Metrics ───────────────────────────────────────────────────────────────
  const sent = recipients.filter(r => ['sent', 'delivered'].includes(r.status)).length
  const delivered = recipients.filter(r => r.status === 'delivered').length
  const failed = recipients.filter(r => r.status === 'failed').length
  const skipped = recipients.filter(r => r.status === 'skipped')

  const clickedContacts = useMemo(
    () => new Set(clicks.map(c => c.contact_id).filter(Boolean)), [clicks])
  const uniqueClicks = clickedContacts.size
  const clickRate = delivered ? (uniqueClicks / delivered) * 100 : 0

  const paid = conversions.filter(c => c.stage === 'paid')
  const orders = new Set(paid.map(c => c.order_id ?? c.id)).size
  const revenue = paid.reduce((s, c) => s + (Number(c.revenue) || 0), 0)
  const purchasers = new Set(paid.map(c => c.contact_id).filter(Boolean))
  const conversionRate = uniqueClicks ? (orders / uniqueClicks) * 100 : 0

  const cost = Number(campaign?.actual_cost) || Number(campaign?.estimated_cost) || 0
  const roi = cost > 0 ? ((revenue - cost) / cost) * 100 : 0

  // Unsubscribes attributable to this campaign — anyone who opted out after it
  // went out. Approximate by design, and labelled as such.
  const sentAt = parseTs(campaign?.sent_at)
  const unsubscribed = useMemo(() => {
    if (!sentAt) return 0
    return recipients.filter(r => {
      const ct = contacts[r.contact_id]
      const u = ct?.unsubscribed_at ? parseTs(ct.unsubscribed_at) : null
      return u && u >= sentAt
    }).length
  }, [recipients, contacts, sentAt])

  /** Clicked but never ordered — the useful follow-up group. */
  const clickedNotPurchased = useMemo(
    () => Array.from(clickedContacts).filter(id => !purchasers.has(id)),
    [clickedContacts, purchasers])

  const failureReasons = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of recipients.filter(x => x.status === 'failed')) {
      const k = r.error || 'Unknown error'
      m[k] = (m[k] || 0) + 1
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [recipients])

  const skipReasons = useMemo(() => {
    const m: Record<string, number> = {}
    for (const r of skipped) {
      const k = r.skip_reason || 'other'
      m[k] = (m[k] || 0) + 1
    }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }, [skipped])

  const byOutlet = useMemo(() => {
    const m: Record<string, { sent: number; clicks: number; revenue: number }> = {}
    for (const r of recipients) {
      const ct = contacts[r.contact_id]
      const key = ct?.location_id ? (outlets[ct.location_id] || 'Unknown outlet') : 'Online store'
      m[key] ||= { sent: 0, clicks: 0, revenue: 0 }
      if (['sent', 'delivered'].includes(r.status)) m[key].sent++
      if (clickedContacts.has(r.contact_id)) m[key].clicks++
    }
    for (const c of paid) {
      const ct = contacts[c.contact_id]
      const key = ct?.location_id ? (outlets[ct.location_id] || 'Unknown outlet') : 'Online store'
      m[key] ||= { sent: 0, clicks: 0, revenue: 0 }
      m[key].revenue += Number(c.revenue) || 0
    }
    return Object.entries(m).sort((a, b) => b[1].sent - a[1].sent)
  }, [recipients, contacts, outlets, clickedContacts, paid])

  const topLinks = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of clicks) m[c.link_id] = (m[c.link_id] || 0) + 1
    return links
      .map(l => ({ ...l, clickCount: m[l.id] || 0 }))
      .sort((a, b) => b.clickCount - a.clickCount)
  }, [links, clicks])

  const clicksOverTime = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of clicks) {
      const p = parseTs(c.clicked_at)
      if (p) {
        const k = p.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
        m[k] = (m[k] || 0) + 1
      }
    }
    return Object.entries(m)
  }, [clicks])

  const createFollowUpSegment = async () => {
    if (!companyId || clickedNotPurchased.length === 0) return
    setCreatingSegment(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await (supabase as any).from('campaigns').insert({
        company_id: companyId,
        name: `Follow-up: ${campaign?.name || 'campaign'} (clicked, no order)`,
        channel: campaign?.channel || 'sms',
        status: 'draft',
        audience_type: 'manual',
        audience_filter: { type: 'manual', contactIds: clickedNotPurchased },
        audience_count: clickedNotPurchased.length,
        created_by: session?.user?.email?.split('@')[0] || null,
        created_by_id: session?.user?.id || null,
      }).select().maybeSingle()
      if (error) throw error
      router.push(`/admin/campaigns/${data.id}`)
    } catch (e: any) { alert('Could not create the follow-up campaign: ' + e.message) }
    finally { setCreatingSegment(false) }
  }

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, background: '#fff', padding: 16 }
  const statNum: React.CSSProperties = { fontSize: 23, fontWeight: 800, color: 'var(--ink)', margin: '4px 0 0' }
  const statLbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const th: React.CSSProperties = { padding: '9px 11px', fontWeight: 700, color: 'var(--ink)', textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '9px 11px', color: 'var(--slate)' }

  if (loading) return <SkeletonList rows={6} />
  if (!campaign) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--slate)' }}>
      Campaign not found. <a href="/admin/campaigns" style={{ color: 'var(--coral)' }}>Back to campaigns</a>
    </div>
  )

  const notSentYet = !['sent', 'sending'].includes(campaign.status)

  return (
    <div style={{ maxWidth: 1300, margin: '0 auto', padding: 24 }}>
      <button onClick={() => router.push('/admin/campaigns')}
        style={{ border: 'none', background: 'none', color: 'var(--slate)', fontSize: 13, cursor: 'pointer', padding: 0, marginBottom: 12 }}>
        ← Back to campaigns
      </button>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 23, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>{campaign.name}</h1>
        <p style={{ color: 'var(--slate)', fontSize: 13, margin: '5px 0 0' }}>
          {campaign.status === 'sent' ? `Sent ${fmt(campaign.sent_at)}` : `Status: ${campaign.status}`}
          {' · '}{String(campaign.channel || 'sms').toUpperCase()}
        </p>
      </div>

      {notSentYet && (
        <div style={{ ...card, borderColor: '#fde68a', background: '#fffbeb', marginBottom: 16 }}>
          <p style={{ margin: 0, fontSize: 13, color: '#78350f' }}>
            This campaign hasn't been sent, so there are no delivery figures yet. Anything below reflects
            what's been recorded so far.
          </p>
        </div>
      )}

      {/* Headline metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 12 }}>
        <div style={card}><div style={statLbl}>Sent</div><p style={statNum}>{sent.toLocaleString()}</p></div>
        <div style={card}><div style={statLbl}>Delivered</div><p style={statNum}>{delivered.toLocaleString()}</p></div>
        <div style={card}><div style={statLbl}>Failed</div>
          <p style={{ ...statNum, color: failed ? '#dc2626' : 'var(--ink)' }}>{failed.toLocaleString()}</p></div>
        <div style={card}><div style={statLbl}>Clicked</div><p style={statNum}>{uniqueClicks.toLocaleString()}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--slate)' }}>{clickRate.toFixed(1)}% of delivered</p></div>
        <div style={card}><div style={statLbl}>Unsubscribed</div>
          <p style={{ ...statNum, color: unsubscribed ? '#b45309' : 'var(--ink)' }}>{unsubscribed.toLocaleString()}</p></div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 10, marginBottom: 18 }}>
        <div style={card}><div style={statLbl}>Orders</div><p style={statNum}>{orders.toLocaleString()}</p></div>
        <div style={card}><div style={statLbl}>Revenue</div>
          <p style={{ ...statNum, color: revenue > 0 ? '#15803d' : 'var(--ink)' }}>{aud(revenue)}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--slate)' }}>influenced</p></div>
        <div style={card}><div style={statLbl}>Conversion rate</div><p style={statNum}>{conversionRate.toFixed(1)}%</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--slate)' }}>of those who clicked</p></div>
        <div style={card}><div style={statLbl}>Cost</div><p style={statNum}>{aud(cost)}</p></div>
        <div style={card}><div style={statLbl}>Return on spend</div>
          <p style={{ ...statNum, color: roi > 0 ? '#15803d' : roi < 0 ? '#dc2626' : 'var(--ink)' }}>
            {cost > 0 ? `${roi > 0 ? '+' : ''}${roi.toFixed(0)}%` : '—'}
          </p></div>
      </div>

      {/* Follow-up action */}
      {clickedNotPurchased.length > 0 && (
        <div style={{ ...card, borderColor: 'var(--coral)', background: 'var(--peach)', marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div>
              <strong style={{ fontSize: 14, color: 'var(--ink)' }}>
                {clickedNotPurchased.length} clicked but didn't order
              </strong>
              <p style={{ margin: '4px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>
                They showed interest — a follow-up usually converts better than a fresh send.
              </p>
            </div>
            <button onClick={createFollowUpSegment} disabled={creatingSegment}
              style={{ padding: '10px 16px', borderRadius: 10, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', opacity: creatingSegment ? 0.6 : 1 }}>
              {creatingSegment ? 'Creating…' : 'Create follow-up campaign'}
            </button>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 12 }}>
        {/* Excluded */}
        {skipReasons.length > 0 && (
          <div style={card}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Excluded before sending</h3>
            {skipReasons.map(([r, n]) => (
              <div key={r} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: 'var(--slate)' }}>
                <span>{SKIP_LABEL[r] || r}</span><strong style={{ color: 'var(--ink)' }}>{n}</strong>
              </div>
            ))}
          </div>
        )}

        {/* Failures */}
        {failureReasons.length > 0 && (
          <div style={card}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Delivery failures</h3>
            {failureReasons.map(([r, n]) => (
              <div key={r} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '4px 0', color: 'var(--slate)' }}>
                <span style={{ flex: 1 }}>{r}</span><strong style={{ color: '#dc2626' }}>{n}</strong>
              </div>
            ))}
          </div>
        )}

        {/* Outlets */}
        {byOutlet.length > 0 && (
          <div style={{ ...card, gridColumn: byOutlet.length > 2 ? 'span 2' : 'auto' }}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>By outlet</h3>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead><tr style={{ color: 'var(--slate)', textAlign: 'left' }}>
                <th style={th}>Outlet</th><th style={th}>Sent</th><th style={th}>Clicks</th><th style={th}>Revenue</th>
              </tr></thead>
              <tbody>
                {byOutlet.map(([name, v]) => (
                  <tr key={name} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ ...td, color: 'var(--ink)', fontWeight: 600 }}>{name}</td>
                    <td style={td}>{v.sent}</td>
                    <td style={td}>{v.clicks}</td>
                    <td style={{ ...td, color: v.revenue > 0 ? '#15803d' : 'var(--slate)', fontWeight: v.revenue > 0 ? 700 : 400 }}>
                      {aud(v.revenue)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Top links */}
        {topLinks.length > 0 && (
          <div style={card}>
            <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Top clicked links</h3>
            {topLinks.map(l => (
              <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 12.5, padding: '5px 0', borderTop: '1px solid var(--border)' }}>
                <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
                  {l.label || l.target_url}
                </span>
                <strong style={{ color: l.clickCount ? '#059669' : 'var(--slate)' }}>{l.clickCount}</strong>
              </div>
            ))}
          </div>
        )}

        {/* Clicks over time */}
        {clicksOverTime.length > 0 && (
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Clicks over time</h3>
            {(() => {
              const max = Math.max(...clicksOverTime.map(e => e[1]), 1)
              return (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
                  {clicksOverTime.map(([d, n]) => (
                    <div key={d} title={`${d} — ${n}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                      <div style={{ height: `${(n / max) * 100}%`, minHeight: 3, background: 'var(--coral)', opacity: 0.8, borderRadius: '3px 3px 0 0' }} />
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        )}
      </div>

      {recipients.length === 0 && (
        <div style={{ ...card, textAlign: 'center', color: 'var(--slate)', fontSize: 13.5, padding: 30, marginTop: 12 }}>
          No recipient records yet.
        </div>
      )}
    </div>
  )
}
