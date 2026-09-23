'use client'

// Custom-domain sub-paths. Help pages render in place so the visitor stays on
// the custom domain (e.g. help.acme.com/help/<id>); other tenant sub-paths
// (roadmap, announcements, …) still redirect to the colvy.com equivalent.

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import HelpArticlePage from '../../../help/[id]/page'
import HelpTicketPage from '../../../help/ticket/page'
import CustomDomainPage from '../page'

export default function CustomDomainSubPath() {
  const params = useParams()
  const encodedDomain = params?.domain as string
  const path = (params?.path as string[]) || []
  const hostname = encodedDomain?.replace(/__/g, '.')
  const subPath = '/' + path.join('/')
  const [redirecting, setRedirecting] = useState(false)

  const isHelpTicket = path[0] === 'help' && path[1] === 'ticket'
  const isHelpArticle = path[0] === 'help' && !!path[1] && path[1] !== 'ticket'
  const isHelpHome = path[0] === 'help' && !path[1]
  const renderInPlace = isHelpTicket || isHelpArticle || isHelpHome

  useEffect(() => {
    if (!hostname || renderInPlace) return
    setRedirecting(true)
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
  }, [hostname, subPath, renderInPlace])

  // Help pages render in place so the visitor never leaves the custom domain.
  if (isHelpTicket) return <HelpTicketPage />
  // The article page reads its id from the URL (help.acme.com/help/<id>).
  if (isHelpArticle) return <HelpArticlePage />
  // The help centre home on the custom domain.
  if (isHelpHome) return <CustomDomainPage />

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
