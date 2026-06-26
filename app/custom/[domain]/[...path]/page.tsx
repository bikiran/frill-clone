'use client'
// Catch-all for custom domain sub-paths
// help.prexty.com/help/article-123 → /custom/help__prexty__com/help/article-123
// Redirects to the equivalent colvy.com page

import { useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CustomDomainSubPath() {
  const params = useParams()
  const encodedDomain = params?.domain as string
  const path = (params?.path as string[]) || []
  const hostname = encodedDomain?.replace(/__/g, '.')
  const subPath = '/' + path.join('/')

  useEffect(() => {
    if (!hostname) return
    ;(async () => {
      // Resolve company slug
      let slug = ''

      const { data: byHelp } = await (supabase as any)
        .from('companies').select('slug').eq('help_domain', hostname).maybeSingle()
      if (byHelp) { slug = byHelp.slug }

      if (!slug) {
        const { data: byBoard } = await (supabase as any)
          .from('companies').select('slug').eq('board_domain', hostname).maybeSingle()
        if (byBoard) slug = byBoard.slug
      }

      if (!slug) {
        const parts = hostname.split('.')
        slug = parts[parts.length - 2] || ''
      }

      if (slug) {
        // Redirect to the colvy.com equivalent page
        window.location.href = `https://${slug}.colvy.com${subPath}`
      } else {
        window.location.href = 'https://colvy.com'
      }
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
