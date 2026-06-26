'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TerminologyProvider } from '@/lib/terminologyContext'
import LiveChat from '@/components/LiveChat'
import UpdateNotification from '@/components/UpdateNotification'
import './globals.css'

const NAV_ITEMS = [
  { href: '/', label: 'Ideas', icon: 'ideas' },
  { href: '/roadmap', label: 'Roadmap', icon: 'roadmap' },
  { href: '/announcements', label: 'Updates', icon: 'updates' },
  { href: '/help', label: 'Help', icon: 'help' },
  { href: '/features', label: 'Features', icon: 'features' },
  { href: '/pricing', label: 'Pricing', icon: 'pricing' },
]

const NavIcon = ({ type, size = 18 }: { type: string; size?: number }) => {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'ideas': return <svg {...p}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" /></svg>
    case 'roadmap': return <svg {...p}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>
    case 'updates': return <svg {...p}><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
    case 'help': return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    case 'features': return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
    case 'pricing': return <svg {...p}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
    case 'admin': return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
    default: return null
  }
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const [showDrawer, setShowDrawer] = useState(false)
  const [showUserMenu, setShowUserMenu] = useState(false)
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [isCompanyOwner, setIsCompanyOwner] = useState(false)
  const [company, setCompany] = useState<any>(null)
  const [navVisibility, setNavVisibility] = useState({
    Ideas: true, Roadmap: true, Updates: true, Help: true,
  })

  // Load nav visibility from settings (DB-first, localStorage fallback)
  useEffect(() => {
    const applySettings = (s: any) => {
      if (s) {
        setNavVisibility({
          Ideas: s.navIdeas !== false,
          Roadmap: s.navRoadmap !== false,
          Updates: s.navAnnouncements !== false,
          Help: s.navHelp !== false,
        })
        if (typeof document !== 'undefined') {
          // Accent color
          if (s.accentColor) {
            document.documentElement.style.setProperty('--coral', s.accentColor)
            const r = parseInt(s.accentColor.slice(1, 3), 16)
            const g = parseInt(s.accentColor.slice(3, 5), 16)
            const b = parseInt(s.accentColor.slice(5, 7), 16)
            document.documentElement.style.setProperty('--peach', `rgba(${r}, ${g}, ${b}, 0.1)`)
          }
          // Theme mode — use data-theme attribute, respect auto/system
          const mode = s.themeMode || 'light'
          if (mode === 'dark') {
            document.documentElement.setAttribute('data-theme', 'dark')
          } else if (mode === 'auto') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
            document.documentElement.setAttribute('data-theme', prefersDark ? 'dark' : 'light')
          } else {
            document.documentElement.removeAttribute('data-theme')
          }
        }
      }
    }

    const loadNav = async () => {
      try {
        const { data } = await supabase.from('site_settings').select('*').eq('key', 'general').single()
        if (data?.value) {
          applySettings(data.value)
          if (typeof window !== 'undefined') {
            localStorage.setItem('site_settings', JSON.stringify(data.value))
          }
          return
        }
      } catch {}
      if (typeof window !== 'undefined') {
        try {
          const s = JSON.parse(localStorage.getItem('site_settings') || '{}')
          applySettings(s)
        } catch {}
      }
    }
    loadNav()
  }, [pathname])

  // Auth — real-time, no hard refresh needed
  useEffect(() => {
    // Initial session
    const checkOwner = async (u: any) => {
      if (!u) { setIsCompanyOwner(false); return }
      const SUPER_ADMIN = 'bishalstha76@gmail.com'
      setIsAdmin(u.email === SUPER_ADMIN)
      try {
        const { data } = await (supabase as any).from('companies').select('*').eq('owner_id', u.id).single()
        setIsCompanyOwner(!!data || u.email === SUPER_ADMIN)
        if (data) setCompany(data)
      } catch {
        setIsCompanyOwner(u.email === SUPER_ADMIN)
      }
    }

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null
      setUser(u)
      checkOwner(u)
    })
    // Subscribe to all auth changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const u = session?.user ?? null
      setUser(u)
      checkOwner(u)
    })
    return () => subscription.unsubscribe()
  }, [])

  const handleLogout = async () => {
    setShowUserMenu(false)
    setShowDrawer(false)
    await supabase.auth.signOut()
    // Force to home — clears any stale component state
    window.location.href = '/'
  }

  const userInitial = user?.email?.[0].toUpperCase() || 'A'

  // Pages that use their own full-page layout (no nav wrapper)
  const isFullPage = ['/landing', '/pricing'].some(p => pathname?.startsWith(p)) ||
    pathname?.startsWith('/features/')

  if (isFullPage) {
    return (
      <html lang="en">
        <head>
          <title>Colvy — Customer Feedback Made Beautiful</title>
          <meta name="description" content="Colvy helps you capture, organize and announce product feedback in one place." />
          <link rel="icon" href="/favicon.png" />
        </head>
        <body>
          {children}
          <UpdateNotification />
        </body>
      </html>
    )
  }

  return (
    <html lang="en">
      <head>
        <title>Colvy — Customer Feedback Made Beautiful</title>
        <meta name="description" content="Colvy helps you capture, organize and announce product feedback in one place." />
        <link rel="icon" href="/favicon.png" />
        <link rel="apple-touch-icon" href="/logo.png" />
      </head>
      <body style={{ background: 'var(--canvas)' }}>
        {/* Header */}
        <header className="sticky top-0 z-40 backdrop-blur-md border-b bg-white/80" style={{ borderColor: 'var(--border)' }}>
          <nav className="h-14 px-6 flex items-center justify-between">
            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 font-bold text-lg transition-smooth hover:opacity-70">
              <img src="/logo.png" alt="Colvy" className="h-7 w-auto" onError={(e: any) => { e.target.style.display='none' }} />
              <span style={{ color: 'var(--coral)' }}>Colvy</span>
            </Link>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {NAV_ITEMS.filter(item => navVisibility[item.label as keyof typeof navVisibility] !== false).map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-smooth group relative"
                  style={{
                    color: pathname === item.href ? 'var(--coral)' : 'var(--slate)',
                  }}>
                  <span className="flex items-center gap-2">
                    <span className="group-hover:scale-110 transition-transform"><NavIcon type={item.icon} size={18} /></span>
                    {item.label}
                  </span>
                  {pathname === item.href && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 rounded-t-lg" style={{ background: 'var(--coral)' }} />
                  )}
                </Link>
              ))}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  <div className="relative">
                    <button
                      onClick={() => setShowUserMenu(!showUserMenu)}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white transition-smooth hover:shadow-md cursor-pointer"
                      style={{ background: 'var(--coral)' }}>
                      {userInitial}
                    </button>
                    
                    {showUserMenu && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
                                                <div className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border z-40 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                          <div className="p-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                            <p className="text-sm font-semibold truncate" style={{ color: 'var(--ink)' }}>{user?.user_metadata?.display_name || user.email}</p>
                            <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--slate)' }}>{user.email}</p>
                          </div>
                          <div className="py-1.5">
                            <Link href="/profile" onClick={() => setShowUserMenu(false)}
                              className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 cursor-pointer" style={{ color: 'var(--ink)' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                              My Profile
                            </Link>
                            {isCompanyOwner && <>
                              <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />
                              <p className="px-4 pt-1 pb-0.5 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Board Owner</p>
                              <Link href="/admin" onClick={() => setShowUserMenu(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 cursor-pointer font-semibold" style={{ color: 'var(--coral)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                                Admin Dashboard
                              </Link>
                              <Link href="/admin/settings" onClick={() => setShowUserMenu(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 cursor-pointer" style={{ color: 'var(--ink)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
                                Settings
                              </Link>
                              <Link href="/admin/billing" onClick={() => setShowUserMenu(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 cursor-pointer" style={{ color: 'var(--ink)' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
                                Billing
                              </Link>
                            </>}
                            <div className="border-t my-1" style={{ borderColor: 'var(--border)' }} />
                            <button onClick={handleLogout}
                              className="w-full flex items-center gap-2.5 text-left px-4 py-2.5 text-sm hover:bg-gray-50 cursor-pointer" style={{ color: '#ef4444' }}>
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                              Sign out
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                  {isCompanyOwner && (
                    <Link
                      href="/admin"
                      className="hidden md:flex px-4 py-2 rounded-lg text-sm font-medium transition-smooth"
                      style={{
                        color: pathname?.startsWith('/admin') ? 'var(--coral)' : 'var(--slate)',
                      }}>
                      <NavIcon type="admin" size={16} /> Admin
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <Link
                    href="/signin"
                    onClick={() => setShowDrawer(false)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-smooth hover:opacity-70"
                    style={{ color: 'var(--slate)' }}>
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setShowDrawer(false)}
                    className="px-5 py-2.5 rounded-lg text-sm font-semibold text-white transition-smooth press-effect cursor-pointer"
                    style={{ background: 'var(--coral)' }}>
                    Get started
                  </Link>
                </>
              )}

              {/* Mobile menu */}
              <button
                className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-smooth cursor-pointer"
                onClick={() => setShowDrawer(!showDrawer)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <line x1="3" y1="6" x2="21" y2="6" />
                  <line x1="3" y1="12" x2="21" y2="12" />
                  <line x1="3" y1="18" x2="21" y2="18" />
                </svg>
              </button>
            </div>
          </nav>
        </header>

        {/* Mobile Drawer */}
        {showDrawer && (
          <>
            <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setShowDrawer(false)} />
            <div className="fixed right-0 top-14 bottom-0 z-40 w-64 bg-white border-l drawer-open" style={{ borderColor: 'var(--border)' }}>
              <div className="p-4 space-y-2">
                {NAV_ITEMS.filter(item => navVisibility[item.label as keyof typeof navVisibility] !== false).map(item => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setShowDrawer(false)}
                    className="block px-4 py-3 rounded-lg font-medium transition-smooth cursor-pointer"
                    style={{
                      background: pathname === item.href ? 'var(--peach)' : 'transparent',
                      color: pathname === item.href ? 'var(--coral)' : 'var(--ink)',
                    }}>
                    <span className="flex items-center gap-2">
                      <NavIcon type={item.icon} size={18} />
                      {item.label}
                    </span>
                  </Link>
                ))}
                {isAdmin && (
                  <Link
                    href="/admin"
                    onClick={() => setShowDrawer(false)}
                    className="block px-4 py-3 rounded-lg font-medium transition-smooth cursor-pointer"
                    style={{
                      background: pathname?.startsWith('/admin') ? 'var(--peach)' : 'transparent',
                      color: pathname?.startsWith('/admin') ? 'var(--coral)' : 'var(--ink)',
                    }}>
                    <span className="flex items-center gap-2">
                      <NavIcon type="admin" size={18} />
                      Admin
                    </span>
                  </Link>
                )}
                {/* Auth buttons in drawer */}
                {!user && (
                  <div className="pt-4 border-t space-y-2" style={{ borderColor: 'var(--border)' }}>
                    <Link href="/signin" onClick={() => setShowDrawer(false)}
                      className="block px-4 py-3 rounded-lg text-sm font-medium text-center border cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      Sign in
                    </Link>
                    <Link href="/signup" onClick={() => setShowDrawer(false)}
                      className="block px-4 py-3 rounded-lg text-sm font-semibold text-white text-center cursor-pointer"
                      style={{ background: 'var(--coral)' }}>
                      Get started
                    </Link>
                  </div>
                )}
                {user && (
                  <div className="pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                    <button onClick={handleLogout}
                      className="w-full px-4 py-3 rounded-lg text-sm font-medium text-left cursor-pointer hover:bg-gray-50"
                      style={{ color: 'var(--ink)' }}>
                      Sign out
                    </button>
                  </div>
                )}
              </div>
            </div>
          </>
        )}

        <main className="w-full px-0 py-0">
          <TerminologyProvider>
            {children}
          </TerminologyProvider>
        </main>
        <LiveChat />
        <UpdateNotification />
      </body>
    </html>
  )
}
