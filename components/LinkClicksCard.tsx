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
    <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', boxShadow: '0 0 0 1px rgba(0,0,0,.06), 0 1px 2px rgba(16,24,40,.04)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '16px 18px 6px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ width: 30, height: 30, borderRadius: 10, background: '#eef2ff', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#4f46e5" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
          </span>
          <h3 style={{ margin: 0, fontSize: 15.5, fontWeight: 700, color: 'var(--ink)' }}>Link clicks</h3>
        </div>
        <Link href="/admin/link-reports" style={{ height: 30, padding: '0 12px', borderRadius: 999, background: '#f4f4f5', color: '#18181b', fontSize: 13, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', whiteSpace: 'nowrap' }}>
          Full report
        </Link>
      </div>

      {/* Headline numbers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8, padding: '8px 12px' }}>
        {[
          { label: 'Total clicks', value: totalClicks },
          { label: 'Links opened', value: `${opened}/${links.length}` },
          { label: 'Open rate', value: `${rate}%` },
        ].map((s, i) => (
          <div key={s.label} style={{ padding: '12px 14px', borderRadius: 14, background: '#fafafa', minWidth: 0 }}>
            <p style={{ margin: '0 0 4px', fontSize: 12.5, fontWeight: 600, color: '#71717a', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 22, fontWeight: 800, letterSpacing: '-.02em', color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{loading ? '—' : s.value}</p>
          </div>
        ))}
      </div>

      {/* Busiest links */}
      <div style={{ padding: '4px 8px 10px' }}>
        {loading ? (
          <p style={{ padding: '12px 10px', margin: 0, fontSize: 13.5, color: '#8e8e93' }}>Loading…</p>
        ) : top.length === 0 ? (
          <p style={{ padding: '12px 10px', margin: 0, fontSize: 13.5, color: '#8e8e93' }}>No links sent yet. Links you send in chats and campaigns show their clicks here.</p>
        ) : top.map(l => {
          const t = l.link_type || l.kind
          const colour = TYPE_COLOR[t] || { bg: '#f3f4f6', fg: '#374151' }
          return (
            <div key={l.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 10px', borderRadius: 14 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {l.label || l.target_url}
                  </span>
                  {t && (
                    <span style={{ flexShrink: 0, fontSize: 11.5, fontWeight: 600, height: 20, display: 'inline-flex', alignItems: 'center', padding: '0 7px', borderRadius: 999, background: colour.bg, color: colour.fg }}>
                      {TYPE_LABEL[t] || t}
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 12.5, color: '#a1a1aa', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>/{l.code}</div>
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
