'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import { peekCompanyUser, readCache, writeCache } from '@/lib/client-cache'
import { SkeletonList } from '@/components/Skeleton'
import { alertDialog, confirmDialog } from '@/components/ConfirmDialog'
import { campaignControls, unscheduleFlow, rescheduleFlow, stopSendingFlow, type ActionOutcome } from '@/components/campaigns/CampaignActions'
import EmptyScroll from '@/components/EmptyScroll'

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
  cancelled: { bg: '#f3f4f6', fg: '#6b7280', label: 'Stopped' },
  failed:    { bg: '#fee2e2', fg: '#dc2626', label: 'Failed' },
}
const CHANNEL_LABEL: Record<string, string> = { sms: 'SMS', email: 'Email' }
const CHANNEL_BADGE: Record<string, { bg: string; fg: string }> = {
  sms: { bg: '#ecfeff', fg: '#0e7490' },
  email: { bg: '#f5f3ff', fg: '#6d28d9' },
}
const ChannelIcon = ({ ch, size = 12 }: { ch: string; size?: number }) => ch === 'email'
  ? <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/></svg>
  : <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
// The dot colour on each status tag.
const STATUS_DOT: Record<string, string> = { draft: '#a1a1aa', scheduled: '#3b82f6', sending: '#f59e0b', sent: '#22c55e', paused: '#f59e0b', cancelled: '#71717a', failed: '#ef4444' }
const tint = (c: string) => ({ ['--t' as any]: c }) as React.CSSProperties
type Ins = { all: { clickRate: number; clickers: number; revenue: number }; byId: Record<string, { clickers: number; revenue: number }> }
const pctText = (n: number) => `${(Math.round((n || 0) * 10) / 10).toLocaleString('en-AU')}%`

export default function CampaignsPage() {
  const router = useRouter()
  const seededCid = peekCompanyUser()?.companyId ?? null
  const [loading, setLoading] = useState(!(seededCid && readCache(`campaigns:${seededCid}`)))
  const [companyId, setCompanyId] = useState<string | null>(seededCid)
  const [campaigns, setCampaigns] = useState<Campaign[]>([])
  // Clicks and revenue, the same figures as Campaign insights (all time).
  const [ins, setIns] = useState<Ins | null>(null)
  const [statusFilter, setStatusFilter] = useState<string>('all')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [newChannel, setNewChannel] = useState<'sms' | 'email'>('sms')
  const [tableMissing, setTableMissing] = useState(false)

  useEffect(() => {
    ;(async () => {
      try {
        let cid: string | null = seededCid
        if (!cid && typeof window !== 'undefined') {
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
    // Instant paint on revisit: hydrate from the last snapshot we rendered for
    // this company while the fresh data loads in the background.
    const cacheKey = `campaigns:${cid}`
    const cached = readCache<{ campaigns: Campaign[]; ins?: Ins | null }>(cacheKey)
    if (cached) {
      setCampaigns(cached.campaigns)
      if (cached.ins) setIns(cached.ins)
    }

    const { data, error } = await (supabase as any).from('campaigns')
      .select('*').eq('company_id', cid).order('created_at', { ascending: false }).limit(500)
    // The page is useful before the migration is applied — say so rather than
    // rendering an empty state that looks like "no campaigns yet".
    if (error) { setTableMissing(true); return }
    const campaignRows = data || []
    setCampaigns(campaignRows)
    writeCache(cacheKey, { campaigns: campaignRows, ins: cached?.ins || null })

    // Who clicked and what sold: from the server, measured exactly as Campaign
    // insights and each report measure it (people who clicked, of people
    // reached; paid orders through the campaign's links). Not awaited, so the
    // list shows straight away.
    authFetch(`/api/campaigns/insights?companyId=${encodeURIComponent(cid)}&days=0`)
      .then(r => (r.ok ? r.json() : null))
      .then((j: any) => {
        if (!j?.totals?.all) return
        const next: Ins = {
          all: { clickRate: j.totals.all.clickRate, clickers: j.totals.all.clickers, revenue: j.totals.all.revenue },
          byId: Object.fromEntries((j.campaigns || []).map((c: any) => [c.id, { clickers: c.clickers || 0, revenue: c.revenue || 0 }])),
        }
        setIns(next)
        writeCache(cacheKey, { campaigns: campaignRows, ins: next })
      })
      .catch(() => {})
  }

  const byCampaign: Ins['byId'] = ins?.byId || {}
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
  const totalRevenue = ins?.all.revenue || 0

  const createDraft = async () => {
    if (!newName.trim() || !companyId) return
    setCreating(true)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const { data, error } = await (supabase as any).from('campaigns').insert({
        company_id: companyId,
        name: newName.trim(),
        channel: newChannel,
        status: 'draft',
        // Quiet hours are a texting courtesy; an email campaign can switch
        // them on in Schedule if it wants.
        ...(newChannel === 'email' ? { quiet_hours: false } : {}),
        created_by: session?.user?.user_metadata?.display_name || session?.user?.email?.split('@')[0] || null,
        created_by_id: session?.user?.id || null,
      }).select().maybeSingle()
      if (error) throw error
      setCampaigns(c => [data, ...c])
      setNewName(''); setShowNew(false)
      // Straight into the builder rather than leaving them on the list.
      if (data?.id) router.push(`/admin/campaigns/${data.id}`)
    } catch (e: any) {
      alertDialog('Could not create the campaign: ' + e.message)
    } finally { setCreating(false) }
  }

  const deleteCampaign = async (c: Campaign) => {
    if (c.status !== 'draft') { alertDialog('Only draft campaigns can be deleted.'); return }
    if (!await confirmDialog(`Delete the draft “${c.name}”?`)) return
    try {
      // Through the server, so any SMS credit held for it is given back.
      const res = await authFetch('/api/campaigns/cancel', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, campaignId: c.id, delete: true }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(d.error || 'Could not delete the campaign')
      setCampaigns(list => list.filter(x => x.id !== c.id))
    } catch (e: any) { alertDialog('Could not delete: ' + e.message) }
  }

  // Unschedule / Reschedule / Stop sending, as on the campaign page (SMS and
  // email alike), each confirmed first.
  const [busyId, setBusyId] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const runControl = async (c: Campaign, flow: (companyId: string, c: any) => Promise<ActionOutcome | null>) => {
    if (!companyId || busyId) return
    setBusyId(c.id)
    try {
      const r = await flow(companyId, c)
      if (!r) return
      setNotice({ ok: r.ok, text: `${c.name}: ${r.message}` })
      if (r.ok && r.patch) setCampaigns(list => list.map(x => x.id === c.id ? { ...x, ...r.patch } as Campaign : x))
    } finally { setBusyId(null) }
  }
  const I = (d: React.ReactNode, size = 16) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  const open = (c: Campaign) => router.push(
    // A sent campaign opens its report; a draft opens the builder.
    ['sent', 'sending', 'cancelled'].includes(c.status) ? `/admin/campaigns/${c.id}/report` : `/admin/campaigns/${c.id}`
  )
  const countOf = (st: string) => st === 'all' ? campaigns.length : campaigns.filter(c => c.status === st).length
  const statusTag = (st: string) => <span className="cp-tag dot" style={tint(STATUS_DOT[st] || '#a1a1aa')}>{(STATUS_STYLE[st] || STATUS_STYLE.draft).label}</span>
  const closeNew = () => { setShowNew(false); setNewName(''); setNewChannel('sms') }
  const rowActions = (c: Campaign) => {
    const ctl = campaignControls(c)
    return (
      <div className="cp-acts" onClick={e => e.stopPropagation()}>
        {ctl.reschedule && <button type="button" className="cp-mini" onClick={() => runControl(c, rescheduleFlow)} disabled={!!busyId}>Reschedule</button>}
        {ctl.unschedule && <button type="button" className="cp-mini danger" onClick={() => runControl(c, unscheduleFlow)} disabled={!!busyId}>Unschedule</button>}
        {ctl.stop && <button type="button" className="cp-mini danger" onClick={() => runControl(c, stopSendingFlow)} disabled={!!busyId}>Stop sending</button>}
        {c.status === 'draft' && (
          <button type="button" className="cp-round" onClick={() => deleteCampaign(c)} title="Delete draft" aria-label={`Delete draft ${c.name}`}>
            {I(<><polyline points="3 6 5 6 21 6" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /></>, 14)}
          </button>
        )}
      </div>
    )
  }
  const tiles: { key: string; label: string; value: string; sub: string; color: string; icon: React.ReactNode; filter?: string; href?: string }[] = [
    { key: 'draft', label: 'Drafts', value: drafts.toLocaleString(), sub: 'Still being written', color: '#71717a', filter: 'draft', icon: I(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>) },
    { key: 'scheduled', label: 'Scheduled', value: scheduled.toLocaleString(), sub: 'Waiting to go out', color: '#2563eb', filter: 'scheduled', icon: I(<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" /></>) },
    { key: 'sent', label: 'Sent this month', value: sentThisMonth.toLocaleString(), sub: 'Campaigns', color: '#16a34a', filter: 'sent', icon: I(<><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></>) },
    { key: 'delivered', label: 'Delivered', value: delivered.toLocaleString(), sub: 'Messages, all time', color: '#0891b2', icon: I(<><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></>) },
    { key: 'clicks', label: 'Click rate', value: ins ? pctText(ins.all.clickRate) : '—', sub: ins ? `${ins.all.clickers.toLocaleString()} ${ins.all.clickers === 1 ? 'person' : 'people'} clicked` : 'Working it out…', color: '#7c3aed', href: '/admin/campaigns/insights', icon: I(<><path d="m9 9 5 12 1.8-5.2L21 14Z" /><path d="M7.2 2.2 8 5.1" /><path d="m5.1 8-2.9-.8" /><path d="M14 4.1 12 6" /><path d="m6 12-1.9 2" /></>) },
    { key: 'revenue', label: 'Revenue', value: ins ? money(totalRevenue) : '—', sub: 'From campaign links', color: '#15803d', href: '/admin/campaigns/insights', icon: I(<><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></>) },
  ]

  if (loading) return <div style={{ padding: '24px 28px' }}><SkeletonList rows={6} /></div>

  return (
    <div className="cp">
      <style>{CP_CSS}</style>
      <div className="cp-head">
        <div>
          <h1>Campaigns</h1>
          <p>Send texts and designed emails to the right group of customers.</p>
        </div>
        <div className="cp-head-acts">
          <button type="button" className="cp-pill" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={() => router.push('/admin/campaigns/insights')}>
            {I(<><path d="M3 3v18h18" /><path d="m7 15 4-4 3 3 5-6" /></>, 15)} Insights
          </button>
          <button type="button" className="cp-pill" onClick={() => router.push('/admin/campaigns/templates')}>Templates</button>
          <button type="button" className="cp-pill cp-hide-sm" onClick={() => router.push('/admin/contacts?import=1')}>Import contacts</button>
          <button type="button" className="cv-btn cv-btn-primary" onClick={() => setShowNew(true)}>
            {I(<><line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" /></>, 15)} Create campaign
          </button>
        </div>
      </div>

      {tableMissing && (
        <div className="cp-banner err">
          <b>Campaign tables not found</b>
          <span>Run <code>migrations/COLVY_V194_CAMPAIGNS.sql</code> in Supabase to create them, then reload this page.</span>
        </div>
      )}

      {/* Summary; the first three filter the list. */}
      <div className="cp-tiles">
        {tiles.map(t => {
          const on = !!t.filter && statusFilter === t.filter
          const body = (
            <>
              <span className="cp-tile-top"><span className="cp-tile-l">{t.label}</span><span className="cp-tile-ic">{t.icon}</span></span>
              <span className="cp-tile-v" style={t.key === 'revenue' && totalRevenue > 0 ? { color: '#15803d' } : undefined}>{t.value}</span>
              <span className="cp-tile-s">{t.sub}</span>
            </>
          )
          return t.filter
            ? <button key={t.key} type="button" className={`cp-tile${on ? ' on' : ''}`} style={{ ['--t' as any]: t.color }} aria-pressed={on} onClick={() => setStatusFilter(on ? 'all' : t.filter!)}>{body}</button>
            : t.href
              ? <button key={t.key} type="button" className="cp-tile" style={{ ['--t' as any]: t.color }} onClick={() => router.push(t.href!)} title="See Campaign insights">{body}</button>
              : <div key={t.key} className="cp-tile static" style={{ ['--t' as any]: t.color }}>{body}</div>
        })}
      </div>

      <div className="cp-bar">
        <div className="cp-seg" role="tablist" aria-label="Status">
          {(['all', 'draft', 'scheduled', 'sending', 'sent'] as const).map(st => (
            <button key={st} type="button" role="tab" aria-selected={statusFilter === st} className={statusFilter === st ? 'on' : ''} onClick={() => setStatusFilter(st)}>
              {st === 'all' ? 'All' : STATUS_STYLE[st]?.label || st}<span className="n">{countOf(st)}</span>
            </button>
          ))}
        </div>
        <label className="cp-search">
          {I(<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, 15)}
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search campaigns" aria-label="Search campaigns" />
          {search && <button type="button" className="cp-x" onClick={() => setSearch('')} aria-label="Clear search">{I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 12)}</button>}
        </label>
      </div>

      {notice && (
        <div role="status" className={`cp-banner ${notice.ok ? 'ok' : 'err'}`}>
          <span style={{ flex: 1, minWidth: 0, overflowWrap: 'anywhere' }}>{notice.text}</span>
          <button type="button" className="cp-round sm" onClick={() => setNotice(null)} aria-label="Dismiss">{I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 12)}</button>
        </div>
      )}

      <div className="cp-card">
        {visible.length > 0 && (
          <>
            <div className="cp-tablewrap">
              <table className="cp-table">
                <thead>
                  <tr>
                    <th>Campaign</th><th>Audience</th><th>Status</th><th>Date</th>
                    <th className="r">Sent</th><th className="r">Delivered</th><th className="r">Clicked</th><th className="r">Revenue</th>
                    <th className="r"><span className="sr">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(c => {
                    const clk = byCampaign[c.id]?.clickers || 0
                    const rev = byCampaign[c.id]?.revenue || 0
                    const badge = CHANNEL_BADGE[c.channel] || CHANNEL_BADGE.sms
                    return (
                      <tr key={c.id} onClick={() => open(c)}>
                        <td>
                          <div className="cp-name">
                            <span className="cp-ch" style={{ background: badge.bg, color: badge.fg }} title={CHANNEL_LABEL[c.channel] || 'SMS'}><ChannelIcon ch={c.channel} size={16} /></span>
                            <span className="cp-name-t">
                              <button type="button" onClick={e => { e.stopPropagation(); open(c) }}>{c.name}</button>
                              <small>{CHANNEL_LABEL[c.channel] || c.channel || 'SMS'}{c.campaign_type ? ` · ${c.campaign_type.replace(/_/g, ' ')}` : ''}</small>
                            </span>
                          </div>
                        </td>
                        <td>
                          {c.audience_count ? c.audience_count.toLocaleString() : <span className="cp-muted">—</span>}
                          {c.excluded_count > 0 && <small className="cp-warn">{c.excluded_count.toLocaleString()} excluded</small>}
                        </td>
                        <td>{statusTag(c.status)}</td>
                        <td className="cp-date">{c.status === 'sent' ? fmtDate(c.sent_at) : fmtDate(c.scheduled_at)}</td>
                        <td className="r">{c.sent_count ? c.sent_count.toLocaleString() : <span className="cp-muted">—</span>}</td>
                        <td className="r">
                          {c.delivered_count ? c.delivered_count.toLocaleString() : <span className="cp-muted">—</span>}
                          {c.failed_count > 0 && <small className="cp-bad">{c.failed_count.toLocaleString()} failed</small>}
                        </td>
                        <td className="r">{clk ? <b className="cp-good">{clk.toLocaleString()}</b> : <span className="cp-muted">—</span>}</td>
                        <td className="r">{rev ? <b className="cp-good">{money(rev)}</b> : <span className="cp-muted">—</span>}</td>
                        <td className="r">{rowActions(c)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            {/* Phones: one card per campaign. */}
            <div className="cp-mlist">
              {visible.map(c => {
                const badge = CHANNEL_BADGE[c.channel] || CHANNEL_BADGE.sms
                const clk = byCampaign[c.id]?.clickers || 0
                const rev = byCampaign[c.id]?.revenue || 0
                const ctl = campaignControls(c)
                return (
                  <div key={c.id} className="cp-m" role="button" tabIndex={0} onClick={() => open(c)} onKeyDown={e => { if (e.key === 'Enter') open(c) }}>
                    <span className="cp-ch" style={{ background: badge.bg, color: badge.fg }}><ChannelIcon ch={c.channel} size={16} /></span>
                    <div className="cp-m-main">
                      <b>{c.name}</b>
                      <span className="cp-m-meta">{statusTag(c.status)}<span>{c.status === 'sent' ? fmtDate(c.sent_at) : c.scheduled_at ? fmtDate(c.scheduled_at) : (CHANNEL_LABEL[c.channel] || 'SMS')}</span></span>
                      {(c.sent_count > 0 || clk > 0 || rev > 0) && (
                        <span className="cp-m-stats">
                          {c.sent_count > 0 && <span><b>{c.sent_count.toLocaleString()}</b> sent</span>}
                          {clk > 0 && <span><b>{clk.toLocaleString()}</b> clicked</span>}
                          {rev > 0 && <span className="cp-good"><b>{money(rev)}</b></span>}
                        </span>
                      )}
                      {(ctl.reschedule || ctl.unschedule || ctl.stop || c.status === 'draft') && rowActions(c)}
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
        {visible.length === 0 && (
          <div className="cp-empty">
            {campaigns.length === 0
              ? <EmptyScroll kinds={['campaign', 'sms', 'email']} title="No campaigns yet"
                  line="Send a text or a designed email to your customers. Results show up here."
                  action={<button type="button" className="cv-btn cv-btn-primary" onClick={() => setShowNew(true)}>Create campaign</button>} />
              : <EmptyScroll kinds={['campaign', 'sms', 'email']} title={search.trim() ? 'No matches' : 'No campaigns match these filters'}
                  line={search.trim() ? `Nothing matches “${search.trim()}”.` : 'Try another status to see more.'}
                  action={<button type="button" className="cv-btn" onClick={() => { setSearch(''); setStatusFilter('all') }}>Clear filters</button>} />}
          </div>
        )}
      </div>

      <p className="cp-fine">
        Consent, opt-outs and (for email) bounces are checked again right before anything sends. SMS
        uses your monthly allowance, then SMS credit; email doesn’t use either.
      </p>

      {/* New campaign */}
      {showNew && (
        <div className="cp-overlay" onClick={closeNew}>
          <div className="cp-modal" role="dialog" aria-modal="true" aria-label="Create a campaign" onClick={e => e.stopPropagation()}>
            <div className="cp-mh">
              <div>
                <h2>Create a campaign</h2>
                <p>This makes a draft. Audience, message and timing come next, and nothing sends yet.</p>
              </div>
              <button type="button" className="cp-round lg" onClick={closeNew} aria-label="Close">{I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 16)}</button>
            </div>
            <div className="cp-mb">
              <p className="cp-flabel">How will it go out?</p>
              <div className="cp-chans" role="radiogroup" aria-label="Channel">
                {([['sms', 'SMS', 'A text message to customers’ mobiles. Uses your SMS allowance, then SMS credit.'], ['email', 'Email', 'A designed email in your branding. Doesn’t use SMS credit.']] as const).map(([v, t, d]) => (
                  <button key={v} type="button" role="radio" aria-checked={newChannel === v} className={`cp-chan${newChannel === v ? ' on' : ''}`} onClick={() => setNewChannel(v)}>
                    <span className="cp-ch lg" style={{ background: CHANNEL_BADGE[v].bg, color: CHANNEL_BADGE[v].fg }}><ChannelIcon ch={v} size={18} /></span>
                    <span className="cp-chan-t"><b>{t}</b><small>{d}</small></span>
                    <span className="cp-radio" aria-hidden="true" />
                  </button>
                ))}
              </div>
              <label className="cp-flabel" htmlFor="cp-new-name">Name your campaign</label>
              <input id="cp-new-name" className="cp-field" autoFocus value={newName} onChange={e => setNewName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && createDraft()} placeholder="e.g. Weekend Fish Sale" />
              <p className="cp-hint">Only your team sees this name.</p>
            </div>
            <div className="cp-mf">
              <button type="button" className="cv-btn" onClick={closeNew}>Cancel</button>
              <button type="button" className="cv-btn cv-btn-primary" onClick={createDraft} disabled={creating || !newName.trim()}>{creating ? 'Creating…' : 'Create draft'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// The Campaigns look: a big bold header, summary tiles, a status switch and a
// soft table (cards on phones), with a dialog to start a new campaign.
const CP_CSS = `
.cp{padding:24px 28px 48px;max-width:1400px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.cp button::before,.cp-modal button::before{display:none}
.cp-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.cp-head h1{margin:0;font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.1}
.cp-head p{margin:6px 0 0;font-size:14px;color:#71717a}
.cp-head-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.cp-pill{height:38px;padding:0 15px;border:none;border-radius:999px;background:#f4f4f5;color:#18181b;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s}
.cp-pill:hover{background-color:#ececef}
.cp-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px;padding:12px 14px 12px 16px;border-radius:16px;font-size:13.5px;line-height:1.5}
.cp-banner.ok{background:color-mix(in srgb,#22c55e 9%,#fff);color:#166534;box-shadow:0 0 0 1px color-mix(in srgb,#22c55e 20%,transparent)}
.cp-banner.err{background:color-mix(in srgb,#ef4444 7%,#fff);color:#7f1d1d;box-shadow:0 0 0 1px color-mix(in srgb,#ef4444 18%,transparent)}
.cp-tiles{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;margin-bottom:18px}
.cp-tile{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:14px 16px;border:none;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.07),0 1px 2px rgba(16,24,40,.04);font:inherit;color:inherit;text-align:left;min-width:0;cursor:pointer;transition:box-shadow .15s,transform .2s cubic-bezier(.22,1,.36,1)}
.cp-tile.static{cursor:default}
button.cp-tile:hover{transform:translateY(-1px);box-shadow:0 0 0 1px rgba(0,0,0,.08),0 10px 24px -14px rgba(0,0,0,.3)}
.cp-tile.on{box-shadow:0 0 0 2px var(--t)}
.cp-tile-top{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%}
.cp-tile-l{font-size:13.5px;font-weight:600;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-tile-ic{width:30px;height:30px;border-radius:10px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 11%,#fff);color:var(--t)}
.cp-tile-ic svg{width:15px;height:15px}
.cp-tile-v{margin-top:2px;font-size:25px;font-weight:800;letter-spacing:-.02em;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.cp-tile-s{font-size:12.5px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.cp-bar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:14px}
.cp-seg{display:inline-flex;gap:2px;padding:3px;border-radius:999px;background:#f4f4f5;max-width:100%;overflow-x:auto;scrollbar-width:none}
.cp-seg::-webkit-scrollbar{display:none}
.cp-seg button{flex-shrink:0;height:32px;padding:0 12px 0 14px;border:none;border-radius:999px;background:transparent;font:inherit;font-size:13.5px;font-weight:600;color:#52525b;cursor:pointer;display:inline-flex;align-items:center;gap:7px;white-space:nowrap;transition:background .15s,color .15s,box-shadow .15s}
.cp-seg button:hover{color:#18181b}
.cp-seg button.on{background:#fff;color:#18181b;box-shadow:0 1px 3px rgba(0,0,0,.1),0 0 0 .5px rgba(0,0,0,.04)}
.cp-seg .n{min-width:18px;height:18px;padding:0 6px;box-sizing:border-box;border-radius:999px;background:rgba(0,0,0,.06);font-size:11.5px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.cp-search{flex:1;min-width:220px;display:flex;align-items:center;gap:8px;height:38px;padding:0 10px 0 14px;border-radius:999px;border:1.5px solid transparent;background:#f4f4f5;color:#a1a1aa;box-sizing:border-box;transition:background-color .15s,border-color .15s,box-shadow .15s}
.cp-search:focus-within{background:#fff;border-color:#d4d4d8;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.cp-search input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;font-size:14px;color:var(--ink)}
.cp-search input:focus{box-shadow:none}
.cp-x{width:24px;height:24px;padding:0;border:none;border-radius:999px;background:#e4e4e7;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.cp-card{background:#fff;border-radius:20px;box-shadow:0 0 0 1px rgba(0,0,0,.07),0 1px 2px rgba(16,24,40,.04);overflow:hidden}
.cp-tablewrap{overflow-x:auto}
.cp-table{width:100%;border-collapse:collapse;min-width:900px}
.cp-table th{text-align:left;padding:14px 14px 10px;font-size:12.5px;font-weight:600;color:#8e8e93;white-space:nowrap;border-bottom:1px solid #f0f0f2}
.cp-table td{padding:12px 14px;font-size:13.5px;color:var(--ink);border-bottom:1px solid #f4f4f5;vertical-align:middle;font-variant-numeric:tabular-nums}
.cp-table tbody tr{cursor:pointer;transition:background-color .12s}
.cp-table tbody tr:hover td{background:#fafafa}
.cp-table tbody tr:last-child td{border-bottom:none}
.cp-table .r{text-align:right}
.cp-table small{display:block;font-size:12px;margin-top:1px}
.sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
.cp-name{display:flex;align-items:center;gap:12px;min-width:0}
.cp-ch{width:36px;height:36px;border-radius:12px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center}
.cp-ch.lg{width:40px;height:40px}
.cp-name-t{display:flex;flex-direction:column;min-width:0}
.cp-name-t button{border:none;background:none;padding:0;font:inherit;font-size:14.5px;font-weight:600;color:var(--ink);text-align:left;cursor:pointer;max-width:320px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-name-t small{font-size:12.5px!important;color:#8e8e93;text-transform:none}
.cp-name-t small::first-letter{text-transform:uppercase}
.cp-muted{color:#c4c4c8}
.cp-warn{color:#b45309}
.cp-bad{color:#dc2626}
.cp-good{color:#15803d;font-weight:700}
.cp-date{color:#71717a;white-space:nowrap}
.cp-tag{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;font-size:12.5px;font-weight:600;white-space:nowrap}
.cp-tag.dot{background:color-mix(in srgb,var(--t) 12%,#fff);color:color-mix(in srgb,var(--t) 78%,#000)}
.cp-tag.dot::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--t)}
.cp-acts{display:inline-flex;align-items:center;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.cp-mini{height:30px;padding:0 12px;border:none;border-radius:999px;background:#f4f4f5;color:#18181b;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s}
.cp-mini:hover{background-color:#ececef}
.cp-mini:disabled{opacity:.55;cursor:default}
.cp-mini.danger{color:#e11d48}
.cp-mini.danger:hover{background-color:#fff1f2}
.cp-round{width:30px;height:30px;padding:0;border:none;border-radius:999px;background:#f4f4f5;color:#71717a;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;transition:background-color .15s,color .15s}
.cp-round:hover{background-color:#fff1f2;color:#e11d48}
.cp-round.sm{width:26px;height:26px;background:rgba(255,255,255,.6);color:inherit}
.cp-round.lg{width:34px;height:34px}
.cp-round.lg:hover{background-color:#ececef;color:#18181b}
.cp-mlist{display:none}
.cp-m{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border-bottom:1px solid #f4f4f5;cursor:pointer}
.cp-m:last-child{border-bottom:none}
.cp-m-main{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.cp-m-main > b{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.cp-m-meta{display:flex;align-items:center;gap:8px;font-size:12.5px;color:#8e8e93}
.cp-m-stats{display:flex;gap:12px;flex-wrap:wrap;font-size:12.5px;color:#71717a}
.cp-m-stats b{color:var(--ink)}
.cp-m .cp-acts{justify-content:flex-start;margin-top:2px}
.cp-empty{padding:24px 12px}
.cp-fine{margin:14px 2px 0;font-size:12.5px;color:#8e8e93;line-height:1.55}
@keyframes cpFade{from{opacity:0}to{opacity:1}}
@keyframes cpRise{from{transform:translateY(12px) scale(.98);opacity:0}to{transform:none;opacity:1}}
.cp-overlay{position:fixed;inset:0;z-index:5700;background:rgba(15,15,20,.35);display:flex;align-items:center;justify-content:center;padding:20px;animation:cpFade .18s ease}
.cp-modal{width:500px;max-width:100%;max-height:calc(100dvh - 40px);display:flex;flex-direction:column;background:#fff;border-radius:24px;box-shadow:0 24px 64px rgba(0,0,0,.22);animation:cpRise .24s cubic-bezier(.22,1,.36,1);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.cp-mh{display:flex;align-items:flex-start;gap:12px;padding:22px 22px 6px}
.cp-mh > div{flex:1;min-width:0}
.cp-mh h2{margin:0;font-size:22px;font-weight:800;letter-spacing:-.02em}
.cp-mh p{margin:4px 0 0;font-size:14px;color:#71717a;line-height:1.5}
.cp-mb{flex:1;min-height:0;overflow-y:auto;padding:14px 22px 6px}
.cp-mf{display:flex;justify-content:flex-end;gap:8px;padding:14px 22px 20px}
.cp-flabel{display:block;margin:0 0 8px;font-size:13.5px;font-weight:600;color:var(--ink)}
.cp-chans{display:flex;flex-direction:column;gap:6px;margin-bottom:18px}
.cp-chan{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border:none;border-radius:16px;background:#f4f4f5;font:inherit;text-align:left;cursor:pointer;color:inherit;transition:background-color .15s,box-shadow .15s}
.cp-chan:hover{background-color:#ececef}
.cp-chan.on{background:color-mix(in srgb,var(--coral) 8%,#fff);box-shadow:0 0 0 1.5px var(--coral)}
.cp-chan-t{flex:1;min-width:0}
.cp-chan-t b{display:block;font-size:14.5px;font-weight:600}
.cp-chan-t small{display:block;margin-top:2px;font-size:12.5px;color:#71717a;line-height:1.4}
.cp-radio{width:18px;height:18px;border-radius:50%;flex-shrink:0;box-sizing:border-box;border:2px solid #c4c4c8;background:#fff;transition:border .15s}
.cp-chan.on .cp-radio{border:5.5px solid var(--coral)}
.cp-field{display:block;width:100%;box-sizing:border-box;height:44px;padding:0 14px;border:1.5px solid transparent;border-radius:12px;background:#f4f4f5;font:inherit;font-size:15px;color:var(--ink);outline:none;transition:background-color .15s,border-color .15s,box-shadow .15s}
.cp-field:focus{background:#fff;border-color:#d4d4d8!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.cp-hint{margin:6px 0 0;font-size:12.5px;color:#8e8e93}
.cp-tile:focus-visible,.cp-seg button:focus-visible,.cp-mini:focus-visible,.cp-round:focus-visible,.cp-pill:focus-visible,.cp-chan:focus-visible,.cp-m:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 28%,transparent)}
@media(max-width:1180px){.cp-tiles{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media(max-width:700px){
  .cp{padding:16px 14px 40px}
  .cp-head{flex-direction:column;align-items:stretch}
  .cp-head h1{font-size:26px}
  .cp-head-acts .cv-btn{flex:1}
  .cp-hide-sm{display:none}
  .cp-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .cp-tile{padding:12px 14px}
  .cp-tile-v{font-size:21px}
  .cp-search{min-width:0;flex:1 1 100%}
  .cp-tablewrap{display:none}
  .cp-mlist{display:block}
  .cp-overlay{padding:0;align-items:flex-end}
  .cp-modal{width:100%;border-radius:24px 24px 0 0;max-height:94dvh}
  .cp-field{font-size:16px}
}
@media (prefers-reduced-motion: reduce){.cp-overlay,.cp-modal{animation:none}button.cp-tile:hover{transform:none}}
`
