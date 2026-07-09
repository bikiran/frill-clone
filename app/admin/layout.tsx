'use client'

import React from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { getCompanyByOwner } from '@/lib/board'
import { useRouter } from 'next/navigation'

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'

// SVG icon components
const icons: Record<string, React.JSX.Element> = {
  dashboard: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>,
  ideas: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.76-1.58 5.16-3.9 6.37L15 17H9l-.1-1.63A7 7 0 0 1 5 9a7 7 0 0 1 7-7z"/><line x1="9" y1="21" x2="15" y2="21"/><line x1="9.5" y1="17" x2="14.5" y2="17"/></svg>,
  roadmap: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>,
  announcements: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></svg>,
  polls: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>,
  forms: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/><line x1="7" y1="16" x2="11" y2="16"/></svg>,
  surveys: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>,
  statuses: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>,
  topics: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/><line x1="7" y1="7" x2="7.01" y2="7"/></svg>,
  priorities: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
  segments: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  analytics: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/><line x1="2" y1="20" x2="22" y2="20"/></svg>,
  help: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>,
  support: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>,
  team: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  users: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>,
  integrations: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M13 6h3a2 2 0 0 1 2 2v7"/><line x1="6" y1="9" x2="6" y2="21"/></svg>,
  settings: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>,
  billing: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>,
  company: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>,
  import_data: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  widget: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="14" rx="2" ry="2"/><path d="M16 3H8a2 2 0 0 0-2 2v2h12V5a2 2 0 0 0-2-2z"/></svg>,
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
      { label: 'Forms', href: '/admin/forms', icon: 'forms' },
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
    label: 'Inbox & CRM',
    items: [
      { label: 'Inbox', href: '/admin/inbox', icon: 'support' },
      { label: 'Contacts', href: '/admin/contacts', icon: 'users' },
      { label: 'Reviews', href: '/admin/reviews', icon: 'analytics' },
      { label: 'Scheduled', href: '/admin/scheduled', icon: 'roadmap' },
    ],
  },
  {
    label: 'Support',
    items: [
      { label: 'Help Centre', href: '/admin/help', icon: 'help' },
      { label: 'Help Reporting', href: '/admin/help/analytics', icon: 'analytics' },
      { label: 'Help Settings', href: '/admin/help/settings', icon: 'settings' },

    ],
  },
  {
    label: 'Settings',
    items: [
      { label: 'Team', href: '/admin/team', icon: 'team' },
      { label: 'Users', href: '/admin/users', icon: 'users' },
      { label: 'Locations', href: '/admin/locations', icon: 'settings' },
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
  const [adminCollapsed, setAdminCollapsed] = useState(false)
  const [company, setCompany] = useState<any>(null)
  const [showWorkspaces, setShowWorkspaces] = useState(false)
  const [workspaces, setWorkspaces] = useState<any[]>([])

  // All companies this user can administer (owned + elevated team memberships)
  const loadWorkspaces = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) return
      const list: any[] = []
      const { data: owned } = await (supabase as any).from('companies')
        .select('id, name, slug, logo_url, accent_color').eq('owner_id', session.user.id)
      ;(owned || []).forEach((c: any) => list.push(c))
      const { data: memberships } = await (supabase as any).from('team_members')
        .select('company_id, role').eq('user_id', session.user.id)
      const elevated = (memberships || []).filter((m: any) => ['owner', 'admin', 'editor'].includes((m.role || '').toLowerCase()))
      for (const m of elevated) {
        if (list.find(c => c.id === m.company_id)) continue
        const { data: co } = await (supabase as any).from('companies')
          .select('id, name, slug, logo_url, accent_color').eq('id', m.company_id).maybeSingle()
        if (co) list.push(co)
      }
      setWorkspaces(list)
    } catch {}
  }
  const [user, setUser] = useState<any>(null)
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  useEffect(() => {
    const initAuth = async () => {
      // When redirected from colvy.com sign-in, the session tokens may be in
      // the URL hash fragment (#access_token=...&refresh_token=...).
      // Supabase's detectSessionInUrl will exchange them automatically,
      // but we need to wait for onAuthStateChange to fire first.
      if (typeof window !== 'undefined' && window.location.hash.includes('access_token')) {
        // Let Supabase process the hash
        await new Promise<void>(resolve => {
          const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || session) {
              subscription.unsubscribe()
              // Clean the hash from URL without reloading
              window.history.replaceState(null, '', window.location.pathname)
              resolve()
            }
          })
          // Timeout fallback in case the event doesn't fire
          setTimeout(resolve, 2000)
        })
      }

      supabase.auth.getSession().then(async ({ data }: any) => {
      const u = data?.session?.user
      if (!u) { router.push('/signin'); return }
      setUser(u)

      // Get hostname for subdomain detection
      const hostname = typeof window !== 'undefined' ? window.location.hostname : ''
      const parts = hostname.split('.')
      const isSubdomain = parts.length === 3 && hostname.endsWith('colvy.com')
      const isLocalOrVercel = hostname.includes('localhost') || hostname.includes('vercel.app')
      const subdomain = isSubdomain ? parts[0] : null

      // Super admin can access anything
      const SUPER_ADMIN = 'bishalstha76@gmail.com'
      if (u.email === SUPER_ADMIN) {
        // Load the company for display (could be any company if on a subdomain)
        if (subdomain) {
          const { data: co } = await (supabase as any).from('companies').select('*').eq('slug', subdomain).maybeSingle()
          setCompany(co)
        } else {
          const co = await getCompanyByOwner(u.id)
          setCompany(co)
        }
        setAuthed(true)
        return
      }

      // Regular user: check subdomain access
      if (isSubdomain && !isLocalOrVercel) {
        // On a company subdomain — load that company and verify ownership
        const { data: subdomainCo } = await (supabase as any)
          .from('companies').select('*').eq('slug', subdomain).maybeSingle()

        if (!subdomainCo) {
          // Subdomain doesn't exist — deny access
          router.push('/')
          return
        }

        if (subdomainCo.owner_id === u.id) {
          setCompany(subdomainCo)
          setAuthed(true)
          return
        }

        // Elevated team members (owner/admin/editor) may also access the admin panel.
        // Viewers (regular users who signed up on this board) may NOT.
        // Array query with .length check — never .single() (may return no rows).
        const { data: members } = await (supabase as any)
          .from('team_members').select('role')
          .eq('company_id', subdomainCo.id).eq('user_id', u.id).limit(1)
        const role = members && members.length > 0 ? (members[0].role || '').toLowerCase() : null
        if (role && ['owner', 'admin', 'editor'].includes(role)) {
          setCompany(subdomainCo)
          setAuthed(true)
          return
        }

        // Regular user (viewer or not a member) on someone else's board.
        // If they own their OWN company, send them to their own admin; otherwise back to the board.
        const userCo = await getCompanyByOwner(u.id)
        if (userCo?.slug) {
          window.location.href = `https://${userCo.slug}.colvy.com/admin`
        } else {
          // User owns no company — deny access, back to the public board
          router.push('/')
        }
        return
      }

      // On localhost/vercel.app/colvy.com — user must own a company (or be an elevated team member somewhere)
      const userCo = await getCompanyByOwner(u.id)
      if (userCo) {
        setCompany(userCo)
        setAuthed(true)
        return
      }
      // No owned company — allow only elevated team members; plain viewers are denied
      const { data: anyMemberships } = await (supabase as any)
        .from('team_members').select('role, company_id')
        .eq('user_id', u.id).limit(5)
      const elevated = (anyMemberships || []).find((m: any) => ['owner', 'admin', 'editor'].includes((m.role || '').toLowerCase()))
      if (elevated) {
        const { data: memberCo } = await (supabase as any).from('companies').select('*').eq('id', elevated.company_id).maybeSingle()
        setCompany(memberCo || null)
        setAuthed(true)
        return
      }
      // Not an admin of anything — deny
      router.push('/')
    })
    } // end initAuth
    initAuth()
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
    if (!pathname?.startsWith(href)) return false
    // Only the LONGEST matching nav item is active — prevents /admin/help
    // lighting up when /admin/help/analytics is the current page.
    const allHrefs = NAV_GROUPS.flatMap(g => g.items.map(i => i.href))
    const longestMatch = allHrefs
      .filter(h => h !== '/admin' && pathname?.startsWith(h))
      .sort((a, b) => b.length - a.length)[0]
    return href === longestMatch
  }

  return (
    <div style={{ display: 'flex', minHeight: 'calc(100vh - 56px)' }}>
      <style>{`
        @media (max-width: 860px) {
          .admin-sidebar { transform: translateX(-100%); transition: transform 0.25s ease; box-shadow: 0 0 0 transparent; }
          .admin-sidebar.open { transform: translateX(0); box-shadow: 8px 0 32px rgba(0,0,0,0.18); }
          .admin-main { margin-left: 0 !important; }
          .admin-mobile-trigger { display: flex !important; }
          .admin-mobile-overlay.open { display: block !important; }
        }
      `}</style>

      {/* Mobile hamburger trigger */}
      <button
        onClick={() => setMobileSidebarOpen(true)}
        className="admin-mobile-trigger"
        style={{
          display: 'none', position: 'fixed', top: 68, left: 14, zIndex: 35,
          width: 38, height: 38, borderRadius: 10, background: '#fff',
          border: '1px solid var(--border)', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
        }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>

      {/* Mobile overlay */}
      <div
        className={`admin-mobile-overlay ${mobileSidebarOpen ? 'open' : ''}`}
        onClick={() => setMobileSidebarOpen(false)}
        style={{ display: mobileSidebarOpen ? 'block' : 'none', position: 'fixed', inset: 0, top: 56, background: 'rgba(0,0,0,0.3)', zIndex: 29 }}
      />

      {/* Sidebar — fixed, responsive drawer on mobile */}
      <aside className={`admin-sidebar ${mobileSidebarOpen ? 'open' : ''}`} style={{
        position: 'fixed',
        top: 56,
        left: 0,
        width: adminCollapsed ? 60 : 220,
        height: 'calc(100vh - 56px)',
        background: '#fff',
        borderRight: '1px solid var(--border)',
        overflowY: 'auto',
        overflowX: 'hidden',
        zIndex: 30,
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        transition: 'width 0.2s ease',
      }}>
        {/* Collapse toggle — arrow with a T */}
        <button type="button" onClick={() => setAdminCollapsed(v => !v)} title={adminCollapsed ? 'Expand' : 'Collapse'}
          className="admin-collapse-btn"
          style={{ position: 'absolute', top: 12, right: 8, width: 26, height: 26, borderRadius: 7, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', zIndex: 5, padding: 0 }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            {/* Arrow */}
            <polyline points={adminCollapsed ? '9 6 15 12 9 18' : '15 6 9 12 15 18'} />
            {/* The 'T' bar */}
            <line x1={adminCollapsed ? '19' : '5'} y1="5" x2={adminCollapsed ? '19' : '5'} y2="19" />
          </svg>
        </button>
        {/* Company info — workspace switcher */}
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', position: 'relative' }}>
          <button type="button" onClick={() => { setShowWorkspaces(v => !v); if (!workspaces.length) loadWorkspaces() }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
            {company?.logo_url ? (
              <img src={company.logo_url} alt={company.name}
                style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover', flexShrink: 0 }}
                onError={(e: any) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex' }} />
            ) : null}
            <div style={{ width: 32, height: 32, borderRadius: 8, background: company?.accent_color || 'var(--coral)', display: company?.logo_url ? 'none' : 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
              {(company?.name?.[0] || user?.email?.[0] || '?').toUpperCase()}
            </div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {company?.name || user?.email?.split('@')[0] || 'My Board'}
              </p>
              <p style={{ fontSize: 11, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {company ? `${company.slug}.colvy.com` : typeof window !== 'undefined' ? window.location.hostname : 'colvy.com'}
              </p>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0, transform: showWorkspaces ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s' }}><polyline points="6 9 12 15 18 9" /></svg>
          </button>

          {/* Workspace switcher dropdown */}
          {showWorkspaces && (
            <div style={{ position: 'absolute', top: '92%', left: 12, right: 12, background: '#fff', borderRadius: 14, border: '1px solid var(--border)', boxShadow: '0 16px 48px rgba(0,0,0,0.14)', zIndex: 90, overflow: 'hidden' }}>
              <p style={{ margin: 0, padding: '12px 16px 6px', fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>Workspaces</p>
              {workspaces.map(w => (
                <button key={w.id} type="button"
                  onClick={() => {
                    setShowWorkspaces(false)
                    if (w.slug && company?.slug !== w.slug) window.location.href = `https://${w.slug}.colvy.com/admin`
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 16px', border: 'none', background: 'none', cursor: 'pointer' }}>
                  {w.logo_url ? (
                    <img src={w.logo_url} alt={w.name} style={{ width: 24, height: 24, borderRadius: 6, objectFit: 'cover' }} />
                  ) : (
                    <span style={{ width: 24, height: 24, borderRadius: 6, background: w.accent_color || 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 11, fontWeight: 700 }}>{(w.name?.[0] || '?').toUpperCase()}</span>
                  )}
                  <span style={{ flex: 1, fontSize: 13.5, fontWeight: 600, color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                  {company?.id === w.id && <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12" /></svg>}
                </button>
              ))}
              <div style={{ borderTop: '1px solid var(--border)', marginTop: 4 }}>
                <a href="/admin/new-workspace"
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 16px', textDecoration: 'none' }}>
                  <span style={{ width: 24, height: 24, borderRadius: 6, background: 'var(--canvas)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--slate)', fontSize: 15, fontWeight: 600 }}>+</span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Create Workspace</span>
                </a>
              </div>
            </div>
          )}
        </div>

        {/* Nav groups */}
        <nav style={{ flex: 1, padding: '10px 8px' }}>
          {NAV_GROUPS.map((group, gi) => (
            <div key={gi} style={{ marginBottom: 20 }}>
              {group.label && !adminCollapsed && (
                <p style={{ padding: '0 10px', marginBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--slate)' }}>
                  {group.label}
                </p>
              )}
              {group.items.map(item => {
                const active = isActive(item.href)
                return (
                  <Link key={item.href + item.label} href={item.href}
                    onClick={() => setMobileSidebarOpen(false)}
                    title={adminCollapsed ? item.label : undefined}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px',
                      borderRadius: 8, fontSize: 13, textDecoration: 'none', marginBottom: 1,
                      background: active ? 'var(--peach)' : 'transparent',
                      color: active ? 'var(--coral)' : 'var(--slate)',
                      fontWeight: active ? 600 : 400,
                      transition: 'all 0.15s',
                      justifyContent: adminCollapsed ? 'center' : 'flex-start',
                    }}>
                    <span style={{ flexShrink: 0, display: 'flex', opacity: active ? 1 : 0.65 }}>
                      {icons[item.icon]}
                    </span>
                    {!adminCollapsed && item.label}
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
              <Link href="/admin/new-workspace"
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

      {/* Main content — offset by sidebar width on desktop, full width on mobile */}
      <div className="admin-main" style={{ marginLeft: adminCollapsed ? 60 : 220, flex: 1, overflowY: 'auto', minHeight: 'calc(100vh - 56px)', transition: 'margin-left 0.2s ease' }}>
        {children}
      </div>
    </div>
  )
}
