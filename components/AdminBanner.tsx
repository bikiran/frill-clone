'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

// A dismissible announcement bar across the top of the admin. Managed from
// Settings → Announcements; can carry a link that deep-links into settings.
export default function AdminBanner({ companyId }: { companyId?: string | null }) {
  const [banner, setBanner] = useState<any>(null)
  const [dismissed, setDismissed] = useState(true) // assume hidden until we know

  useEffect(() => {
    ;(async () => {
      try {
        // Company banners first, then any platform-wide one.
        let row: any = null
        if (companyId) {
          const { data } = await (supabase as any).from('admin_banners')
            .select('*').eq('company_id', companyId).eq('is_active', true)
            .order('created_at', { ascending: false }).limit(1)
          row = data?.[0] || null
        }
        if (!row) {
          const { data } = await (supabase as any).from('admin_banners')
            .select('*').is('company_id', null).eq('is_active', true)
            .order('created_at', { ascending: false }).limit(1)
          row = data?.[0] || null
        }
        if (!row) return
        // Respect a previous dismissal of THIS banner.
        const key = `colvy_banner_dismissed_${row.id}`
        const already = typeof window !== 'undefined' && localStorage.getItem(key) === '1'
        setBanner(row)
        setDismissed(!!already)
      } catch { /* table may not exist yet — stay quiet */ }
    })()
  }, [companyId])

  if (!banner || dismissed) return null

  const dismiss = () => {
    try { localStorage.setItem(`colvy_banner_dismissed_${banner.id}`, '1') } catch {}
    setDismissed(true)
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '9px 44px 9px 16px', background: 'var(--coral)', color: '#fff', position: 'relative', fontSize: 13.5, fontWeight: 600 }}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
      <span style={{ textAlign: 'center' }}>{banner.message}</span>
      {banner.link_url && (
        <a href={banner.link_url} style={{ color: '#fff', textDecoration: 'underline', fontWeight: 800, whiteSpace: 'nowrap' }}>
          {banner.link_label || 'Learn more'}
        </a>
      )}
      <button onClick={dismiss} aria-label="Dismiss"
        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: '#fff', display: 'flex', padding: 4 }}>
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      </button>
    </div>
  )
}
