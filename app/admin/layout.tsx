'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCompanyByOwner } from '@/lib/board'
import { useRouter } from 'next/navigation'

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'

const NAV_GROUPS = [
  {
    label: null,
    items: [
      { label: 'Dashboard', href: '/admin', icon: '📊' },
    ]
  },
  {
    label: 'Feedback',
    items: [
      { label: 'Ideas', href: '/admin', icon: '💡' },
      { label: 'Roadmap', href: '/roadmap', icon: '🗺️' },
      { label: 'Announcements', href: '/admin/announcements', icon: '📢' },
      { label: 'Polls', href: '/admin/polls', icon: '📊' },
      { label: 'Surveys', href: '/admin/surveys', icon: '📋' },
    ]
  },
  {
    label: 'Manage',
    items: [
      { label: 'Statuses', href: '/admin/statuses', icon: '🔖' },
      { label: 'Topics', href: '/admin/topics', icon: '🏷️' },
      { label: 'Priorities', href: '/admin/priorities', icon: '⚡' },
      { label: 'Segments', href: '/admin/segments', icon: '👥' },
      { label: 'Analytics', href: '/admin/analytics', icon: '📈' },
    ]
  },
  {
    label: 'Support',
    items: [
      { label: 'Help Centre', href: '/admin/help', icon: '📚' },
      { label: 'Support', href: '/admin/support', icon: '💬' },
    ]
  },
  {
    label: 'Settings',
    items: [
      { label: 'Team', href: '/admin/team', icon: '👤' },
      { label: 'Integrations', href: '/admin/integrations', icon: '🔗' },
      { label: 'Settings', href: '/admin/settings', icon: '⚙️' },
      { label: 'Billing', href: '/admin/billing', icon: '💳' },
    ]
  },
]

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [company, setCompany] = useState<any>(null)
  const [user, setUser] = useState<any>(null)

  useEffect(() => {
    supabase.auth.getSession().then(async ({ data }: any) => {
      const u = data?.session?.user
      if (!u) { router.push('/signin'); return }
      setUser(u)

      // Load the user's company
      const co = await getCompanyByOwner(u.id)
      setCompany(co)

      // On a subdomain — verify user owns this company
      const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
      const parts = hostname.split('.')
      const isSubdomain = parts.length === 3 && hostname.endsWith('colvy.com')
      const isLocalOrVercel = hostname.includes('localhost') || hostname.includes('vercel.app')

      if (isSubdomain && !isLocalOrVercel) {
        const subdomain = parts[0]
        if (co && co.slug !== subdomain) {
          // Wrong subdomain for this user — go to their board
          window.location.href = `https://${co.slug}.colvy.com/admin`
          return
        }
        if (!co) {
          window.location.href = '/'
          return
        }
      }

      setAuthed(true)
    })
  }, [])

  if (authed === null) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
        <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--coral)', borderTopColor: 'transparent' }} />
      </div>
    )
  }

  const isSuperAdmin = user?.email === SUPER_ADMIN_EMAIL

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 lg:w-60 shrink-0 bg-white border-r sticky top-14 h-[calc(100vh-56px)] overflow-y-auto"
        style={{ borderColor: 'var(--border)' }}>

        {/* Company info */}
        {company && (
          <div className="p-4 border-b" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white text-sm font-bold shrink-0"
                style={{ background: company.accent_color || 'var(--coral)' }}>
                {company.name?.[0]?.toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-sm font-bold truncate" style={{ color: 'var(--ink)' }}>{company.name}</p>
                <p className="text-xs truncate" style={{ color: 'var(--slate)' }}>{company.slug}.colvy.com</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav */}
        <nav className="flex-1 py-3 px-2">
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} className="mb-4">
              {group.label && (
                <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>
                  {group.label}
                </p>
              )}
              {group.items.map(item => {
                const active = pathname === item.href
                return (
                  <Link key={item.href} href={item.href}
                    className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer transition-all mb-0.5"
                    style={{
                      background: active ? 'var(--peach)' : 'transparent',
                      color: active ? 'var(--coral)' : 'var(--slate)',
                      fontWeight: active ? 600 : 400,
                    }}>
                    <span className="text-base">{item.icon}</span>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}

          {/* Super admin only */}
          {isSuperAdmin && (
            <div className="mb-4">
              <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>
                Super Admin
              </p>
              <Link href="/admin/create-company"
                className="flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-gray-50"
                style={{ color: 'var(--slate)' }}>
                <span>🏢</span> Create Company
              </Link>
            </div>
          )}
        </nav>

        {/* Upgrade CTA */}
        <div className="p-3 border-t" style={{ borderColor: 'var(--border)' }}>
          <Link href="/admin/billing"
            className="block w-full rounded-xl p-3 text-center cursor-pointer hover:opacity-90 transition-all"
            style={{ background: 'var(--peach)' }}>
            <p className="text-xs font-bold" style={{ color: 'var(--coral)' }}>⭐ Upgrade to Pro</p>
            <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Unlock all features</p>
          </Link>
        </div>
      </aside>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  )
}
