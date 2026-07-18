'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'

type Campaign = {
  id: string; name: string; channel: string; campaign_type: string | null
  status: string; audience_count: number; excluded_count: number
  scheduled_at: string | null; sent_at: string | null
  recipients_total: number; sent_count: number; delivered_count: number
  failed_count: number; estimated_cost: number; actual_cost: number
  location_id: string | null; created_at: string; created_by: string | null
}

// Supabase returns "+00:00" offsets; a naive `+ 'Z'` makes them invalid.
function parseTs(d: string | null | undefined): Date | null {
  if (!d) return null
  let s = String(d).trim()
  if (!s) return null
  s = s.replace(' ', 'T').replace(/([+-]\d{2})$/, '$1:00')
  if (!/(Z|[+-]\d{2}:?\d{2})$/.test(s)) s += 'Z'
  const p = new Date(s)
  return isNaN(p.getTime()) ? null : p
}
const fmtDate = (d: string | null | undefined) => {
  const p = parseTs(d)
  return p ? p.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }) : '—'
}
const money = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol' }).format(n || 0)

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  draft:     { bg: '#f3f4f6', fg: '#4b5563', label: 'Draft' },
  scheduled: { bg: '#dbeafe', fg: '#1d4ed8', label: 'Scheduled' },
  sending:   { bg: '#fef3c7', fg: '#b45309', label: 'Sending' },
  sent:      { bg: '#dcfce7', fg: '#15803d', label: 'Sent' },
  paused:    { bg: '#fef3c7', fg: '#b45309', label: 'Paused' },
  cancelled: { bg: '#f3f4f6', fg: '#6b7280', label: 'Cancelled' },
  failed:    { bg: '#fee2e2', fg: '#dc2626', label: 'Failed' },
}
const CHANNEL_LABEL: Record<string, string> = { sms: 'SMS', email: 'Email' }

export default function CampaignsPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  const [links, setLinks] = useState<any[]>([])
  const [conversions, setConversions] = useState<any[]>([])
  const [clicks, setClicks] = useState<any[]>([])
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [tableMissing, setTableMissing] = useState(false)

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
        await load(cid)
      } finally { setLoading(false) }
    })()
  }, [])

  const load = async (cid: string) => {
    const { data, error } = await (supabase as any).from('campaigns')
      .select('*').eq('company_id', cid).order('created_at', { ascending: false }).limit(500)
    // The page is useful before the migration is applied — say so rather than
    // rendering an empty state that looks like "no campaigns yet".
    if (error) { setTableMissing(true); return }
    setCampaigns(data || [])

    // Campaign links drive the click and revenue columns, reusing the tracking
    // built for Link Reports rather than a second measurement system.
    try {
      const { data: ls } = await (supabase as any).from('short_links')
        .select('id, campaign_id').eq('company_id', cid).not('campaign_id', 'is', null).limit(2000)
      setLinks(ls || [])
      const ids = (ls || []).map((l: any) => l.id)
      if (ids.length) {
        const { data: cl } = await (supabase as any).from('link_clicks')
          .select('link_id, contact_id').in('link_id', ids.slice(0, 500))
        setClicks(cl || [])
        const { data: cv } = await (supabase as any).from('link_conversions')
          .select('link_id, revenue, stage, order_id').in('link_id', ids.slice(0, 500))
        setConversions(cv || [])
      }
    } catch { /* tracking tables are optional here */ }
  }

  // link_id → campaign_id
  const linkCampaign = useMemo(() => {
    const m: Record<string, string> = {}
    for (const l of links) m[l.id] = l.campaign_id
    return m
  }, [links])

  const clicksByCampaign = useMemo(() => {
    const m: Record<string, number> = {}
    for (const c of clicks) {
      const cid = linkCampaign[c.link_id]
      if (cid) m[cid] = (m[cid] || 0) + 1
    }
    return m
  }, [clicks, linkCampaign])

  const revenueByCampaign = useMemo(() => {
    const m: Record<string, number> = {}
    for (const v of conversions) {
      if (v.stage !== 'paid') continue
      const cid = linkCampaign[v.link_id]
      if (cid) m[cid] = (m[cid] || 0) + (Number(v.revenue) || 0)
    }
    return m
  }, [conversions, linkCampaign])

  const visible = campaigns.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  // ── Summary ───────────────────────────────────────────────────────────────
  const drafts = campaigns.filter(c => c.status === 'draft').length
  const scheduled = campaigns.filter(c => c.status === 'scheduled').length
  const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1)
  const sentThisMonth = campaigns.filter(c => {
    const p = parseTs(c.sent_at)
    return c.status === 'sent' && p && p >= startOfMonth
  }).length
  const delivered = campaigns.reduce((s, c) => s + (c.delivered_count || 0), 0)
  const totalClicks = Object.values(clicksByCampaign).reduce((a, b) => a + b, 0)
  const clickRate = delivered ? Math.round((totalClicks / delivered) * 100) : 0
  const totalRevenue = Object.values(revenueByCampaign).reduce((a, b) => a + b, 0)

  const createDraft = async () => {
    if (!newName.trim() || !companyId) return
    setCreating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await (supabase as any).from('campaigns').insert({
        company_id: companyId,
        name: newName.trim(),
        channel: 'sms',
        status: 'draft',
        created_by: session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0] || null,
        created_by_id: session?.user?.id || null,
      }).select().maybeSingle()
      if (error) throw error
      setCampaigns(c => [data, ...c])
      setNewName(''); setShowNew(false)
    } catch (e: any) {
      alert('Could not create the campaign: ' + e.message)
    } finally { setCreating(false) }
  }

  const deleteCampaign = async (c: Campaign) => {
    if (c.status !== 'draft') { alert('Only draft campaigns can be deleted.'); return }
    if (!confirm(`Delete the draft “${c.name}”?`)) return
    try {
      await (supabase as any).from('campaigns').delete().eq('id', c.id)
      setCampaigns(list => list.filter(x => x.id !== c.id))
    } catch (e: any) { alert('Could not delete: ' + e.message) }
  }

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, background: '#fff', padding: 16 }
  const statNum: React.CSSProperties = { fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '4px 0 0' }
  const statLbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 700, color: 'var(--ink)', textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '11px 12px', color: 'var(--slate)' }
  const topBtn = (primary?: boolean): React.CSSProperties => ({
    padding: '9px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer',
    border: primary ? 'none' : '1px solid var(--border)',
    background: primary ? 'var(--coral)' : '#fff',
    color: primary ? '#fff' : 'var(--ink)',
  })

  if (loading) return <SkeletonList rows={6} />

  return (
    <div style={{ maxWidth: 1400, margin: '0 auto', padding: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap', marginBottom: 20 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Campaigns</h1>
          <p style={{ color: 'var(--slate)', fontSize: 13.5, margin: '6px 0 0' }}>
            Send SMS and email campaigns to targeted groups of customers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button onClick={() => router.push('/admin/campaigns/templates')} style={topBtn()}>Templates</button>
          <button onClick={() => router.push('/admin/contacts?import=1')} style={topBtn()}>Import contacts</button>
          <button onClick={() => setShowNew(v => !v)} style={topBtn(true)}>+ Create campaign</button>
        </div>
      </div>

      {tableMissing && (
        <div style={{ ...card, borderColor: '#fecaca', background: '#fef2f2', marginBottom: 18 }}>
          <strong style={{ color: '#dc2626', fontSize: 13.5 }}>Campaign tables not found</strong>
          <p style={{ margin: '6px 0 0', fontSize: 13, color: '#7f1d1d' }}>
            Run <code>migrations/COLVY_V194_CAMPAIGNS.sql</code> in Supabase to create them, then reload this page.
          </p>
        </div>
      )}

      {/* New campaign */}
      {showNew && (
        <div style={{ ...card, marginBottom: 18 }}>
          <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>Name your campaign</p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input autoFocus value={newName} onChange={e => setNewName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && createDraft()}
              placeholder="e.g. Weekend Fish Sale"
              style={{ flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13 }} />
            <button onClick={createDraft} disabled={creating || !newName.trim()}
              style={{ ...topBtn(true), opacity: creating || !newName.trim() ? 0.5 : 1 }}>
              {creating ? 'Creating…' : 'Create draft'}
            </button>
            <button onClick={() => { setShowNew(false); setNewName('') }} style={topBtn()}>Cancel</button>
          </div>
          <p style={{ margin: '10px 0 0', fontSize: 12, color: 'var(--slate)' }}>
            This creates a draft only. Audience, message and scheduling come next — nothing is sent yet.
          </p>
        </div>
      )}

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 18 }}>
        <div style={card}><div style={statLbl}>Drafts</div><p style={statNum}>{drafts}</p></div>
        <div style={card}><div style={statLbl}>Scheduled</div><p style={statNum}>{scheduled}</p></div>
        <div style={card}><div style={statLbl}>Sent this month</div><p style={statNum}>{sentThisMonth}</p></div>
        <div style={card}><div style={statLbl}>Messages delivered</div><p style={statNum}>{delivered.toLocaleString()}</p></div>
        <div style={card}><div style={statLbl}>Click rate</div><p style={statNum}>{clickRate}%</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--slate)' }}>{totalClicks.toLocaleString()} clicks</p></div>
        <div style={card}><div style={statLbl}>Revenue generated</div>
          <p style={{ ...statNum, color: totalRevenue > 0 ? '#15803d' : 'var(--ink)' }}>{money(totalRevenue)}</p></div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap', alignItems: 'center' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns…"
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13 }} />
        {(['all', 'draft', 'scheduled', 'sending', 'sent'] as const).map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            style={{ padding: '7px 14px', borderRadius: 20, cursor: 'pointer', border: '1px solid ' + (statusFilter === s ? 'var(--coral)' : 'var(--border)'), background: statusFilter === s ? 'var(--peach)' : '#fff', color: statusFilter === s ? 'var(--coral)' : 'var(--slate)', fontSize: 12.5, fontWeight: 700, textTransform: 'capitalize' }}>
            {s === 'all' ? 'All' : STATUS_STYLE[s]?.label || s}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: '#fff', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 940 }}>
          <thead><tr style={{ background: 'var(--peach)' }}>
            <th style={th}>Campaign</th><th style={th}>Channel</th><th style={th}>Audience</th>
            <th style={th}>Status</th><th style={th}>Scheduled</th>
            <th style={{ ...th, textAlign: 'right' }}>Sent</th>
            <th style={{ ...th, textAlign: 'right' }}>Delivered</th>
            <th style={{ ...th, textAlign: 'right' }}>Clicks</th>
            <th style={{ ...th, textAlign: 'right' }}>Revenue</th>
            <th style={th}></th>
          </tr></thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={10} style={{ ...td, textAlign: 'center', padding: 34 }}>
                {campaigns.length === 0
                  ? 'No campaigns yet. Create one to get started.'
                  : 'No campaigns match these filters.'}
              </td></tr>
            )}
            {visible.map(c => {
              const st = STATUS_STYLE[c.status] || STATUS_STYLE.draft
              const clk = clicksByCampaign[c.id] || 0
              const rev = revenueByCampaign[c.id] || 0
              return (
                <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                  <td style={{ ...td, color: 'var(--ink)', fontWeight: 600 }}>
                    {c.name}
                    {c.campaign_type && (
                      <div style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500, textTransform: 'capitalize' }}>
                        {c.campaign_type.replace(/_/g, ' ')}
                      </div>
                    )}
                  </td>
                  <td style={td}>{CHANNEL_LABEL[c.channel] || c.channel}</td>
                  <td style={td}>
                    {c.audience_count ? c.audience_count.toLocaleString() : '—'}
                    {c.excluded_count > 0 && (
                      <div style={{ fontSize: 11, color: '#b45309' }}>{c.excluded_count} excluded</div>
                    )}
                  </td>
                  <td style={td}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 20, background: st.bg, color: st.fg }}>
                      {st.label}
                    </span>
                  </td>
                  <td style={td}>{c.status === 'sent' ? fmtDate(c.sent_at) : fmtDate(c.scheduled_at)}</td>
                  <td style={{ ...td, textAlign: 'right' }}>{c.sent_count ? c.sent_count.toLocaleString() : '—'}</td>
                  <td style={{ ...td, textAlign: 'right' }}>
                    {c.delivered_count ? c.delivered_count.toLocaleString() : '—'}
                    {c.failed_count > 0 && (
                      <div style={{ fontSize: 11, color: '#dc2626' }}>{c.failed_count} failed</div>
                    )}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: clk ? 700 : 400, color: clk ? '#059669' : 'var(--slate)' }}>
                    {clk || '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: rev ? 700 : 400, color: rev ? '#15803d' : 'var(--slate)' }}>
                    {rev ? money(rev) : '—'}
                  </td>
                  <td style={{ ...td, textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {c.status === 'draft' && (
                      <button onClick={() => deleteCampaign(c)} title="Delete draft"
                        style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', padding: 4, display: 'inline-flex' }}>
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                      </button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <p style={{ marginTop: 14, fontSize: 12.5, color: 'var(--slate)' }}>
        Campaign sending isn't enabled yet — this step sets up the structure. The audience builder,
        message composer and send engine follow, with consent and quiet-hour checks applied at send time.
      </p>
    </div>
  )
}
