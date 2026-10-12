'use client'

// Tenant sub-paths on a custom domain that aren't rendered in place (roadmap,
// announcements, …) redirect to the colvy.com subdomain equivalent.

import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function CustomRedirect({ hostname, subPath }: { hostname: string; subPath: string }) {
  useEffect(() => {
    if (!hostname) return
    ;(async () => {
      let slug = ''
      const { data: byHelp } = await (supabase as any).from('companies').select('slug').eq('help_domain', hostname).maybeSingle()
      if (byHelp) slug = byHelp.slug
      if (!slug) {
        const { data: byBoard } = await (supabase as any).from('companies').select('slug').eq('board_domain', hostname).maybeSingle()
        if (byBoard) slug = byBoard.slug
      }
      if (!slug) { const parts = hostname.split('.'); slug = parts[parts.length - 2] || '' }
      window.location.href = slug ? `https://${slug}.colvy.com${subPath}` : 'https://colvy.com'
    })()
  }, [hostname, subPath])

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fafafa' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ width: 32, height: 32, border: '2px solid #ff7a6b', borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
        <p style={{ color: '#6b7280', fontSize: 14 }}>Redirecting...</p>
        <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
      </div>
    </div>
  )
}
