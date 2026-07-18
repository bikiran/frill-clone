'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { SkeletonList } from '@/components/Skeleton'

type Link = {
  id: string; code: string; target_url: string; label: string | null
  clicks: number; created_at: string; last_clicked_at: string | null
  kind: string | null; conversation_id: string | null; channel: string | null
}
type Click = {
  id: string; link_id: string; clicked_at: string
  city: string | null; region: string | null; country: string | null
  device: string | null; os: string | null; browser: string | null
  referrer: string | null
}

// Same robust timestamp parsing used across the inbox: Supabase returns
// "+00:00" offsets, which a naive `+ 'Z'` append turns into an invalid date.
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

export default function LinkReportsPage() {
  const [loading, setLoading] = useState(true)
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [links, setLinks] = useState<Link[]>([])
  const [clicks, setClicks] = useState<Click[]>([])
  const [selected, setSelected] = useState<Link | null>(null)
  const [range, setRange] = useState<'7' | '30' | '90' | 'all'>('30')
  const [search, setSearch] = useState('')

  useEffect(() => {
    ;(async () => {
      try {
        // Resolve the company from the subdomain, then ownership/membership.
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
      } finally {
        setLoading(false)
      }
    })()
  }, [])

  useEffect(() => { if (companyId) load(companyId, range) }, [range])

  const load = async (cid: string, r: string) => {
    let q = (supabase as any).from('short_links').select('*').eq('company_id', cid)
    if (r !== 'all') {
      const since = new Date(Date.now() - parseInt(r) * 86400000).toISOString()
      q = q.gte('created_at', since)
    }
    const { data: ls } = await q.order('created_at', { ascending: false }).limit(500)
    setLinks(ls || [])
    // Click detail for the same window.
    let cq = (supabase as any).from('link_clicks').select('*').eq('company_id', cid)
    if (r !== 'all') {
      const since = new Date(Date.now() - parseInt(r) * 86400000).toISOString()
      cq = cq.gte('clicked_at', since)
    }
    const { data: cs } = await cq.order('clicked_at', { ascending: false }).limit(2000)
    setClicks(cs || [])
  }

  const visible = links.filter(l =>
    !search || (l.target_url || '').toLowerCase().includes(search.toLowerCase())
    || (l.label || '').toLowerCase().includes(search.toLowerCase())
    || (l.code || '').toLowerCase().includes(search.toLowerCase())
  )

  // Summary stats.
  const totalLinks = visible.length
  const totalClicks = clicks.length
  const clickedLinks = visible.filter(l => (l.clicks || 0) > 0).length
  const clickRate = totalLinks ? Math.round((clickedLinks / totalLinks) * 100) : 0

  const tally = (key: keyof Click) => {
    const counts: Record<string, number> = {}
    for (const c of clicks) {
      const v = (c[key] as string) || 'Unknown'
      counts[v] = (counts[v] || 0) + 1
    }
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6)
  }
  const byDevice = tally('device')
  const byCity = tally('city')

  const selectedClicks = selected ? clicks.filter(c => c.link_id === selected.id) : []

  const card: React.CSSProperties = { border: '1px solid var(--border)', borderRadius: 14, background: '#fff', padding: 16 }
  const stat: React.CSSProperties = { fontSize: 26, fontWeight: 800, color: 'var(--ink)', margin: '4px 0 0' }
  const statLabel: React.CSSProperties = { fontSize: 11, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }

  if (loading) return <SkeletonList rows={6} />

  return (
    <div style={{ maxWidth: 1200, margin: '0 auto', padding: 24 }}>
      <div style={{ marginBottom: 20 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Link Reports</h1>
        <p style={{ color: 'var(--slate)', fontSize: 13.5, margin: '6px 0 0' }}>
          Links sent to customers are rewritten to trackable short URLs. See what was clicked, when, and from where.
        </p>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 18, flexWrap: 'wrap' }}>
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search links…"
          style={{ flex: 1, minWidth: 220, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }} />
        {(['7', '30', '90', 'all'] as const).map(r => (
          <button key={r} onClick={() => setRange(r)}
            style={{ padding: '9px 14px', borderRadius: 10, border: '1px solid var(--border)', background: range === r ? 'var(--peach)' : '#fff', color: range === r ? 'var(--coral)' : 'var(--slate)', fontSize: 12.5, fontWeight: 700, cursor: 'pointer' }}>
            {r === 'all' ? 'All time' : `${r} days`}
          </button>
        ))}
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={card}><div style={statLabel}>Links sent</div><p style={stat}>{totalLinks.toLocaleString()}</p></div>
        <div style={card}><div style={statLabel}>Total clicks</div><p style={stat}>{totalClicks.toLocaleString()}</p></div>
        <div style={card}><div style={statLabel}>Links clicked</div><p style={stat}>{clickedLinks.toLocaleString()}</p></div>
        <div style={card}><div style={statLabel}>Click rate</div><p style={stat}>{clickRate}%</p></div>
      </div>

      {/* Breakdowns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 12, marginBottom: 18 }}>
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>By device</h3>
          {byDevice.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: 0 }}>No clicks yet.</p> : byDevice.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: 'var(--ink)' }}>
              <span style={{ textTransform: 'capitalize' }}>{k}</span>
              <strong>{v}</strong>
            </div>
          ))}
        </div>
        <div style={card}>
          <h3 style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 700, color: 'var(--ink)' }}>Top locations</h3>
          {byCity.length === 0 ? <p style={{ fontSize: 12.5, color: 'var(--slate)', margin: 0 }}>No clicks yet.</p> : byCity.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, padding: '4px 0', color: 'var(--ink)' }}>
              <span>{k}</span><strong>{v}</strong>
            </div>
          ))}
        </div>
      </div>

      {/* Link list */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden', background: '#fff' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ background: 'var(--peach)', textAlign: 'left' }}>
              <th style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--ink)' }}>Destination</th>
              <th style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--ink)' }}>Short link</th>
              <th style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--ink)' }}>Sent</th>
              <th style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--ink)' }}>Last click</th>
              <th style={{ padding: '11px 14px', fontWeight: 700, color: 'var(--ink)', textAlign: 'right' }}>Clicks</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr><td colSpan={5} style={{ padding: 28, textAlign: 'center', color: 'var(--slate)' }}>
                No links sent in this period.
              </td></tr>
            )}
            {visible.map(l => (
              <tr key={l.id} onClick={() => setSelected(selected?.id === l.id ? null : l)}
                style={{ borderTop: '1px solid var(--border)', cursor: 'pointer', background: selected?.id === l.id ? 'var(--canvas)' : '#fff' }}>
                <td style={{ padding: '11px 14px', maxWidth: 340 }}>
                  <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)' }}>
                    {l.label || l.target_url}
                  </div>
                </td>
                <td style={{ padding: '11px 14px', color: 'var(--slate)' }}><code>/l/{l.code}</code></td>
                <td style={{ padding: '11px 14px', color: 'var(--slate)' }}>{fmt(l.created_at)}</td>
                <td style={{ padding: '11px 14px', color: 'var(--slate)' }}>{l.last_clicked_at ? fmt(l.last_clicked_at) : '—'}</td>
                <td style={{ padding: '11px 14px', textAlign: 'right' }}>
                  <span style={{ fontWeight: 800, color: (l.clicks || 0) > 0 ? '#059669' : '#9ca3af' }}>{l.clicks || 0}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Click detail for the selected link */}
      {selected && (
        <div style={{ ...card, marginTop: 16 }}>
          <h3 style={{ margin: '0 0 4px', fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>
            Clicks on /l/{selected.code}
          </h3>
          <p style={{ margin: '0 0 12px', fontSize: 12, color: 'var(--slate)', wordBreak: 'break-all' }}>{selected.target_url}</p>
          {selectedClicks.length === 0 ? (
            <p style={{ fontSize: 13, color: 'var(--slate)', margin: 0 }}>No clicks recorded for this link yet.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--slate)' }}>
                  <th style={{ padding: '6px 8px', fontWeight: 700 }}>When</th>
                  <th style={{ padding: '6px 8px', fontWeight: 700 }}>Where</th>
                  <th style={{ padding: '6px 8px', fontWeight: 700 }}>Device</th>
                  <th style={{ padding: '6px 8px', fontWeight: 700 }}>Browser</th>
                </tr>
              </thead>
              <tbody>
                {selectedClicks.map(c => (
                  <tr key={c.id} style={{ borderTop: '1px solid var(--border)' }}>
                    <td style={{ padding: '7px 8px', color: 'var(--ink)' }}>{fmt(c.clicked_at)}</td>
                    <td style={{ padding: '7px 8px', color: 'var(--slate)' }}>
                      {[c.city, c.region, c.country].filter(Boolean).join(', ') || 'Unknown'}
                    </td>
                    <td style={{ padding: '7px 8px', color: 'var(--slate)', textTransform: 'capitalize' }}>
                      {c.device || '—'}{c.os ? ` · ${c.os}` : ''}
                    </td>
                    <td style={{ padding: '7px 8px', color: 'var(--slate)' }}>{c.browser || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}
    </div>
  )
}
