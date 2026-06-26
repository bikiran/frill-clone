'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function CustomDomainPage() {
  const params = useParams()
  const encodedDomain = params?.domain as string
  const hostname = encodedDomain?.replace(/__/g, '.')
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [isHelpDomain, setIsHelpDomain] = useState(false)

  useEffect(() => {
    if (!hostname) return
    const resolve = async () => {
      try {
        // 1. Try exact board_domain match
        const { data: byBoard } = await (supabase as any)
          .from('companies').select('*').eq('board_domain', hostname).maybeSingle()
        if (byBoard) { setCompany(byBoard); setIsHelpDomain(false); setLoading(false); return }

        // 2. Try exact help_domain match
        const { data: byHelp } = await (supabase as any)
          .from('companies').select('*').eq('help_domain', hostname).maybeSingle()
        if (byHelp) { setCompany(byHelp); setIsHelpDomain(true); setLoading(false); return }

        // 3. Fallback — match by slug from domain (help.prexty.com → slug 'prexty')
        const parts = hostname.split('.')
        if (parts.length >= 2) {
          const possibleSlug = parts[parts.length - 2]
          const { data: bySlug } = await (supabase as any)
            .from('companies').select('*').eq('slug', possibleSlug).maybeSingle()
          if (bySlug) {
            setCompany(bySlug)
            setIsHelpDomain(hostname.startsWith('help.'))
            setLoading(false); return
          }
        }
      } catch {}
      setLoading(false)
    }
    resolve()
  }, [hostname])

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#fafafa' }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin"
        style={{ borderColor: '#ff7a6b', borderTopColor: 'transparent' }} />
    </div>
  )

  if (!company) return (
    <div className="min-h-screen flex flex-col items-center justify-center text-center px-6">
      <div className="text-5xl mb-4">🔍</div>
      <h1 className="text-xl font-bold mb-2" style={{ color: '#1a1a1a' }}>Domain not configured</h1>
      <p className="text-sm mb-1" style={{ color: '#6b7280' }}>No board found for <strong>{hostname}</strong></p>
      <p className="text-xs mt-2" style={{ color: '#9ca3af' }}>
        Go to Admin → Settings → White Labeling → enter this domain → click Save Settings.
      </p>
    </div>
  )

  const accentColor = company.accent_color || '#ff7a6b'

  return (
    <div className="min-h-screen" style={{ background: '#fafafa' }}>
      <header className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: '#f0f0f0' }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {company.logo_url
              ? <img src={company.logo_url} alt={company.name} className="h-7 w-auto" />
              : <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: accentColor }}>{company.name?.[0]?.toUpperCase()}</div>
            }
            <span className="font-bold text-base" style={{ color: '#1a1a1a' }}>{company.name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: 'Ideas', href: `https://${company.slug}.colvy.com` },
              { label: 'Roadmap', href: `https://${company.slug}.colvy.com/roadmap` },
              { label: 'Updates', href: `https://${company.slug}.colvy.com/announcements` },
              { label: 'Help', href: `https://${company.slug}.colvy.com/help`, active: isHelpDomain },
            ].map(n => (
              <a key={n.label} href={n.href}
                className="px-3 py-1.5 rounded-lg text-sm transition-all"
                style={{ color: n.active ? accentColor : '#6b7280', background: n.active ? accentColor + '15' : 'transparent', fontWeight: n.active ? 600 : 400 }}>
                {n.label}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-16 text-center">
        <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-white text-2xl font-bold mx-auto mb-5 overflow-hidden"
          style={{ background: accentColor }}>
          {company.logo_url
            ? <img src={company.logo_url} alt={company.name} className="w-full h-full object-cover" />
            : company.name?.[0]?.toUpperCase()}
        </div>
        <h1 className="text-3xl font-black mb-3" style={{ color: '#1a1a1a' }}>
          {isHelpDomain ? `${company.name} Help Centre` : `${company.name} Feedback`}
        </h1>
        <p className="text-base mb-8" style={{ color: '#6b7280' }}>
          {isHelpDomain
            ? `Find answers, guides, and support for ${company.name}.`
            : `Share ideas and vote on what ${company.name} should build next.`}
        </p>
        <a href={`https://${company.slug}.colvy.com${isHelpDomain ? '/help' : ''}`}
          className="inline-block px-8 py-3.5 rounded-xl font-semibold text-white text-lg hover:opacity-90 transition-all"
          style={{ background: accentColor }}>
          {isHelpDomain ? 'Browse Help Articles →' : 'View Feedback Board →'}
        </a>
        <p className="text-xs mt-6" style={{ color: '#d1d5db' }}>
          Powered by <a href="https://colvy.com" style={{ color: '#d1d5db' }}>Colvy</a>
        </p>
      </div>
    </div>
  )
}
