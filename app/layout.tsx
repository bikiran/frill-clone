'use client'

import { useState, useEffect, useRef } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useClickOutside } from '@/lib/use-click-outside'
import { TerminologyProvider } from '@/lib/terminologyContext'
import { ToastProvider } from '@/components/ToastProvider'
import LiveChat from '@/components/LiveChat'
import UpdateNotification from '@/components/UpdateNotification'
import './globals.css'

const NAV_ITEMS = [
  { href: '/', label: 'Ideas', icon: 'ideas' },
  { href: '/roadmap', label: 'Roadmap', icon: 'roadmap' },
  { href: '/announcements', label: 'Updates', icon: 'updates' },
  { href: '/help', label: 'Help', icon: 'help' },
  { href: '/features/ideas', label: 'Product', icon: 'features' },
  { href: '/features', label: 'Features', icon: 'features' },
  { href: '/pricing', label: 'Pricing', icon: 'pricing' },
]

// Marketing-context nav (colvy.com, signin, signup) — real pages that exist
const MARKETING_NAV = [
  { href: '/features/ideas', label: 'Ideas', icon: 'ideas' },
  { href: '/features/roadmap', label: 'Roadmap', icon: 'roadmap' },
  { href: '/features/announcements', label: 'Announcements', icon: 'updates' },
  { href: '/features/knowledgebase', label: 'Knowledgebase', icon: 'help' },
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
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // If a user lands with an auth error hash (e.g. an expired invite/OTP link:
  // #error=access_denied&error_code=otp_expired), Supabase's detectSessionInUrl
  // would otherwise choke on it and the page renders a blank error. Strip the
  // hash immediately and show a gentle notice instead of crashing.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const hash = window.location.hash || ''
    if (hash.includes('error_code=') || hash.includes('error=access_denied')) {
      const params = new URLSearchParams(hash.replace(/^#/, ''))
      const code = params.get('error_code') || params.get('error') || 'error'
      // Clean the URL so a reload doesn't re-trigger and nothing parses it.
      try { window.history.replaceState(null, '', window.location.pathname + window.location.search) } catch {}
      if (code === 'otp_expired' || code === 'access_denied') {
        // Send them somewhere sensible with a friendly message.
        try { window.location.replace('/signin?notice=link_expired') } catch {}
      }
    }
  }, [])
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  // Dropdowns should close when you click anywhere else, or press Escape.
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notifMenuRef = useRef<HTMLDivElement>(null)
  useClickOutside(showUserMenu, () => setShowUserMenu(false), [userMenuRef])
  useClickOutside(showNotifications, () => setShowNotifications(false), [notifMenuRef])
  const [notifications, setNotifications] = useState<any[]>([])
  const [notificationFilter, setNotificationFilter] = useState<'unread' | 'all'>('unread')
  const [loadingNotifications, setLoadingNotifications] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [freshContent] = useState({ ideas: false, roadmap: false, updates: false, help: false })
  const pathname = usePathname()
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string>('')
  const [isCompanyOwner, setIsCompanyOwner] = useState(false)

  useEffect(() => {
    // Listen for avatar updates from profile page
    const handleAvatarUpdate = (e: any) => {
      setAvatarUrl(e.detail)
    }
    window.addEventListener('colvy-avatar-update', handleAvatarUpdate)
    return () => window.removeEventListener('colvy-avatar-update', handleAvatarUpdate)
  }, [])

  useEffect(() => {
    // Set initial avatar from user metadata
    if (user?.user_metadata?.avatar_url) {
      setAvatarUrl(user.user_metadata.avatar_url)
    }
  }, [user])
  // Start with stable server-safe values, then hydrate from window/localStorage
  // AFTER mount. Reading window in a useState initializer causes a server/client
  // mismatch that can throw React #300 (hydration/hook mismatch).
  const [company, setCompany] = useState<any>(null)
  const [isSubdomain, setIsSubdomain] = useState(false)
  useEffect(() => {
    try {
      const h = window.location.hostname
      const sub = h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com' && !h.includes('localhost')
      setIsSubdomain(sub)
      const slug = sub ? h.replace('.colvy.com', '') : null
      if (slug) {
        const cached = localStorage.getItem(`company_${slug}`)
        if (cached) setCompany(JSON.parse(cached))
      }
    } catch {}
  }, [])
  const [navVisibility, setNavVisibility] = useState({
    Ideas: true, Roadmap: true, Updates: true, Help: true,
  })
  const [navOrder, setNavOrder] = useState(['Ideas', 'Roadmap', 'Updates', 'Help'])
  const [homePath, setHomePath] = useState('/')

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
        // Apply the saved navigation ORDER too (this was only applied by the
        // live-update event before, so page loads ignored the saved order)
        if (s.navOrder && Array.isArray(s.navOrder)) {
          const norm = (l: string) => l === 'Help Centre' ? 'Help' : l === 'Announcements' ? 'Updates' : l
          setNavOrder(s.navOrder.map(norm))
        }
        // Default homepage — where the logo link goes
        const homeMap: Record<string, string> = { ideas: '/', roadmap: '/roadmap', announcements: '/announcements', help: '/help' }
        setHomePath(homeMap[s.defaultHomepage] || '/')
        if (typeof document !== 'undefined') {
          // Dynamic favicon per company
          if (s.faviconUrl) {
            let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement
            if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
            link.href = s.faviconUrl
          } else {
            // Reset to default colvy favicon (not prexty's)
            const link = document.querySelector("link[rel~='icon']") as HTMLLinkElement
            if (link) link.href = '/favicon.png'
          }
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
        // Detect company from hostname
        const h = typeof window !== 'undefined' ? window.location.hostname : ''
        const isSubdomain = h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com'
        const slug = isSubdomain ? h.replace('.colvy.com', '') : null

        // Load settings for this specific company
        let q = (supabase as any).from('site_settings').select('*').eq('key', 'general')
        let resolvedCompanyId: string | null = null
        if (slug) {
          const { data: co } = await (supabase as any).from('companies').select('id,name,slug,logo_url,accent_color').eq('slug', slug).maybeSingle()
          if (co) {
            resolvedCompanyId = co.id
            setCompany(co)
            try { localStorage.setItem(`company_${slug}`, JSON.stringify(co)) } catch {}
            if (co.accent_color && typeof document !== 'undefined') {
              document.documentElement.style.setProperty('--coral', co.accent_color)
              const r = parseInt(co.accent_color.slice(1,3), 16)
              const g = parseInt(co.accent_color.slice(3,5), 16)
              const b = parseInt(co.accent_color.slice(5,7), 16)
              document.documentElement.style.setProperty('--peach', `rgba(${r},${g},${b},0.1)`)
            }
            q = q.eq('company_id', co.id)
          } else {
            // On a subdomain but company not found — do NOT load unscoped
            // settings (that would show another company's nav/logo/favicon)
            return
          }
        } else {
          // On colvy.com, don't apply any company color
          q = q.is('company_id', null)
        }

        // Array query + newest row — never breaks if duplicate settings rows exist
        const { data: rows } = await q.order('updated_at', { ascending: false }).limit(1)
        const data = rows?.[0] || null
        if (data?.value) {
          applySettings(data.value)
          if (typeof window !== 'undefined') {
            localStorage.setItem(`site_settings_${slug || 'colvy'}`, JSON.stringify(data.value))
          }
          return
        }
      } catch {}
      if (typeof window !== 'undefined') {
        try {
          const h = window.location.hostname
          const slug = h.endsWith('.colvy.com') && h !== 'colvy.com' ? h.replace('.colvy.com', '') : 'colvy'
          const slugKey = typeof window !== 'undefined'
            ? (window.location.hostname.replace('.colvy.com', '') || 'colvy')
            : 'colvy'
          const s = JSON.parse(localStorage.getItem(`site_settings_${slugKey}`) || '{}')
          if (s && Object.keys(s).length > 0) applySettings(s)
        } catch {}
      }
    }
    loadNav()

    // Listen for real-time nav updates from settings page
    const handleNavUpdate = (e: Event) => {
      const s = (e as CustomEvent).detail
      if (!s) return
      const norm = (l: string) => l === 'Help Centre' ? 'Help' : l === 'Announcements' ? 'Updates' : l
      setNavVisibility({
        Ideas: s.navIdeas !== false,
        Roadmap: s.navRoadmap !== false,
        Updates: s.navAnnouncements !== false,
        Help: s.navHelp !== false,
      })
      if (s.navOrder) setNavOrder(s.navOrder.map(norm))
    }
    window.addEventListener('colvy-nav-update', handleNavUpdate)
    return () => window.removeEventListener('colvy-nav-update', handleNavUpdate)
  }, [pathname])

  // Browser tab title: "<Company>'s <Page Name>" on company boards
  // e.g. "nePlay's Idea Board", "nePlay's Help Center", "nePlay's Roadmap"
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const h = window.location.hostname
    const isSubdomain = h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com'
    if (!isSubdomain) return
    const slug = h.replace('.colvy.com', '')

    const pageName = (() => {
      const p = pathname || '/'
      if (p.startsWith('/roadmap')) return 'Roadmap'
      if (p.startsWith('/announcements')) return 'Announcements'
      if (p.startsWith('/help')) return 'Help Center'
      if (p.startsWith('/admin/settings')) return 'Settings'
      if (p.startsWith('/admin')) return 'Admin'
      if (p.startsWith('/polls')) return 'Polls'
      if (p.startsWith('/surveys')) return 'Surveys'
      if (p.startsWith('/forms')) return 'Forms'
      if (p.startsWith('/profile')) return 'Profile'
      if (p.startsWith('/signin')) return 'Sign In'
      if (p.startsWith('/signup')) return 'Sign Up'
      return 'Idea Board'
    })()

    const applyTitle = (name: string) => { document.title = `${name}'s ${pageName}` }

    // Use cached company name immediately, then confirm from the DB
    let cachedName: string | null = null
    try {
      const cached = localStorage.getItem(`company_${slug}`)
      if (cached) cachedName = JSON.parse(cached)?.name || null
    } catch {}
    applyTitle(cachedName || slug.charAt(0).toUpperCase() + slug.slice(1))

    ;(async () => {
      try {
        const { data: co } = await (supabase as any).from('companies').select('name').eq('slug', slug).maybeSingle()
        if (co?.name) applyTitle(co.name)
      } catch {}
    })()
  }, [pathname])

  // Auth — real-time, no hard refresh needed
  useEffect(() => {
    // Initial session
    const checkOwner = async (u: any) => {
      if (!u) { setIsCompanyOwner(false); return }
      const SUPER_ADMIN = 'bishalstha76@gmail.com'
      setIsAdmin(u.email === SUPER_ADMIN)
      // Also check if user is on a subdomain - they're probably the owner
      const currentHost = typeof window !== 'undefined' ? window.location.hostname : ''
      const onSubdomain = currentHost.endsWith('.colvy.com') && currentHost !== 'colvy.com' && currentHost !== 'www.colvy.com'

      try {
        let data: any = null
        let isTeamMember = false

        if (onSubdomain) {
          // On a company subdomain: the company shown is the SUBDOMAIN's company.
          // The user is only an admin here if they actually own it or are an elevated team member.
          const h = typeof window !== 'undefined' ? window.location.hostname : ''
          const slug = h.replace('.colvy.com', '')
          const { data: coBySlug } = await (supabase as any).from('companies').select('*').eq('slug', slug).maybeSingle()
          if (coBySlug) {
            if (coBySlug.owner_id === u.id) {
              data = coBySlug
            } else {
              // Check elevated team membership (owner/admin/editor) — array query, never .single()
              const { data: members } = await (supabase as any)
                .from('team_members').select('role')
                .eq('company_id', coBySlug.id).eq('user_id', u.id).limit(1)
              if (members && members.length > 0 && ['owner', 'admin', 'editor'].includes((members[0].role || '').toLowerCase())) {
                data = coBySlug
                isTeamMember = true
              }
            }
            // Always apply the subdomain company's branding, even for regular visitors
            if (!data && coBySlug.accent_color) {
              document.documentElement.style.setProperty('--coral', coBySlug.accent_color)
              const r = parseInt(coBySlug.accent_color.slice(1,3),16)
              const g = parseInt(coBySlug.accent_color.slice(3,5),16)
              const b = parseInt(coBySlug.accent_color.slice(5,7),16)
              document.documentElement.style.setProperty('--peach', `rgba(${r},${g},${b},0.1)`)
            }
          }
        } else {
          // Main domain: a user administers their own company
          const { data: coByOwner } = await (supabase as any).from('companies').select('*').eq('owner_id', u.id).maybeSingle()
          data = coByOwner
        }

        setIsCompanyOwner(!!data || u.email === SUPER_ADMIN)
        if (data) {
          setCompany(data)
          // Apply company accent color
          if (data.accent_color) {
            document.documentElement.style.setProperty('--coral', data.accent_color)
            const r = parseInt(data.accent_color.slice(1,3),16)
            const g = parseInt(data.accent_color.slice(3,5),16)
            const b = parseInt(data.accent_color.slice(5,7),16)
            document.documentElement.style.setProperty('--peach', `rgba(${r},${g},${b},0.1)`)
          }
        }
      } catch {
        setIsCompanyOwner(u.email === SUPER_ADMIN)
      }
    }

    // Detect subdomain
    if (typeof window !== 'undefined') {
      const h = window.location.hostname
      const sub = h !== 'colvy.com' && h !== 'www.colvy.com' &&
        !h.includes('localhost') && !h.includes('vercel.app') &&
        h.endsWith('.colvy.com')
      setIsSubdomain(sub)
    }

    supabase.auth.getSession().then(async ({ data }) => {
      const u = data.session?.user ?? null
      if (u) {
        // getSession() reads a possibly-stale token from localStorage. If the
        // user signed out on another subdomain, that token is revoked server
        // side but still cached here — validate it with getUser() (which hits
        // the server) so colvy.com doesn't show "Welcome back" for a
        // signed-out user.
        const { data: verified, error } = await supabase.auth.getUser()
        if (error || !verified?.user) {
          // Stale/invalid session — clear it locally and treat as logged out
          try { await supabase.auth.signOut() } catch {}
          setUser(null)
          checkOwner(null)
          return
        }
        setUser(verified.user)
        checkOwner(verified.user)
      } else {
        setUser(null)
        checkOwner(null)
      }
    })
    // Subscribe to all auth changes (sign-in, sign-out, token refresh)
    // Close user dropdown on outside click
    const closeMenuOnOutsideClick = (e: MouseEvent) => {
      const menu = document.getElementById('colvy-user-menu')
      const btn = document.getElementById('colvy-user-btn')
      if (menu && btn && !menu.contains(e.target as Node) && !btn.contains(e.target as Node)) {
        setShowUserMenu(false)
      }
    }
    document.addEventListener('mousedown', closeMenuOnOutsideClick)

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

  // Notifications unread count + realtime. MUST be declared before any early
  // return (the isFullPage branch below) so the hook count is stable — otherwise
  // React throws #300 ("rendered fewer hooks than expected") when isFullPage
  // flips after mount on the marketing root.
  useEffect(() => {
    if (!user) { setUnreadCount(0); return }
    const getCount = async () => {
      try {
        const { count } = await (supabase as any)
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false)
        setUnreadCount(count || 0)
      } catch { setUnreadCount(0) }
    }
    getCount()
    const ch = supabase
      .channel(`notifications-${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, (payload: any) => {
        getCount()
        // Browser notification for new items (works while the admin tab is open,
        // even if it's in the background). Interim until the mobile app ships.
        try {
          if (payload.eventType === 'INSERT' && payload.new) {
            const n = payload.new

            // A soft two-note chime — pleasant, quiet, and short. Synthesised so
            // there's no audio file to load, and it fails silently if the browser
            // blocks audio (which it does until the user has interacted).
            try {
              const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
              if (Ctx) {
                const ctx = new Ctx()
                const now = ctx.currentTime
                const play = (freq: number, at: number, dur: number, peak: number) => {
                  const osc = ctx.createOscillator()
                  const gain = ctx.createGain()
                  osc.type = 'sine'
                  osc.frequency.value = freq
                  // Gentle swell then fade — no harsh click.
                  gain.gain.setValueAtTime(0.0001, now + at)
                  gain.gain.exponentialRampToValueAtTime(peak, now + at + 0.03)
                  gain.gain.exponentialRampToValueAtTime(0.0001, now + at + dur)
                  osc.connect(gain).connect(ctx.destination)
                  osc.start(now + at)
                  osc.stop(now + at + dur + 0.02)
                }
                play(880, 0, 0.18, 0.06)      // A5
                play(1318.5, 0.10, 0.26, 0.045) // E6 — a soft rising fifth
                setTimeout(() => ctx.close(), 900)
              }
            } catch {}

            if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
              const notif = new Notification(n.actor_name ? `${n.actor_name}` : 'Colvy', {
                body: n.message || 'You have a new notification',
                icon: '/logo.png',
                badge: '/favicon.png',
                tag: n.id,
                silent: true, // we play our own softer chime instead of the OS blare
              })
              notif.onclick = () => {
                window.focus()
                if (n.conversation_id) window.location.href = `/admin/inbox?conversation=${n.conversation_id}`
                else window.location.href = '/admin'
                notif.close()
              }
            }
          }
        } catch {}
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user])

  // Ask for browser-notification permission once the user is signed in to the
  // admin. Only prompts if they haven't decided yet.
  useEffect(() => {
    if (!user) return
    if (typeof window === 'undefined' || typeof Notification === 'undefined') return
    if (Notification.permission !== 'default') return
    // Delay slightly so the prompt doesn't collide with page load.
    const t = setTimeout(() => { try { Notification.requestPermission() } catch {} }, 2500)
    return () => clearTimeout(t)
  }, [user])

  // Flush any due review requests. Vercel Hobby plans don't allow frequent
  // crons, so instead we opportunistically dispatch whenever an admin is using
  // the app (throttled to once every 10 minutes per browser).
  useEffect(() => {
    if (!user) return
    const KEY = 'colvy_last_review_dispatch'
    const tick = () => {
      try {
        const last = Number(localStorage.getItem(KEY) || 0)
        if (Date.now() - last < 10 * 60 * 1000) return
        localStorage.setItem(KEY, String(Date.now()))
        fetch('/api/reviews/dispatch').catch(() => {})
        // Calendar reminders ride along on the same throttle.
        fetch('/api/calendar/reminders').catch(() => {})
      } catch {}
    }
    const t = setTimeout(tick, 8000)          // shortly after load
    const iv = setInterval(tick, 10 * 60 * 1000) // and while the tab stays open
    return () => { clearTimeout(t); clearInterval(iv) }
  }, [user])

  // Fetch notifications when dropdown opens. Also declared before any early
  // return to keep the hook order stable (see #300 note above).
  useEffect(() => {
    if (showNotifications) fetchNotifications()
  }, [showNotifications])

  const userInitial = user?.email?.[0].toUpperCase() || 'A'
  // Pages that use their own full-page layout (no nav wrapper).
  // IMPORTANT: window-dependent checks (embed, marketing root) must NOT change
  // the render tree between the server render and the first client render, or
  // React throws a hydration error (the "page error that clears on reload" bug
  // when navigating to/from signin). So they only take effect after mount.
  const isEmbed = mounted && new URLSearchParams(window.location.search).get('embed') === '1'
  // On colvy.com the proxy rewrites "/" → "/landing", but usePathname() still
  // reports "/". Detect the root of the marketing domain so we don't render the
  // app nav on top of the landing page's own nav (the "mixed up menu" bug).
  const isMarketingRoot = mounted
    && (window.location.hostname === 'colvy.com' || window.location.hostname === 'www.colvy.com')
    && (pathname === '/' || pathname === '/landing')
  // Pathname-based full-page routes are safe on the server (no window needed).
  const isFullPageRoute = ['/landing', '/pricing', '/features', '/platform-admin', '/forms/', '/widget', '/auth/handoff'].some(p => pathname?.startsWith(p))
  const isFullPage = isEmbed || isMarketingRoot || isFullPageRoute

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
          <UpdateNotification accentColor={company?.accent_color} />
        </body>
      </html>
    )
  }

  // Fetch notifications when user opens notification panel
  const fetchNotifications = async () => {
    try {
      setLoadingNotifications(true)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user.id) {
        setNotifications([])
        setLoadingNotifications(false)
        return
      }

      let q = supabase.from('notifications').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false }).limit(50)
      const { data } = await q
      setNotifications(data || [])
    } catch (err) {
      console.error('Error fetching notifications:', err)
      setNotifications([])
    } finally {
      setLoadingNotifications(false)
    }
  }

  // Unread count for the bell dot — fetched on load and kept fresh via realtime
  const fetchUnreadCount = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user.id) { setUnreadCount(0); return }
      const { count } = await (supabase as any)
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false)
      setUnreadCount(count || 0)
    } catch { setUnreadCount(0) }
  }

  const markAllAsRead = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user.id) return
      
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false)
      
      // Refetch notifications
      await fetchNotifications()
      setUnreadCount(0)
    } catch (err) {
      console.error('Error marking as read:', err)
    }
  }

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
      
      // Update local state
      setNotifications(notifications.map(n => 
        n.id === notificationId ? { ...n, is_read: true } : n
      ))
      setUnreadCount(c => Math.max(0, c - 1))
    } catch (err) {
      console.error('Error marking notification as read:', err)
    }
  }

  const handleNotificationClick = async (notification: any) => {
    // Mark as read
    if (!notification.is_read) {
      await markNotificationAsRead(notification.id)
    }

    // Navigate based on type
    if (notification.type === 'idea' && notification.idea_id) {
      setShowNotifications(false)
      router.push(`/?idea=${notification.idea_id}`)
    } else if (notification.type === 'roadmap') {
      setShowNotifications(false)
      router.push('/roadmap')
    } else if (notification.type === 'announcement' && notification.announcement_id) {
      setShowNotifications(false)
      router.push(`/announcements?id=${notification.announcement_id}`)
    } else if (notification.type === 'help' && notification.article_id) {
      setShowNotifications(false)
      router.push(`/help/${notification.article_id}`)
    } else if (notification.type === 'form' && notification.form_id) {
      setShowNotifications(false)
      router.push(`/forms/${notification.form_id}`)
    } else if (notification.type === 'settings') {
      setShowNotifications(false)
      router.push('/admin/settings')
    } else if (['chat', 'sms', 'order', 'ticket', 'cart', 'activity'].includes(notification.type)) {
      // CRM activity — go to the inbox (open the specific conversation if known).
      setShowNotifications(false)
      const convId = notification.conversation_id || notification.conversationId
      router.push(convId ? `/admin/inbox?conversation=${convId}` : '/admin/inbox')
    } else {
      // Fallback: any unrecognised type with a conversation goes to the inbox.
      setShowNotifications(false)
      if (notification.conversation_id) router.push(`/admin/inbox?conversation=${notification.conversation_id}`)
    }
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
            {/* Left: mobile hamburger + logo */}
            <div className="flex items-center gap-2">
              <button
                className="md:hidden p-2 -ml-2 rounded-lg hover:bg-gray-100 transition-smooth cursor-pointer"
                onClick={() => {
                  // On admin pages this hamburger should open the admin sidebar,
                  // not the marketing drawer.
                  if (pathname?.startsWith('/admin')) {
                    window.dispatchEvent(new CustomEvent('colvy:toggle-admin-sidebar'))
                  } else {
                    setShowDrawer(!showDrawer)
                  }
                }}
                aria-label="Menu">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
              </button>
              {/* Logo */}
              <Link href={isSubdomain ? homePath : '/'} className="flex items-center gap-2 font-bold text-lg transition-smooth hover:opacity-70">
              {/* On subdomains show company branding; on colvy.com show Colvy */}
              {isSubdomain && company ? (
                <>
                  {company.logo_url
                    ? <img src={company.logo_url} alt={company.name} className="h-7 w-auto" onError={(e: any) => { e.target.style.display='none' }} />
                    : <div style={{ width: 28, height: 28, borderRadius: 8, background: company.accent_color || 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 700, fontSize: 13, flexShrink: 0 }}>{company.name?.[0]?.toUpperCase()}</div>
                  }
                  <span style={{ color: 'var(--coral)' }}>{company.name}</span>
                </>
              ) : (
                <>
                  <img src="/logo.png" alt="Colvy" className="h-7 w-auto"
                    onLoad={(e: any) => { const span = e.target.nextSibling; if (span) span.style.display = 'none' }}
                    onError={(e: any) => { e.target.style.display = 'none' }} />
                  <span style={{ color: 'var(--coral)' }}>Colvy</span>
                </>
              )}
            </Link>
            </div>

            {/* Desktop Nav */}
            <div className="hidden md:flex items-center gap-1">
              {(() => {
                const isOnBoard = isSubdomain || isCompanyOwner
                // On colvy.com show the full marketing menu; on boards show board nav
                const items = isOnBoard ? NAV_ITEMS : MARKETING_NAV
                return items
                .filter(item => {
                  if (isOnBoard && navVisibility[item.label as keyof typeof navVisibility] === false) return false
                  const isBoardItem = ['Ideas', 'Roadmap', 'Updates', 'Help'].includes(item.label) && item.href.startsWith('/') && !item.href.startsWith('/features')
                  const isMarketingItem = item.label === 'Features' || item.label === 'Product'
                  if (!isOnBoard && isBoardItem) return false
                  if (isOnBoard && isMarketingItem) return false
                  // Pricing is unnecessary once the user is logged in
                  if (item.label === 'Pricing' && user) return false
                  return true
                }).map(item => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-smooth group relative"
                  style={{
                    color: pathname === item.href ? 'var(--coral)' : 'var(--slate)',
                  }}>
                  <span className="flex items-center gap-2">
                    <span className="group-hover:scale-110 transition-transform relative">
                      <NavIcon type={item.icon} size={18} />
                      {((item.label === 'Ideas' && freshContent.ideas) ||
                        (item.label === 'Roadmap' && freshContent.roadmap) ||
                        (item.label === 'Updates' && freshContent.updates) ||
                        (item.label === 'Help' && freshContent.help)) && (
                        <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: 'var(--coral)' }} />
                      )}
                    </span>
                    {item.label}
                  </span>
                  {pathname === item.href && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 rounded-t-lg" style={{ background: 'var(--coral)' }} />
                  )}
                </Link>
              ))
              })()}
            </div>

            {/* Right side */}
            <div className="flex items-center gap-3">
              {user ? (
                <>
                  {/* Notification icon */}
                  <div ref={notifMenuRef} className="relative">
                  <button
                    onClick={() => setShowNotifications(!showNotifications)}
                    className="w-9 h-9 rounded-full flex items-center justify-center text-gray-600 hover:bg-gray-100 transition-smooth cursor-pointer relative"
                    title="Notifications">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
                      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                    </svg>
                    {unreadCount > 0 && (
                      <div className="absolute top-1 right-1 w-2 h-2 rounded-full" style={{ background: 'var(--coral)' }}></div>
                    )}
                  </button>
                  
                  {showNotifications && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowNotifications(false)} />
                      <div className="absolute top-full right-0 mt-2 w-96 max-h-[600px] bg-white rounded-xl shadow-2xl border z-40 flex flex-col overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                        {/* Header with filters */}
                        <div className="p-4 border-b flex items-center justify-between shrink-0" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                          <h3 className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Notifications</h3>
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => setNotificationFilter(notificationFilter === 'unread' ? 'all' : 'unread')}
                              className="px-3 py-1 rounded-full text-xs font-medium transition-smooth cursor-pointer"
                              style={{
                                background: notificationFilter === 'unread' ? 'var(--coral)' : 'transparent',
                                color: notificationFilter === 'unread' ? 'white' : 'var(--slate)',
                                border: notificationFilter === 'unread' ? 'none' : `1px solid var(--border)`
                              }}>
                              {notificationFilter === 'unread' ? 'Unread' : 'Show all'}
                            </button>
                            {notifications.some(n => !n.is_read) && (
                              <button
                                onClick={markAllAsRead}
                                className="px-3 py-1 rounded-full text-xs font-medium transition-smooth cursor-pointer border"
                                style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                                Mark all as read
                              </button>
                            )}
                          </div>
                        </div>
                        
                        {/* Notifications list */}
                        <div className="overflow-y-auto flex-1">
                          {loadingNotifications ? (
                            <div className="p-8 text-center" style={{ color: 'var(--slate)' }}>
                              <p className="text-sm">Loading...</p>
                            </div>
                          ) : notifications.length === 0 ? (
                            <div className="p-8 text-center" style={{ color: 'var(--slate)' }}>
                              <p className="text-sm">No {notificationFilter === 'unread' ? 'unread ' : ''}notifications</p>
                            </div>
                          ) : (
                            notifications
                              .filter(n => notificationFilter === 'all' || !n.is_read)
                              .map(notification => (
                                <button
                                  key={notification.id}
                                  onClick={() => handleNotificationClick(notification)}
                                  className="w-full px-4 py-3 border-b text-left transition-smooth hover:bg-gray-50 cursor-pointer"
                                  style={{
                                    borderColor: 'var(--border)',
                                    background: !notification.is_read ? 'var(--peach)' : 'transparent'
                                  }}>
                                  <div className="flex items-start gap-3">
                                    <div className="w-2 h-2 rounded-full mt-2 shrink-0" style={{
                                      background: !notification.is_read ? 'var(--coral)' : 'transparent'
                                    }} />
                                    <div className="flex-1 min-w-0">
                                      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                                        {notification.title || ({
                                          vote: 'New vote on your idea',
                                          comment: 'New comment on your idea',
                                          reply: 'New reply to your comment',
                                          status_change: 'Idea status updated',
                                          mention: 'You were mentioned',
                                          assignment: 'You were assigned',
                                        } as Record<string, string>)[notification.type] || 'Notification'}
                                      </p>
                                      <p className="text-xs mt-1 line-clamp-2" style={{ color: 'var(--slate)' }}>
                                        {notification.message}
                                      </p>
                                      <p className="text-xs mt-1.5" style={{ color: 'var(--slate)' }}>
                                        {new Date(notification.created_at).toLocaleDateString()} {new Date(notification.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                      </p>
                                    </div>
                                  </div>
                                </button>
                              ))
                          )}
                        </div>
                      </div>
                    </>
                  )}
                  
                  </div>

                  <div ref={userMenuRef} className="relative" id="colvy-user-btn">
                    <button
                      onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu) }}
                      className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white transition-smooth hover:shadow-md cursor-pointer overflow-hidden"
                      style={{ background: avatarUrl ? undefined : 'var(--coral)' }}>
                      {avatarUrl ? (
                        <img src={avatarUrl} alt="Profile" className="w-full h-full object-cover" />
                      ) : (
                        userInitial
                      )}
                    </button>
                    
                    {showUserMenu && (
                      <>
                        <div className="fixed inset-0 z-30" onClick={() => setShowUserMenu(false)} />
                        <div id="colvy-user-menu" className="absolute top-full right-0 mt-2 w-56 bg-white rounded-xl shadow-2xl border z-40 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
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
                              <a href="/admin" onClick={() => setShowUserMenu(false)}
                                className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-gray-50 cursor-pointer font-semibold" style={{ color: 'var(--coral)', textDecoration: 'none' }}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
                                Admin Dashboard
                              </a>
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
                    className="px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-smooth hover:opacity-70"
                    style={{ color: 'var(--slate)' }}>
                    Sign in
                  </Link>
                  <Link
                    href="/signup"
                    onClick={() => setShowDrawer(false)}
                    className="px-3 py-1.5 md:px-5 md:py-2.5 rounded-lg text-xs md:text-sm font-semibold text-white transition-smooth press-effect cursor-pointer"
                    style={{ background: 'var(--coral)' }}>
                    Get started
                  </Link>
                </>
              )}

            </div>
          </nav>
        </header>

        {/* Mobile Drawer */}
        {showDrawer && (
          <>
            <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setShowDrawer(false)} />
            <div className="fixed right-0 top-14 bottom-0 z-40 w-64 bg-white border-l drawer-open" style={{ borderColor: 'var(--border)' }}>
              <div className="p-4 space-y-2">
                {NAV_ITEMS.filter(item => {
                  if (navVisibility[item.label as keyof typeof navVisibility] === false) return false
                  const isBoardItem2 = ['Ideas', 'Roadmap', 'Updates', 'Help'].includes(item.label)
                  const isMarketingItem2 = item.label === 'Features' || item.label === 'Pricing'
                  const isOnBoard2 = isSubdomain || isCompanyOwner
                  if (!isOnBoard2 && isBoardItem2) return false
                  if (isOnBoard2 && isMarketingItem2) return false
                  return true
                }).map(item => (
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
                      <span className="relative">
                        <NavIcon type={item.icon} size={18} />
                        {((item.label === 'Ideas' && freshContent.ideas) ||
                          (item.label === 'Roadmap' && freshContent.roadmap) ||
                          (item.label === 'Updates' && freshContent.updates) ||
                          (item.label === 'Help' && freshContent.help)) && (
                          <div className="absolute -top-1 -right-1 w-2 h-2 rounded-full" style={{ background: 'var(--coral)' }} />
                        )}
                      </span>
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
          <ToastProvider>
            <TerminologyProvider>
              {children}
            </TerminologyProvider>
          </ToastProvider>
        </main>
        <LiveChat />
        <UpdateNotification accentColor={company?.accent_color} />
      </body>
    </html>
  )
}
