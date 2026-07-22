'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const TYPE_LABEL: Record<string, string> = {
  product: 'Product', image: 'Image', help: 'Help article', form: 'Form',
  checkout: 'Checkout', external: 'Website', booking: 'Booking',
  payment: 'Payment', tracking: 'Tracking', media: 'Media', review: 'Review',
}

const TYPE_COLOR: Record<string, { bg: string; fg: string }> = {
  tracking: { bg: '#eef2ff', fg: '#4338ca' },
  media: { bg: '#fff4f1', fg: '#c2410c' },
  review: { bg: '#fefce8', fg: '#a16207' },
  product: { bg: '#ecfdf5', fg: '#15803d' },
}

/**
 * A quick read on how the links we send are performing — total clicks, how many
 * links have been opened at all, and the busiest few. Sits on the admin
 * dashboard so it's visible without going digging.
 */
export default function LinkClicksCard({ companyId }: { companyId: string | null }) {
  const [loading, setLoading] = useState(true)
  const [links, setLinks] = useState<any[]>([])

  useEffect(() => {
    if (!companyId) { setLoading(false); return }
    ;(async () => {
      try {
        // Try with the newer columns, fall back if a migration hasn't run.
        let rows: any[] = []
        const full = await (supabase as any).from('short_links')
          .select('code, label, target_url, clicks, link_type, kind, created_at')
          .eq('company_id', companyId).order('created_at', { ascending: false }).limit(500)
        if (full.error) {
          const base = await (supabase as any).from('short_links')
            .select('code, label, target_url, clicks, created_at')
            .eq('company_id', companyId).order('created_at', { ascending: false }).limit(500)
          rows = base.data || []
        } else rows = full.data || []
        setLinks(rows)
      } catch { setLinks([]) } finally { setLoading(false) }
    })()
  }, [companyId])

  const totalClicks = links.reduce((n, l) => n + (l.clicks || 0), 0)
  const opened = links.filter(l => (l.clicks || 0) > 0).length
  const top = [...links].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, 5)
  const rate = links.length ? Math.round((opened / links.length) * 100) : 0

  return (
    <div className="bg-white rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 18px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
            <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
          </svg>
          <h3 style={{ margin: 0, fontSize: 14, fontWeight: 800, color: 'var(--ink)' }}>Link clicks</h3>
        </div>
        <Link href="/admin/link-reports" style={{ fontSize: 12, fontWeight: 700, color: 'var(--coral)', textDecoration: 'none' }}>
          Full report →
        </Link>
      </div>

      {/* Headline numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)' }}>
        {[
          { label: 'Total clicks', value: totalClicks },
          { label: 'Links opened', value: `${opened}/${links.length}` },
          { label: 'Open rate', value: `${rate}%` },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: '14px 18px', borderRight: i < 2 ? '1px solid var(--border)' : 'none' }}>
            <p style={{ margin: '0 0 3px', fontSize: 10.5, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, color: 'var(--ink)' }}>{loading ? '—' : s.value}</p>
          </div>
        ))}
      </div>

      {/* Busiest links */}
      <div style={{ borderTop: '1px solid var(--border)' }}>
        {loading ? (
          <p style={{ padding: 16, margin: 0, fontSize: 13, color: 'var(--slate)' }}>Loading…</p>
        ) : top.length === 0 ? (
          <p style={{ padding: 16, margin: 0, fontSize: 13, color: 'var(--slate)' }}>No links sent yet.</p>
        ) : top.map(l => {
          const t = l.link_type || l.kind
          const colour = TYPE_COLOR[t] || { bg: '#f3f4f6', fg: '#374151' }
          return (
            <div key={l.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 18px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.label || l.target_url}
                  </span>
                  {t && (
                    <span style={{ flexShrink: 0, fontSize: 9.5, fontWeight: 700, padding: '1px 6px', borderRadius: 4, background: colour.bg, color: colour.fg }}>
                      {TYPE_LABEL[t] || t}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/{l.code}</div>
              </div>

              {/* Click count with a view icon — a quick read at a glance. */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}
                title={`${l.clicks || 0} click${(l.clicks || 0) === 1 ? '' : 's'}`}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                  stroke={l.clicks ? '#059669' : '#d1d5db'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <span style={{ fontSize: 14, fontWeight: 800, color: l.clicks ? '#059669' : '#d1d5db', minWidth: 18, textAlign: 'right' }}>
                  {l.clicks || 0}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
