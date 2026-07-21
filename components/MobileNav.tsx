'use client'

import { useState, useEffect } from 'react'
import { usePathname, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

/**
 * App-style bottom navigation for phones.
 *
 * The desktop sidebar carries ~25 destinations, which is unusable on a phone.
 * This surfaces the four screens used constantly and files the rest behind
 * More — the pattern every native app of this size settles on.
 *
 * Hidden at 861px and up, matching the breakpoint where the admin layout
 * switches its sidebar back on — so the two never appear together.
 */

const I = {
  inbox: <><path d="M22 12h-6l-2 3h-4l-2-3H2"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/></>,
  contacts: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></>,
  tasks: <><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></>,
  calendar: <><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></>,
  more: <><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></>,
  gallery: <><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></>,
  campaigns: <><path d="M3 11l18-5v12L3 14v-3z"/><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6"/></>,
  reviews: <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>,
  calls: <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>,
  links: <><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></>,
  help: <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>,
  analytics: <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></>,
  team: <><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></>,
  account: <><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></>,
  logout: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></>,
}

const svg = (path: React.ReactNode, size = 21) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
    strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">{path}</svg>
)

const TABS = [
  { href: '/admin/inbox', label: 'Inbox', icon: I.inbox },
  { href: '/admin/contacts', label: 'Contacts', icon: I.contacts },
  { href: '/admin/tasks', label: 'Tasks', icon: I.tasks },
  { href: '/admin/calendar', label: 'Calendar', icon: I.calendar },
]

const MORE_GROUPS: { title: string; items: { href: string; label: string; icon: React.ReactNode; external?: boolean }[] }[] = [
  {
    title: 'Work',
    items: [
      { href: '/admin/gallery', label: 'Gallery', icon: I.gallery },
      { href: '/admin/campaigns', label: 'Campaigns', icon: I.campaigns },
      { href: '/admin/reviews', label: 'Reviews', icon: I.reviews },
      { href: '/admin/calls', label: 'Call logs', icon: I.calls },
    ],
  },
  {
    title: 'Insights',
    items: [
      { href: '/admin/link-reports', label: 'Link reports', icon: I.links },
      { href: '/admin/analytics', label: 'Analytics', icon: I.analytics },
    ],
  },
  {
    title: 'Manage',
    items: [
      { href: '/help', label: 'Help Centre', icon: I.help, external: true },
      { href: '/admin/team', label: 'Team', icon: I.team },
      { href: '/admin/settings', label: 'Settings', icon: I.settings },
    ],
  },
]

export default function MobileNav() {
  const pathname = usePathname()
  const router = useRouter()
  const [showMore, setShowMore] = useState(false)
  const [me, setMe] = useState<{ name: string; email: string } | null>(null)
  const [unread, setUnread] = useState(0)

  useEffect(() => {
    ;(async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setMe({
          name: session.user.user_metadata?.display_name || session.user.email?.split('@')[0] || 'Account',
          email: session.user.email || '',
        })
      }
    })()
  }, [])

  // Unread count on the Inbox tab, the way a native app badges it.
  useEffect(() => {
    let cancelled = false
    const tick = async () => {
      try {
        const { count } = await (supabase as any).from('conversations')
          .select('*', { count: 'exact', head: true })
          .eq('is_unread', true).neq('status', 'resolved')
        if (!cancelled) setUnread(count || 0)
      } catch { /* badge is cosmetic */ }
    }
    tick()
    const t = setInterval(tick, 30000)
    return () => { cancelled = true; clearInterval(t) }
  }, [])

  // Close the sheet on navigation, and lock background scroll while it's open.
  useEffect(() => { setShowMore(false) }, [pathname])
  useEffect(() => {
    if (!showMore) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [showMore])

  const logout = async () => {
    if (!confirm('Log out of Colvy?')) return
    try { await supabase.auth.signOut() } catch {}
    router.push('/login')
  }

  const isActive = (href: string) =>
    pathname === href || pathname.startsWith(href + '/')

  const moreActive = MORE_GROUPS.some(g => g.items.some(i => isActive(i.href)))

  return (
    <>
      <style>{`
        .colvy-mobile-nav { display: none; }
        @media (max-width: 860px) {
          .colvy-mobile-nav { display: flex; }
          /* Room for the bar so it never covers the last row of content. */
          .colvy-mobile-pad { padding-bottom: calc(58px + env(safe-area-inset-bottom)); }
        }
      `}</style>

      {/* ── Bottom tab bar ─────────────────────────────────────────────────── */}
      <nav className="colvy-mobile-nav" style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 900,
        background: 'rgba(255,255,255,0.94)',
        backdropFilter: 'saturate(180%) blur(14px)',
        WebkitBackdropFilter: 'saturate(180%) blur(14px)',
        borderTop: '1px solid var(--border)',
        paddingBottom: 'env(safe-area-inset-bottom)',
      }}>
        {TABS.map(t => {
          const active = isActive(t.href)
          return (
            <Link key={t.href} href={t.href} style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
              justifyContent: 'center', gap: 3, padding: '8px 0 7px', textDecoration: 'none',
              color: active ? 'var(--coral)' : 'var(--slate)',
              WebkitTapHighlightColor: 'transparent', position: 'relative',
            }}>
              <span style={{ display: 'flex', position: 'relative' }}>
                {svg(t.icon)}
                {t.label === 'Inbox' && unread > 0 && (
                  <span style={{
                    position: 'absolute', top: -4, right: -7, minWidth: 16, height: 16,
                    padding: '0 4px', borderRadius: 9, background: 'var(--coral)', color: '#fff',
                    fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', boxSizing: 'border-box',
                  }}>
                    {unread > 99 ? '99+' : unread}
                  </span>
                )}
              </span>
              <span style={{ fontSize: 10.5, fontWeight: active ? 700 : 600 }}>{t.label}</span>
            </Link>
          )
        })}

        <button onClick={() => setShowMore(true)} style={{
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
          justifyContent: 'center', gap: 3, padding: '8px 0 7px', border: 'none',
          background: 'none', cursor: 'pointer',
          color: (showMore || moreActive) ? 'var(--coral)' : 'var(--slate)',
          WebkitTapHighlightColor: 'transparent',
        }}>
          {svg(I.more)}
          <span style={{ fontSize: 10.5, fontWeight: (showMore || moreActive) ? 700 : 600 }}>More</span>
        </button>
      </nav>

      {/* ── More sheet ─────────────────────────────────────────────────────── */}
      {showMore && (
        <div onClick={() => setShowMore(false)} style={{
          position: 'fixed', inset: 0, zIndex: 950, background: 'rgba(0,0,0,0.35)',
          display: 'flex', alignItems: 'flex-end',
        }}>
          <div onClick={e => e.stopPropagation()} style={{
            width: '100%', maxHeight: '85dvh', overflowY: 'auto',
            background: '#fff', borderRadius: '18px 18px 0 0',
            paddingBottom: 'calc(14px + env(safe-area-inset-bottom))',
            overscrollBehavior: 'contain',
          }}>
            {/* Grab handle */}
            <div style={{ display: 'flex', justifyContent: 'center', padding: '9px 0 4px' }}>
              <div style={{ width: 38, height: 4, borderRadius: 3, background: '#e5e7eb' }} />
            </div>

            {me && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '10px 18px 14px', borderBottom: '1px solid var(--border)' }}>
                <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--coral)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, flexShrink: 0 }}>
                  {me.name.charAt(0).toUpperCase()}
                </div>
                <div style={{ minWidth: 0 }}>
                  <p style={{ margin: 0, fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{me.name}</p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{me.email}</p>
                </div>
              </div>
            )}

            {MORE_GROUPS.map(group => (
              <div key={group.title} style={{ padding: '12px 0 4px' }}>
                <p style={{ margin: '0 18px 4px', fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {group.title}
                </p>
                {group.items.map(item => (
                  <Link key={item.href} href={item.href}
                    {...(item.external ? { target: '_blank', rel: 'noopener' } : {})}
                    onClick={() => setShowMore(false)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 13, padding: '12px 18px',
                      textDecoration: 'none', color: isActive(item.href) ? 'var(--coral)' : 'var(--ink)',
                      fontSize: 14.5, fontWeight: isActive(item.href) ? 700 : 500,
                      WebkitTapHighlightColor: 'transparent',
                    }}>
                    <span style={{ color: isActive(item.href) ? 'var(--coral)' : 'var(--slate)', display: 'flex' }}>
                      {svg(item.icon, 19)}
                    </span>
                    {item.label}
                  </Link>
                ))}
              </div>
            ))}

            {/* Account */}
            <div style={{ padding: '12px 0 4px', borderTop: '1px solid var(--border)', marginTop: 6 }}>
              <p style={{ margin: '0 18px 4px', fontSize: 10.5, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Account
              </p>
              <Link href="/admin/settings" onClick={() => setShowMore(false)}
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 18px', textDecoration: 'none', color: 'var(--ink)', fontSize: 14.5, WebkitTapHighlightColor: 'transparent' }}>
                <span style={{ color: 'var(--slate)', display: 'flex' }}>{svg(I.account, 19)}</span>
                Account
              </Link>
              <button onClick={logout}
                style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '12px 18px', width: '100%', textAlign: 'left', border: 'none', background: 'none', cursor: 'pointer', color: '#dc2626', fontSize: 14.5, fontWeight: 600, WebkitTapHighlightColor: 'transparent' }}>
                <span style={{ display: 'flex' }}>{svg(I.logout, 19)}</span>
                Log out
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
