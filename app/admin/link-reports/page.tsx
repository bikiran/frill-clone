'use client'

import { useState, useEffect, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'

type Link = {
  id: string; code: string; target_url: string; label: string | null
  clicks: number; created_at: string; last_clicked_at: string | null
  kind: string | null; link_type: string | null
  conversation_id: string | null; contact_id: string | null
  channel: string | null; sent_by: string | null; location_id: string | null
}
type Click = {
  id: string; link_id: string; contact_id: string | null; clicked_at: string
  city: string | null; region: string | null; country: string | null
  device: string | null; os: string | null; browser: string | null
  referrer: string | null
}
type Conversion = {
  id: string; link_id: string; contact_id: string | null
  order_id: string | null; order_number: string | null
  stage: string; revenue: number; converted_at: string; clicked_at: string | null
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
const fmt = (d: string | null | undefined) => {
  const p = parseTs(d)
  return p ? p.toLocaleString('en-AU', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '—'
}
const money = (n: number) =>
  new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', currencyDisplay: 'narrowSymbol' }).format(n || 0)
/** Human duration for "time from send to click". */
const dur = (ms: number) => {
  if (!isFinite(ms) || ms <= 0) return '—'
  const m = ms / 60000
  if (m < 60) return `${Math.round(m)}m`
  const h = m / 60
  if (h < 48) return `${h.toFixed(1)}h`
  return `${(h / 24).toFixed(1)}d`
}

const CHANNEL_LABEL: Record<string, string> = {
  sms: 'SMS', chat: 'Website chat', widget: 'Website chat', email: 'Email',
  messenger: 'Facebook Messenger', instagram: 'Instagram', whatsapp: 'WhatsApp',
  internal: 'Internal agent message',
}
const TYPE_LABEL: Record<string, string> = {
  product: 'Product', image: 'Image', help: 'Help article', form: 'Form',
  checkout: 'Checkout', external: 'External website', booking: 'Booking page',
  payment: 'Payment link',
}

export default function LinkReportsPage() {
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [links, setLinks] = useState<Link[]>([])
  const [clicks, setClicks] = useState<Click[]>([])
  const [conversions, setConversions] = useState<Conversion[]>([])
  const [contacts, setContacts] = useState<Record<string, any>>({})
  const [convs, setConvs] = useState<Record<string, any>>({})
  const [outlets, setOutlets] = useState<Record<string, string>>({})
  const [team, setTeam] = useState<string[]>([])
  const [selected, setSelected] = useState<Link | null>(null)
  const [range, setRange] = useState<'7' | '30' | '90' | 'all'>('30')
  const [search, setSearch] = useState('')
  const [fChannel, setFChannel] = useState('')
  const [fType, setFType] = useState('')
  const [fAgent, setFAgent] = useState('')
  const [fOutlet, setFOutlet] = useState('')
  const [fOutcome, setFOutcome] = useState('')
  const [tab, setTab] = useState<'links' | 'channels' | 'agents' | 'outlets' | 'timing' | 'devices'>('links')

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
        await load(cid, range)
      } finally { setLoading(false) }
    })()
  }, [])

  useEffect(() => { if (companyId) load(companyId, range) }, [range])

  const load = async (cid: string, r: string) => {
    const since = r !== 'all' ? new Date(Date.now() - parseInt(r) * 86400000).toISOString() : null

    let lq = (supabase as any).from('short_links').select('*').eq('company_id', cid)
    if (since) lq = lq.gte('created_at', since)
    const { data: ls } = await lq.order('created_at', { ascending: false }).limit(1000)
    const linkRows: Link[] = ls || []
    setLinks(linkRows)

    let cq = (supabase as any).from('link_clicks').select('*').eq('company_id', cid)
    if (since) cq = cq.gte('clicked_at', since)
    const { data: cs } = await cq.order('clicked_at', { ascending: false }).limit(5000)
    setClicks(cs || [])

    // Conversions only exist once the V192 migration has been run.
    try {
      let vq = (supabase as any).from('link_conversions').select('*').eq('company_id', cid)
      if (since) vq = vq.gte('converted_at', since)
      const { data: vs } = await vq.limit(5000)
      setConversions(vs || [])
    } catch { setConversions([]) }

    // Resolve the people and threads behind the links.
    const contactIds = Array.from(new Set(linkRows.map(l => l.contact_id).filter(Boolean))) as string[]
    if (contactIds.length) {
      const { data: cts } = await (supabase as any).from('contacts')
        .select('id, name, email, phone').in('id', contactIds.slice(0, 500))
      const m: Record<string, any> = {}
      for (const c of (cts || [])) m[c.id] = c
      setContacts(m)
    }
    const convIds = Array.from(new Set(linkRows.map(l => l.conversation_id).filter(Boolean))) as string[]
    if (convIds.length) {
      const { data: cv } = await (supabase as any).from('conversations')
        .select('id, subject, channel, assigned_name, assigned_location_id').in('id', convIds.slice(0, 500))
      const m: Record<string, any> = {}
      for (const c of (cv || [])) m[c.id] = c
      setConvs(m)
    }
    // The agent filter previously listed only names already stamped on links.
    // Links sent before attribution existed have sent_by = null, so the filter
    // came up empty — load the actual team as well.
    try {
      const names = new Set<string>()
      const { data: co } = await (supabase as any).from('companies')
        .select('name, owner_id').eq('id', cid).maybeSingle()
      if (co?.name) names.add(`${co.name} (Owner)`)
      const { data: tm } = await (supabase as any).from('team_members')
        .select('name, display_name, email').eq('company_id', cid)
      for (const m of (tm || [])) {
        const n = m.name || m.display_name || (m.email ? String(m.email).split('@')[0] : null)
        if (n) names.add(n)
      }
      setTeam(Array.from(names).sort())
    } catch { /* the link-derived list still works */ }

    const { data: outs } = await (supabase as any).from('company_locations')
      .select('id, label, suburb').eq('company_id', cid)
    const om: Record<string, string> = {}
    for (const o of (outs || [])) om[o.id] = o.label || o.suburb || 'Outlet'
    setOutlets(om)
  }

  // ── Derived indexes ───────────────────────────────────────────────────────
  const clicksByLink = useMemo(() => {
    const m: Record<string, Click[]> = {}
    for (const c of clicks) (m[c.link_id] ||= []).push(c)
    for (const k in m) m[k].sort((a, b) => +(parseTs(a.clicked_at) || 0) - +(parseTs(b.clicked_at) || 0))
    return m
  }, [clicks])

  const convByLink = useMemo(() => {
    const m: Record<string, Conversion[]> = {}
    for (const v of conversions) (m[v.link_id] ||= []).push(v)
    return m
  }, [conversions])

  /** Outcome of a link: the furthest stage it reached. */
  const outcomeOf = (l: Link): string => {
    const vs = convByLink[l.id] || []
    if (vs.some(v => v.stage === 'paid')) return 'Purchased'
    if (vs.some(v => v.stage === 'created')) return 'Order created'
    if (vs.some(v => v.stage === 'checkout')) return 'Checkout started'
    if (vs.some(v => v.stage === 'cart')) return 'Added to cart'
    if ((clicksByLink[l.id]?.length || l.clicks || 0) > 0) return 'Clicked'
    return 'Not opened'
  }
  const OUTCOME_COLOR: Record<string, { bg: string; fg: string }> = {
    'Purchased': { bg: '#dcfce7', fg: '#15803d' },
    'Order created': { bg: '#dbeafe', fg: '#1d4ed8' },
    'Checkout started': { bg: '#e0e7ff', fg: '#4338ca' },
    'Added to cart': { bg: '#fef3c7', fg: '#b45309' },
    'Clicked': { bg: 'var(--peach)', fg: 'var(--coral)' },
    'Not opened': { bg: '#f3f4f6', fg: '#6b7280' },
  }

  // Names on links plus the current team, so the filter is usable even before
  // any attributed links exist.
  const agents = useMemo(() => Array.from(new Set([
    ...links.map(l => l.sent_by).filter(Boolean) as string[],
    ...team,
  ])).sort(), [links, team])

  const visible = useMemo(() => links.filter(l => {
    if (fChannel && (l.channel || '') !== fChannel) return false
    if (fType && (l.link_type || 'external') !== fType) return false
    if (fAgent && (l.sent_by || '') !== fAgent) return false
    if (fOutlet && (l.location_id || '') !== fOutlet) return false
    if (fOutcome && outcomeOf(l) !== fOutcome) return false
    if (search) {
      const q = search.toLowerCase()
      const ct = l.contact_id ? contacts[l.contact_id] : null
      const hay = [l.target_url, l.label, l.code, ct?.name, ct?.email, ct?.phone, l.sent_by]
        .filter(Boolean).join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  }), [links, fChannel, fType, fAgent, fOutlet, fOutcome, search, contacts, convByLink, clicksByLink])

  const visibleIds = useMemo(() => new Set(visible.map(l => l.id)), [visible])
  const vClicks = useMemo(() => clicks.filter(c => visibleIds.has(c.link_id)), [clicks, visibleIds])
  const vConv = useMemo(() => conversions.filter(c => visibleIds.has(c.link_id)), [conversions, visibleIds])

  // ── Summary ───────────────────────────────────────────────────────────────
  const totalClicks = vClicks.length
  const uniqueClicks = new Set(vClicks.map(c => c.contact_id || `anon:${c.id}`)).size
  const repeatClickers = (() => {
    const per: Record<string, number> = {}
    for (const c of vClicks) if (c.contact_id) per[c.contact_id] = (per[c.contact_id] || 0) + 1
    return Object.values(per).filter(n => n > 1).length
  })()
  const paidConv = vConv.filter(v => v.stage === 'paid')
  const orders = new Set(paidConv.map(v => v.order_id ?? v.id)).size
  const revenue = paidConv.reduce((s, v) => s + (Number(v.revenue) || 0), 0)
  const clickedLinks = visible.filter(l => (clicksByLink[l.id]?.length || l.clicks || 0) > 0).length
  const conversionRate = clickedLinks ? Math.round((orders / clickedLinks) * 100) : 0
  const aov = orders ? revenue / orders : 0

  /** Average time from a link being sent to its first click. */
  const avgTimeToClick = (rows: Link[]) => {
    const deltas: number[] = []
    for (const l of rows) {
      const first = clicksByLink[l.id]?.[0]
      const sent = parseTs(l.created_at)
      const clicked = first ? parseTs(first.clicked_at) : null
      if (sent && clicked) deltas.push(clicked.getTime() - sent.getTime())
    }
    return deltas.length ? deltas.reduce((a, b) => a + b, 0) / deltas.length : NaN
  }

  const tally = (rows: Click[], key: keyof Click) => {
    const m: Record<string, number> = {}
    for (const c of rows) { const v = (c[key] as string) || 'Unknown'; m[v] = (m[v] || 0) + 1 }
    return Object.entries(m).sort((a, b) => b[1] - a[1])
  }

  /** Group links by a key and compute the performance columns. */
  const groupStats = (keyOf: (l: Link) => string) => {
    const g: Record<string, Link[]> = {}
    for (const l of visible) (g[keyOf(l)] ||= []).push(l)
    return Object.entries(g).map(([k, rows]) => {
      const ids = new Set(rows.map(r => r.id))
      const cl = vClicks.filter(c => ids.has(c.link_id))
      const cv = vConv.filter(c => ids.has(c.link_id) && c.stage === 'paid')
      const uniq = new Set(cl.map(c => c.contact_id || `anon:${c.id}`)).size
      const rev = cv.reduce((s, v) => s + (Number(v.revenue) || 0), 0)
      return {
        key: k, sent: rows.length, clicks: cl.length, unique: uniq,
        clickRate: rows.length ? Math.round((rows.filter(r => (clicksByLink[r.id]?.length || 0) > 0).length / rows.length) * 100) : 0,
        orders: new Set(cv.map(v => v.order_id ?? v.id)).size,
        revenue: rev, avgToClick: avgTimeToClick(rows),
      }
    }).sort((a, b) => b.clicks - a.clicks)
  }

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, background: '#fff', padding: 16 }
  const statNum: React.CSSProperties = { fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '4px 0 0' }
  const statLbl: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }
  const th: React.CSSProperties = { padding: '10px 12px', fontWeight: 700, color: 'var(--ink)', textAlign: 'left', whiteSpace: 'nowrap' }
  const td: React.CSSProperties = { padding: '10px 12px', color: 'var(--slate)', verticalAlign: 'top' }
  const sel: React.CSSProperties = { padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 12.5, fontWeight: 600, background: '#fff', color: 'var(--ink)', cursor: 'pointer' }

  const StatTable = ({ rows, label }: { rows: any[]; label: string }) => (
    <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: '#fff', overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 760 }}>
        <thead><tr style={{ background: 'var(--peach)' }}>
          <th style={th}>{label}</th><th style={th}>Links sent</th><th style={th}>Clicks</th>
          <th style={th}>Unique</th><th style={th}>Click rate</th><th style={th}>Orders</th>
          <th style={th}>Revenue</th><th style={th}>Avg. send → click</th>
        </tr></thead>
        <tbody>
          {rows.length === 0 && <tr><td colSpan={8} style={{ ...td, textAlign: 'center', padding: 24 }}>No data in this period.</td></tr>}
          {rows.map(r => (
            <tr key={r.key} style={{ borderTop: '1px solid var(--border)' }}>
              <td style={{ ...td, color: 'var(--ink)', fontWeight: 600 }}>{r.key}</td>
              <td style={td}>{r.sent}</td>
              <td style={td}>{r.clicks}</td>
              <td style={td}>{r.unique}</td>
              <td style={td}>{r.clickRate}%</td>
              <td style={td}>{r.orders}</td>
              <td style={{ ...td, fontWeight: 700, color: r.revenue > 0 ? '#15803d' : 'var(--slate)' }}>{money(r.revenue)}</td>
              <td style={td}>{dur(r.avgToClick)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )

  if (loading) return <SkeletonList rows={6} />

  return (
    <div style={{ maxWidth: 1500, margin: '0 auto', padding: 24 }}>
      <div style={{ marginBottom: 18 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Link Reports</h1>
        <p style={{ color: 'var(--slate)', fontSize: 13.5, margin: '6px 0 0' }}>
          Links sent to customers are rewritten to trackable short URLs. An order placed by a customer
          within 7 days of clicking is credited as <strong>revenue influenced</strong>.
        </p>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search link, customer, agent…"
          style={{ flex: 1, minWidth: 200, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13 }} />
        <select value={fChannel} onChange={e => setFChannel(e.target.value)} style={sel}>
          <option value="">All channels</option>
          {Object.entries(CHANNEL_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={fType} onChange={e => setFType(e.target.value)} style={sel}>
          <option value="">All link types</option>
          {Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={fAgent} onChange={e => setFAgent(e.target.value)} style={sel}>
          <option value="">All agents</option>
          {agents.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        {Object.keys(outlets).length > 0 && (
          <select value={fOutlet} onChange={e => setFOutlet(e.target.value)} style={sel}>
            <option value="">All outlets</option>
            {Object.entries(outlets).map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        )}
        <select value={fOutcome} onChange={e => setFOutcome(e.target.value)} style={sel}>
          <option value="">Any outcome</option>
          {['Not opened', 'Clicked', 'Added to cart', 'Checkout started', 'Order created', 'Purchased']
            .map(o => <option key={o} value={o}>{o}</option>)}
        </select>
        {(['7', '30', '90', 'all'] as const).map(r => (
          <button key={r} onClick={() => setRange(r)}
            style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: range === r ? 'var(--peach)' : '#fff', color: range === r ? 'var(--coral)' : 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            {r === 'all' ? 'All time' : `${r}d`}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10, marginBottom: 16 }}>
        <div style={card}><div style={statLbl}>Links sent</div><p style={statNum}>{visible.length}</p></div>
        <div style={card}><div style={statLbl}>Clicks</div><p style={statNum}>{totalClicks}</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--slate)' }}>{uniqueClicks} unique · {repeatClickers} repeat</p></div>
        <div style={card}><div style={statLbl}>Orders</div><p style={statNum}>{orders}</p></div>
        <div style={card}><div style={statLbl}>Conversion rate</div><p style={statNum}>{conversionRate}%</p>
          <p style={{ margin: '2px 0 0', fontSize: 11, color: 'var(--slate)' }}>of clicked links</p></div>
        <div style={card}><div style={statLbl}>Revenue influenced</div><p style={{ ...statNum, color: '#15803d' }}>{money(revenue)}</p></div>
        <div style={card}><div style={statLbl}>Avg. order value</div><p style={statNum}>{money(aov)}</p></div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto', paddingBottom: 2 }}>
        {([['links', 'Links'], ['channels', 'Channels'], ['agents', 'Agents'], ['outlets', 'Outlets'], ['timing', 'Timing'], ['devices', 'Devices']] as const).map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ flexShrink: 0, padding: '7px 14px', borderRadius: 20, cursor: 'pointer', border: '1px solid ' + (tab === k ? 'var(--coral)' : 'var(--border)'), background: tab === k ? 'var(--peach)' : '#fff', color: tab === k ? 'var(--coral)' : 'var(--slate)', fontSize: 12.5, fontWeight: 700 }}>
            {label}
          </button>
        ))}
      </div>

      {/* ── Links ─────────────────────────────────────────────────────────── */}
      {tab === 'links' && (
        <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: '#fff', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 1080 }}>
            <thead><tr style={{ background: 'var(--peach)' }}>
              <th style={th}>Customer</th><th style={th}>Contact</th><th style={th}>Link</th>
              <th style={th}>Type</th><th style={th}>Channel</th><th style={th}>Agent</th>
              <th style={th}>Outcome</th><th style={th}>First click</th>
              <th style={{ ...th, textAlign: 'right' }}>Clicks</th><th style={{ ...th, textAlign: 'right' }}>Revenue</th>
            </tr></thead>
            <tbody>
              {visible.length === 0 && <tr><td colSpan={10} style={{ ...td, textAlign: 'center', padding: 28 }}>No links match these filters.</td></tr>}
              {visible.map(l => {
                const ct = l.contact_id ? contacts[l.contact_id] : null
                const cv = l.conversation_id ? convs[l.conversation_id] : null
                const lc = clicksByLink[l.id] || []
                const rev = (convByLink[l.id] || []).filter(v => v.stage === 'paid')
                  .reduce((s, v) => s + (Number(v.revenue) || 0), 0)
                const oc = outcomeOf(l)
                const col = OUTCOME_COLOR[oc]
                const byThisCustomer = l.contact_id
                  ? vClicks.filter(c => c.contact_id === l.contact_id).length : lc.length
                return (
                  <tr key={l.id} onClick={() => setSelected(selected?.id === l.id ? null : l)}
                    style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: selected?.id === l.id ? 'var(--canvas)' : '#fff' }}>
                    <td style={{ ...td, color: 'var(--ink)', fontWeight: 600 }}>{ct?.name || '—'}</td>
                    <td style={td}>{ct?.phone || ct?.email || '—'}</td>
                    <td style={{ ...td, maxWidth: 220 }}>
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{l.label || l.target_url}</div>
                      <code style={{ fontSize: 11, color: '#9ca3af' }}>/l/{l.code}</code>
                    </td>
                    <td style={td}>{TYPE_LABEL[l.link_type || 'external'] || 'External website'}</td>
                    <td style={td}>{CHANNEL_LABEL[l.channel || ''] || l.channel || '—'}</td>
                    <td style={td}>{l.sent_by || cv?.assigned_name || '—'}</td>
                    <td style={td}>
                      <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: col.bg, color: col.fg, whiteSpace: 'nowrap' }}>{oc}</span>
                    </td>
                    <td style={td}>{lc[0] ? fmt(lc[0].clicked_at) : '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <strong style={{ color: lc.length ? '#059669' : '#9ca3af' }}>{lc.length || l.clicks || 0}</strong>
                      {l.contact_id && byThisCustomer > lc.length && (
                        <div style={{ fontSize: 10.5, color: '#9ca3af' }}>{byThisCustomer} by customer</div>
                      )}
                    </td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 700, color: rev > 0 ? '#15803d' : 'var(--slate)' }}>{rev > 0 ? money(rev) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'channels' && <StatTable label="Channel" rows={groupStats(l => CHANNEL_LABEL[l.channel || ''] || l.channel || 'Unknown')} />}
      {tab === 'agents' && <StatTable label="Agent" rows={groupStats(l => l.sent_by || 'Unattributed')} />}
      {tab === 'outlets' && <StatTable label="Outlet" rows={groupStats(l => l.location_id ? (outlets[l.location_id] || 'Unknown outlet') : 'Online store')} />}

      {/* ── Timing ────────────────────────────────────────────────────────── */}
      {tab === 'timing' && (
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
            <div style={card}><div style={statLbl}>Avg. time to first click</div><p style={statNum}>{dur(avgTimeToClick(visible))}</p></div>
            {(() => {
              const within = (ms: number) => visible.filter(l => {
                const f = clicksByLink[l.id]?.[0]; const s = parseTs(l.created_at)
                const c = f ? parseTs(f.clicked_at) : null
                return s && c && (c.getTime() - s.getTime()) <= ms
              }).length
              return (<>
                <div style={card}><div style={statLbl}>Clicked ≤ 5 min</div><p style={statNum}>{within(5 * 60000)}</p></div>
                <div style={card}><div style={statLbl}>Clicked ≤ 1 hour</div><p style={statNum}>{within(3600000)}</p></div>
                <div style={card}><div style={statLbl}>Clicked ≤ 24 hours</div><p style={statNum}>{within(86400000)}</p></div>
              </>)
            })()}
          </div>

          {/* Clicks by hour */}
          <div style={card}>
            <h3 style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Clicks by hour of day</h3>
            <p style={{ margin: '0 0 12px', fontSize: 11.5, color: 'var(--slate)' }}>When customers open links — useful for choosing send times.</p>
            {(() => {
              const hours = Array.from({ length: 24 }, () => 0)
              for (const c of vClicks) { const p = parseTs(c.clicked_at); if (p) hours[p.getHours()]++ }
              const max = Math.max(...hours, 1)
              const best = hours.indexOf(Math.max(...hours))
              return (<>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 2, height: 110 }}>
                  {hours.map((n, h) => (
                    <div key={h} title={`${h}:00 — ${n} click${n === 1 ? '' : 's'}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                      <div style={{ height: `${(n / max) * 100}%`, minHeight: n ? 3 : 0, background: h === best && n > 0 ? 'var(--coral)' : '#e5e7eb', borderRadius: '3px 3px 0 0' }} />
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: 10, color: '#9ca3af' }}>
                  <span>12am</span><span>6am</span><span>12pm</span><span>6pm</span><span>11pm</span>
                </div>
                {vClicks.length > 0 && (
                  <p style={{ margin: '10px 0 0', fontSize: 12.5, color: 'var(--ink)' }}>
                    Most effective sending time: <strong>{best}:00–{best + 1}:00</strong> ({hours[best]} clicks)
                  </p>
                )}
              </>)
            })()}
          </div>

          {/* Clicks by day */}
          <div style={card}>
            <h3 style={{ margin: '0 0 12px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Clicks by day</h3>
            {(() => {
              const days: Record<string, number> = {}
              for (const c of vClicks) { const p = parseTs(c.clicked_at); if (p) { const k = p.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' }); days[k] = (days[k] || 0) + 1 } }
              const entries = Object.entries(days).slice(-30)
              const max = Math.max(...entries.map(e => e[1]), 1)
              if (!entries.length) return <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: 0 }}>No clicks yet.</p>
              return (
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 90 }}>
                  {entries.map(([d, n]) => (
                    <div key={d} title={`${d} — ${n}`} style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', height: '100%' }}>
                      <div style={{ height: `${(n / max) * 100}%`, minHeight: 3, background: 'var(--coral)', opacity: 0.75, borderRadius: '3px 3px 0 0' }} />
                    </div>
                  ))}
                </div>
              )
            })()}
          </div>
        </div>
      )}

      {/* ── Devices & locations ───────────────────────────────────────────── */}
      {tab === 'devices' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 12 }}>
          {([['Device', 'device'], ['Operating system', 'os'], ['Browser', 'browser'], ['City', 'city'], ['Country', 'country']] as const).map(([label, key]) => (
            <div key={key} style={card}>
              <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>{label}</h3>
              {tally(vClicks, key as keyof Click).slice(0, 8).map(([k, v]) => (
                <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: 'var(--ink)' }}>
                  <span style={{ textTransform: key === 'device' ? 'capitalize' : 'none' }}>{k}</span>
                  <strong>{v}</strong>
                </div>
              ))}
              {vClicks.length === 0 && <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: 0 }}>No clicks yet.</p>}
            </div>
          ))}
        </div>
      )}

      {/* Per-link click detail */}
      {selected && tab === 'links' && (
        <div style={{ ...card, marginTop: 16 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Clicks on /l/{selected.code}</h3>
          <p style={{ margin: '0 0 6px', fontSize: 12, color: 'var(--slate)', wordBreak: 'break-all' }}>{selected.target_url}</p>
          {selected.conversation_id && (
            <a href={`/admin/inbox?conversation=${selected.conversation_id}`}
              style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--coral)', textDecoration: 'none' }}>
              Open the conversation →
            </a>
          )}
          <div style={{ marginTop: 12, overflowX: 'auto' }}>
            {(clicksByLink[selected.id] || []).length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--slate)', margin: 0 }}>No clicks recorded for this link yet.</p>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5, minWidth: 560 }}>
                <thead><tr style={{ textAlign: 'left', color: 'var(--slate)' }}>
                  <th style={{ padding: '6px 8px' }}>When</th><th style={{ padding: '6px 8px' }}>Where</th>
                  <th style={{ padding: '6px 8px' }}>Device</th><th style={{ padding: '6px 8px' }}>Browser</th>
                </tr></thead>
                <tbody>
                  {(clicksByLink[selected.id] || []).slice().reverse().map(c => (
                    <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                      <td style={{ padding: '7px 8px', color: 'var(--ink)' }}>{fmt(c.clicked_at)}</td>
                      <td style={{ padding: '7px 8px' }}>{[c.city, c.region, c.country].filter(Boolean).join(', ') || 'Unknown'}</td>
                      <td style={{ padding: '7px 8px', textTransform: 'capitalize' }}>{c.device || '—'}{c.os ? ` · ${c.os}` : ''}</td>
                      <td style={{ padding: '7px 8px' }}>{c.browser || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
