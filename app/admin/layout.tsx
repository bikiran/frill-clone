'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCompanyByOwner } from '@/lib/board'
import { useRouter } from 'next/navigation'

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'

// SVG icon components
const icons: Record<string, JSX.Element> = {
  dashboard: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  ideas: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.76-1.58 5.16-3.9 6.37L15 17H9l-.1-1.63A7 7 0 0 1 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="9.5" y1="17" x2="14.5" y2="17"/></svg>,
  roadmap: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  announcements: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>,
  polls: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  surveys: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  statuses: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  topics: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  priorities: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  segments: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  analytics: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  help: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  support: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  team: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  integrations: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>,
  settings: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  billing: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  company: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  import_data: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  upgrade: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="17 11 12 6 7 11"/><line x1="12" y1="18" x2="12" y2="6"/></svg>,
}

const NAV_GROUPS = [
  {
    label: null,
    items: [{ label: 'Dashboard', href: '/admin', icon: 'dashboard' }],
  },
  {
    label: 'Feedback',
    items: [
      { label: 'Ideas', href: '/admin', icon: 'ideas' },
      { label: 'Roadmap', href: '/roadmap', icon: 'roadmap' },
      { label: 'Announcements', href: '/admin/announcements', icon: 'announcements' },
      { label: 'Polls', href: '/admin/polls', icon: 'polls' },
      { label: 'Surveys', href: '/admin/surveys', icon: 'surveys' },
    ],
  },
  {
    label: 'Manage',
    items: [
      { label: 'Statuses', href: '/admin/statuses', icon: 'statuses' },
      { label: 'Topics', href: '/admin/topics', icon: 'topics' },
      { label: 'Priorities', href: '/admin/priorities', icon: 'priorities' },
      { label: 'Segments', href: '/admin/segments', icon: 'segments' },
      { label: 'Analytics', href: '/admin/analytics', icon: 'analytics' },
    ],
  },
  {
    label: 'Support',
    items: [
      { label: 'Help Centre', href: '/admin/help', icon: 'help' },
      { label: 'Support', href: '/admin/support', icon: 'support' },
    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Team', href: '/admin/team', icon: 'team' },
      { label: 'Integrations', href: '/admin/integrations', icon: 'integrations' },
      { label: 'Import Data', href: '/admin/import', icon: 'import_data' },
      { label: 'Settings', href: '/admin/settings', icon: 'settings' },
      { label: 'Billing', href: '/admin/billing', icon: 'billing' },
    ],
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
      const co = await getCompanyByOwner(u.id)
      setCompany(co)
      const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
      const parts = hostname.split('.')
      const isSubdomain = parts.length === 3 && hostname.endsWith('colvy.com')
      const isLocalOrVercel = hostname.includes('localhost') || hostname.includes('vercel.app')
      if (isSubdomain && !isLocalOrVercel) {
        const subdomain = parts[0]
        if (co && co.slug !== subdomain) {
          // User owns a different company - redirect to their own admin
          window.location.href = `https://${co.slug}.colvy.com/admin`
          return
        }
        if (!co) {
          // Company not found by owner_id - try looking up by subdomain slug
          const { data: coBySlug } = await (supabase as any)
            .from('companies')
            .select('*')
            .eq('slug', subdomain)
            .maybeSingle()
          if (coBySlug && coBySlug.owner_id === u.id) {
            setCompany(coBySlug)
            setAuthed(true)
            return
          }
          // Still not found - let them in anyway if on their subdomain
          // They may have signed up but company creation failed
          setAuthed(true)
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

  const isActive = (href: string) => {
    if (href === '/admin') return pathname === '/admin'
    return pathname?.startsWith(href)
  }

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
      {/* Sidebar — fixed, always visible */}
      <aside style={{
        position: 'fixed',
        top: 56,
        left: 0,
        width: 220,
        height: 'calc(100vh - 56px)',
        background: '#fff',
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
      }}>
        {/* Company info */}
        {company && (
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {company.logo_url ? (
                <img src={company.logo_url} alt={company.name}
                  style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                  onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
              ) : null}
              <div style={{ width: 32, height: 32, borderRadius: 8, background: company.accent_color || 'var(--coral)', display: company.logo_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                {company.name?.[0]?.toUpperCase()}
              </div>
              <div style={{ minWidth: 0 }}>
                <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.name}</p>
                <p style={{ fontSize: 11, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.slug}.colvy.com</p>
              </div>
            </div>
          </div>
        )}

        {/* Nav groups */}
        <nav style={{ flex: 1, padding: '10px 8px' }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 20 }}>
              {group.label && (
                <p style={{ padding: '0 10px', marginBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--slate)' }}>
                  {group.label}
                </p>
              )}
              {group.items.map(item => {
                const active = isActive(item.href)
                return (
                  <Link key={item.href + item.label} href={item.href}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
                      borderRadius: 8, fontSize: 13, textDecoration: 'none', marginBottom: 1,
                      background: active ? 'var(--peach)' : 'transparent',
                      color: active ? 'var(--coral)' : 'var(--slate)',
                      fontWeight: active ? 600 : 400,
                      transition: 'all 0.15s',
                    }}>
                    <span style={{ flexShrink: 0, display: 'flex', opacity: active ? 1 : 0.65 }}>
                      {icons[item.icon]}
                    </span>
                    {item.label}
                  </Link>
                )
              })}
            </div>
          ))}

          {/* Super admin */}
          {isSuperAdmin && (
            <div style={{ marginBottom: 20 }}>
              <p style={{ padding: '0 10px', marginBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--slate)' }}>
                Super Admin
              </p>
              <Link href="/admin/create-company"
                style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 8, fontSize: 13, textDecoration: 'none', color: 'var(--slate)', background: 'transparent' }}>
                <span style={{ flexShrink: 0, display: 'flex', opacity: 0.65 }}>{icons.company}</span>
                Create Company
              </Link>
            </div>
          )}
        </nav>

        {/* Upgrade CTA */}
        <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
          <Link href="/admin/billing"
            style={{ display: 'block', padding: '10px 14px', borderRadius: 12, background: 'var(--peach)', textDecoration: 'none', textAlign: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              {icons.upgrade}
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--coral)' }}>Upgrade to Pro</p>
            </div>
            <p style={{ fontSize: 11, color: 'var(--slate)', marginTop: 2 }}>Unlock all features</p>
          </Link>
        </div>
      </aside>

      {/* Main content — offset by sidebar width */}
      <div style={{ marginLeft: 220, flex: 1, overflowY: 'auto', minHeight: 'calc(100vh - 56px)' }}>
        {children}
      </div>
    </div>
  )
}
