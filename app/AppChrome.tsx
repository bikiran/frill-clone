'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { useClickOutside } from '@/lib/use-click-outside'
import { TerminologyProvider } from '@/lib/terminologyContext'
import { termFor } from '@/lib/terminology'
import { ToastProvider } from '@/components/ToastProvider'
import LiveChat from '@/components/LiveChat'
import UpdateNotification from '@/components/UpdateNotification'
import NotificationsPanel, { notificationSoundOn, inWorkspace } from '@/components/NotificationsPanel'
import Analytics from '@/components/Analytics'
import { NEUTRAL_ICON } from '@/lib/tenant-meta'
import { setAppearance } from '@/lib/seasonal-themes'

// Where a notification should take you when clicked. Shared by the in-app
// notifications menu AND the bottom-right OS notification, so both route the
// same way (the OS one used to only handle conversations and otherwise dumped
// you on /admin — order and task alerts went nowhere useful).
export function notificationPath(n: any): string {
  const conv = n?.conversation_id || n?.conversationId
  switch (n?.type) {
    case 'idea': return n.idea_id ? `/?idea=${n.idea_id}` : '/'
    case 'roadmap': return '/roadmap'
    case 'announcement': return n.announcement_id ? `/announcements?id=${n.announcement_id}` : (typeof n.link === 'string' && n.link.startsWith('/announcements') ? n.link : '/announcements')
    case 'help': return n.article_id ? `/help/${n.article_id}` : '/help'
    case 'form': return n.form_id ? `/forms/${n.form_id}` : '/admin/forms'
    case 'settings': return '/admin/settings'
    case 'task': return '/admin/tasks'
    case 'chat': case 'sms': case 'call': case 'order': case 'ticket': case 'cart': case 'activity':
      return conv ? `/admin/inbox?conversation=${conv}` : '/admin/inbox'
    default: return conv ? `/admin/inbox?conversation=${conv}` : '/admin'
  }
}

const NAV_ITEMS = [
  { href: '/', label: 'Ideas', icon: 'ideas' },
  { href: '/roadmap', label: 'Roadmap', icon: 'roadmap' },
  { href: '/announcements', label: 'Updates', icon: 'updates' },
  { href: '/help', label: 'Help', icon: 'help' },
  { href: '/product/ideas', label: 'Product', icon: 'inbox' },
  { href: '/product', label: 'Features', icon: 'features' },
  { href: '/pricing', label: 'Pricing', icon: 'pricing' },
]

// Marketing-context nav (colvy.com, signin, signup) — real pages that exist
const MARKETING_NAV = [
  { href: '/inbox-crm', label: 'Inbox & CRM', icon: 'inbox' },
  { href: '/product/ideas', label: 'Ideas', icon: 'ideas' },
  { href: '/product/roadmap', label: 'Roadmap', icon: 'roadmap' },
  { href: '/product/announcements', label: 'Announcements', icon: 'updates' },
  { href: '/product/knowledgebase', label: 'Knowledgebase', icon: 'help' },
  { href: '/pricing', label: 'Pricing', icon: 'pricing' },
]

// Which company a host belongs to: a workspace subdomain (roxy.colvy.com) or a
// custom help/board domain (help.roxyaquarium.com.au). Colvy's own hosts,
// localhost and Vercel previews are neither. Every check in this file uses this,
// so no later check can flip a custom domain back to Colvy's marketing header.
function companyHost(hostname: string): { slug: string | null; customHost: string | null } {
  const h = String(hostname || '').toLowerCase()
  if (!h || h.includes('localhost') || h.endsWith('vercel.app') || !h.includes('.')) return { slug: null, customHost: null }
  if (h === 'colvy.com' || h === 'www.colvy.com' || h === 'admin.colvy.com') return { slug: null, customHost: null }
  if (h.endsWith('.colvy.com')) return { slug: h.replace('.colvy.com', ''), customHost: null }
  return { slug: null, customHost: h }
}

const NavIcon = ({ type, size = 18 }: { type: string; size?: number }) => {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'ideas': return <svg {...p}><path d="M9 18h6" /><path d="M10 22h4" /><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14" /></svg>
    case 'roadmap': return <svg {...p}><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" /><line x1="8" y1="2" x2="8" y2="18" /><line x1="16" y1="6" x2="16" y2="22" /></svg>
    case 'updates': return <svg {...p}><path d="m3 11 18-5v12L3 14v-3z" /><path d="M11.6 16.8a3 3 0 1 1-5.8-1.6" /></svg>
    case 'help': return <svg {...p}><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
    case 'features': return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" /></svg>
    case 'inbox': return <svg {...p}><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>
    case 'pricing': return <svg {...p}><line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>
    case 'admin': return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
    default: return null
  }
}

// The interactive site chrome (marketing nav, board nav, drawers, notifications,
// footer). Extracted from the root layout so that app/layout.tsx can be a server
// component and export the Metadata API. Renders fragments only — <html>/<body>
// and all <head> metadata now live in the server layout.
export default function AppChrome({
  children,
}: {
  children: React.ReactNode
}) {
  const [showDrawer, setShowDrawer] = useState(false)
  const [mounted, setMounted] = useState(false)
  useEffect(() => { setMounted(true) }, [])

  // The header lifts with a soft shadow once the page scrolls under it
  // (an attribute, so scrolling never re-renders the app).
  const headerRef = useRef<HTMLElement>(null)
  useEffect(() => {
    const on = () => headerRef.current?.toggleAttribute('data-scrolled', window.scrollY > 4)
    on()
    window.addEventListener('scroll', on, { passive: true })
    return () => window.removeEventListener('scroll', on)
  }, [])

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

  // Password-reset links land the user wherever Supabase's redirect_to points —
  // which, when the app's redirectTo isn't in Supabase's allow-list, is the site
  // root (Site URL), NOT /auth/confirm. The recovery tokens then sit in the URL
  // hash on a page that doesn't handle them, so the user just sees the sign-in /
  // landing page and can never set a new password. Supabase fires PASSWORD_RECOVERY
  // the moment it detects a recovery link on ANY page, so catch it globally here
  // and send them to the set-new-password screen (unless they're already there).
  useEffect(() => {
    if (typeof window === 'undefined') return
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY' && !window.location.pathname.startsWith('/reset-password')) {
        try { window.location.assign('/reset-password') } catch {}
      }
    })
    // Fallback for browsers/timing where the event was missed but the hash is
    // still present: detect a recovery hash directly on mount.
    try {
      const h = window.location.hash || ''
      if (h.includes('type=recovery') && h.includes('access_token=') && !window.location.pathname.startsWith('/reset-password')) {
        // Preserve the hash so /reset-password can set the session from it if the
        // client hasn't already.
        window.location.assign('/reset-password' + h)
      }
    } catch {}
    return () => { try { sub?.subscription?.unsubscribe?.() } catch {} }
  }, [])
  const [showUserMenu, setShowUserMenu] = useState(false)
  const [showNotifications, setShowNotifications] = useState(false)

  // Dropdowns should close when you click anywhere else, or press Escape.
  const userMenuRef = useRef<HTMLDivElement>(null)
  const notifMenuRef = useRef<HTMLDivElement>(null)
  useClickOutside(showUserMenu, () => setShowUserMenu(false), [userMenuRef])
  useClickOutside(showNotifications, () => setShowNotifications(false), [notifMenuRef])
  const [unreadCount, setUnreadCount] = useState(0)
  const [freshContent] = useState({ ideas: false, roadmap: false, updates: false, help: false })
  const pathname = usePathname()
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string>('')
  // In the admin on wider screens the avatar and its menu sit at the foot of
  // the rail (components/AdminRail's #rail-account-slot), like Sellio's.
  const [railSlot, setRailSlot] = useState<HTMLElement | null>(null)
  useEffect(() => {
    const find = () => setRailSlot(document.getElementById('rail-account-slot'))
    find()
    window.addEventListener('colvy:rail-slot', find)
    return () => window.removeEventListener('colvy:rail-slot', find)
  }, [])
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
  // Latest current-company id, readable inside the realtime callback without
  // re-subscribing (the notifications channel keys on user, not company).
  const companyIdRef = useRef<string | null>(null)
  companyIdRef.current = company?.id || null
  useEffect(() => {
    try {
      const h = window.location.hostname
      // A custom help/board domain (e.g. help.roxyaquarium.com.au) is a company
      // host too — it should show the company's brand + board nav, not Colvy's.
      const { slug, customHost } = companyHost(h)
      const isCustomHost = !!customHost
      setIsSubdomain(!!slug || isCustomHost)
      if (slug) {
        const cached = localStorage.getItem(`company_${slug}`)
        if (cached) setCompany(JSON.parse(cached))
      } else if (isCustomHost) {
        const cached = localStorage.getItem(`company_domain_${h}`)
        if (cached) setCompany(JSON.parse(cached))
      }
    } catch {}
  }, [])
  const [navVisibility, setNavVisibility] = useState({
    Ideas: true, Roadmap: true, Updates: true, Help: true,
  })
  const [navOrder, setNavOrder] = useState(['Ideas', 'Roadmap', 'Updates', 'Help'])
  const [homePath, setHomePath] = useState('/')
  // The workspace's own wording (Settings → Terminology, lib/terminology).
  const [siteTerms, setSiteTerms] = useState<Record<string, string>>({})
  const NAV_TERM: Record<string, string> = { Ideas: 'nav_ideas', Roadmap: 'nav_roadmap', Updates: 'nav_updates', Help: 'nav_help' }

  // Load nav visibility from settings (DB-first, localStorage fallback)
  useEffect(() => {
    // The company's logo, resolved below — used as the favicon fallback when no
    // explicit faviconUrl is set, so a board keeps ITS icon in the tab instead
    // of Colvy's default.
    let companyLogo: string | null = null
    const applySettings = (s: any) => {
      if (s) {
        if (s.termValues && typeof s.termValues === 'object') setSiteTerms(s.termValues)
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
          // Dynamic favicon per company: explicit faviconUrl first, else the
          // company's own logo, and only then Colvy's default — so a board that
          // set a logo but no separate favicon keeps its own icon in the tab.
          // A company's site never falls back to Colvy's mark — the neutral icon
          // (lib/tenant-meta) instead.
          const onCompanyHost = (() => { const c = companyHost(window.location.hostname); return !!(c.slug || c.customHost) })()
          const favicon = s.faviconUrl || companyLogo || (onCompanyHost ? NEUTRAL_ICON : '/favicon.png')
          let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement
          if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
          link.href = favicon
          // Accent color
          if (s.accentColor) {
            document.documentElement.style.setProperty('--coral', s.accentColor)
            const r = parseInt(s.accentColor.slice(1, 3), 16)
            const g = parseInt(s.accentColor.slice(3, 5), 16)
            const b = parseInt(s.accentColor.slice(5, 7), 16)
            document.documentElement.style.setProperty('--peach', `rgba(${r}, ${g}, ${b}, 0.1)`)
          }
          // Light/dark (auto follows the system) and the seasonal theme
          // (lib/seasonal-themes), which can switch to dark while it runs.
          setAppearance({ themeMode: s.themeMode || 'light', seasonal: s.seasonal || {} })
        }
      }
    }

    const loadNav = async () => {
      try {
        // Detect company from hostname
        const h = typeof window !== 'undefined' ? window.location.hostname : ''
        // Custom help/board domains resolve their company by domain, so the nav,
        // logo, name and accent all belong to the customer, not Colvy.
        const { slug, customHost } = companyHost(h)
        const isCustomHost = !!customHost

        // Load settings for this specific company
        let q = (supabase as any).from('site_settings').select('*').eq('key', 'general')
        let resolvedCompanyId: string | null = null
        let brandSlug = slug
        if (slug || isCustomHost) {
          let co: any = null
          if (slug) {
            const r = await (supabase as any).from('companies').select('id,name,slug,logo_url,accent_color').eq('slug', slug).maybeSingle()
            co = r.data
          } else {
            const r = await (supabase as any).from('companies').select('id,name,slug,logo_url,accent_color').or(`help_domain.eq.${h},board_domain.eq.${h}`).maybeSingle()
            co = r.data
          }
          if (co) {
            resolvedCompanyId = co.id
            brandSlug = co.slug || slug
            companyLogo = co.logo_url || null
            setCompany(co)
            try { localStorage.setItem(slug ? `company_${co.slug || slug}` : `company_domain_${h}`, JSON.stringify(co)) } catch {}
            // Set the tab favicon to the company logo right away, so it's correct
            // even if there's no site_settings row (the applySettings path below).
            if (co.logo_url && typeof document !== 'undefined') {
              let link = document.querySelector("link[rel~='icon']") as HTMLLinkElement
              if (!link) { link = document.createElement('link'); link.rel = 'icon'; document.head.appendChild(link) }
              link.href = co.logo_url
            }
            if (co.accent_color && typeof document !== 'undefined') {
              document.documentElement.style.setProperty('--coral', co.accent_color)
              const r = parseInt(co.accent_color.slice(1,3), 16)
              const g = parseInt(co.accent_color.slice(3,5), 16)
              const b = parseInt(co.accent_color.slice(5,7), 16)
              document.documentElement.style.setProperty('--peach', `rgba(${r},${g},${b},0.1)`)
            }
            q = q.eq('company_id', co.id)
          } else {
            // On a company host but company not found — do NOT load unscoped
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
            localStorage.setItem(`site_settings_${brandSlug || 'colvy'}`, JSON.stringify(data.value))
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
      if (s.termValues && typeof s.termValues === 'object') setSiteTerms(s.termValues)
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
    const handleTermsUpdate = (e: Event) => { const d = (e as CustomEvent).detail; if (d && typeof d === 'object') setSiteTerms(d) }
    window.addEventListener('colvy-terminology-update', handleTermsUpdate)
    return () => { window.removeEventListener('colvy-nav-update', handleNavUpdate); window.removeEventListener('colvy-terminology-update', handleTermsUpdate) }
  }, [pathname])

  // Browser tab title on a company subdomain's signed-in pages:
  // "<Company>'s Admin", "<Company>'s Settings"… Public pages (board, roadmap,
  // announcements, help, polls, surveys, forms, booking) get their title from
  // the server (lib/tenant-meta) — overwriting it here replaced an article's
  // own title with "<Company>'s Help Center".
  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return
    const h = window.location.hostname
    const isSubdomain = h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com'
    if (!isSubdomain) return
    const slug = h.replace('.colvy.com', '')

    const pageName = (() => {
      const p = pathname || '/'
      if (p.startsWith('/admin/settings')) return 'Settings'
      if (p.startsWith('/admin')) return 'Admin'
      if (p.startsWith('/profile')) return 'Profile'
      if (p.startsWith('/signin')) return 'Sign In'
      if (p.startsWith('/signup')) return 'Sign Up'
      return null
    })()
    if (!pageName) return

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
      const host = companyHost(currentHost)
      const onSubdomain = !!(host.slug || host.customHost)

      try {
        let data: any = null
        let isTeamMember = false

        if (onSubdomain) {
          // On a company subdomain: the company shown is the SUBDOMAIN's company.
          // The user is only an admin here if they actually own it or are an elevated team member.
          const { data: coBySlug } = host.slug
            ? await (supabase as any).from('companies').select('*').eq('slug', host.slug).maybeSingle()
            : await (supabase as any).from('companies').select('*').or(`help_domain.eq.${host.customHost},board_domain.eq.${host.customHost}`).maybeSingle()
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
      const { slug, customHost } = companyHost(window.location.hostname)
      setIsSubdomain(!!(slug || customHost))
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
          try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
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
    return () => { subscription.unsubscribe(); document.removeEventListener('mousedown', closeMenuOnOutsideClick) }
  }, [])

  const handleLogout = async () => {
    setShowUserMenu(false)
    setShowDrawer(false)
    await supabase.auth.signOut({ scope: 'local' })
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
        const { count } = await inWorkspace((supabase as any)
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('is_read', false), companyIdRef.current)
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
            // Only for the workspace this tab is viewing. The same person can
            // belong to several (several Colvy subdomains open at once): another
            // workspace's notification isn't listed, counted, chimed or popped
            // up here, and opening it used to show that workspace's
            // conversation inside this one. On the root domain (no workspace)
            // nothing is filtered.
            const currentCo = companyIdRef.current
            if (currentCo && n.company_id && n.company_id !== currentCo) return

            // An open notifications panel adds it to its list straight away.
            try { window.dispatchEvent(new CustomEvent('colvy:notification', { detail: n })) } catch {}

            // A soft two-note chime — pleasant, quiet, and short. Synthesised so
            // there's no audio file to load, and it fails silently if the browser
            // blocks audio (which it does until the user has interacted).
            // The panel's Sound switch turns it off.
            if (notificationSoundOn()) try {
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
                try { window.focus() } catch {}
                // Route by notification type (inbox / orders-as-conversation /
                // tasks / idea / …) — not just conversations. window.location so
                // it works even when this tab was in the background.
                window.location.href = notificationPath(n)
                notif.close()
              }
            }
          }
        } catch {}
      })
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [user, company?.id])

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



  // Same source as the profile page: their display name first, then the email.
  const userInitial = (String(user?.user_metadata?.display_name || user?.user_metadata?.full_name || user?.email || 'A').trim()[0] || 'A').toUpperCase()
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
  // `/u/` = the customer secure-upload page. It carries its own branded card
  // header, so the app nav on top was redundant and left a big gap above the
  // card. Render it standalone like the other full-page routes.
  // Auth pages (sign in / up, password reset flows) are standalone: they carry
  // their own centered card and must NOT render the marketing/board nav, the user
  // menu, or the live-chat bubble on top — that chrome overlapped the reset form
  // and left an open menu that covered the screen with nothing to tap "outside".
  const isFullPageRoute = ['/landing', '/inbox-crm', '/pricing', '/product', '/solutions', '/compare', '/industries', '/channels', '/integrations', '/ai-assistant', '/ai-agents', '/phones', '/testimonials', '/features', '/referrals', '/custom/', '/f/', '/about', '/careers', '/blog', '/changelog', '/security', '/status', '/platform-admin', '/forms/', '/widget', '/auth', '/signin', '/signup', '/forgot-password', '/reset-password', '/u/', '/demo', '/book', '/oauth', '/pay/', '/for/', '/business-phone-number-australia', '/all-in-one-customer-platform', '/selling-chat', '/whatsapp-shared-inbox'].some(p => pathname?.startsWith(p)) || pathname === '/for'
  // admin.colvy.com is the Super Admin console — it has its own dark chrome, so
  // the marketing/board nav must never render on top of it (regardless of the
  // path the proxy serves it under). Whole host is full-page.
  const isPlatformHost = mounted && typeof window !== 'undefined' && window.location.hostname === 'admin.colvy.com'
  // Before mount we can't tell a marketing-host "/" (colvy.com, full-page landing)
  // from a board-host "/" (the ideas board, which wants the app header). Rendering
  // the app header on the server for colvy.com/ and then removing it once
  // `isMarketingRoot` resolves is exactly the load "flash" (a ghost of the app nav
  // over the landing's own nav). Treat "/" as full-page until mounted: the
  // marketing root then never shows the app header (no flash); the board home just
  // gains its header a beat later once the host is known. Same value on the server
  // and the first client render, so there's no hydration mismatch.
  const isRootPending = !mounted && pathname === '/'
  const isFullPage = isEmbed || isMarketingRoot || isFullPageRoute || isPlatformHost || isRootPending

  if (isFullPage) {
    // Colvy's own prospects need a way to reach us from the marketing site. Show
    // the Colvy live-chat bubble on marketing pages (routing into Colvy's own
    // support workspace), but NOT on auth / upload / widget / super-admin pages,
    // nor on a business's own public forms (their customers aren't our prospects).
    const authOrUtility = ['/signin', '/signup', '/forgot-password', '/reset-password', '/auth', '/u/', '/widget', '/platform-admin', '/book', '/oauth', '/pay/', '/forms/', '/f/'].some(p => pathname?.startsWith(p))
    const showMarketingChat = (isMarketingRoot || isFullPageRoute) && !authOrUtility && !isPlatformHost
    const supportSlug = process.env.NEXT_PUBLIC_COLVY_SUPPORT_SLUG || 'colvy'
    return (
      <>
        <Analytics />
        {children}
        <UpdateNotification accentColor={company?.accent_color} />
        {showMarketingChat && <LiveChat slug={supportSlug} />}
      </>
    )
  }

  // Unread count for the bell dot — fetched on load and kept fresh via realtime
  const fetchUnreadCount = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user.id) { setUnreadCount(0); return }
      const { count } = await inWorkspace((supabase as any)
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('user_id', session.user.id)
        .eq('is_read', false), companyIdRef.current)
      setUnreadCount(count || 0)
    } catch { setUnreadCount(0) }
  }

  const markNotificationAsRead = async (notificationId: string) => {
    try {
      await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId)
      
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
    } else if (notification.type === 'announcement') {
      // Board bell notifications from "Publish & notify" carry a link to the post.
      setShowNotifications(false)
      router.push(notificationPath(notification))
    } else if (notification.type === 'help' && notification.article_id) {
      setShowNotifications(false)
      router.push(`/help/${notification.article_id}`)
    } else if (notification.type === 'form' && notification.form_id) {
      setShowNotifications(false)
      router.push(`/forms/${notification.form_id}`)
    } else if (notification.type === 'settings') {
      setShowNotifications(false)
      router.push('/admin/settings')
    } else if (notification.type === 'task') {
      setShowNotifications(false)
      router.push('/admin/tasks')
    } else if (['chat', 'sms', 'call', 'order', 'ticket', 'cart', 'activity'].includes(notification.type)) {
      // CRM activity — go to the inbox (open the specific conversation if known).
      setShowNotifications(false)
      let convId = notification.conversation_id || notification.conversationId
      // Older SMS notifications didn't store a conversation id — resolve it from
      // the sender's phone number so the click still lands on the right thread.
      if (!convId) {
        const raw = String(notification.actor_name || '') + ' ' + String(notification.message || '')
        const phone = raw.match(/\+?\d[\d ]{6,}\d/)?.[0]
        if (phone) {
          try {
            const digits = phone.replace(/\D/g, '').slice(-9)
            if (digits.length >= 8) {
              const { data } = await (supabase as any).from('conversations')
                .select('id').ilike('sms_number', `%${digits}%`).order('last_message_at', { ascending: false }).limit(1)
              if (data?.[0]?.id) convId = data[0].id
            }
          } catch {}
        }
      }
      router.push(convId ? `/admin/inbox?conversation=${convId}` : '/admin/inbox')
    } else {
      // Fallback: any unrecognised type with a conversation goes to the inbox.
      setShowNotifications(false)
      if (notification.conversation_id) router.push(`/admin/inbox?conversation=${notification.conversation_id}`)
    }
  }

  return (
    <>
        <Analytics />
        {/* Header */}
        <header ref={headerRef} className="cv-app-header sticky top-0 z-40 backdrop-blur-md border-b bg-white/80" style={{ borderColor: 'var(--border)' }}>
          <style>{`@media (min-width: 861px) { .cv-hdr-logo-admin { display: none !important; } }`}</style>
          <nav className="h-14 px-6 flex items-center justify-between">
            {/* Left: logo */}
            <div className="flex items-center gap-2">
              {/* On admin pages the sidebar drawer slides in from the LEFT, so the
                  hamburger belongs on the left too (next to the menu it opens).
                  Marketing pages keep their hamburger on the right (their drawer
                  opens from the right). */}
              {pathname?.startsWith('/admin') && (
                <button
                  className="md:hidden p-2 -ml-2 mr-0.5 rounded-lg hover:bg-gray-100 transition-smooth cursor-pointer"
                  onClick={() => window.dispatchEvent(new CustomEvent('colvy:toggle-admin-sidebar'))}
                  aria-label="Menu">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
              )}
              {/* Logo */}
              {/* On admin pages the rail shows the workspace logo (wider than
                  860px), so the header doesn't repeat it there. */}
              <Link href={isSubdomain ? homePath : '/'} className={`flex items-center gap-2 font-bold text-lg transition-smooth hover:opacity-70${pathname?.startsWith('/admin') ? ' cv-hdr-logo-admin' : ''}`}>
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
                  <img src="/icon-512.png" alt="Colvy" style={{ width: 28, height: 28, borderRadius: 8, display: 'block', flexShrink: 0 }} />
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
                // Apply the saved drag-to-reorder sequence (Site Navigation
                // settings) — items were always rendered in NAV_ITEMS' fixed
                // array order regardless of navOrder, so dragging "Help" to the
                // top never actually changed where it appeared here.
                const ordered = isOnBoard
                  ? [...items].sort((a, b) => {
                      const ai = navOrder.indexOf(a.label), bi = navOrder.indexOf(b.label)
                      if (ai === -1 && bi === -1) return 0
                      if (ai === -1) return 1
                      if (bi === -1) return -1
                      return ai - bi
                    })
                  : items
                return ordered
                .filter(item => {
                  // Inside the admin the left sidebar already covers navigation, so
                  // the top board menu (Help/Ideas/Roadmap/Updates) is redundant —
                  // hide it once you're in /admin.
                  if (pathname?.startsWith('/admin')) return false
                  if (isOnBoard && navVisibility[item.label as keyof typeof navVisibility] === false) return false
                  const isBoardItem = ['Ideas', 'Roadmap', 'Updates', 'Help'].includes(item.label) && item.href.startsWith('/') && !item.href.startsWith('/product')
                  // Colvy's own sales items never belong on a company's board/help site.
                  const isMarketingItem = item.label === 'Features' || item.label === 'Product' || item.label === 'Pricing'
                  if (!isOnBoard && isBoardItem) return false
                  if (isOnBoard && isMarketingItem) return false
                  // Pricing is unnecessary once the user is logged in
                  if (item.label === 'Pricing' && user) return false
                  return true
                }).map(item => (
                <Link
                  key={item.href}
                  // (see the filter above; center nav is hidden inside /admin)
                  // "Ideas" always needs ?view=ideas so it reaches the ideas
                  // board even when another page (e.g. Help) is the configured
                  // homepage — bare "/" would just redirect straight past it.
                  // item.href itself stays "/" so the active-state checks below
                  // (which compare against pathname, without the query) still work.
                  href={item.label === 'Ideas' ? '/?view=ideas' : item.href}
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
                    {isOnBoard && NAV_TERM[item.label] ? termFor(siteTerms, NAV_TERM[item.label]) : item.label}
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
                      <span aria-label={`${unreadCount} unread`} style={{ position: 'absolute', top: 1, right: 0, minWidth: 17, height: 17, padding: '0 4px', boxSizing: 'border-box', borderRadius: 999, border: '2px solid #fff', background: 'var(--coral)', color: '#fff', fontSize: 9.5, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}>{unreadCount > 99 ? '99+' : unreadCount}</span>
                    )}
                  </button>
                  
                  {showNotifications && (
                    <>
                      <div className="fixed inset-0 z-30" onClick={() => setShowNotifications(false)} />
                      {/* Phones: a sheet pinned 8px inside the screen edges
                          (anchored to the bell it ran off the left edge). */}
                      <style>{`@media (max-width: 640px) { .notif-panel { position: fixed !important; top: 64px !important; left: 8px !important; right: 8px !important; margin-top: 0 !important; z-index: 1000 !important; } }`}</style>
                      <div className="notif-panel absolute top-full right-0 mt-2 z-40">
                        <NotificationsPanel userId={user.id} companyId={company?.id || null} unreadCount={unreadCount}
                          onUnread={d => setUnreadCount(c => d === 'zero' ? 0 : Math.max(0, c + d))}
                          onOpen={handleNotificationClick}
                          onClose={() => setShowNotifications(false)}
                          settingsHref={pathname?.startsWith('/admin') ? '/admin/crm-settings/profile#notifications' : null} />
                      </div>
                    </>
                  )}

                  </div>

                  {(() => {
                    const account = (inRail: boolean) => (
                    <div ref={userMenuRef} className={inRail ? 'cv-acct-rail' : 'relative'} id="colvy-user-btn">
                      {inRail ? (
                        <button type="button" onClick={(e) => { e.stopPropagation(); setShowUserMenu(!showUserMenu) }}
                          className="cv-acct-rail-btn" aria-label="Your account" aria-haspopup="menu" aria-expanded={showUserMenu}
                          title={user?.user_metadata?.display_name || user.email}
                          style={{ background: avatarUrl ? '#fff' : 'var(--coral)' }}>
                          {avatarUrl ? <img src={avatarUrl} alt="" /> : userInitial}
                          <span className="cv-acct-dot" title="Online" />
                        </button>
                      ) : (
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
                      )}
                    
                      {showUserMenu && (() => {
                        // Account menu: who you are, then your things, then the
                        // business's, then sign out. Grouped and plainly named.
                        const close = () => setShowUserMenu(false)
                        const I = (d: React.ReactNode) => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
                        const name = user?.user_metadata?.display_name || user.email
                        const inAdmin = !!pathname?.startsWith('/admin')
                        return (
                        <>
                          <div className="fixed inset-0 z-30" onClick={close} />
                          <div id="colvy-user-menu" role="menu" className={`cv-acct absolute z-40 ${inRail ? 'cv-acct-up' : 'top-full right-0 mt-2'}`}>
                            <div className="cv-acct-head">
                              <span className="cv-acct-av" style={{ background: avatarUrl ? undefined : 'var(--coral)' }}>
                                {avatarUrl ? <img src={avatarUrl} alt="" /> : userInitial}
                              </span>
                              <span style={{ minWidth: 0, flex: 1 }}>
                                <span className="cv-acct-name">{name}</span>
                                <span className="cv-acct-mail">{user.email}</span>
                              </span>
                            </div>
                            <div className="cv-acct-sep" />
                            {isCompanyOwner && !inAdmin && (
                              <a href="/admin" onClick={close} role="menuitem" className="cv-acct-item">
                                {I(<><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></>)}
                                Open dashboard
                              </a>
                            )}
                            <Link href="/profile" onClick={close} role="menuitem" className="cv-acct-item">
                              {I(<><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></>)}
                              Your profile
                            </Link>
                            {isCompanyOwner && <>
                              <Link href="/admin/settings" onClick={close} role="menuitem" className="cv-acct-item">
                                {I(<><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" /></>)}
                                Business settings
                              </Link>
                              <Link href="/admin/billing" onClick={close} role="menuitem" className="cv-acct-item">
                                {I(<><rect x="2.5" y="5" width="19" height="14" rx="2.5" /><path d="M2.5 10h19" /></>)}
                                Plan &amp; billing
                              </Link>
                            </>}
                            {/* Their private chat with Colvy (components/inbox/ColvyChat):
                                opened in place when the inbox is already showing. */}
                            {inAdmin && (
                              <Link href="/admin/inbox?colvy=1" role="menuitem" className="cv-acct-item"
                                onClick={e => { close(); if (pathname?.startsWith('/admin/inbox')) { e.preventDefault(); window.dispatchEvent(new Event('colvy:open')) } }}>
                                {I(<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.9-.9L3 21l1.9-4.6A8 8 0 0 1 3.5 11.5 8.5 8.5 0 0 1 12 3a8.4 8.4 0 0 1 9 8.5z" />)}
                                Message Colvy
                              </Link>
                            )}
                            <div className="cv-acct-sep" />
                            <button type="button" onClick={handleLogout} role="menuitem" className="cv-acct-item cv-acct-out" data-no-press>
                              {I(<><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></>)}
                              Sign out
                            </button>
                          </div>
                        </>
                        )
                      })()}
                    </div>
                    )
                    return railSlot ? createPortal(account(true), railSlot) : account(false)
                  })()}
                  {isCompanyOwner && !pathname?.startsWith('/admin') && (
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
                    className="hidden md:inline-flex px-3 py-1.5 md:px-4 md:py-2 rounded-lg text-xs md:text-sm font-medium transition-smooth hover:opacity-70"
                    style={{ color: 'var(--slate)' }}>
                    Sign in
                  </Link>
                  {!isSubdomain && <Link
                    href="/signup"
                    onClick={() => setShowDrawer(false)}
                    className="hidden md:inline-flex px-3 py-1.5 md:px-5 md:py-2.5 rounded-lg text-xs md:text-sm font-semibold text-white transition-smooth press-effect cursor-pointer"
                    style={{ background: 'var(--coral)' }}>
                    Get started
                  </Link>}
                </>
              )}

              {/* Mobile hamburger — marketing pages only (their drawer opens from
                  the right). On admin pages it's rendered on the LEFT instead. */}
              {!pathname?.startsWith('/admin') && (
                <button
                  className="md:hidden p-2 -mr-1 rounded-lg hover:bg-gray-100 transition-smooth cursor-pointer"
                  onClick={() => setShowDrawer(!showDrawer)}
                  aria-label="Menu">
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
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
                {[...NAV_ITEMS].sort((a, b) => {
                  const ai = navOrder.indexOf(a.label), bi = navOrder.indexOf(b.label)
                  if (ai === -1 && bi === -1) return 0
                  if (ai === -1) return 1
                  if (bi === -1) return -1
                  return ai - bi
                }).filter(item => {
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
                    href={item.label === 'Ideas' ? '/?view=ideas' : item.href}
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
                      {(isSubdomain || isCompanyOwner) && NAV_TERM[item.label] ? termFor(siteTerms, NAV_TERM[item.label]) : item.label}
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
                    {!isSubdomain && <Link href="/signup" onClick={() => setShowDrawer(false)}
                      className="block px-4 py-3 rounded-lg text-sm font-semibold text-white text-center cursor-pointer"
                      style={{ background: 'var(--coral)' }}>
                      Get started
                    </Link>}
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
            <TerminologyProvider terms={siteTerms}>
              {children}
            </TerminologyProvider>
          </ToastProvider>
        </main>
        {/* Public-facing chat widget — hidden on the admin panel where staff
            work (they don't need to open a support chat with themselves). */}
        {!pathname?.startsWith('/admin') && !pathname?.startsWith('/f/') && !pathname?.startsWith('/forms/') && <LiveChat />}
        <UpdateNotification accentColor={company?.accent_color} />
    </>
  )
}
