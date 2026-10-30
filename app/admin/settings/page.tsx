'use client'

import OverviewMetrics from '@/components/settings/OverviewMetrics'
import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useToast, ToastContainer } from '@/lib/toast'
import { useEntitlements } from '@/lib/entitlements-client'
import { confirmDialog } from '@/components/ConfirmDialog'
import TerminologySettings from '@/components/TerminologySettings'
import { cleanTerms } from '@/lib/terminology'
import { WP_PLUGIN_VERSION } from '@/lib/wp-plugin'
import ThemeSettings from '@/components/settings/ThemeSettings'
import { setAppearance, type SeasonalConfig } from '@/lib/seasonal-themes'

// Colvy-branded CNAME target shown to customers for custom domains — a
// colvy.com host that itself points at our platform, so the underlying
// provider is never exposed. Overridable via env.
const CUSTOM_CNAME = process.env.NEXT_PUBLIC_CUSTOM_CNAME_TARGET || 'cname.colvy.com'

// Shopify's App Store rules: merchants mustn't edit theme code. Shopify stores
// add Colvy from the theme editor (app embed) instead of pasting the snippet.
function ShopifyNote() {
  return (
    <div className="flex items-start gap-2 mb-3 p-2.5 rounded-lg text-xs" style={{ background: 'var(--canvas, #f8f8fa)', color: 'var(--slate)', lineHeight: 1.5 }}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#008060" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: 1 }} aria-hidden="true"><path d="M5 8h14l-1.2 11.2a2 2 0 0 1-2 1.8H8.2a2 2 0 0 1-2-1.8L5 8z"/><path d="M9 10V6a3 3 0 0 1 6 0v4"/></svg>
      <span>On Shopify? Don’t paste code into your theme. Turn Colvy on from <Link href="/admin/integrations/shopify" className="font-semibold underline" style={{ color: 'var(--ink)' }}>Integrations → Shopify</Link> → On your store.</span>
    </div>
  )
}

export default function SettingsPage() {
  const router = useRouter()
  const { toasts, showToast, removeToast } = useToast()
  // Branding removal is a paid entitlement. Assume allowed until the async
  // resolve returns so we never briefly lock a paying customer's control.
  const { hasFeature, ready: entReady } = useEntitlements()
  const brandingEntitled = !entReady || hasFeature('removeBranding')
  // Custom domains are an Everything-plan feature. Assume allowed until the
  // async resolve returns, so a paying customer's controls never flash locked.
  const customDomainEntitled = !entReady || hasFeature('customDomain')
  const [user, setUser] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loadedCompany, setLoadedCompany] = useState(false)
  const [companyName, setCompanyName] = useState('YourApp')
  const [logoUrl, setLogoUrl] = useState('')
  const [faviconUrl, setFaviconUrl] = useState('')
  const [ogImageUrl, setOgImageUrl] = useState('')
  const [logoLink, setLogoLink] = useState('')
  const [customScript, setCustomScript] = useState('')
  // How people can sign in (Sign-in & security). Saved in site_settings
  // 'general' as signIn; the sign-in page reads it. Email & password is always on.
  const [signIn, setSignIn] = useState<{ google: boolean; github: boolean; magicLink: boolean }>({ google: true, github: true, magicLink: false })
  const [signInSaving, setSignInSaving] = useState(false)
  const [navIdeas, setNavIdeas] = useState(true)
  const [navRoadmap, setNavRoadmap] = useState(true)
  const [navAnnouncements, setNavAnnouncements] = useState(true)
  const [navHelp, setNavHelp] = useState(true)
  const [navOrder, setNavOrder] = useState(['Ideas', 'Roadmap', 'Updates', 'Help Centre'])
  // Widget Configuration
  const [widgetFeedback, setWidgetFeedback] = useState(true)
  const [widgetRoadmap, setWidgetRoadmap] = useState(true)
  const [widgetUpdates, setWidgetUpdates] = useState(true)
  const [widgetForms, setWidgetForms] = useState(true)
  const [widgetPolls, setWidgetPolls] = useState(true)
  const [widgetSurveys, setWidgetSurveys] = useState(true)
  const [widgetKnowledgeBase, setWidgetKnowledgeBase] = useState(true)
  const [widgetChat, setWidgetChat] = useState(true)
  const [widgetOrder, setWidgetOrder] = useState(['Chat', 'Feedback', 'Roadmap', 'Updates', 'Knowledge Base'])
  const [dragWidgetItem, setDragWidgetItem] = useState<string | null>(null)
  // Webhooks
  const [webhooks, setWebhooks] = useState<any[]>([])
  const [webhookSecret] = useState(() => typeof crypto !== 'undefined' ? crypto.randomUUID?.() || '20d12d0e-f851-4b1b-ac88-d31637988152' : '20d12d0e-f851-4b1b-ac88-d31637988152')
  const [newWebhookEvent, setNewWebhookEvent] = useState('')
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  // API Keys
  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [pluginKey, setPluginKey] = useState('')
  const [showPluginKey, setShowPluginKey] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState('')
  // Terminology
  const [termValues, setTermValues] = useState<Record<string, string>>({})
  // Other open tabs of the board pick up new wording as you type (AppChrome and
  // TerminologyProvider listen for this).
  useEffect(() => {
    try { window.dispatchEvent(new CustomEvent('colvy-terminology-update', { detail: cleanTerms(termValues) })) } catch {}
  }, [termValues])
  const [privacyMode, setPrivacyMode] = useState('public')
  const [slugEdit, setSlugEdit] = useState(() => {
    if (typeof window === 'undefined') return ''
    const h = window.location.hostname
    if (h.endsWith('.colvy.com') && h !== 'colvy.com') return h.replace('.colvy.com', '')
    return ''
  })
  const [slugStatus, setSlugStatus] = useState<'idle'|'checking'|'available'|'taken'|'invalid'>('idle')
  const [slugTimer, setSlugTimer] = useState<any>(null)
  const [widgetCopied, setWidgetCopied] = useState('')
  const [categories, setCategories] = useState<string[]>(['New Feature', 'Improvement', 'Fix', 'Announcement'])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [defaultHomepage, setDefaultHomepage] = useState('ideas')
  const [removingDemo, setRemovingDemo] = useState(false)
  const [demoRemoved, setDemoRemoved] = useState(false)
  const [dragNavItem, setDragNavItem] = useState<string | null>(null)
  // Styling
  const [accentColor, setAccentColor] = useState('#ff7a6b')
  const [themeMode, setThemeMode] = useState<'light' | 'dark' | 'auto'>('light')
  // Halloween and the other seasonal themes (lib/seasonal-themes).
  const [seasonal, setSeasonal] = useState<SeasonalConfig>({})
  const [borderRadius, setBorderRadius] = useState<'sharp' | 'soft' | 'rounded'>('soft')
  // Email customization
  const [emailFromName, setEmailFromName] = useState('')
  const [emailReplyTo, setEmailReplyTo] = useState('')
  const [emailSignature, setEmailSignature] = useState('')
  // White label
  // On by default: plans that include branding removal hide the badge unless
  // the workspace turns this off (saved as showPoweredBy; see lib/branding).
  const [hidePoweredBy, setHidePoweredBy] = useState(true)
  const [customDomain, setCustomDomain] = useState('')
  const [boardDomain, setBoardDomain] = useState('')       // e.g. feedback.acme.com
  const [helpDomain, setHelpDomain] = useState('')         // e.g. help.acme.com
  const [domainVerifying, setDomainVerifying] = useState<string | null>(null)
  const [domainStatus, setDomainStatus] = useState<Record<string, 'unverified'|'verifying'|'verified'|'pending'|'error'>>({})
  // A verified domain is soft-locked; "Change" flips this to re-open the field.
  const [domainEditing, setDomainEditing] = useState<Record<string, boolean>>({})
  // Guest access
  const [guestVotingEnabled, setGuestVotingEnabled] = useState(true)
  const [guestSubmitEnabled, setGuestSubmitEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const saveSignIn = async (next: { google: boolean; github: boolean; magicLink: boolean }) => {
    const before = signIn
    setSignIn(next)
    const cid = company?.id
    if (!cid) { setSignIn(before); showToast('Workspace not loaded yet. Try again in a moment.', 'error', 3000); return }
    setSignInSaving(true)
    try {
      // Through the settings API (members only), keeping everything else in the row.
      const cur = await authFetch(`/api/admin/settings?company_id=${cid}`).then(r => r.json())
      const value = { ...(cur?.settings?.value || {}), signIn: next }
      const res = await authFetch('/api/admin/settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ company_id: cid, value }) })
      const out = await res.json().catch(() => ({}))
      if (!res.ok || out.error) throw new Error(out.error || 'save failed')
      try { localStorage.setItem(`site_settings_${company?.slug || 'colvy'}`, JSON.stringify(value)) } catch {}
      showToast('Saved', 'success', 1500)
    } catch (e: any) {
      setSignIn(before)
      showToast('Couldn’t save: ' + (e?.message || 'try again'), 'error', 4000)
    } finally { setSignInSaving(false) }
  }
  // Miscellaneous settings
  const [allowAnnSubsc, setAllowAnnSubsc] = useState(true)
  const [allowAnnComments, setAllowAnnComments] = useState(true)
  const [showAnnComments, setShowAnnComments] = useState<'always' | 'admins'>('always')
  const [disableAnnReactions, setDisableAnnReactions] = useState(false)
  const [disableAnimGifs, setDisableAnimGifs] = useState(false)
  const [disableCommentReactions, setDisableCommentReactions] = useState(false)
  const [allowIdeaComments, setAllowIdeaComments] = useState(true)
  const [showIdeaMRR, setShowIdeaMRR] = useState(false)
  const [showIdeaNumber, setShowIdeaNumber] = useState(true)
  const [showRoadmapDesc, setShowRoadmapDesc] = useState(true)
  const [showIdeaDate, setShowIdeaDate] = useState<'always' | 'admins' | 'never'>('always')
  const [showIdeaActivity, setShowIdeaActivity] = useState<'always' | 'admins'>('always')
  const [requireIdeaTopic, setRequireIdeaTopic] = useState(false)
  const [activeSettingsTab, setActiveSettingsTab] = useState(() => {
    if (typeof window !== 'undefined') {
      const hash = window.location.hash.replace('#', '')
      const valid = ['overview','general','theme','emails','whitelabel','auth','nav','terminology','webhooks','api','privacy','misc','widget','languages','categories']
      if (valid.includes(hash)) return hash
    }
    return 'general'
  })

  // The tab follows the address's #hash (set by the Settings menu, components/settings).

  // Overview metrics (real data, fetched when the Overview tab is open).
  const [overview, setOverview] = useState<any>(null)
  const [overviewDays, setOverviewDays] = useState(30)
  const [overviewLoading, setOverviewLoading] = useState(false)
  useEffect(() => {
    const cid = company?.id
    if (activeSettingsTab !== 'overview' || !cid) return
    setOverviewLoading(true)
    authFetch(`/api/company/overview?companyId=${cid}&days=${overviewDays}`)
      .then(r => r.json())
      .then(d => setOverview(d))
      .catch(() => {})
      .finally(() => setOverviewLoading(false))
  }, [activeSettingsTab, company?.id, overviewDays])

  // Listen to hash changes to retain tab on reload
  useEffect(() => {
    // On mount, sync hash to state immediately
    const hash = window.location.hash.replace('#', '')
    const valid = ['overview','general','theme','emails','whitelabel','auth','nav','terminology','webhooks','api','privacy','misc','widget','languages','categories']
    if (valid.includes(hash) && hash !== activeSettingsTab) {
      setActiveSettingsTab(hash)
    }
    
    // Then listen for future changes
    const handleHashChange = () => {
      const newHash = window.location.hash.replace('#', '')
      if (valid.includes(newHash)) {
        setActiveSettingsTab(newHash)
      }
    }
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  // (Widget auto-save is handled by the main debounced auto-save effect below,
  //  which includes all widget deps and has proper first-render/loaded guards.)

  useEffect(() => {
    const init = async () => {
      const { data: authData } = await supabase.auth.getSession()
      const u = authData.session?.user
      if (!u) return
      setUser(u)

      // Load company — hostname slug FIRST (this is THE board being administered),
      // then owner_id as a fallback for the main domain / localhost.
      // NOTE: `co` must live OUTSIDE this try block — it is used again below when
      // loading site_settings. Declaring it inside made settings loading crash
      // and silently fall back to unscoped (cross-company) settings.
      let co: any = null
      try {
        // Primary: look up by hostname slug (e.g. funnynepal.colvy.com)
        if (typeof window !== 'undefined') {
          const h = window.location.hostname
          if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
            const slug = h.replace('.colvy.com', '')
            const { data: coBySlug } = await (supabase as any)
              .from('companies').select('*').eq('slug', slug).maybeSingle()
            if (coBySlug) co = coBySlug
          }
        }

        // Fallback: the signed-in user's own company (main domain / localhost)
        if (!co) {
          const { data: coByOwner } = await (supabase as any)
            .from('companies').select('*').eq('owner_id', u.id).maybeSingle()
          co = coByOwner
        }

        if (co) {
          setCompany(co)
          // The plugin / API key is server-only now (company_secrets); the
          // route returns it, creating it the first time.
          authFetch(`/api/company/plugin-key?companyId=${co.id}`)
            .then(r => r.json()).then(d => { if (d?.key) setPluginKey(d.key) }).catch(() => {})
          if (co.name) setCompanyName(co.name)
          if (co.logo_url) setLogoUrl(co.logo_url)
          if (co.accent_color) setAccentColor(co.accent_color)
          if (co.board_domain) setBoardDomain(co.board_domain)
          if (co.slug) setSlugEdit(co.slug)
          if (co.help_domain) setHelpDomain(co.help_domain)
          // Re-check live status on load so the Verified badge (and soft-lock)
          // survive a reload without relying on the user having saved settings.
          const recheck = (key: string, dom?: string) => {
            if (!dom) return
            authFetch(`/api/verify-domain?domain=${encodeURIComponent(dom)}&companyId=${co.id}`)
              .then(r => r.json())
              .then(d => { if (d.verified) setDomainStatus(p => ({ ...p, [key]: 'verified' })) })
              .catch(() => {})
          }
          recheck('board', co.board_domain)
          recheck('help', co.help_domain)
        }
      } catch (e: any) {
        console.warn('Company fetch failed:', e.message)
      }
      setLoadedCompany(true)

      // Load site_settings scoped to THIS company (via server API — same path as save)
      try {
        let settingsData: any = null
        console.log('[SETTINGS LOAD] Looking for settings with company_id:', co?.id)
        if (co?.id) {
          const res = await authFetch(`/api/admin/settings?company_id=${co.id}`)
          const result = await res.json()
          console.log('[SETTINGS LOAD] Query result:', { found: !!result.settings, error: result.error })
          settingsData = result.settings || null
        }
        // Fallback: unscoped (legacy) — ONLY when no company could be resolved.
        // If a company IS resolved but has no scoped row yet, we must NOT load
        // the unscoped row (it may belong to another company / the platform).
        if (!settingsData && !co?.id) {
          console.log('[SETTINGS LOAD] No company context, trying legacy fallback...')
          const { data: rows } = await (supabase as any).from('site_settings').select('*')
            .eq('key', 'general').is('company_id', null)
            .order('updated_at', { ascending: false })
            .limit(1)
          settingsData = rows?.[0] || null
        }
        const data = settingsData
        if (data?.value) {
          const s = data.value
          console.log('[SETTINGS LOAD] ✅ Loaded settings:', {
            faviconUrl: s.faviconUrl || '(empty)',
            ogImageUrl: s.ogImageUrl || '(empty)',
            defaultHomepage: s.defaultHomepage || '(empty)',
            privacyMode: s.privacyMode || '(empty)',
          })
          // Only set favicon if it belongs to THIS company's settings
          if (s.faviconUrl) setFaviconUrl(s.faviconUrl)
          else setFaviconUrl('')
          if (s.ogImageUrl) setOgImageUrl(s.ogImageUrl)
          else setOgImageUrl('')
          if (s.logoLink) setLogoLink(s.logoLink)
          if (s.customScript) setCustomScript(s.customScript)
          if (s.signIn && typeof s.signIn === 'object') setSignIn(v => ({ ...v, ...s.signIn }))
          if (s.navIdeas !== undefined) setNavIdeas(s.navIdeas)
          if (s.navRoadmap !== undefined) setNavRoadmap(s.navRoadmap)
          if (s.navAnnouncements !== undefined) setNavAnnouncements(s.navAnnouncements)
          if (s.navHelp !== undefined) setNavHelp(s.navHelp)
          if (s.navOrder && Array.isArray(s.navOrder)) setNavOrder(s.navOrder)
          if (s.widgetChat !== undefined) setWidgetChat(s.widgetChat)
          if (s.widgetFeedback !== undefined) setWidgetFeedback(s.widgetFeedback)
          if (s.widgetRoadmap !== undefined) setWidgetRoadmap(s.widgetRoadmap)
          if (s.widgetUpdates !== undefined) setWidgetUpdates(s.widgetUpdates)
          if (s.widgetKnowledgeBase !== undefined) setWidgetKnowledgeBase(s.widgetKnowledgeBase)
          if (s.widgetOrder && Array.isArray(s.widgetOrder)) {
            // Merge saved order with the current tab set: keep saved positions,
            // drop tabs that no longer exist (Forms/Polls/Surveys), and append
            // any newly-added tabs (e.g. Chat) that aren't in the saved order.
            const valid = ['Chat', 'Feedback', 'Roadmap', 'Updates', 'Knowledge Base']
            const kept = s.widgetOrder.filter((x: string) => valid.includes(x))
            const missing = valid.filter(v => !kept.includes(v))
            // New tabs like Chat go to the FRONT so they're discoverable.
            setWidgetOrder([...missing, ...kept])
          }
          if (s.themeMode) setThemeMode(s.themeMode)
          if (s.seasonal && typeof s.seasonal === 'object') setSeasonal(s.seasonal)
          if (s.borderRadius) setBorderRadius(s.borderRadius)
          if (s.emailFromName) setEmailFromName(s.emailFromName)
          if (s.emailReplyTo) setEmailReplyTo(s.emailReplyTo)
          if (s.emailSignature) setEmailSignature(s.emailSignature)
          // The old hidePoweredBy key was auto-saved as false for everyone, so
          // only an explicit showPoweredBy choice counts.
          setHidePoweredBy(s.showPoweredBy !== true)
          if (s.domainStatus) setDomainStatus(s.domainStatus)
          if (s.guestVotingEnabled !== undefined) setGuestVotingEnabled(s.guestVotingEnabled)
          if (s.guestSubmitEnabled !== undefined) setGuestSubmitEnabled(s.guestSubmitEnabled)
          if (s.allowAnnSubsc !== undefined) setAllowAnnSubsc(s.allowAnnSubsc)
          if (s.allowAnnComments !== undefined) setAllowAnnComments(s.allowAnnComments)
          if (s.showAnnComments) setShowAnnComments(s.showAnnComments)
          if (s.disableAnnReactions !== undefined) setDisableAnnReactions(s.disableAnnReactions)
          if (s.disableAnimGifs !== undefined) setDisableAnimGifs(s.disableAnimGifs)
          if (s.disableCommentReactions !== undefined) setDisableCommentReactions(s.disableCommentReactions)
          if (s.allowIdeaComments !== undefined) setAllowIdeaComments(s.allowIdeaComments)
          if (s.showIdeaMRR !== undefined) setShowIdeaMRR(s.showIdeaMRR)
          if (s.showIdeaNumber !== undefined) setShowIdeaNumber(s.showIdeaNumber)
          if (s.showRoadmapDesc !== undefined) setShowRoadmapDesc(s.showRoadmapDesc)
          if (s.showIdeaDate) setShowIdeaDate(s.showIdeaDate)
          if (s.showIdeaActivity) setShowIdeaActivity(s.showIdeaActivity)
          if (s.requireIdeaTopic !== undefined) setRequireIdeaTopic(s.requireIdeaTopic)
          if (s.termValues) setTermValues(s.termValues)
          if (s.privacyMode) setPrivacyMode(s.privacyMode)
          // Also support loading from is_private boolean (for backward compatibility)
          if (s.is_private !== undefined && !s.privacyMode) {
            setPrivacyMode(s.is_private ? 'private' : 'public')
          }
          if (s.categories && Array.isArray(s.categories)) setCategories(s.categories)
          if (s.defaultHomepage) setDefaultHomepage(s.defaultHomepage)
          else setDefaultHomepage('ideas') // Default to ideas if not set
          const slugKey = typeof window !== 'undefined' ? (window.location.hostname.replace('.colvy.com','') || 'colvy') : 'colvy'
          if (typeof window !== 'undefined') localStorage.setItem(`site_settings_${slugKey}`, JSON.stringify(s))
        }
      } catch {
        try {
          const s = JSON.parse(localStorage.getItem('site_settings') || '{}')
          if (s.signIn && typeof s.signIn === 'object') setSignIn(v => ({ ...v, ...s.signIn }))
          if (s.navIdeas !== undefined) setNavIdeas(s.navIdeas)
          if (s.navRoadmap !== undefined) setNavRoadmap(s.navRoadmap)
          if (s.navAnnouncements !== undefined) setNavAnnouncements(s.navAnnouncements)
        } catch {}
      }
      // Settings are now fully loaded — auto-save may run from here on.
      // Small delay lets React flush the loaded values before the gate opens.
      setTimeout(() => { settingsLoadedRef.current = true }, 300)
    }
    init()
  }, [])

  // Auto-save: debounced — fires 1.2s after the user stops typing/changing settings
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)
  const settingsLoadedRef = useRef(false)
  // Theme appearance and the seasonal theme show as soon as they're changed.
  useEffect(() => {
    if (settingsLoadedRef.current) setAppearance({ themeMode, seasonal })
  }, [themeMode, seasonal])
  // So does the brand colour (the admin wears it too).
  useEffect(() => {
    if (!settingsLoadedRef.current || !/^#[0-9a-f]{6}$/i.test(accentColor)) return
    const n = parseInt(accentColor.slice(1), 16)
    document.documentElement.style.setProperty('--coral', accentColor)
    document.documentElement.style.setProperty('--peach', `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, 0.1)`)
  }, [accentColor])
  const isFirstRender = useRef(true)
  useEffect(() => {
    // Skip auto-save on initial mount (before data loads)
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (!loadedCompany) return
    // CRITICAL: never auto-save until the saved settings have fully loaded.
    // The load itself triggers many state changes across renders; auto-saving
    // mid-load wrote default values (e.g. navOrder) over the saved settings,
    // which is why navigation kept reverting.
    if (!settingsLoadedRef.current) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      handleSave()
    }, 1200)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [
    companyName, logoUrl, faviconUrl, ogImageUrl, logoLink, customScript,
    navIdeas, navRoadmap, navAnnouncements, navHelp, navOrder,
    widgetChat, widgetFeedback, widgetRoadmap, widgetUpdates, widgetForms, widgetPolls, widgetSurveys, widgetKnowledgeBase, widgetOrder,
    accentColor, themeMode, seasonal, borderRadius,
    emailFromName, emailReplyTo, emailSignature,
    hidePoweredBy, boardDomain, helpDomain,
    guestVotingEnabled, guestSubmitEnabled, termValues, privacyMode,
    allowAnnSubsc, allowAnnComments, showAnnComments, disableAnnReactions,
    disableAnimGifs, disableCommentReactions, allowIdeaComments, showIdeaMRR,
    showIdeaNumber, showRoadmapDesc, showIdeaDate, showIdeaActivity, requireIdeaTopic, categories, defaultHomepage,
  ])

  const handleSave = async (isManualSave: boolean = false, overrides?: Record<string, any>) => {
    setSaving(true)
    
    // Wait for company to be loaded
    if (!loadedCompany) {
      if (isManualSave) showToast('Loading settings... please wait', 'info', 2000)
      setSaving(false)
      return
    }
    
    if (!company?.id) {
      if (isManualSave) showToast('Error: Company information not available', 'error', 4000)
      setSaving(false)
      return
    }
    
    const settingsData = {
      companyName, logoUrl, faviconUrl, ogImageUrl, logoLink, customScript,
      navIdeas, navRoadmap, navAnnouncements, navHelp, navOrder,
      widgetChat, widgetFeedback, widgetRoadmap, widgetUpdates, widgetForms, widgetPolls, widgetSurveys, widgetKnowledgeBase, widgetOrder,
      accentColor, themeMode, seasonal, borderRadius,
      emailFromName, emailReplyTo, emailSignature,
      hidePoweredBy, showPoweredBy: !hidePoweredBy, customDomain, boardDomain, helpDomain, domainStatus,
      guestVotingEnabled, guestSubmitEnabled, termValues: cleanTerms(termValues), privacyMode, categories, defaultHomepage,
      allowAnnSubsc, allowAnnComments, showAnnComments, disableAnnReactions,
      disableAnimGifs, disableCommentReactions, allowIdeaComments, showIdeaMRR,
      showIdeaNumber, showRoadmapDesc, showIdeaDate, showIdeaActivity, requireIdeaTopic,
      // The whole row is replaced on save, so the sign-in choices ride along.
      signIn,
    }
    
    const companyId = company.id
    console.log('[SETTINGS SAVE] Saving with companyId:', companyId)
    console.log('[SETTINGS SAVE] Settings to save:', {
      faviconUrl,
      ogImageUrl,
      defaultHomepage,
      privacyMode,
      logoUrl,
      companyName,
    })
    
    const siteSettingsValue = { 
      ...settingsData,
      ...(overrides || {}),
      faviconUrl: faviconUrl || undefined,
      ogImageUrl: ogImageUrl || undefined,
      defaultHomepage: (overrides?.defaultHomepage ?? defaultHomepage) || 'ideas',
      navOrder: Array.isArray(overrides?.navOrder ?? navOrder) ? (overrides?.navOrder ?? navOrder) : ['Ideas', 'Roadmap', 'Updates', 'Help Centre'],
      companyId,
      savedAt: new Date().toISOString(),
    }
    
    console.log('[SETTINGS SAVE] Full value object:', siteSettingsValue)
    
    try {
      // Save via server-side API (service role key + read-back verification)
      const res = await authFetch('/api/admin/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ company_id: companyId, value: siteSettingsValue }),
      })
      const result = await res.json()

      if (!res.ok || result.error) {
        console.error('[SETTINGS SAVE] Server save failed:', result.error)
        if (isManualSave) showToast('Failed to save settings: ' + (result.error || 'unknown error'), 'error', 4000)
      } else {
        console.log('[SETTINGS SAVE] ✅ Verified save via', result.method, '— row:', result.settings?.id)
        if (isManualSave) {
          showToast('Settings saved successfully!', 'success', 3000)
          // Hard reload after 2 seconds to ensure data is fresh
          setTimeout(() => {
            console.log('[SETTINGS SAVE] Reloading to verify save...')
            window.location.reload()
          }, 2000)
        }
      }
    } catch (e: any) {
      console.error('DB save failed:', e.message)
      if (isManualSave) showToast('Save failed: ' + e.message, 'error', 4000)
    } finally {
      setSaving(false)
    }

    // BACKUP: Also save favicon/og/privacy directly to companies table
    try {
      if (company?.id) {
        console.log('[SETTINGS SAVE] Saving to companies table as backup...')
        await (supabase as any).from('companies').update({
          logo_url: logoUrl || null,
        }).eq('id', company.id)
      }
    } catch (e) {
      console.error('Backup save to companies failed:', e)
    }

    // Save to companies table using company.id (most reliable, works even if owner_id was patched)
    try {
      const companyToUpdate = company || await (async () => {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session?.user) return null
        const h = typeof window !== 'undefined' ? window.location.hostname : ''
        const slug = h.endsWith('.colvy.com') ? h.replace('.colvy.com', '') : null
        if (slug) {
          const { data: co } = await (supabase as any).from('companies').select('*').eq('slug', slug).maybeSingle()
          if (co) return co
        }
        const { data: co } = await (supabase as any).from('companies').select('*').eq('owner_id', session.user.id).maybeSingle()
        return co
      })()
      if (companyToUpdate?.id) {
        const { error: updateErr } = await (supabase as any).from('companies').update({
          name: companyName,
          accent_color: accentColor,
          board_domain: boardDomain || null,
          help_domain: helpDomain || null,
          logo_url: logoUrl || null,
          is_private: privacyMode !== 'public',
        }).eq('id', companyToUpdate.id)
        if (updateErr) console.error('Company update error:', updateErr.message)
        else {
          // Update local company state so UI reflects immediately
          const updated = companyToUpdate ? { ...companyToUpdate, name: companyName, logo_url: logoUrl, accent_color: accentColor, is_private: privacyMode !== 'public' } : null
          setCompany(updated)
          // Notify layout nav and other pages
          window.dispatchEvent(new CustomEvent('colvy-company-update', { detail: { name: companyName, logo_url: logoUrl, accent_color: accentColor, slug: updated?.slug } }))
          // Update cached company in localStorage
          try {
            const slug = updated?.slug || window.location.hostname.replace('.colvy.com','')
            if (slug) localStorage.setItem(`company_${slug}`, JSON.stringify(updated || { name: companyName, logo_url: logoUrl, accent_color: accentColor }))
          } catch {}
        }
      }
    } catch (e) {
      console.error('Company update failed:', e)
    }
    
    // Cache in localStorage scoped to this company slug
    if (typeof window !== 'undefined') {
      const slugKey = window.location.hostname.replace('.colvy.com','') || 'colvy'
      localStorage.setItem(`site_settings_${slugKey}`, JSON.stringify(settingsData))
    }
    
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const uploadFile = async (file: File, folder: string, setter: (url: string) => void, settingKey: string) => {
    try {
      const ext = file.name.split('.').pop()
      const fileName = `${folder}/${Date.now()}.${ext}`
      let uploadBucket = 'settings'
      let { data, error } = await supabase.storage.from(uploadBucket).upload(fileName, file, { upsert: true })
      if (error) {
        uploadBucket = 'idea-images'
        const result = await supabase.storage.from(uploadBucket).upload(fileName, file, { upsert: true })
        data = result.data
        error = result.error
      }
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from(uploadBucket).getPublicUrl(data!.path)
      setter(publicUrl)

      // Resolve company (use state, or look up by hostname slug if not loaded yet)
      let co = company
      if (!co?.id && typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const slug = h.replace('.colvy.com', '')
          const { data: coBySlug } = await (supabase as any).from('companies').select('*').eq('slug', slug).maybeSingle()
          if (coBySlug) co = coBySlug
        }
      }

      // 1) If this is the logo, update companies.logo_url directly (source of truth for nav/sidebar)
      if (settingKey === 'logoUrl' && co?.id) {
        const { error: coErr } = await (supabase as any).from('companies').update({ logo_url: publicUrl }).eq('id', co.id)
        if (coErr) console.warn('companies.logo_url update failed:', coErr.message)
        else {
          setCompany((prev: any) => prev ? { ...prev, logo_url: publicUrl } : { ...co, logo_url: publicUrl })
          window.dispatchEvent(new CustomEvent('colvy-company-update', { detail: { logo_url: publicUrl } }))
          try {
            const slug = co.slug
            const cached = localStorage.getItem(`company_${slug}`)
            const merged = { ...(cached ? JSON.parse(cached) : co), logo_url: publicUrl }
            localStorage.setItem(`company_${slug}`, JSON.stringify(merged))
          } catch {}
        }
      }

      // 2) Always also save into site_settings, scoped to this company
      try {
        const cid = co?.id
        const currentSettings: any = {}
        if (cid) {
          const { data: rows } = await (supabase as any).from('site_settings').select('value').eq('key', 'general').eq('company_id', cid)
            .order('updated_at', { ascending: false }).limit(1)
          if (rows?.[0]?.value) Object.assign(currentSettings, rows[0].value)
        }
        currentSettings[settingKey] = publicUrl
        // Only save when scoped to a real company — writing with company_id null
        // pollutes the shared legacy row and bleeds into other companies
        if (cid) {
          await (supabase as any).from('site_settings').upsert({ key: 'general', company_id: cid, value: currentSettings, updated_at: new Date().toISOString() }, { onConflict: 'key,company_id' })
        }
        const slugKey = typeof window !== 'undefined' ? (window.location.hostname.replace('.colvy.com','') || 'colvy') : 'colvy'
        if (typeof window !== 'undefined') localStorage.setItem(`site_settings_${slugKey}`, JSON.stringify({ ...currentSettings }))
      } catch (saveErr: any) { console.warn('URL save error:', saveErr.message) }

      setSaved(true)
      setTimeout(() => setSaved(false), 1500)
      // Apply terminology globally via localStorage + event
      try {
        const slug = company?.slug || (typeof window !== 'undefined' ? window.location.hostname.replace('.colvy.com','') : null)
        if (slug) {
          localStorage.setItem(`terminology_${slug}`, JSON.stringify(termValues))
          window.dispatchEvent(new CustomEvent('colvy-terminology-update', { detail: termValues }))
        }
      } catch {}
    } catch (err: any) {
      alert('Upload failed: ' + err.message + '\n\nMake sure a "settings" or "idea-images" storage bucket exists in Supabase with public access.')
    }
  }

  // Extract dominant color from an image
  const extractDominantColor = (imgUrl: string): Promise<string | null> => {
    return new Promise(resolve => {
      try {
        const img = new Image()
        img.crossOrigin = 'Anonymous'
        img.onload = () => {
          const canvas = document.createElement('canvas')
          canvas.width = 50; canvas.height = 50
          const ctx = canvas.getContext('2d')
          if (!ctx) { resolve(null); return }
          ctx.drawImage(img, 0, 0, 50, 50)
          const data = ctx.getImageData(0, 0, 50, 50).data
          let r = 0, g = 0, b = 0, count = 0
          for (let i = 0; i < data.length; i += 4) {
            // Skip near-white, near-black, and transparent pixels
            const alpha = data[i + 3]
            const brightness = (data[i] + data[i+1] + data[i+2]) / 3
            if (alpha > 128 && brightness > 30 && brightness < 220) {
              r += data[i]; g += data[i+1]; b += data[i+2]; count++
            }
          }
          if (count === 0) { resolve(null); return }
          const hex = '#' + [r,g,b].map(v => Math.round(v/count).toString(16).padStart(2,'0')).join('')
          resolve(hex)
        }
        img.onerror = () => resolve(null)
        img.src = imgUrl
      } catch { resolve(null) }
    })
  }

  const [suggestedColor, setSuggestedColor] = useState<string | null>(null)

  const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    // Upload file then extract color
    await uploadFile(file, 'logo', setLogoUrl, 'logoUrl')
    // Small delay to let URL state settle
    setTimeout(async () => {
      // Get the latest logoUrl from the input element (state may not have updated yet)
      const input = e.target
      if (input.files?.[0]) {
        const objectUrl = URL.createObjectURL(input.files[0])
        const color = await extractDominantColor(objectUrl)
        if (color) setSuggestedColor(color)
        URL.revokeObjectURL(objectUrl)
      }
    }, 500)
  }

  const handleFaviconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file, 'favicon', setFaviconUrl, 'faviconUrl')
  }

  const handleOgUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file, 'og', setOgImageUrl, 'ogImageUrl')
  }

  if (!user) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  return (
    <>
      <ToastContainer toasts={toasts} onRemove={removeToast} />
    <div>

      {/* Main Content (the Settings menu is components/settings/SettingsShell) */}
      <div className="px-4 md:px-11 py-6 md:py-9">
      <div className="max-w-5xl">

      {activeSettingsTab === 'misc' ? (
        /* MISCELLANEOUS TAB */
        <>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Miscellaneous</h1>
          <p className="mb-8 text-sm" style={{ color: 'var(--slate)' }}>Other company settings.</p>

          {/* Announcements */}
          <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold mb-5" style={{ color: 'var(--ink)' }}>Announcements</h2>
            <div className="space-y-5">
              {[
                { label: 'Allow Announcement subscriptions', desc: 'Enable users to receive updates for Announcements', state: allowAnnSubsc, set: setAllowAnnSubsc },
                { label: 'Allow Announcement comments', desc: 'Enable commenting on Announcements', state: allowAnnComments, set: setAllowAnnComments },
                { label: 'Disable Announcements reactions', desc: 'Turn off reactions on Announcements', state: disableAnnReactions, set: setDisableAnnReactions },
                { label: 'Disable animated GIFs', desc: 'Remove any animated GIFs from your company', state: disableAnimGifs, set: setDisableAnimGifs },
                { label: 'Disable comment reactions', desc: 'Turn off reactions on comments', state: disableCommentReactions, set: setDisableCommentReactions },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-3 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{item.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{item.desc}</p>
                  </div>
                  <button onClick={() => item.set(!item.state)}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ml-4"
                    style={{ background: item.state ? 'var(--coral)' : '#d1d5db' }}>
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                      style={{ transform: item.state ? 'translateX(24px)' : 'translateX(4px)' }} />
                  </button>
                </div>
              ))}
              {/* Show Announcement comments - with select */}
              <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Show Announcement comments</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Display Announcement comments to selected users</p>
                </div>
                <select value={showAnnComments} onChange={e => setShowAnnComments(e.target.value as any)}
                  className="px-3 py-1.5 rounded-lg border text-sm focus:outline-none ml-4"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  <option value="always">Always</option>
                  <option value="admins">Admins only</option>
                </select>
              </div>
            </div>
          </div>

          {/* Ideas */}
          <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold mb-5" style={{ color: 'var(--ink)' }}>Ideas</h2>
            <div className="space-y-0">
              {[
                { label: 'Allow Idea comments', desc: 'Enable commenting and replies on Ideas and Idea activity', state: allowIdeaComments, set: setAllowIdeaComments },
                { label: 'Show Idea MRR', desc: 'Display the total MRR for an Idea', state: showIdeaMRR, set: setShowIdeaMRR },
                { label: 'Show Idea number', desc: 'Display the unique Idea number', state: showIdeaNumber, set: setShowIdeaNumber },
                { label: 'Show Roadmap Idea descriptions', desc: 'Display the Idea description on your Roadmap', state: showRoadmapDesc, set: setShowRoadmapDesc },
                { label: 'Require Idea topic', desc: 'At least one topic will be required for an Idea submission', state: requireIdeaTopic, set: setRequireIdeaTopic },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-3 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{item.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{item.desc}</p>
                  </div>
                  <button onClick={() => item.set(!item.state)}
                    className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer shrink-0 ml-4"
                    style={{ background: item.state ? 'var(--coral)' : '#d1d5db' }}>
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform"
                      style={{ transform: item.state ? 'translateX(24px)' : 'translateX(4px)' }} />
                  </button>
                </div>
              ))}
              {/* Show Idea date */}
              <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Show Idea date</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Display the Idea created date to selected users</p>
                </div>
                <select value={showIdeaDate} onChange={e => setShowIdeaDate(e.target.value as any)}
                  className="px-3 py-1.5 rounded-lg border text-sm focus:outline-none ml-4"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  <option value="always">Always</option>
                  <option value="admins">Admins only</option>
                  <option value="never">Never</option>
                </select>
              </div>
              {/* Show Idea activity */}
              <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Show Idea activity</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Display Idea activity to selected users</p>
                </div>
                <select value={showIdeaActivity} onChange={e => setShowIdeaActivity(e.target.value as any)}
                  className="px-3 py-1.5 rounded-lg border text-sm focus:outline-none ml-4"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  <option value="always">Always</option>
                  <option value="admins">Admins only</option>
                </select>
              </div>
            </div>
          </div>

          {/* Data */}
          <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-base font-bold mb-5" style={{ color: 'var(--ink)' }}>Data</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Export data (CSV)</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Download all Ideas, Votes, Comments, Users, Announcements data.</p>
                </div>
                <button className="px-4 py-2 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-gray-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  Export data
                </button>
              </div>
              <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Import Ideas</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Kick-start your board by importing the Starter Template.</p>
                </div>
                <button className="px-4 py-2 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-gray-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  Import template
                </button>
              </div>
              <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Restart setup</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Missed something? Go back through connecting email, Facebook and Instagram, your store and phone.</p>
                </div>
                <Link href="/onboarding" className="px-4 py-2 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-gray-50 shrink-0"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  Restart
                </Link>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="st-sec" style={{ borderColor: '#fca5a5' }}>
            <h2 className="text-base font-bold mb-5" style={{ color: '#dc2626' }}>Danger Zone</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Delete all Ideas</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Once you delete Ideas, there is no going back so please be certain.</p>
                </div>
                <button onClick={async () => { if (await confirmDialog('Delete ALL ideas? This cannot be undone!')) alert('Contact support to delete all ideas.') }}
                  className="px-4 py-2 rounded-xl border text-sm font-semibold cursor-pointer"
                  style={{ borderColor: '#fca5a5', color: '#dc2626' }}>
                  Delete all Ideas
                </button>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Delete account and company</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Deletes your login now. A company you own is closed at once (staff locked out, numbers and subscription stopped) and all its data is erased after 30 days.</p>
                </div>
                <button onClick={async () => {
                  if (!(await confirmDialog('Delete your account? A company you own is closed now and erased after 30 days. This cannot be undone.'))) return
                  const typed = window.prompt('Type DELETE to confirm')
                  if (String(typed || '').trim().toUpperCase() !== 'DELETE') return
                  const res = await authFetch('/api/account/delete', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ confirm: 'DELETE' }) })
                  const d = await res.json().catch(() => ({}))
                  if (!res.ok) { alert(d?.error || 'Couldn’t delete the account.'); return }
                  try { await supabase.auth.signOut({ scope: 'local' }) } catch {}
                  window.location.href = '/'
                }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer text-white"
                  style={{ background: '#dc2626' }}>
                  Delete account
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button onClick={() => handleSave(true)} disabled={saving}
              className="px-8 py-3 rounded-xl font-semibold text-white cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--coral)' }}>
              {saving ? 'Saving...' : saved ? '✅ Saved!' : 'Save Settings'}
            </button>
          </div>
        </>
      ) : (
        <>
        {/* Tab title */}
        <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>
          {activeSettingsTab === 'overview' && 'Overview'}
          {activeSettingsTab === 'general' && 'General'}
          {activeSettingsTab === 'theme' && 'Theme'}
          {activeSettingsTab === 'emails' && 'Emails'}
          {activeSettingsTab === 'whitelabel' && 'White Labeling'}
          {activeSettingsTab === 'auth' && 'Authentication'}
          {activeSettingsTab === 'privacy' && 'Privacy'}
          {activeSettingsTab === 'nav' && 'Navigation'}
          {activeSettingsTab === 'terminology' && 'Terminology'}
          {activeSettingsTab === 'categories' && 'Categories'}
          {activeSettingsTab === 'webhooks' && 'Webhooks'}
          {activeSettingsTab === 'widget' && 'Widget'}
          {activeSettingsTab === 'api' && 'API'}
          {activeSettingsTab === 'languages' && 'Languages'}
        </h1>
        <p className="mb-6 text-sm" style={{ color: 'var(--slate)' }}>
          {activeSettingsTab === 'overview' && 'How your team is performing across chat, customers and conversions.'}
          {activeSettingsTab === 'general' && 'Manage your company settings.'}
          {activeSettingsTab === 'theme' && 'How your board and help centre look to customers, and how Colvy dresses up for the holidays.'}
          {activeSettingsTab === 'emails' && 'Configure outgoing email settings.'}
          {activeSettingsTab === 'whitelabel' && 'Remove Colvy branding and use your own domain.'}
          {activeSettingsTab === 'auth' && 'Configure authentication and access settings.'}
          {activeSettingsTab === 'privacy' && 'Control who can access your board.'}
          {activeSettingsTab === 'nav' && 'Show or hide navigation items.'}
          {activeSettingsTab === 'terminology' && 'Customise the labels used throughout your board.'}
          {activeSettingsTab === 'categories' && 'Use Categories to organize your Announcements.'}
          {activeSettingsTab === 'webhooks' && 'Receive HTTP callbacks when events happen in your board.'}
          {activeSettingsTab === 'widget' && 'Embed a feedback widget on any website.'}
          {activeSettingsTab === 'api' && 'Manage API keys for programmatic access to your board.'}
          {activeSettingsTab === 'languages' && 'Configure supported languages.'}
        </p>

        {/* Languages tab */}
        {activeSettingsTab === 'languages' && (
          <div className="space-y-4">
            <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Language Settings</h2>
              <div className="space-y-3">
                {[
                  { code: 'en', label: 'English', flag: '🇺🇸', active: true },
                  { code: 'es', label: 'Spanish', flag: '🇪🇸', active: false },
                  { code: 'fr', label: 'French', flag: '🇫🇷', active: false },
                  { code: 'de', label: 'German', flag: '🇩🇪', active: false },
                  { code: 'pt', label: 'Portuguese', flag: '🇧🇷', active: false },
                  { code: 'ja', label: 'Japanese', flag: '🇯🇵', active: false },
                  { code: 'zh', label: 'Chinese', flag: '🇨🇳', active: false },
                ].map(lang => (
                  <div key={lang.code} className="flex items-center justify-between p-3 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{lang.flag}</span>
                      <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{lang.label}</span>
                      {lang.active && <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#16a34a' }}>Default</span>}
                    </div>
                    <button className="relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer"
                      style={{ background: lang.active ? 'var(--coral)' : '#d1d5db' }}>
                      <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow"
                        style={{ transform: lang.active ? 'translateX(24px)' : 'translateX(4px)' }} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* White Labeling tab */}
        {activeSettingsTab === 'whitelabel' && (
          <div className="space-y-5">
            <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-5" style={{ color: 'var(--ink)' }}>Branding</h2>
              <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Hide "Powered by Colvy"</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Remove the Colvy branding from your board footer</p>
                </div>
                {brandingEntitled ? (
                  <button onClick={() => setHidePoweredBy(!hidePoweredBy)}
                    className="relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer shrink-0 ml-4"
                    style={{ background: hidePoweredBy ? 'var(--coral)' : '#d1d5db' }}>
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow"
                      style={{ transform: hidePoweredBy ? 'translateX(24px)' : 'translateX(4px)' }} />
                  </button>
                ) : (
                  <Link href="/admin/billing" className="shrink-0 ml-4 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: '#fff1ec', color: 'var(--coral)', textDecoration: 'none', whiteSpace: 'nowrap' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Upgrade to remove</Link>
                )}
              </div>
            </div>

            <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>Custom Domains</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>Use your own domain instead of {company?.slug
                    ? `${company.slug}.colvy.com`
                    : typeof window !== 'undefined' && window.location.hostname.endsWith('.colvy.com')
                    ? window.location.hostname
                    : 'yourslug.colvy.com'}</p>
              <div className="space-y-5">
                {/* Editable Colvy URL */}
                <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Your Colvy URL</p>
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#dcfce7', color: '#16a34a' }}>● Active</span>
                  </div>
                  <div className="flex rounded-xl border overflow-hidden" style={{ borderColor: slugStatus === 'taken' || slugStatus === 'invalid' ? '#ef4444' : slugStatus === 'available' ? '#10b981' : 'var(--border)' }}>
                    <input
                      value={slugEdit}
                      onChange={e => {
                        const val = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '')
                        setSlugEdit(val)
                        if (val === company?.slug) { setSlugStatus('idle'); return }
                        setSlugStatus('checking')
                        if (slugTimer) clearTimeout(slugTimer)
                        const t = setTimeout(async () => {
                          if (val.length < 3 || val.length > 30) { setSlugStatus('invalid'); return }
                          const { data } = await (supabase as any).from('companies').select('id').eq('slug', val).maybeSingle()
                          setSlugStatus(data ? 'taken' : 'available')
                        }, 600)
                        setSlugTimer(t)
                      }}
                      className="flex-1 px-3 py-2 text-sm focus:outline-none font-mono"
                      style={{ background: 'transparent', color: 'var(--ink)' }}
                      placeholder="your-slug"
                    />
                    <span className="px-2 py-2 text-sm font-medium flex-shrink-0" style={{ color: 'var(--slate)', borderLeft: '1px solid var(--border)' }}>.colvy.com</span>
                    {slugStatus === 'available' && slugEdit !== company?.slug && (
                      <button onClick={async () => {
                        if (!company?.id) return
                        await (supabase as any).from('companies').update({ slug: slugEdit }).eq('id', company.id)
                        setCompany((prev: any) => prev ? { ...prev, slug: slugEdit } : prev)
                        setSlugStatus('idle')
                        // Register new subdomain with Vercel
                        authFetch('/api/domains', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ domain: `${slugEdit}.colvy.com`, companyId: company.id }) }).catch(() => {})
                      }}
                        className="px-3 py-2 text-xs font-bold cursor-pointer text-white flex-shrink-0"
                        style={{ background: '#10b981', border: 'none' }}>
                        Save
                      </button>
                    )}
                  </div>
                  <div className="flex items-center justify-between mt-1">
                    <p className="text-xs" style={{ color: slugStatus === 'taken' ? '#ef4444' : slugStatus === 'invalid' ? '#ef4444' : slugStatus === 'available' ? '#10b981' : slugStatus === 'checking' ? '#f59e0b' : 'var(--slate)' }}>
                      {slugStatus === 'checking' ? 'Checking availability...' : slugStatus === 'taken' ? '✗ Already taken' : slugStatus === 'invalid' ? '✗ 3–30 chars, letters, numbers, hyphens' : slugStatus === 'available' ? '✓ Available' : 'Lowercase letters, numbers, hyphens'}
                    </p>
                    {company?.slug && (
                      <a href={`https://${company.slug}.colvy.com`} target="_blank"
                        className="text-xs hover:underline" style={{ color: 'var(--slate)' }}>
                        Open board ↗
                      </a>
                    )}
                  </div>
                </div>

                {/* Widget embed */}
                <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>Feedback widget</p>
                  <p className="text-xs mb-3" style={{ color: 'var(--slate)' }}>Add a floating feedback button to any website. Paste this snippet before {`</body>`}.</p>
                  <ShopifyNote />
                  {company?.slug && (<>
                    <div className="rounded-lg p-3 font-mono text-xs overflow-x-auto" style={{ background: '#0d0d0d', color: '#a3e635' }}>
                      {`<script src="https://colvy.com/widget.js" data-slug="${company.slug}" async></script>`}
                    </div>
                    <button onClick={() => {
                      navigator.clipboard.writeText(`<script src="https://colvy.com/widget.js" data-slug="${company?.slug}" async></script>`)
                      setWidgetCopied('snippet')
                      setTimeout(() => setWidgetCopied(''), 2000)
                    }} className="mt-2 text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer text-white" style={{ background: 'var(--coral)', border: 'none' }}>
                      {widgetCopied === 'snippet' ? '✓ Copied!' : 'Copy snippet'}
                    </button>
                    <a href={`/widget?slug=${company.slug}`} target="_blank" className="ml-2 text-xs font-semibold px-3 py-1.5 rounded-lg cursor-pointer" style={{ border: '1px solid var(--border)', color: 'var(--ink)', textDecoration: 'none', display: 'inline-block', marginTop: 8 }}>
                      Preview popup →
                    </a>
                  </>)}
                </div>

                {/* Board domain */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>
                    Custom board domain
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>Pro</span>
                  </label>
                  <div className="flex gap-2">
                    <input type="text" value={boardDomain} onChange={e => setBoardDomain(e.target.value.toLowerCase())}
                      placeholder="feedback.yourcompany.com" disabled={!customDomainEntitled}
                      className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border focus:outline-none text-sm disabled:opacity-60"
                      style={{ borderColor: domainStatus['board'] === 'verified' ? '#10b981' : domainStatus['board'] === 'error' ? '#ef4444' : 'var(--border)', fontSize: '16px' }} />
                    {customDomainEntitled ? (
                    <button onClick={async () => {
                        if (!boardDomain) return
                        setDomainStatus(p => ({ ...p, board: 'verifying' }))
                        try {
                          const res = await authFetch('/api/domains', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ domain: boardDomain, companyId: company?.id }),
                          })
                          const data = await res.json()
                          if (data.manual) {
                            // No Vercel token — show instructions and mark as pending
                            setDomainStatus(p => ({ ...p, board: 'pending' }))
                          } else if (data.success || data.error?.includes('already')) {
                            setDomainStatus(p => ({ ...p, board: 'verified' }))
                          } else {
                            setDomainStatus(p => ({ ...p, board: 'error' }))
                          }
                        } catch {
                          setDomainStatus(p => ({ ...p, board: 'error' }))
                        }
                      }}
                      disabled={!boardDomain || domainStatus['board'] === 'verifying'}
                      className="px-4 py-2.5 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 shrink-0"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      {domainStatus['board'] === 'verifying' ? '⏳ Adding...' : domainStatus['board'] === 'verified' ? '✓ Active' : domainStatus['board'] === 'pending' ? '⏱ Pending' : 'Add Domain'}
                    </button>
                    ) : (
                    <Link href="/admin/billing" className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0" style={{ background: 'var(--coral)', textDecoration: 'none', whiteSpace: 'nowrap' }}>🔒 Upgrade</Link>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Your feedback board will be accessible at this domain.</p>
                </div>

                {/* Help domain */}
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>
                    Custom help centre domain
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>Pro</span>
                  </label>
                  <div className="flex gap-2">
                    <input type="text" value={helpDomain} onChange={e => setHelpDomain(e.target.value.toLowerCase())}
                      placeholder="help.yourcompany.com" disabled={!customDomainEntitled}
                      className="flex-1 min-w-0 px-4 py-2.5 rounded-xl border focus:outline-none text-sm disabled:opacity-60"
                      style={{ borderColor: domainStatus['help'] === 'verified' ? '#10b981' : domainStatus['help'] === 'error' ? '#ef4444' : 'var(--border)', fontSize: '16px' }} />
                    {customDomainEntitled ? (
                    <button onClick={async () => {
                        if (!helpDomain) return
                        setDomainStatus(p => ({ ...p, help: 'verifying' }))
                        try {
                          const res = await authFetch('/api/domains', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ domain: helpDomain, companyId: company?.id }),
                          })
                          const data = await res.json()
                          if (data.manual) {
                            setDomainStatus(p => ({ ...p, help: 'pending' }))
                          } else if (data.success || data.error?.includes('already')) {
                            setDomainStatus(p => ({ ...p, help: 'verified' }))
                          } else {
                            setDomainStatus(p => ({ ...p, help: 'error' }))
                          }
                        } catch {
                          setDomainStatus(p => ({ ...p, help: 'error' }))
                        }
                      }}
                      disabled={!helpDomain || domainStatus['help'] === 'verifying'}
                      className="px-4 py-2.5 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 shrink-0"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      {domainStatus['help'] === 'verifying' ? '⏳ Adding...' : domainStatus['help'] === 'verified' ? '✓ Active' : domainStatus['help'] === 'pending' ? '⏱ Pending' : 'Add Domain'}
                    </button>
                    ) : (
                    <Link href="/admin/billing" className="px-4 py-2.5 rounded-xl text-sm font-semibold text-white shrink-0" style={{ background: 'var(--coral)', textDecoration: 'none', whiteSpace: 'nowrap' }}>🔒 Upgrade</Link>
                    )}
                  </div>
                  <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Your help centre will be accessible at this domain.</p>
                </div>

                {/* DNS Instructions */}
                {(boardDomain || helpDomain) && (
                  <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                    <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>📋 DNS Setup</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Add these CNAME records in your DNS provider (Cloudflare, GoDaddy, etc.)</p>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-xs font-mono">
                        <thead>
                          <tr style={{ background: 'var(--canvas)' }}>
                            <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--slate)' }}>Type</th>
                            <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--slate)' }}>Name</th>
                            <th className="text-left px-4 py-2 font-semibold" style={{ color: 'var(--slate)' }}>Value</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y" style={{ borderColor: 'var(--border)' }}>
                          {boardDomain && (
                            <tr>
                              <td className="px-4 py-2.5 font-bold" style={{ color: '#2563eb' }}>CNAME</td>
                              <td className="px-4 py-2.5" style={{ color: 'var(--ink)' }}>{boardDomain.split('.')[0]}</td>
                              <td className="px-4 py-2.5" style={{ color: 'var(--coral)' }}>{CUSTOM_CNAME}</td>
                            </tr>
                          )}
                          {helpDomain && (
                            <tr>
                              <td className="px-4 py-2.5 font-bold" style={{ color: '#2563eb' }}>CNAME</td>
                              <td className="px-4 py-2.5" style={{ color: 'var(--ink)' }}>{helpDomain.split('.')[0]}</td>
                              <td className="px-4 py-2.5" style={{ color: 'var(--coral)' }}>{CUSTOM_CNAME}</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                    <div className="px-4 py-3 border-t text-xs" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                      ⏱️ DNS changes can take up to 24 hours. After adding, click "Verify" above and save settings.
                    </div>
                  </div>
                )}
              </div>
            </div>
            <div className="flex justify-end">
              <button onClick={() => handleSave(true)} disabled={saving} className="px-6 py-2.5 rounded-xl font-semibold text-white text-sm cursor-pointer disabled:opacity-50" style={{ background: 'var(--coral)' }}>
                {saving ? 'Saving...' : saved ? '✅ Saved!' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}

        {/* Privacy tab */}
        {activeSettingsTab === 'privacy' && (
          <div className="space-y-4">
            <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-5" style={{ color: 'var(--ink)' }}>Board Privacy</h2>
              <div className="space-y-0">
                {[
                  { label: 'Public board', desc: 'Anyone can view and vote on ideas', value: 'public' },
                  { label: 'Private board', desc: 'Only invited users can access your board', value: 'private' },
                  { label: 'SSO only', desc: 'Users must sign in via your SSO provider', value: 'sso' },
                ].map((opt, i) => (
                  <label key={opt.value} className={`flex items-start gap-3 p-4 cursor-pointer hover:bg-gray-50 rounded-xl ${i < 2 ? 'border-b' : ''}`} style={{ borderColor: 'var(--border)' }}>
                    <input type="radio" name="privacy" value={opt.value} checked={privacyMode === opt.value} onChange={() => setPrivacyMode(opt.value)} className="mt-0.5" style={{ accentColor: 'var(--coral)' }} />
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{opt.label}</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>
            <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-5" style={{ color: 'var(--ink)' }}>Guest Access</h2>
              {[
                { label: 'Allow guest voting', desc: 'Users can vote without signing in', state: guestVotingEnabled, set: setGuestVotingEnabled },
                { label: 'Allow guest submissions', desc: 'Users can submit ideas without signing in', state: guestSubmitEnabled, set: setGuestSubmitEnabled },
              ].map(item => (
                <div key={item.label} className="flex items-center justify-between py-3 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                  <div>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{item.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{item.desc}</p>
                  </div>
                  <button onClick={() => item.set(!item.state)}
                    className="relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer shrink-0 ml-4"
                    style={{ background: item.state ? 'var(--coral)' : '#d1d5db' }}>
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow"
                      style={{ transform: item.state ? 'translateX(24px)' : 'translateX(4px)' }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Authentication tab */}
        {activeSettingsTab === 'auth' && (
          <div className="space-y-4">
            <div className="st-sec">
              <h2>Sign-in methods</h2>
              <p>How people sign in to your board and help centre. Email and password always works, so nobody gets locked out.</p>
              <div className="si-list">
                <style>{`
                  .si-list { display: flex; flex-direction: column; border-radius: 16px; box-shadow: 0 0 0 1px #ececf0; overflow: hidden; }
                  .si-row { display: flex; align-items: center; gap: 14px; padding: 14px 16px; border-top: 1px solid #f0f0f2; }
                  .si-row:first-child { border-top: none; }
                  .si-ic { width: 38px; height: 38px; flex-shrink: 0; border-radius: 11px; background: #f4f4f5; color: #3f3f46; display: flex; align-items: center; justify-content: center; }
                  .si-sw { position: relative; width: 44px; height: 26px; flex-shrink: 0; border: none; border-radius: 999px; background: #d4d4d8; cursor: pointer; transition: background .2s ease; }
                  .si-sw::before { display: none; }
                  .si-sw span { position: absolute; top: 3px; left: 3px; width: 20px; height: 20px; border-radius: 50%; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.2); transition: transform .22s cubic-bezier(.22,1,.36,1); }
                  .si-sw[aria-checked="true"] { background: var(--coral); }
                  .si-sw[aria-checked="true"] span { transform: translateX(18px); }
                  .si-sw:focus-visible { outline: 2px solid var(--coral); outline-offset: 2px; }
                  .si-sw:disabled { opacity: .6; cursor: default; }
                `}</style>
                {([
                  { key: null, label: 'Email & password', desc: 'Their email and a password', icon: <><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m3.5 7 8.5 6 8.5-6" /></> },
                  { key: 'google', label: 'Google', desc: 'Continue with their Google account', icon: <><path d="M20.5 12.2c0-.6-.1-1.2-.2-1.7H12v3.3h4.8a4.1 4.1 0 0 1-1.8 2.7" /><path d="M12 20.5a8.5 8.5 0 1 1 5.7-14.8" /><path d="M12 12h8.5" /></> },
                  { key: 'github', label: 'GitHub', desc: 'Continue with their GitHub account', icon: <path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21" /> },
                  { key: 'magicLink', label: 'Magic link', desc: 'We email them a one-time sign-in link, no password needed', icon: <><path d="m15 4 1.5 3L20 8.5 16.5 10 15 13l-1.5-3L10 8.5 13.5 7z" /><path d="M5.5 14.5 3 21l6.5-2.5" /><path d="m7 17 6-6" /></> },
                ] as const).map(m => {
                  const on = m.key ? signIn[m.key] : true
                  return (
                    <div key={m.label} className="si-row">
                      <span className="si-ic"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>{m.icon}</svg></span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontSize: 14.5, fontWeight: 600, color: '#18181b' }}>{m.label}</p>
                        <p style={{ margin: '2px 0 0', fontSize: 13, color: '#71717a' }}>{m.desc}</p>
                      </div>
                      {m.key ? (
                        <button type="button" role="switch" aria-checked={on} aria-label={m.label} className="si-sw" disabled={signInSaving}
                          onClick={() => saveSignIn({ ...signIn, [m.key!]: !on })}><span /></button>
                      ) : (
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: '#71717a', background: '#f4f4f5', borderRadius: 999, padding: '4px 10px', whiteSpace: 'nowrap' }}>Always on</span>
                      )}
                    </div>
                  )
                })}
              </div>
              {signIn.magicLink && (
                <p style={{ margin: '12px 0 0', fontSize: 13, color: '#71717a', lineHeight: 1.5 }}>
                  The sign-in page now offers “Email me a sign-in link”. Links work for people who already have an account, and each one works once.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Navigation tab */}
        {activeSettingsTab === 'nav' && (() => {
          const NAV_ITEMS_MAP: Record<string, { desc: string; state: boolean; set: (v: boolean) => void }> = {
            'Ideas':      { desc: 'The main feedback board', state: navIdeas, set: setNavIdeas },
            'Roadmap':    { desc: 'Show your product roadmap publicly', state: navRoadmap, set: setNavRoadmap },
            'Updates':    { desc: 'Announcements and changelog', state: navAnnouncements, set: setNavAnnouncements },
            'Help Centre':{ desc: 'Help articles and support docs', state: navHelp, set: setNavHelp },
          }
          return (<>
            <div className="space-y-4">
              <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
                <h2 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>Site Navigation</h2>
                <p className="text-sm mb-1" style={{ color: 'var(--slate)' }}>Choose which sections appear and drag to reorder.</p>
                <p className="text-xs mb-5 flex items-center gap-1" style={{ color: 'var(--slate)', opacity: 0.7 }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                  Drag items to change order
                </p>
                <div className="space-y-0">
                  {navOrder.map(label => {
                    const item = NAV_ITEMS_MAP[label]
                    if (!item) return null
                    return (
                      <div key={label}
                        draggable
                        onDragStart={() => setDragNavItem(label)}
                        onDragOver={e => { e.preventDefault() }}
                        onDrop={() => {
                          if (!dragNavItem || dragNavItem === label) return
                          const newOrder = [...navOrder]
                          const from = newOrder.indexOf(dragNavItem)
                          const to = newOrder.indexOf(label)
                          newOrder.splice(from, 1)
                          newOrder.splice(to, 0, dragNavItem)
                          setNavOrder(newOrder)
                          setDragNavItem(null)
                          // Real-time nav preview
                          window.dispatchEvent(new CustomEvent('colvy-nav-update', { detail: {
                            navIdeas, navRoadmap, navAnnouncements, navHelp,
                            navOrder: newOrder,
                          }}))
                          // Persist immediately with the new order — don't rely on the
                          // debounced auto-save (which can be gated out during load).
                          setTimeout(() => handleSave(false, { navOrder: newOrder }), 0)
                        }}
                        onDragEnd={() => setDragNavItem(null)}
                        className="flex items-center justify-between py-4 border-b last:border-b-0 cursor-grab active:cursor-grabbing select-none"
                        style={{
                          borderColor: 'var(--border)',
                          opacity: dragNavItem === label ? 0.4 : 1,
                          background: dragNavItem === label ? 'var(--peach)' : 'transparent',
                          borderRadius: 8, padding: '12px 8px',
                          transition: 'opacity 0.15s',
                        }}>
                        <div className="flex items-center gap-3">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)', opacity: 0.4, flexShrink: 0 }}>
                            <circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/>
                            <circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
                            <circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/>
                          </svg>
                          <div>
                            <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{label}</p>
                            <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{item.desc}</p>
                          </div>
                        </div>
                        <button onClick={() => {
                          item.set(!item.state)
                          // Real-time nav preview
                          setTimeout(() => window.dispatchEvent(new CustomEvent('colvy-nav-update', { detail: {
                            navIdeas: label === 'Ideas' ? !item.state : navIdeas,
                            navRoadmap: label === 'Roadmap' ? !item.state : navRoadmap,
                            navAnnouncements: label === 'Updates' ? !item.state : navAnnouncements,
                            navHelp: label === 'Help Centre' ? !item.state : navHelp,
                            navOrder,
                          }})), 0)
                        }}
                          className="relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer shrink-0 ml-6"
                          style={{ background: item.state ? 'var(--coral)' : '#d1d5db' }}>
                          <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow"
                            style={{ transform: item.state ? 'translateX(24px)' : 'translateX(4px)', transition: 'transform 0.15s' }} />
                        </button>
                      </div>
                    )
                  })}
                </div>
              </div>
              <div className="flex justify-end">
                <button onClick={() => handleSave(true)} disabled={saving} className="px-6 py-2.5 rounded-xl font-semibold text-white text-sm cursor-pointer disabled:opacity-50" style={{ background: 'var(--coral)' }}>
                  {saving ? 'Saving...' : saved ? '✅ Saved!' : 'Save Settings'}
                </button>
              </div>
            </div>
          </> )
        })()}

        {/* Webhooks tab */}
        {activeSettingsTab === 'webhooks' && (
          <div className="space-y-5">
            <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>Webhook Secret</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>Use webhooks to receive notifications when events happen in your board. <a href="https://docs.colvy.com/webhooks" className="hover:underline" style={{ color: 'var(--coral)' }} target="_blank">View documentation →</a></p>
              <div className="flex items-center gap-3 p-3 rounded-xl font-mono text-sm" style={{ background: 'var(--canvas)', border: '1px solid var(--border)' }}>
                <span style={{ color: 'var(--ink)', fontSize: 13 }}>{webhookSecret}</span>
                <button onClick={() => navigator.clipboard.writeText(webhookSecret)}
                  className="ml-auto text-xs px-3 py-1 rounded-lg cursor-pointer" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                  Copy
                </button>
              </div>
              <p className="text-xs mt-2" style={{ color: '#ca8a04' }}>⚠️ Keep your webhook secret private.</p>
            </div>
            <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Add Webhook</h2>
              <p className="text-xs mb-4" style={{ color: 'var(--slate)' }}>Webhooks are auto-disabled after repeated delivery failures. Ensure your endpoint is reachable.</p>
              <div className="flex gap-3 mb-3">
                <select value={newWebhookEvent} onChange={e => setNewWebhookEvent(e.target.value)}
                  className="flex-1 px-3 py-2.5 rounded-xl border text-sm focus:outline-none cursor-pointer"
                  style={{ borderColor: 'var(--border)', color: newWebhookEvent ? 'var(--ink)' : 'var(--slate)' }}>
                  <option value="">Select event...</option>
                  <option value="all">All Events</option>
                  <option value="Announcement Created">Announcement Created</option>
                  <option value="Announcement Deleted">Announcement Deleted</option>
                  <option value="Announcement Published">Announcement Published</option>
                  <option value="Announcement Updated">Announcement Updated</option>
                  <option value="Comment Created">Comment Created</option>
                  <option value="Comment Deleted">Comment Deleted</option>
                  <option value="Comment Updated">Comment Updated</option>
                  <option value="Idea Approved">Idea Approved</option>
                  <option value="Idea Archived">Idea Archived</option>
                  <option value="Idea Created">Idea Created</option>
                  <option value="Idea Deleted">Idea Deleted</option>
                  <option value="Idea Marked As Bug">Idea Marked As Bug</option>
                  <option value="Idea Merged">Idea Merged</option>
                  <option value="Idea Roadmap Changed">Idea Roadmap Changed</option>
                  <option value="Idea Status Changed">Idea Status Changed</option>
                  <option value="Idea Unvoted">Idea Unvoted</option>
                  <option value="Idea Updated">Idea Updated</option>
                  <option value="Idea Voted">Idea Voted</option>
                  <option value="Note Created">Note Created</option>
                  <option value="Note Deleted">Note Deleted</option>
                  <option value="Note Updated">Note Updated</option>
                  <option value="Survey Submitted">Survey Submitted</option>
                </select>
              </div>
              <div className="flex gap-3">
                <input value={newWebhookUrl} onChange={e => setNewWebhookUrl(e.target.value)}
                  placeholder="https://your-server.com/webhook"
                  className="flex-1 px-3 py-2.5 rounded-xl border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)' }} />
                <button onClick={() => {
                    if (!newWebhookEvent || !newWebhookUrl) return
                    setWebhooks(prev => [...prev, { id: Date.now(), event: newWebhookEvent, url: newWebhookUrl }])
                    setNewWebhookUrl(''); setNewWebhookEvent('')
                  }}
                  className="px-5 py-2.5 rounded-xl font-semibold text-white text-sm cursor-pointer"
                  style={{ background: 'var(--coral)' }}>
                  Add
                </button>
              </div>
            </div>
            {webhooks.length > 0 && (
              <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                {webhooks.map(wh => (
                  <div key={wh.id} className="flex items-center justify-between p-4 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <div>
                      <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{wh.event}</p>
                      <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--slate)' }}>{wh.url}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: '#dcfce7', color: '#16a34a' }}>Active</span>
                      <button onClick={() => setWebhooks(prev => prev.filter(w => w.id !== wh.id))}
                        className="text-xs cursor-pointer hover:underline" style={{ color: '#ef4444' }}>Remove</button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* API tab */}
        {activeSettingsTab === 'widget' && (
          <div className="space-y-5">
            <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-5" style={{ color: 'var(--ink)' }}>Widget Display</h2>
              <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>Choose which sections to display in your embedded widget, and drag to set their order.</p>

              {/* Widget items — draggable + toggleable */}
              <div className="space-y-2 mb-6">
                {(() => {
                  const meta: Record<string, { state: boolean; set: (v: boolean) => void; desc: string }> = {
                    'Chat': { state: widgetChat, set: setWidgetChat, desc: 'Live chat with your team' },
                    'Feedback': { state: widgetFeedback, set: setWidgetFeedback, desc: 'Let users submit and vote on ideas' },
                    'Roadmap': { state: widgetRoadmap, set: setWidgetRoadmap, desc: 'Show your product roadmap' },
                    'Updates': { state: widgetUpdates, set: setWidgetUpdates, desc: 'Display announcements and changelog' },
                    'Knowledge Base': { state: widgetKnowledgeBase, set: setWidgetKnowledgeBase, desc: 'Link to help articles and docs' },
                  }
                  const labelFor: Record<string, string> = { 'Feedback': 'Feedback Board' }
                  return widgetOrder.map(label => {
                    const m = meta[label]
                    if (!m) return null
                    return (
                      <div key={label}
                        draggable
                        onDragStart={() => setDragWidgetItem(label)}
                        onDragOver={e => e.preventDefault()}
                        onDrop={() => {
                          if (!dragWidgetItem || dragWidgetItem === label) return
                          const next = [...widgetOrder]
                          const from = next.indexOf(dragWidgetItem)
                          const to = next.indexOf(label)
                          if (from === -1 || to === -1) return
                          next.splice(to, 0, next.splice(from, 1)[0])
                          setWidgetOrder(next)
                          setDragWidgetItem(null)
                          handleSave(false, { widgetOrder: next })
                        }}
                        className="flex items-center gap-3 p-3 rounded-xl border cursor-move"
                        style={{ borderColor: 'var(--border)', background: dragWidgetItem === label ? 'var(--peach)' : '#fff', opacity: m.state ? 1 : 0.55 }}>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" strokeLinecap="round" style={{ flexShrink: 0 }}><circle cx="9" cy="6" r="1"/><circle cx="9" cy="12" r="1"/><circle cx="9" cy="18" r="1"/><circle cx="15" cy="6" r="1"/><circle cx="15" cy="12" r="1"/><circle cx="15" cy="18" r="1"/></svg>
                        <div style={{ flex: 1 }}>
                          <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{labelFor[label] || label}</p>
                          <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{m.desc}</p>
                        </div>
                        <input type="checkbox" checked={m.state} onChange={() => { m.set(!m.state); handleSave(false, { [`widget${label.replace(/\s/g, '')}`]: !m.state }) }} className="w-5 h-5 rounded cursor-pointer" style={{ accentColor: 'var(--coral)' }} />
                      </div>
                    )
                  })
                })()}
              </div>

              {/* Widget order info */}
              <div className="p-3 rounded-xl" style={{ background: 'var(--canvas)', borderColor: 'var(--border)' }}>
                <p className="text-xs font-medium" style={{ color: 'var(--slate)' }}>Shown in the widget, in order: {widgetOrder.filter(s => {
                  if (s === 'Chat') return widgetChat
                  if (s === 'Feedback') return widgetFeedback
                  if (s === 'Roadmap') return widgetRoadmap
                  if (s === 'Updates') return widgetUpdates
                  if (s === 'Knowledge Base') return widgetKnowledgeBase
                  return false
                }).map(s => s === 'Feedback' ? 'Feedback Board' : s).join(', ') || 'nothing (all sections hidden)'}</p>
              </div>
            </div>

            <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>Feedback Widget</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>A floating button on your website that opens a popup with feedback, roadmap, and updates — just like UserJot.</p>

              {/* Live preview */}
              {company?.slug && (
                <div className="mb-5 rounded-2xl overflow-hidden border" style={{ borderColor: 'var(--border)', height: 480 }}>
                  <iframe
                    src={`/widget?slug=${company.slug}`}
                    style={{ width: '100%', height: '100%', border: 'none' }}
                    title="Widget preview"
                  />
                </div>
              )}

              {/* Embed code */}
              <div className="mb-5">
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>Embed on your website</p>
                <p className="text-xs mb-3" style={{ color: 'var(--slate)' }}>Paste this snippet anywhere before the <code>{`</body>`}</code> tag on your website. <Link href="/admin/crm-settings/install" className="font-semibold" style={{ color: 'var(--coral)' }}>Step-by-step for your platform, with a live check →</Link></p>
                <ShopifyNote />
                {company?.slug ? (
                  <>
                    <div className="rounded-xl p-4 font-mono text-xs overflow-x-auto" style={{ background: '#0d0d0d', color: '#a3e635', lineHeight: 1.6 }}>
                      {`<script src="https://colvy.com/widget.js" data-slug="${company.slug}" async></script>`}
                    </div>
                    <div className="flex gap-2 mt-3 flex-wrap">
                      <button onClick={() => {
                        navigator.clipboard.writeText(`<script src="https://colvy.com/widget.js" data-slug="${company?.slug}" async></script>`)
                        setWidgetCopied('embed')
                        setTimeout(() => setWidgetCopied(''), 2000)
                      }} className="px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)', border: 'none' }}>
                        {widgetCopied === 'embed' ? '✓ Copied!' : 'Copy embed code'}
                      </button>
                      <a href={`/widget?slug=${company.slug}`} target="_blank" className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer" style={{ border: '1px solid var(--border)', color: 'var(--ink)', textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
                        Open full preview →
                      </a>
                    </div>
                  </>
                ) : (
                  <div className="p-4 rounded-xl" style={{ background: 'var(--canvas)', color: 'var(--slate)', fontSize: 13 }}>
                    Set up your Colvy URL first to get the embed code.
                  </div>
                )}
              </div>

              {/* iFrame embed option */}
              <div>
                <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>Or embed as inline iframe</p>
                <p className="text-xs mb-3" style={{ color: 'var(--slate)' }}>Drop this into a Help page, internal docs, or any webpage to show feedback inline.</p>
                {company?.slug && (
                  <>
                    <div className="rounded-xl p-4 font-mono text-xs overflow-x-auto" style={{ background: '#0d0d0d', color: '#a3e635', lineHeight: 1.6 }}>
                      {`<iframe src="https://colvy.com/widget?slug=${company.slug}&embed=1" width="100%" height="540" frameborder="0" style="border-radius:16px;"></iframe>`}
                    </div>
                    <button onClick={() => {
                      navigator.clipboard.writeText(`<iframe src="https://colvy.com/widget?slug=${company?.slug}&embed=1" width="100%" height="540" frameborder="0" style="border-radius:16px;"></iframe>`)
                      setWidgetCopied('iframe')
                      setTimeout(() => setWidgetCopied(''), 2000)
                    }} className="mt-3 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer" style={{ background: 'var(--coral)', border: 'none' }}>
                      {widgetCopied === 'iframe' ? '✓ Copied!' : 'Copy iframe code'}
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSettingsTab === 'api' && (
          <div className="space-y-5">
            <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center gap-2 mb-1">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/></svg>
                <h2 className="font-bold" style={{ color: 'var(--ink)' }}>WordPress plugin</h2>
              </div>
              <p className="text-sm mb-3" style={{ color: 'var(--slate)' }}>One plugin for your site: chat widget, WooCommerce orders and abandoned carts, “Notify me” on sold-out products, booking page embed and branding. Install it, then paste these two values into <strong>Colvy → Connection</strong> in your WP admin. It replaces the older Colvy Dashboard and Colvy Bridge plugins and keeps their settings.</p>
              <a href="/downloads/colvy-wordpress.zip" download className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold mb-4" style={{ background: 'var(--coral)', color: '#fff' }}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3v12M7 10l5 5 5-5" /><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /></svg>
                Download plugin (v{WP_PLUGIN_VERSION})
              </a>
              <div className="space-y-3">
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--slate)' }}>Company ID</label>
                  <div className="flex gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg border text-xs overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>{company?.id || '—'}</code>
                    <button onClick={() => { navigator.clipboard?.writeText(company?.id || ''); showToast('Company ID copied', 'success') }} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>Copy</button>
                  </div>
                </div>
                <div>
                  <label className="text-xs font-semibold block mb-1" style={{ color: 'var(--slate)' }}>API key</label>
                  <div className="flex gap-2">
                    <code className="flex-1 px-3 py-2 rounded-lg border text-xs overflow-x-auto" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>{pluginKey ? (showPluginKey ? pluginKey : pluginKey.slice(0, 10) + '••••••••••••') : 'Loading…'}</code>
                    <button onClick={() => setShowPluginKey(v => !v)} className="px-3 py-2 rounded-lg text-xs font-semibold border" style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>{showPluginKey ? 'Hide' : 'Show'}</button>
                    <button onClick={() => { navigator.clipboard?.writeText(pluginKey || ''); showToast('API key copied', 'success') }} className="px-3 py-2 rounded-lg text-xs font-semibold" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>Copy</button>
                  </div>
                </div>
              </div>
              <p className="text-xs mt-3" style={{ color: 'var(--slate)' }}>Keep your API key private — it lets the plugin update your board's branding and settings.</p>
            </div>

            <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>API Keys</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>Build your own integration using the Colvy API. <a href="https://developers.colvy.com" target="_blank" className="hover:underline" style={{ color: 'var(--coral)' }}>View API documentation →</a></p>
              <div className="flex gap-3 mb-5">
                <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)}
                  placeholder="Key name (e.g. Production)"
                  className="flex-1 px-3 py-2.5 rounded-xl border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)' }} />
                <button onClick={() => {
                    if (!newKeyName.trim()) return
                    const bytes = new Uint8Array(24)
                    crypto.getRandomValues(bytes)
                    const key = 'ck_' + Array.from(bytes).map(b => b.toString(16).padStart(2,'0')).join('')
                    setApiKeys(prev => [...prev, { id: Date.now(), name: newKeyName.trim(), key, created: new Date().toLocaleDateString() }])
                    setGeneratedKey(key)
                    setNewKeyName('')
                  }}
                  className="px-5 py-2.5 rounded-xl font-semibold text-white text-sm cursor-pointer"
                  style={{ background: 'var(--coral)' }}>
                  Create API Key
                </button>
              </div>
              {generatedKey && (
                <div className="p-4 rounded-xl mb-4" style={{ background: '#dcfce7', border: '1px solid #86efac' }}>
                  <p className="text-sm font-semibold mb-2" style={{ color: '#16a34a' }}>✓ New API key created — copy it now, it will not be shown again</p>
                  <div className="flex items-center gap-2">
                    <code className="text-xs flex-1 font-mono break-all" style={{ color: '#166534' }}>{generatedKey}</code>
                    <button onClick={() => { navigator.clipboard.writeText(generatedKey); setGeneratedKey('') }}
                      className="text-xs px-3 py-1.5 rounded-lg cursor-pointer shrink-0" style={{ background: '#16a34a', color: '#fff' }}>
                      Copy
                    </button>
                  </div>
                </div>
              )}
              {apiKeys.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--slate)' }}>No API keys yet. Create one above.</p>
              ) : (
                <div className="border rounded-xl overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  {apiKeys.map(k => (
                    <div key={k.id} className="flex items-center justify-between p-4 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{k.name}</p>
                        <p className="text-xs font-mono mt-0.5" style={{ color: 'var(--slate)' }}>ck_••••••••••••••••••••••••••••••••••••••••••••••••</p>
                        <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Created {k.created}</p>
                      </div>
                      <button onClick={() => setApiKeys(prev => prev.filter(key => key.id !== k.id))}
                        className="text-xs cursor-pointer hover:underline" style={{ color: '#ef4444' }}>Revoke</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Terminology tab */}
        {activeSettingsTab === 'categories' && (
          <div className="space-y-5">
            <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>Categories</h2>
              <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>Use Categories to organize your Announcements.</p>

              <div className="flex gap-2 mb-5">
                <input
                  value={newCategoryName}
                  onChange={e => setNewCategoryName(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newCategoryName.trim()) {
                      setCategories(prev => [...prev, newCategoryName.trim()])
                      setNewCategoryName('')
                    }
                  }}
                  placeholder="New category name..."
                  className="flex-1 px-4 py-2.5 rounded-xl border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}
                />
                <button
                  onClick={() => {
                    if (!newCategoryName.trim()) return
                    setCategories(prev => [...prev, newCategoryName.trim()])
                    setNewCategoryName('')
                  }}
                  disabled={!newCategoryName.trim()}
                  className="px-5 py-2.5 rounded-xl font-semibold text-white text-sm cursor-pointer disabled:opacity-50"
                  style={{ background: 'var(--coral)' }}>
                  Add Category
                </button>
              </div>

              <div className="space-y-0">
                {categories.map((cat, i) => (
                  <div key={cat + i}
                    draggable
                    onDragStart={() => setDragNavItem(cat)}
                    onDragOver={e => e.preventDefault()}
                    onDrop={() => {
                      if (!dragNavItem || dragNavItem === cat) return
                      const newCats = [...categories]
                      const from = newCats.indexOf(dragNavItem)
                      const to = newCats.indexOf(cat)
                      newCats.splice(from, 1)
                      newCats.splice(to, 0, dragNavItem)
                      setCategories(newCats)
                      setDragNavItem(null)
                    }}
                    onDragEnd={() => setDragNavItem(null)}
                    className="flex items-center gap-3 py-3 px-2 border-b last:border-b-0 cursor-grab active:cursor-grabbing"
                    style={{ borderColor: 'var(--border)', opacity: dragNavItem === cat ? 0.4 : 1, background: dragNavItem === cat ? 'var(--peach)' : 'transparent', borderRadius: 8 }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)', opacity: 0.4, flexShrink: 0 }}>
                      <circle cx="9" cy="6" r="1" fill="currentColor"/><circle cx="15" cy="6" r="1" fill="currentColor"/>
                      <circle cx="9" cy="12" r="1" fill="currentColor"/><circle cx="15" cy="12" r="1" fill="currentColor"/>
                      <circle cx="9" cy="18" r="1" fill="currentColor"/><circle cx="15" cy="18" r="1" fill="currentColor"/>
                    </svg>
                    <span className="text-sm flex-1" style={{ color: 'var(--ink)' }}>{cat}</span>
                    <button
                      onClick={() => setCategories(prev => prev.filter((_, idx) => idx !== i))}
                      className="text-xs cursor-pointer px-2 py-1 rounded-md hover:bg-red-50"
                      style={{ color: '#ef4444', border: 'none', background: 'transparent' }}>
                      Remove
                    </button>
                  </div>
                ))}
                {categories.length === 0 && (
                  <p className="text-sm text-center py-8" style={{ color: 'var(--slate)' }}>No categories yet. Add one above.</p>
                )}
              </div>
            </div>
          </div>
        )}

        {activeSettingsTab === 'terminology' && (
          <TerminologySettings values={termValues} onChange={setTermValues} saving={saving} />
        )}

        {/* General, Theme, Emails tabs — show content based on activeSettingsTab */}
        {activeSettingsTab === 'overview' && (
          <OverviewMetrics overview={overview} days={overviewDays} onDays={setOverviewDays} loading={overviewLoading} />
        )}

        {/* Theme: logo and icons, colour, corners, appearance, seasonal theme, with a live preview */}
        {activeSettingsTab === 'theme' && (
          <ThemeSettings
            companyName={companyName}
            host={boardDomain || (company?.slug ? `${company.slug}.colvy.com` : 'yourboard.colvy.com')}
            logoUrl={logoUrl} faviconUrl={faviconUrl} ogImageUrl={ogImageUrl}
            onLogoFile={handleLogoUpload} onFaviconFile={handleFaviconUpload} onOgFile={handleOgUpload}
            onLogoRemove={() => setLogoUrl('')} onFaviconRemove={() => setFaviconUrl('')} onOgRemove={() => setOgImageUrl('')}
            accent={accentColor} setAccent={setAccentColor}
            suggested={suggestedColor}
            onSuggested={use => { if (use && suggestedColor) setAccentColor(suggestedColor); setSuggestedColor(null) }}
            onMatchLogo={async () => { if (!logoUrl) return; const c = await extractDominantColor(logoUrl); if (c) setAccentColor(c); else showToast('Couldn\u2019t read a colour from the logo', 'info', 2500) }}
            themeMode={themeMode} setThemeMode={setThemeMode}
            radius={borderRadius} setRadius={setBorderRadius}
            seasonal={seasonal} setSeasonal={setSeasonal}
          />
        )}

        {(activeSettingsTab === 'general' || activeSettingsTab === 'emails') && (<>

          {/* Company section */}
          {activeSettingsTab === 'general' && (
          <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--ink)' }}>Company</h2>

            {/* Logo, favicon and share image live in Theme now. */}
            <Link href="/admin/settings#theme" className="st-theme-hint">
              <span className="st-theme-hint-logo" style={{ background: logoUrl ? '#fff' : accentColor }}>{logoUrl ? <img src={logoUrl} alt="" /> : (companyName || 'Y').charAt(0).toUpperCase()}</span>
              <span><b>Logo, colours and icons</b><small>Change how your board looks in Theme</small></span>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
            </Link>
            <style>{`.st-theme-hint{display:flex;align-items:center;gap:12px;margin-bottom:24px;padding:12px 14px;border-radius:16px;background:#f7f7f8;color:#18181b;text-decoration:none;transition:background .15s ease}.st-theme-hint:hover{background:#f1f1f3}.st-theme-hint b{display:block;font-size:14px;font-weight:650}.st-theme-hint small{font-size:12.5px;color:#71717a}.st-theme-hint svg{margin-left:auto;color:#a1a1aa}.st-theme-hint-logo{width:40px;height:40px;flex-shrink:0;border-radius:12px;display:inline-flex;align-items:center;justify-content:center;overflow:hidden;color:#fff;font-weight:800;box-shadow:inset 0 0 0 1px rgba(0,0,0,.06)}.st-theme-hint-logo img{width:100%;height:100%;object-fit:contain}[data-theme="dark"] .st-theme-hint{background:#1c1c1f;color:#ededf0}[data-theme="dark"] .st-theme-hint:hover{background:#232326}`}</style>

            {/* Company name */}
            <div className="mb-6">
              <label className="text-sm font-semibold block mb-2" style={{ color: 'var(--ink)' }}>Company name</label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: 'var(--border)', fontSize: '16px' }}
              />
            </div>

            {/* Default homepage */}
            <div className="mb-6">
              <label className="text-sm font-semibold block mb-2" style={{ color: 'var(--ink)' }}>Default homepage</label>
              <p className="text-xs mb-2" style={{ color: 'var(--slate)' }}>Where your logo link and "/" takes logged-in users.</p>
              <select
                value={defaultHomepage}
                onChange={e => setDefaultHomepage(e.target.value)}
                className="w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none cursor-pointer"
                style={{ borderColor: 'var(--border)', fontSize: '16px', color: 'var(--ink)' }}>
                <option value="ideas">Ideas board</option>
                <option value="roadmap">Roadmap</option>
                <option value="announcements">Announcements</option>
                <option value="help">Help Centre</option>
              </select>
            </div>

            {/* Remove demo data */}
            <div className="mb-6 p-4 rounded-xl" style={{ background: '#fef2f2', border: '1px solid #fecaca' }}>
              <p className="text-sm font-semibold mb-1" style={{ color: '#991b1b' }}>Remove demo data</p>
              <p className="text-xs mb-3" style={{ color: '#991b1b', opacity: 0.8 }}>
                Deletes all sample ideas, topics, statuses, and announcements that were auto-generated on signup. This cannot be undone.
              </p>
              <button
                onClick={async () => {
                  if (!await confirmDialog('This will permanently delete all demo/sample data from your board. Continue?')) return
                  setRemovingDemo(true)
                  try {
                    const cid = company?.id
                    if (cid) {
                      await (supabase as any).from('ideas').delete().eq('company_id', cid).ilike('created_by_name', '%demo%')
                      await (supabase as any).from('ideas').delete().eq('company_id', cid).or('title.ilike.%[Example%,title.ilike.%[Demo%')
                      await (supabase as any).from('announcements').delete().eq('company_id', cid).ilike('title', '%[Example%')
                    }
                    setDemoRemoved(true)
                    setTimeout(() => setDemoRemoved(false), 3000)
                  } catch (e) { console.error(e) }
                  setRemovingDemo(false)
                }}
                disabled={removingDemo}
                className="px-4 py-2 rounded-lg text-sm font-semibold cursor-pointer disabled:opacity-50"
                style={{ background: '#dc2626', color: '#fff', border: 'none' }}>
                {removingDemo ? 'Removing...' : demoRemoved ? '✓ Demo data removed' : 'Remove demo data'}
              </button>
            </div>

            {/* Logo link */}
            <div className="mb-6">
              <label className="text-sm font-semibold block mb-2" style={{ color: 'var(--ink)' }}>Logo link</label>
              <input
                type="text"
                value={logoLink}
                onChange={e => setLogoLink(e.target.value)}
                placeholder="https://"
                className="w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none"
                style={{ borderColor: 'var(--border)', fontSize: '16px' }}
              />
            </div>
          </div>
          )}

          {/* Email Customization */}
          <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--ink)' }}>Email Customization</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>
              Customize emails sent to your users.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>From name</label>
                <input
                  type="text"
                  value={emailFromName}
                  onChange={(e) => setEmailFromName(e.target.value)}
                  placeholder={companyName || 'YourApp'}
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
                  Name shown in email "From" field. Example: "{emailFromName || companyName || 'YourApp'} &lt;noreply@yourapp.com&gt;"
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Reply-to email</label>
                <input
                  type="email"
                  value={emailReplyTo}
                  onChange={(e) => setEmailReplyTo(e.target.value)}
                  placeholder="support@yourcompany.com"
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
                  When users reply to your emails, replies go to this address.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email signature</label>
                <textarea
                  value={emailSignature}
                  onChange={(e) => setEmailSignature(e.target.value)}
                  placeholder={`Thanks,\nThe ${companyName || 'YourApp'} team\n\nFollow us on Twitter @yourapp`}
                  rows={4}
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none resize-none"
                  style={{ borderColor: 'var(--border)', fontSize: '14px' }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
                  Appears at the bottom of every email sent to users.
                </p>
              </div>

              {/* Email preview */}
              <div className="mt-4 p-4 rounded-lg border-2 border-dashed" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Email Preview</p>
                <div className="bg-white rounded-lg p-4 shadow-sm">
                  <div className="text-xs mb-3 pb-2 border-b" style={{ color: 'var(--slate)', borderColor: 'var(--border)' }}>
                    <p><strong>From:</strong> {emailFromName || companyName || 'YourApp'} &lt;noreply@yourapp.com&gt;</p>
                    {emailReplyTo && <p><strong>Reply-To:</strong> {emailReplyTo}</p>}
                    <p><strong>Subject:</strong> Your idea has been updated!</p>
                  </div>
                  <p className="text-sm mb-3" style={{ color: 'var(--ink)' }}>Hi there!</p>
                  <p className="text-sm mb-3" style={{ color: 'var(--ink)' }}>Your idea "Dark mode support" has been moved to <strong>In Progress</strong>.</p>
                  {emailSignature && (
                    <pre className="text-sm mt-4 pt-3 border-t whitespace-pre-wrap font-sans" style={{ color: 'var(--slate)', borderColor: 'var(--border)' }}>{emailSignature}</pre>
                  )}
                </div>
              </div>
            </div>
          </div>

          {activeSettingsTab === 'general' && (<>
          {/* White Labelling */}
          <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-start justify-between mb-1">
              <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>White Labelling</h2>
              <span className="text-xs px-2 py-1 rounded-full font-semibold" style={{ background: 'linear-gradient(135deg, var(--coral), #ffb84d)', color: 'white' }}>
                ✨ PRO
              </span>
            </div>
            <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>
              Remove all branding and use your own domain for a fully white-labelled experience.
            </p>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg" style={{ background: 'var(--canvas)' }}>
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Hide "Powered by" branding</p>
                  <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Remove the footer attribution badge.</p>
                </div>
                {brandingEntitled ? (
                  <button
                    onClick={() => setHidePoweredBy(!hidePoweredBy)}
                    className="relative w-11 h-6 rounded-full transition-smooth cursor-pointer shrink-0 ml-3"
                    style={{ background: hidePoweredBy ? accentColor : '#d1d5db' }}>
                    <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                      style={{ transform: hidePoweredBy ? 'translateX(22px)' : 'translateX(2px)' }} />
                  </button>
                ) : (
                  <Link href="/admin/billing" className="shrink-0 ml-3 text-xs font-semibold px-3 py-1.5 rounded-full" style={{ background: '#fff1ec', color: 'var(--coral)', textDecoration: 'none', whiteSpace: 'nowrap' }}><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" style={{ display: 'inline', verticalAlign: '-1px', marginRight: 4 }}><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>Upgrade to remove</Link>
                )}
              </div>

              {/* Colvy subdomain — always available */}
              <div className="p-4 rounded-xl border" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                <div className="flex items-center justify-between mb-1">
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Your Colvy URL</p>
                  <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#dcfce7', color: '#16a34a' }}>● Active</span>
                </div>
                <p className="text-sm font-mono" style={{ color: 'var(--coral)' }}>
                  {company?.slug
                    ? `${company.slug}.colvy.com`
                    : typeof window !== 'undefined' && window.location.hostname.endsWith('.colvy.com')
                    ? window.location.hostname
                    : 'yourslug.colvy.com'}
                </p>
                <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>This is your permanent Colvy URL — always active, no setup needed.</p>
              </div>

              {/* Board custom domain */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    Custom board domain
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>Pro</span>
                  </label>
                  {domainStatus['board'] === 'verified' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#dcfce7', color: '#16a34a' }}>✓ Verified</span>
                  )}
                  {domainStatus['board'] === 'error' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#fee2e2', color: '#dc2626' }}>✗ Not found</span>
                  )}
                </div>
                {(() => { const boardLocked = domainStatus['board'] === 'verified' && !domainEditing['board']; return (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={boardDomain}
                    onChange={e => setBoardDomain(e.target.value.toLowerCase())}
                    readOnly={boardLocked}
                    placeholder="feedback.yourcompany.com"
                    className="flex-1 px-4 py-2.5 rounded-xl border focus:outline-none text-sm"
                    style={{ borderColor: domainStatus['board'] === 'verified' ? '#10b981' : domainStatus['board'] === 'error' ? '#ef4444' : 'var(--border)', fontSize: '16px', background: boardLocked ? 'var(--canvas)' : '#fff', cursor: boardLocked ? 'default' : 'text' }}
                  />
                  {boardLocked ? (
                    <button
                      onClick={() => setDomainEditing(p => ({ ...p, board: true }))}
                      className="px-4 py-2.5 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50 shrink-0"
                      style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                      Change
                    </button>
                  ) : (
                  <button
                    onClick={async () => {
                      if (!boardDomain) return
                      setDomainStatus(p => ({ ...p, board: 'verifying' }))
                      try {
                        const res = await authFetch(`/api/verify-domain?domain=${encodeURIComponent(boardDomain)}&companyId=${company?.id}`)
                        const data = await res.json()
                        const ok = !!data.verified
                        setDomainStatus(p => ({ ...p, board: ok ? 'verified' : 'error' }))
                        if (ok) setDomainEditing(p => ({ ...p, board: false }))
                      } catch {
                        setDomainStatus(p => ({ ...p, board: 'error' }))
                      }
                    }}
                    disabled={!boardDomain || domainStatus['board'] === 'verifying'}
                    className="px-4 py-2.5 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 shrink-0"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    {domainStatus['board'] === 'verifying' ? 'Checking...' : 'Verify'}
                  </button>
                  )}
                </div>
                )})()}
                <p className="text-xs mt-1.5" style={{ color: 'var(--slate)' }}>
                  Your feedback board will be accessible at this domain.
                </p>
              </div>

              {/* Help centre custom domain */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                    Custom help centre domain
                    <span className="ml-2 text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>Pro</span>
                  </label>
                  {domainStatus['help'] === 'verified' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#dcfce7', color: '#16a34a' }}>✓ Verified</span>
                  )}
                  {domainStatus['help'] === 'error' && (
                    <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{ background: '#fee2e2', color: '#dc2626' }}>✗ Not found</span>
                  )}
                </div>
                {(() => { const helpLocked = domainStatus['help'] === 'verified' && !domainEditing['help']; return (
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={helpDomain}
                    onChange={e => setHelpDomain(e.target.value.toLowerCase())}
                    readOnly={helpLocked}
                    placeholder="help.yourcompany.com"
                    className="flex-1 px-4 py-2.5 rounded-xl border focus:outline-none text-sm"
                    style={{ borderColor: domainStatus['help'] === 'verified' ? '#10b981' : domainStatus['help'] === 'error' ? '#ef4444' : 'var(--border)', fontSize: '16px', background: helpLocked ? 'var(--canvas)' : '#fff', cursor: helpLocked ? 'default' : 'text' }}
                  />
                  {helpLocked ? (
                    <button
                      onClick={() => setDomainEditing(p => ({ ...p, help: true }))}
                      className="px-4 py-2.5 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50 shrink-0"
                      style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                      Change
                    </button>
                  ) : (
                  <button
                    onClick={async () => {
                      if (!helpDomain) return
                      setDomainStatus(p => ({ ...p, help: 'verifying' }))
                      try {
                        const res = await authFetch(`/api/verify-domain?domain=${encodeURIComponent(helpDomain)}&companyId=${company?.id}`)
                        const data = await res.json()
                        const ok = !!data.verified
                        setDomainStatus(p => ({ ...p, help: ok ? 'verified' : 'error' }))
                        if (ok) setDomainEditing(p => ({ ...p, help: false }))
                      } catch {
                        setDomainStatus(p => ({ ...p, help: 'error' }))
                      }
                    }}
                    disabled={!helpDomain || domainStatus['help'] === 'verifying'}
                    className="px-4 py-2.5 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 shrink-0"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    {domainStatus['help'] === 'verifying' ? 'Checking...' : 'Verify'}
                  </button>
                  )}
                </div>
                )})()}
                <p className="text-xs mt-1.5" style={{ color: 'var(--slate)' }}>
                  Your help centre will be accessible at this domain.
                </p>
              </div>

              {/* DNS instructions */}
              {(boardDomain || helpDomain) && (
                <div className="rounded-xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                  <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                    <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>📋 DNS Setup Instructions</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Add these records in your DNS provider (Cloudflare, GoDaddy, etc.)</p>
                  </div>
                  <div className="p-4 space-y-3">
                    {boardDomain && (
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--slate)' }}>For <span style={{ color: 'var(--coral)' }}>{boardDomain}</span>:</p>
                        <div className="rounded-lg overflow-hidden border text-xs font-mono" style={{ borderColor: 'var(--border)' }}>
                          <div className="grid grid-cols-3 px-3 py-2 border-b font-semibold" style={{ borderColor: 'var(--border)', background: 'var(--canvas)', color: 'var(--slate)' }}>
                            <span>Type</span><span>Name</span><span>Value</span>
                          </div>
                          <div className="grid grid-cols-3 px-3 py-2" style={{ color: 'var(--ink)' }}>
                            <span className="text-blue-600 font-bold">CNAME</span>
                            <span>{boardDomain.split('.')[0]}</span>
                            <span style={{ color: 'var(--coral)' }}>{CUSTOM_CNAME}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    {helpDomain && (
                      <div>
                        <p className="text-xs font-semibold mb-2" style={{ color: 'var(--slate)' }}>For <span style={{ color: 'var(--coral)' }}>{helpDomain}</span>:</p>
                        <div className="rounded-lg overflow-hidden border text-xs font-mono" style={{ borderColor: 'var(--border)' }}>
                          <div className="grid grid-cols-3 px-3 py-2 border-b font-semibold" style={{ borderColor: 'var(--border)', background: 'var(--canvas)', color: 'var(--slate)' }}>
                            <span>Type</span><span>Name</span><span>Value</span>
                          </div>
                          <div className="grid grid-cols-3 px-3 py-2" style={{ color: 'var(--ink)' }}>
                            <span className="text-blue-600 font-bold">CNAME</span>
                            <span>{helpDomain.split('.')[0]}</span>
                            <span style={{ color: 'var(--coral)' }}>{CUSTOM_CNAME}</span>
                          </div>
                        </div>
                      </div>
                    )}
                    <div className="flex items-start gap-2 pt-1">
                      <span className="text-xs" style={{ color: 'var(--slate)' }}>⏱️</span>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>DNS changes can take up to 24 hours to propagate. Once they do, click Verify above.</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Guest Access */}
          <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--ink)' }}>Guest Access</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>
              Control whether non-registered users can participate. They'll enter their name and email to submit or vote.
            </p>
            <div className="space-y-4">
              {[
                { label: 'Allow guest voting', sublabel: 'Guests can vote on ideas by entering their name & email', value: guestVotingEnabled, setter: setGuestVotingEnabled },
                { label: 'Allow guest idea submission', sublabel: 'Guests can submit new ideas without an account', value: guestSubmitEnabled, setter: setGuestSubmitEnabled },
              ].map(opt => (
                <div key={opt.label} className="flex items-center justify-between py-2">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{opt.label}</p>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{opt.sublabel}</p>
                  </div>
                  <button
                    onClick={() => opt.setter(!opt.value)}
                    className="relative shrink-0 ml-4 w-11 h-6 rounded-full transition-smooth cursor-pointer"
                    style={{ background: opt.value ? accentColor : '#d1d5db' }}>
                    <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                      style={{ transform: opt.value ? 'translateX(22px)' : 'translateX(2px)' }} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Site Navigation */}
          <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--ink)' }}>Site Navigation</h2>
            <div className="space-y-3">
              {[
                { label: 'Ideas', value: navIdeas, setter: setNavIdeas },
                { label: 'Roadmap', value: navRoadmap, setter: setNavRoadmap },
                { label: 'Announcements', value: navAnnouncements, setter: setNavAnnouncements },
                { label: 'Help Centre', value: navHelp, setter: setNavHelp },
              ].map(nav => (
                <div key={nav.label} className="flex items-center justify-between py-2">
                  <span className="text-sm" style={{ color: 'var(--ink)' }}>{nav.label}</span>
                  <button 
                    onClick={() => nav.setter(!nav.value)}
                    className="relative w-11 h-6 rounded-full transition-smooth cursor-pointer" 
                    style={{ background: nav.value ? 'var(--coral)' : '#d1d5db' }}>
                    <div 
                      className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform" 
                      style={{ transform: nav.value ? 'translateX(22px)' : 'translateX(2px)' }} 
                    />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs mt-4" style={{ color: 'var(--slate)' }}>
              Toggle visibility of navigation items. Hidden items will not appear in the top menu.
            </p>
          </div>

          {/* Add Script - Colvy Style */}
          <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Add Script</h2>
              <button className="text-xs px-3 py-1 rounded-full transition-smooth hover:bg-gray-100 cursor-pointer" style={{ color: 'var(--slate)' }}>
                Ignore step
              </button>
            </div>

            {/* Step 1 */}
            <div className="mb-5">
              <div className="flex items-center justify-between mb-2">
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>1. Copy the code below</p>
                <button className="text-xs flex items-center gap-1 cursor-pointer hover:opacity-70" style={{ color: 'var(--coral)' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  Hide code snippet
                </button>
              </div>
              <div className="relative">
                <pre className="text-xs rounded-lg p-4 overflow-x-auto" style={{ background: '#1e1e2e', color: '#cdd6f4', fontFamily: 'Menlo, Monaco, Consolas, monospace' }}>
                  <code>{`<!-- YourApp Widget Script -->
<script>
(function(t,r){function s(){var a=r.getElementsByTagName("script")[0],e=r.createElement("script");e.type="text/javascript",e.async=!0,e.src="${typeof window !== 'undefined' ? window.location.origin : 'https://yourapp.com'}/widget.js";a.parentNode.insertBefore(e,a)}if(!t.YourApp){var o=0,i={};t.YourApp=function(e,p){var n,l=o++,c=new Promise(function(v,d){i[l]={params:[e,p],resolve:function(f){n=f,v(f)},reject:d}});return c.destroy=function(){delete i[l],n&&n.destroy()},c},t.YourApp.q=i;}r.readyState==="complete"||r.readyState==="interactive"?s():r.addEventListener("DOMContentLoaded",s)})(window,document);
window.YourApp('container', {
  key: 'container_${user?.id?.slice(0, 12) || 'YOUR_KEY_HERE'}',
  // Identify your users (optional)
  // user: { email: 'email@domain.com', name: 'User' }
})
</script>
<!-- End YourApp Script -->`}</code>
                </pre>
                <button 
                  onClick={() => {
                    const code = `<!-- YourApp Widget Script -->\n<script>(function(t,r){function s(){var a=r.getElementsByTagName("script")[0],e=r.createElement("script");e.type="text/javascript",e.async=!0,e.src="${window.location.origin}/widget.js";a.parentNode.insertBefore(e,a)}if(!t.YourApp){var o=0,i={};t.YourApp=function(e,p){var n,l=o++,c=new Promise(function(v,d){i[l]={params:[e,p],resolve:function(f){n=f,v(f)},reject:d}});return c.destroy=function(){delete i[l],n&&n.destroy()},c},t.YourApp.q=i;}r.readyState==="complete"||r.readyState==="interactive"?s():r.addEventListener("DOMContentLoaded",s)})(window,document);\nwindow.YourApp('container', { key: 'container_${user?.id?.slice(0, 12) || 'YOUR_KEY_HERE'}' });\n</script>\n<!-- End YourApp Script -->`
                    navigator.clipboard.writeText(code)
                    alert('Code copied to clipboard!')
                  }}
                  className="absolute top-2 right-2 px-3 py-1.5 rounded-md text-xs font-medium bg-white/10 hover:bg-white/20 transition-smooth cursor-pointer flex items-center gap-1"
                  style={{ color: '#cdd6f4' }}>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  Copy code
                </button>
              </div>
            </div>

            {/* Step 2 */}
            <div className="mb-5">
              <p className="text-sm font-semibold mb-1" style={{ color: 'var(--ink)' }}>2. Paste the code into your website or app</p>
              <p className="text-xs" style={{ color: 'var(--slate)' }}>
                The code needs to be placed before the closing <code className="px-1 py-0.5 rounded text-xs" style={{ background: 'var(--canvas)', color: 'var(--coral)' }}>&lt;/body&gt;</code> tag.
              </p>
              <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>
                Using GTM? <a href="#" className="underline" style={{ color: 'var(--coral)' }}>See our guide</a>. 
                Or see our <a href="#" className="underline" style={{ color: 'var(--coral)' }}>developer docs</a> for advanced usage.
              </p>
            </div>

            {/* Step 3 */}
            <div>
              <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>3. Test the script</p>
              <button 
                onClick={() => alert('Add the snippet to your website, then click here to verify installation.')}
                className="px-4 py-2 rounded-lg text-sm font-medium border transition-smooth cursor-pointer hover:bg-gray-50"
                style={{ borderColor: 'var(--coral)', color: 'var(--coral)' }}>
                Test installation
              </button>
            </div>
          </div>

          {/* Custom Analytics Script */}
          <div className="st-sec" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--ink)' }}>Custom Analytics Script</h2>
            <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>
              Add Google Analytics, Mixpanel, Intercom, or any other tracking code.
            </p>
            <textarea
              value={customScript}
              onChange={(e) => setCustomScript(e.target.value)}
              placeholder={'<!-- Example: Google Analytics -->\n<script async src="https://www.googletagmanager.com/gtag/js?id=GA_ID"></script>'}
              rows={6}
              className="w-full px-4 py-3 rounded-lg border text-sm font-mono focus:outline-none"
              style={{ 
                borderColor: 'var(--border)', 
                color: 'var(--ink)',
                background: '#f8f9fa',
              }}
            />
          </div>

          </>)}

          {/* Save */}
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-green-600">✓ Saved</span>}
            <button
              onClick={() => handleSave(true)}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl font-semibold text-white text-sm transition-smooth press-effect cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--coral)' }}>
              {saving ? 'Saving...' : 'Save Changes'}
            </button>
          </div>
        </>)}
        </>
      )}
      </div>
      </div>
    </div>
    </>
  )
}
