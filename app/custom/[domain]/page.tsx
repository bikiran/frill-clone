'use client'

import { useEffect, useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CustomDomainPage() {
  const params = useParams()
  const pathname = usePathname()
  const encodedDomain = params?.domain as string
  const hostname = encodedDomain?.replace(/__/g, '.')
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isHelpDomain, setIsHelpDomain] = useState(false)

  useEffect(() => {
    if (!hostname) return
    const resolve = async () => {
      try {
        // Try board_domain first
        const { data: byBoard } = await (supabase as any)
          .from('companies')
          .select('*')
          .eq('board_domain', hostname)
          .maybeSingle()

        if (byBoard) {
          setCompany(byBoard)
          setIsHelpDomain(false)
          setLoading(false)
          return
        }

        // Try help_domain
        const { data: byHelp } = await (supabase as any)
          .from('companies')
          .select('*')
          .eq('help_domain', hostname)
          .maybeSingle()

        if (byHelp) {
          setCompany(byHelp)
          setIsHelpDomain(true)
          setLoading(false)
          return
        }

        setLoading(false)
      } catch {
        setLoading(false)
      }
    }
    resolve()
  }, [hostname])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
    </div>
  )

  if (!company) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <div className="text-5xl mb-4">🔍</div>
      <h1 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Domain not configured</h1>
      <p className="text-sm" style={{ color: 'var(--slate)' }}>
        No board found for <strong>{hostname}</strong>
      </p>
      <p className="text-xs mt-3" style={{ color: 'var(--slate)' }}>
        Go to Admin → Settings → White Labeling to configure your custom domain.
      </p>
    </div>
  )

  // Render the actual board content inline with company branding
  const accentColor = company.accent_color || '#ff7a6b'

  return (
    <div className="min-h-screen" style={{ background: '#fafafa' }}>
      {/* Company-branded header — NOT Colvy branding */}
      <header className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: '#f0f0f0' }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {company.logo_url ? (
              <img src={company.logo_url} alt={company.name} className="h-7 w-auto" />
            ) : (
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold"
                style={{ background: accentColor }}>
                {company.name?.[0]?.toUpperCase()}
              </div>
            )}
            <span className="font-bold" style={{ color: '#1a1a1a' }}>{company.name}</span>
          </div>
          <nav className="flex items-center gap-1">
            {!isHelpDomain && (
              <a href="/" className="px-3 py-1.5 rounded-lg text-sm font-medium"
                style={{ color: accentColor, background: accentColor + '15' }}>
                Ideas
              </a>
            )}
            <a href={isHelpDomain ? '/' : '/help'} className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100">
              {isHelpDomain ? 'Ideas' : 'Help'}
            </a>
            <a href="/roadmap" className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100">Roadmap</a>
            <a href="/announcements" className="px-3 py-1.5 rounded-lg text-sm text-gray-500 hover:bg-gray-100">Updates</a>
          </nav>
        </div>
      </header>

      {/* Redirect to the Colvy subdomain to serve full content */}
      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white text-xl font-bold mx-auto mb-4"
          style={{ background: accentColor }}>
          {company.name?.[0]?.toUpperCase()}
        </div>
        <h1 className="text-2xl font-bold mb-2" style={{ color: '#1a1a1a' }}>
          {isHelpDomain ? `${company.name} Help Centre` : `${company.name} Feedback`}
        </h1>
        <p className="text-sm mb-6" style={{ color: '#6b7280' }}>
          {isHelpDomain
            ? 'Find answers, guides, and support for ' + company.name
            : 'Share ideas and feedback for ' + company.name}
        </p>
        <a href={`https://${company.slug}.colvy.com${isHelpDomain ? '/help' : ''}`}
          className="inline-block px-8 py-3 rounded-xl font-semibold text-white cursor-pointer"
          style={{ background: accentColor }}>
          {isHelpDomain ? 'Browse Help Articles →' : 'View Feedback Board →'}
        </a>
        <p className="text-xs mt-4" style={{ color: '#9ca3af' }}>
          You'll be redirected to {company.slug}.colvy.com
        </p>
      </div>
    </div>
  )
}
