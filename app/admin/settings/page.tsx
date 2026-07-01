'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'


const SIDEBAR_ITEMS = [
  { section: null, items: [
    { label: 'General', tab: 'general' },
    { label: 'Invite Team', href: '/admin/team' },
    { label: 'Languages', tab: 'languages' },
    { label: 'Statuses', href: '/admin/statuses' },
    { label: 'Topics', href: '/admin/topics' },
    { label: 'Priorities', href: '/admin/priorities' },
    { label: 'Miscellaneous', tab: 'misc' },
  ]},
  { section: 'Plan', items: [
    { label: 'Upgrade', href: '/admin/upgrade' },
    { label: 'Billing', href: '/admin/billing' },
  ]},
  { section: 'Styling', items: [
    { label: 'Theme', tab: 'theme' },
    { label: 'Emails', tab: 'emails' },
    { label: 'White Labeling', tab: 'whitelabel' },
  ]},
  { section: 'Authentication', items: [
    { label: 'General', tab: 'auth' },
    { label: 'Privacy', tab: 'privacy' },
  ]},
  { section: 'API & Integrations', items: [
    { label: 'Widget', tab: 'widget' },
    { label: 'Integrations', href: '/admin/integrations' },
    { label: 'Webhooks', tab: 'webhooks' },
    { label: 'API', tab: 'api' },
  ]},
  { section: 'Site Navigation', items: [
    { label: 'Navigation', tab: 'nav' },
    { label: 'Terminology', tab: 'terminology' },
    { label: 'Categories', tab: 'categories' },
  ]},
]

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loadedCompany, setLoadedCompany] = useState(false)
  const [companyName, setCompanyName] = useState('YourApp')
  const [logoUrl, setLogoUrl] = useState('')
  const [faviconUrl, setFaviconUrl] = useState('')
  const [ogImageUrl, setOgImageUrl] = useState('')
  const [logoLink, setLogoLink] = useState('')
  const [customScript, setCustomScript] = useState('')
  const [navIdeas, setNavIdeas] = useState(true)
  const [navRoadmap, setNavRoadmap] = useState(true)
  const [navAnnouncements, setNavAnnouncements] = useState(true)
  const [navHelp, setNavHelp] = useState(true)
  const [navOrder, setNavOrder] = useState(['Ideas', 'Roadmap', 'Updates', 'Help Centre'])
  // Webhooks
  const [webhooks, setWebhooks] = useState<any[]>([])
  const [webhookSecret] = useState(() => typeof crypto !== 'undefined' ? crypto.randomUUID?.() || '20d12d0e-f851-4b1b-ac88-d31637988152' : '20d12d0e-f851-4b1b-ac88-d31637988152')
  const [newWebhookEvent, setNewWebhookEvent] = useState('')
  const [newWebhookUrl, setNewWebhookUrl] = useState('')
  // API Keys
  const [apiKeys, setApiKeys] = useState<any[]>([])
  const [newKeyName, setNewKeyName] = useState('')
  const [generatedKey, setGeneratedKey] = useState('')
  // Terminology
  const [termSearch, setTermSearch] = useState('')
  const [settingsSearch, setSettingsSearch] = useState('')
  const [termValues, setTermValues] = useState<Record<string, string>>({})
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
  const [borderRadius, setBorderRadius] = useState<'sharp' | 'soft' | 'rounded'>('soft')
  // Email customization
  const [emailFromName, setEmailFromName] = useState('')
  const [emailReplyTo, setEmailReplyTo] = useState('')
  const [emailSignature, setEmailSignature] = useState('')
  // White label
  const [hidePoweredBy, setHidePoweredBy] = useState(false)
  const [customDomain, setCustomDomain] = useState('')
  const [boardDomain, setBoardDomain] = useState('')       // e.g. feedback.acme.com
  const [helpDomain, setHelpDomain] = useState('')         // e.g. help.acme.com
  const [domainVerifying, setDomainVerifying] = useState<string | null>(null)
  const [domainStatus, setDomainStatus] = useState<Record<string, 'unverified'|'verifying'|'verified'|'error'>>({})
  // Guest access
  const [guestVotingEnabled, setGuestVotingEnabled] = useState(true)
  const [guestSubmitEnabled, setGuestSubmitEnabled] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
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
      const valid = ['general','theme','emails','whitelabel','auth','nav','terminology','webhooks','api','privacy','misc']
      if (valid.includes(hash)) return hash
    }
    return 'general'
  })

  // Sync tab to URL hash for reload persistence
  const switchTab = (tab: string) => {
    setActiveSettingsTab(tab)
    if (typeof window !== 'undefined') window.location.hash = tab
  }
  const logoFileRef = useRef<HTMLInputElement>(null)
  const faviconFileRef = useRef<HTMLInputElement>(null)
  const ogFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const init = async () => {
      const { data: authData } = await supabase.auth.getSession()
      const u = authData.session?.user
      if (!u) return
      setUser(u)

      // Load company - try owner_id first, then slug from hostname as fallback
      try {
        let co: any = null

        // Primary: look up by owner_id
        const { data: coByOwner } = await (supabase as any)
          .from('companies').select('*').eq('owner_id', u.id).maybeSingle()
        co = coByOwner

        // Fallback: look up by hostname slug (e.g. funnynepal.colvy.com)
        if (!co && typeof window !== 'undefined') {
          const h = window.location.hostname
          if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
            const slug = h.replace('.colvy.com', '')
            const { data: coBySlug } = await (supabase as any)
              .from('companies').select('*').eq('slug', slug).maybeSingle()
            if (coBySlug) {
              // Fix owner_id if missing
              if (!coBySlug.owner_id) {
                await (supabase as any).from('companies').update({ owner_id: u.id }).eq('id', coBySlug.id)
                co = { ...coBySlug, owner_id: u.id }
              } else {
                co = coBySlug
              }
            }
          }
        }

        if (co) {
          setCompany(co)
          if (co.name) setCompanyName(co.name)
          if (co.logo_url) setLogoUrl(co.logo_url)
          if (co.accent_color) setAccentColor(co.accent_color)
          if (co.board_domain) setBoardDomain(co.board_domain)
          if (co.slug) setSlugEdit(co.slug)
          if (co.help_domain) setHelpDomain(co.help_domain)
        }
      } catch (e: any) {
        console.warn('Company fetch failed:', e.message)
      }
      setLoadedCompany(true)

      // Load site_settings scoped to THIS company
      try {
        let settingsData: any = null
        if (co?.id) {
          const { data: d } = await (supabase as any).from('site_settings').select('*')
            .eq('key', 'general').eq('company_id', co.id).maybeSingle()
          settingsData = d
        }
        // Fallback: unscoped (legacy)
        if (!settingsData) {
          const { data: d } = await (supabase as any).from('site_settings').select('*')
            .eq('key', 'general').is('company_id', null).maybeSingle()
          settingsData = d
        }
        const data = settingsData
        if (data?.value) {
          const s = data.value
          // Only set favicon if it belongs to THIS company's settings
          if (s.faviconUrl) setFaviconUrl(s.faviconUrl)
          else setFaviconUrl('') // Explicitly clear — don't inherit from another company
          if (s.ogImageUrl) setOgImageUrl(s.ogImageUrl)
          if (s.logoLink) setLogoLink(s.logoLink)
          if (s.customScript) setCustomScript(s.customScript)
          if (s.navIdeas !== undefined) setNavIdeas(s.navIdeas)
          if (s.navRoadmap !== undefined) setNavRoadmap(s.navRoadmap)
          if (s.navAnnouncements !== undefined) setNavAnnouncements(s.navAnnouncements)
          if (s.navHelp !== undefined) setNavHelp(s.navHelp)
          if (s.navOrder) setNavOrder(s.navOrder)
          if (s.themeMode) setThemeMode(s.themeMode)
          if (s.borderRadius) setBorderRadius(s.borderRadius)
          if (s.emailFromName) setEmailFromName(s.emailFromName)
          if (s.emailReplyTo) setEmailReplyTo(s.emailReplyTo)
          if (s.emailSignature) setEmailSignature(s.emailSignature)
          if (s.hidePoweredBy !== undefined) setHidePoweredBy(s.hidePoweredBy)
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
          if (s.categories && Array.isArray(s.categories)) setCategories(s.categories)
          if (s.defaultHomepage) setDefaultHomepage(s.defaultHomepage)
          const slugKey = typeof window !== 'undefined' ? (window.location.hostname.replace('.colvy.com','') || 'colvy') : 'colvy'
          if (typeof window !== 'undefined') localStorage.setItem(`site_settings_${slugKey}`, JSON.stringify(s))
        }
      } catch {
        try {
          const s = JSON.parse(localStorage.getItem('site_settings') || '{}')
          if (s.navIdeas !== undefined) setNavIdeas(s.navIdeas)
          if (s.navRoadmap !== undefined) setNavRoadmap(s.navRoadmap)
          if (s.navAnnouncements !== undefined) setNavAnnouncements(s.navAnnouncements)
        } catch {}
      }
    }
    init()
  }, [])

  // Auto-save: debounced — fires 1.2s after the user stops typing/changing settings
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)
  const isFirstRender = useRef(true)
  useEffect(() => {
    // Skip auto-save on initial mount (before data loads)
    if (isFirstRender.current) { isFirstRender.current = false; return }
    if (!loadedCompany) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => {
      handleSave()
    }, 1200)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [
    companyName, logoUrl, faviconUrl, ogImageUrl, logoLink, customScript,
    navIdeas, navRoadmap, navAnnouncements, navHelp, navOrder,
    accentColor, themeMode, borderRadius,
    emailFromName, emailReplyTo, emailSignature,
    hidePoweredBy, boardDomain, helpDomain,
    guestVotingEnabled, guestSubmitEnabled, termValues, privacyMode,
    allowAnnSubsc, allowAnnComments, showAnnComments, disableAnnReactions,
    disableAnimGifs, disableCommentReactions, allowIdeaComments, showIdeaMRR,
    showIdeaNumber, showRoadmapDesc, showIdeaDate, showIdeaActivity, requireIdeaTopic, categories, defaultHomepage,
  ])

  const handleSave = async () => {
    setSaving(true)
    const settingsData = {
      companyName, logoUrl, faviconUrl, ogImageUrl, logoLink, customScript,
      navIdeas, navRoadmap, navAnnouncements, navHelp, navOrder,
      accentColor, themeMode, borderRadius,
      emailFromName, emailReplyTo, emailSignature,
      hidePoweredBy, customDomain, boardDomain, helpDomain, domainStatus,
      guestVotingEnabled, guestSubmitEnabled, termValues, privacyMode, categories, defaultHomepage,
      allowAnnSubsc, allowAnnComments, showAnnComments, disableAnnReactions,
      disableAnimGifs, disableCommentReactions, allowIdeaComments, showIdeaMRR,
      showIdeaNumber, showRoadmapDesc, showIdeaDate, showIdeaActivity, requireIdeaTopic,
    }
    
    try {
      // Save to site_settings table scoped to this company
      let companyId: string | null = null
      try {
        // Use company state if loaded, otherwise look up by slug then owner_id
        if (company?.id) {
          companyId = company.id
        } else {
          const { data: { session } } = await supabase.auth.getSession()
          if (session?.user) {
            const h = typeof window !== 'undefined' ? window.location.hostname : ''
            if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
              const slug = h.replace('.colvy.com', '')
              const { data: coBySlug } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
              companyId = coBySlug?.id || null
            }
            if (!companyId) {
              const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
              companyId = co?.id || null
            }
          }
        }
      } catch {}

      await (supabase as any).from('site_settings').upsert({
        key: 'general',
        company_id: companyId,
        value: { ...settingsData, companyId },
        updated_at: new Date().toISOString(),
      }, { onConflict: 'key,company_id' })
    } catch (e) {
      console.error('DB save failed:', e)
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
          const updated = companyToUpdate ? { ...companyToUpdate, name: companyName, logo_url: logoUrl, accent_color: accentColor } : null
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
          const { data: s } = await (supabase as any).from('site_settings').select('value').eq('key', 'general').eq('company_id', cid).maybeSingle()
          if (s?.value) Object.assign(currentSettings, s.value)
        }
        currentSettings[settingKey] = publicUrl
        await (supabase as any).from('site_settings').upsert({ key: 'general', company_id: cid || null, value: currentSettings, updated_at: new Date().toISOString() }, { onConflict: 'key,company_id' })
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
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Settings Sidebar */}
      <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white border-r" style={{ borderColor: 'var(--border)', position: 'sticky', top: 0, height: 'calc(100vh - 56px)', overflowY: 'auto', flexShrink: 0 }}>
        <div className="py-4 px-3">
          {/* Sidebar search */}
          <div className="relative mb-4 px-0">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" style={{ color: 'var(--slate)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input
              value={settingsSearch}
              onChange={e => setSettingsSearch(e.target.value)}
              placeholder="Search settings..."
              className="w-full text-xs focus:outline-none rounded-lg border"
              style={{ padding: '7px 10px 7px 30px', borderColor: 'var(--border)', background: 'var(--canvas, #fafafa)', color: 'var(--ink)' }}
            />
          </div>
          {(settingsSearch
            ? SIDEBAR_ITEMS.map((g: any) => ({ ...g, items: g.items.filter((it: any) => it.label.toLowerCase().includes(settingsSearch.toLowerCase())) })).filter((g: any) => g.items.length > 0)
            : SIDEBAR_ITEMS
          ).map((group, gi) => (
            <div key={gi} className="mb-4">
              {group.section && (
                <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wider mb-1" style={{ color: 'var(--slate)' }}>{group.section}</p>
              )}
              {group.items.map((item: any) => (
                item.href ? (
                  <a key={item.label} href={item.href}
                    className="flex items-center px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-gray-50 transition-all"
                    style={{ color: 'var(--slate)' }}>
                    {item.label}
                  </a>
                ) : (
                  <button key={item.label} onClick={() => switchTab(item.tab)}
                    className="flex items-center w-full text-left px-3 py-2 rounded-lg text-sm cursor-pointer hover:bg-gray-50 transition-all"
                    style={{
                      background: activeSettingsTab === item.tab ? 'var(--peach)' : 'transparent',
                      color: activeSettingsTab === item.tab ? 'var(--coral)' : 'var(--slate)',
                      fontWeight: activeSettingsTab === item.tab ? 600 : 400,
                    }}>
                    {item.label}
                  </button>
                )
              ))}
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 md:py-8">
      <div className="max-w-3xl mx-auto">

      {activeSettingsTab === 'misc' ? (
        /* MISCELLANEOUS TAB */
        <>
          <h1 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Miscellaneous</h1>
          <p className="mb-8 text-sm" style={{ color: 'var(--slate)' }}>Other company settings.</p>

          {/* Announcements */}
          <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
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
          <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
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
          <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
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
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Restart onboarding</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Missed something? Start the onboarding process from the beginning.</p>
                </div>
                <button className="px-4 py-2 rounded-xl border text-sm font-semibold cursor-pointer hover:bg-gray-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  Restart
                </button>
              </div>
            </div>
          </div>

          {/* Danger Zone */}
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#fca5a5' }}>
            <h2 className="text-base font-bold mb-5" style={{ color: '#dc2626' }}>Danger Zone</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Delete all Ideas</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Once you delete Ideas, there is no going back so please be certain.</p>
                </div>
                <button onClick={() => { if (confirm('Delete ALL ideas? This cannot be undone!')) alert('Contact support to delete all ideas.') }}
                  className="px-4 py-2 rounded-xl border text-sm font-semibold cursor-pointer"
                  style={{ borderColor: '#fca5a5', color: '#dc2626' }}>
                  Delete all Ideas
                </button>
              </div>
              <div className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Delete company</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Including all Ideas and Announcements, this cannot be undone.</p>
                </div>
                <button onClick={() => { if (confirm('Delete entire company? This CANNOT be undone!')) alert('Contact support to delete your company.') }}
                  className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer text-white"
                  style={{ background: '#dc2626' }}>
                  Delete company
                </button>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end">
            <button onClick={handleSave} disabled={saving}
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
          {activeSettingsTab === 'general' && 'Manage your company settings.'}
          {activeSettingsTab === 'theme' && 'Customize the look and feel of your board.'}
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
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
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
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-5" style={{ color: 'var(--ink)' }}>Branding</h2>
              <div className="flex items-center justify-between py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Hide "Powered by Colvy"</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Remove the Colvy branding from your board footer</p>
                </div>
                <button onClick={() => setHidePoweredBy(!hidePoweredBy)}
                  className="relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer shrink-0 ml-4"
                  style={{ background: hidePoweredBy ? 'var(--coral)' : '#d1d5db' }}>
                  <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow"
                    style={{ transform: hidePoweredBy ? 'translateX(24px)' : 'translateX(4px)' }} />
                </button>
              </div>
            </div>

            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
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
                        fetch('/api/domains', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ domain: `${slugEdit}.colvy.com` }) }).catch(() => {})
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
                      placeholder="feedback.yourcompany.com"
                      className="flex-1 px-4 py-2.5 rounded-xl border focus:outline-none text-sm"
                      style={{ borderColor: domainStatus['board'] === 'verified' ? '#10b981' : domainStatus['board'] === 'error' ? '#ef4444' : 'var(--border)', fontSize: '16px' }} />
                    <button onClick={async () => {
                        if (!boardDomain) return
                        setDomainStatus(p => ({ ...p, board: 'verifying' }))
                        try {
                          const res = await fetch('/api/domains', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ domain: boardDomain }),
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
                      placeholder="help.yourcompany.com"
                      className="flex-1 px-4 py-2.5 rounded-xl border focus:outline-none text-sm"
                      style={{ borderColor: domainStatus['help'] === 'verified' ? '#10b981' : domainStatus['help'] === 'error' ? '#ef4444' : 'var(--border)', fontSize: '16px' }} />
                    <button onClick={async () => {
                        if (!helpDomain) return
                        setDomainStatus(p => ({ ...p, help: 'verifying' }))
                        try {
                          const res = await fetch('/api/domains', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ domain: helpDomain }),
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
                              <td className="px-4 py-2.5" style={{ color: 'var(--coral)' }}>cns.vercel-dns.com</td>
                            </tr>
                          )}
                          {helpDomain && (
                            <tr>
                              <td className="px-4 py-2.5 font-bold" style={{ color: '#2563eb' }}>CNAME</td>
                              <td className="px-4 py-2.5" style={{ color: 'var(--ink)' }}>{helpDomain.split('.')[0]}</td>
                              <td className="px-4 py-2.5" style={{ color: 'var(--coral)' }}>cns.vercel-dns.com</td>
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
              <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl font-semibold text-white text-sm cursor-pointer disabled:opacity-50" style={{ background: 'var(--coral)' }}>
                {saving ? 'Saving...' : saved ? '✅ Saved!' : 'Save Settings'}
              </button>
            </div>
          </div>
        )}

        {/* Privacy tab */}
        {activeSettingsTab === 'privacy' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
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
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
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
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-5" style={{ color: 'var(--ink)' }}>Sign-in Methods</h2>
              <div className="space-y-3">
                {[
                  { label: 'Email & Password', desc: 'Standard email/password authentication', icon: '✉️', enabled: true },
                  { label: 'Google OAuth', desc: 'Let users sign in with their Google account', icon: '🔵', enabled: true },
                  { label: 'GitHub OAuth', desc: 'Let users sign in with their GitHub account', icon: '⚫', enabled: false },
                  { label: 'Magic Link', desc: 'Passwordless sign-in via email link', icon: '🔮', enabled: false },
                ].map(m => (
                  <div key={m.label} className="flex items-center justify-between p-4 rounded-xl border" style={{ borderColor: 'var(--border)' }}>
                    <div className="flex items-center gap-3">
                      <span className="text-xl">{m.icon}</span>
                      <div>
                        <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{m.label}</p>
                        <p className="text-xs" style={{ color: 'var(--slate)' }}>{m.desc}</p>
                      </div>
                    </div>
                    <button className="relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer shrink-0"
                      style={{ background: m.enabled ? 'var(--coral)' : '#d1d5db' }}>
                      <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow"
                        style={{ transform: m.enabled ? 'translateX(24px)' : 'translateX(4px)' }} />
                    </button>
                  </div>
                ))}
              </div>
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
              <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
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
                <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl font-semibold text-white text-sm cursor-pointer disabled:opacity-50" style={{ background: 'var(--coral)' }}>
                  {saving ? 'Saving...' : saved ? '✅ Saved!' : 'Save Settings'}
                </button>
              </div>
            </div>
          </> )
        })()}

        {/* Webhooks tab */}
        {activeSettingsTab === 'webhooks' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
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
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
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
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
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
                <p className="text-xs mb-3" style={{ color: 'var(--slate)' }}>Paste this snippet anywhere before the <code>{`</body>`}</code> tag on your website.</p>
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
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
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
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
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
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-1" style={{ color: 'var(--ink)' }}>Terminology</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>Customise the labels shown to your users throughout the board.</p>
              <div className="relative mb-5">
                <svg className="absolute left-3.5 top-1/2 -translate-y-1/2" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)' }}><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input value={termSearch} onChange={e => setTermSearch(e.target.value)}
                  placeholder="Search terms..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)' }} />
              </div>
              <div style={{ maxHeight: 480, overflowY: 'auto' }}>
                {['Idea', 'Ideas', 'Idea board title', 'Idea board subtitle', 'Idea not found', 'Idea failed to load', 'Ideas board no Ideas', 'Ideas board failed to load', 'Ideas board filter placeholder', 'Ideas board meta title', 'Ideas board meta description', 'Submit Idea button', 'Create Idea form submit', 'Update Idea form submit', 'Update Idea form cancel', 'Idea form name placeholder', 'Idea form name length error', 'Idea form description placeholder', 'Idea form topics label', 'Idea form topics length error', 'Create Idea title', 'Similar Ideas title', 'Similar Ideas no results', 'View Idea', 'Add new Idea', 'Create new Idea', 'Close Idea', 'Create Idea signup prompt', 'Vote for Idea signup prompt', 'Sort by trending', 'Sort by votes (Highest first)', 'Sort by votes (Lowest first)', 'Sort by priority (Highest first)', 'Sort by priority (Lowest first)', 'Sort by MRR (Descending)', 'Sort by latest', 'Sort by oldest', 'Sort by custom order', 'Create Idea success title', 'Create Idea success subtitle', 'Follow Idea', 'Unfollow Idea', 'Pin Idea', 'Unpin Idea', 'Edit Idea', 'Delete Idea', 'Delete Idea success', 'Delete Idea confirmation title', 'Idea archived', 'Idea removed', 'Idea was merged (winning)', 'Idea was merged (losing)', 'Add Idea comment', 'Add Idea note', 'Idea pending approval', 'Idea rejected', 'Bug', 'Bugs', 'Idea marked as bug', 'Private', 'Idea is private', 'Prioritized', 'Unprioritized', 'Vote', 'Votes', 'Vote Idea', 'Unvote Idea', 'Idea Activity title', 'Delete Idea Activity confirmation title'].filter((t: string) => !termSearch || t.toLowerCase().includes(termSearch.toLowerCase())).map((term: string) => (
                  <div key={term} className="flex items-center gap-4 py-2.5 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                    <span className="text-sm flex-1" style={{ color: 'var(--ink)' }}>{term}</span>
                    <input className="text-sm px-3 py-1.5 rounded-lg border focus:outline-none"
                      style={{ borderColor: 'var(--border)', width: 200, fontSize: 13 }}
                      placeholder={term} />
                  </div>
                ))}
              </div>
              <div className="flex justify-end mt-4">
                <button onClick={handleSave} disabled={saving} className="px-6 py-2.5 rounded-xl font-semibold text-white text-sm cursor-pointer disabled:opacity-50" style={{ background: 'var(--coral)' }}>
                  {saving ? 'Saving...' : saved ? '✅ Saved!' : 'Save Terminology'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* General, Theme, Emails tabs — show content based on activeSettingsTab */}
        {(activeSettingsTab === 'general' || activeSettingsTab === 'theme' || activeSettingsTab === 'emails') && (<>

          {/* Company section */}
          <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--ink)' }}>Company</h2>

            {/* Logo */}
            <div className="mb-6">
              <label className="text-sm font-semibold block mb-2" style={{ color: 'var(--ink)' }}>Company Logo</label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => logoFileRef.current?.click()}
                  className="w-16 h-16 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-smooth"
                  style={{ borderColor: 'var(--border)' }}>
                  {logoUrl ? (
                    <img src={logoUrl} alt="Logo" className="w-full h-full object-cover rounded-[9px]" />
                  ) : (
                    <span className="text-2xl font-bold" style={{ color: 'var(--coral)' }}>A</span>
                  )}
                </button>
                <input ref={logoFileRef} type="file" accept="image/*" className="hidden" onChange={handleLogoUpload} />
                <div>
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Light theme</p>
                  <p className="text-xs" style={{ color: 'var(--slate)' }}>Recommended size: 256 × 256px.</p>
                {suggestedColor && (
                  <div className="mt-2 flex items-center gap-2 p-2 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                    <div style={{ width: 20, height: 20, borderRadius: 5, background: suggestedColor, flexShrink: 0, border: '1px solid rgba(0,0,0,0.1)' }} />
                    <span className="text-xs" style={{ color: 'var(--slate)' }}>Brand color detected: <strong style={{ color: suggestedColor }}>{suggestedColor}</strong></span>
                    <button onClick={() => { setAccentColor(suggestedColor); setSuggestedColor(null) }}
                      className="text-xs px-2 py-0.5 rounded-md font-semibold ml-auto cursor-pointer"
                      style={{ background: suggestedColor, color: '#fff', border: 'none' }}>
                      Use this
                    </button>
                    <button onClick={() => setSuggestedColor(null)}
                      className="text-xs cursor-pointer" style={{ color: 'var(--slate)', background: 'none', border: 'none' }}>
                      Dismiss
                    </button>
                  </div>
                )}
                </div>
              </div>
            </div>

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
                  if (!confirm('This will permanently delete all demo/sample data from your board. Continue?')) return
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

            {/* Favicon */}
            <div className="mb-6">
              <label className="text-sm font-semibold block mb-2" style={{ color: 'var(--ink)' }}>Favicon</label>
              <div className="flex items-center gap-4">
                <button
                  onClick={() => faviconFileRef.current?.click()}
                  className="w-12 h-12 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-smooth"
                  style={{ borderColor: 'var(--border)' }}>
                  {faviconUrl ? (
                    <img src={faviconUrl} alt="Favicon" className="w-full h-full object-cover rounded-[6px]" />
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ color: 'var(--slate)', opacity: 0.4 }}><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="8" y1="12" x2="16" y2="12"/><line x1="12" y1="8" x2="12" y2="16"/></svg>
                  )}
                </button>
                {faviconUrl && (
                  <button onClick={() => setFaviconUrl('')}
                    className="w-6 h-6 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-100 transition-all"
                    style={{ background: '#fee2e2', color: '#dc2626', border: 'none' }}
                    title="Remove favicon">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                )}
                <input ref={faviconFileRef} type="file" accept="image/png,image/ico,image/x-icon" className="hidden" onChange={handleFaviconUpload} />
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Recommended size: 96×96 (png only)</p>
              </div>
            </div>

            {/* Open Graph image */}
            <div>
              <label className="text-sm font-semibold block mb-2" style={{ color: 'var(--ink)' }}>Open Graph image</label>
              <button
                onClick={() => ogFileRef.current?.click()}
                className="w-64 h-36 rounded-lg border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-smooth"
                style={{ borderColor: 'var(--border)' }}>
                {ogImageUrl ? (
                  <img src={ogImageUrl} alt="OG Image" className="w-full h-full object-cover rounded-[6px]" />
                ) : (
                  <span className="text-2xl" style={{ color: 'var(--slate)' }}>↑</span>
                )}
              </button>
              <input ref={ogFileRef} type="file" accept="image/*" className="hidden" onChange={handleOgUpload} />
              <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Recommended size: 1200×630</p>
            </div>
          </div>

          {/* Styling / Theme */}
          <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-bold mb-1" style={{ color: 'var(--ink)' }}>Styling</h2>
            <p className="text-sm mb-5" style={{ color: 'var(--slate)' }}>
              Customize the look and feel of your feedback board.
            </p>

            {/* Theme Mode */}
            <div className="mb-6">
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>Theme appearance</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'light', label: 'Light', icon: '☀️' },
                  { key: 'dark', label: 'Dark', icon: '🌙' },
                  { key: 'auto', label: 'Auto', icon: '🌓' },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setThemeMode(t.key)}
                    className="p-4 rounded-xl border-2 transition-smooth cursor-pointer hover:shadow-md text-center"
                    style={{
                      borderColor: themeMode === t.key ? 'var(--coral)' : 'var(--border)',
                      background: themeMode === t.key ? 'var(--peach)' : 'white',
                    }}>
                    <div className="text-3xl mb-2">{t.icon}</div>
                    <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t.label}</div>
                  </button>
                ))}
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>
                Auto follows the user's system preference.
              </p>
            </div>

            {/* Accent Color */}
            <div className="mb-6">
              <div className="flex items-center justify-between mb-2">
                <label className="block text-sm font-medium" style={{ color: 'var(--ink)' }}>Brand color</label>
                {logoUrl && (
                  <button onClick={() => {
                    try {
                      const img = new Image()
                      img.crossOrigin = 'anonymous'
                      img.onload = () => {
                        const canvas = document.createElement('canvas')
                        canvas.width = 50; canvas.height = 50
                        const ctx = canvas.getContext('2d')
                        if (!ctx) return
                        ctx.drawImage(img, 0, 0, 50, 50)
                        const d = ctx.getImageData(0, 0, 50, 50).data
                        let r = 0, g = 0, b = 0, count = 0
                        for (let i = 0; i < d.length; i += 4) {
                          if (d[i+3] > 128) { r += d[i]; g += d[i+1]; b += d[i+2]; count++ }
                        }
                        if (count > 0) {
                          const hex = '#' + [Math.round(r/count), Math.round(g/count), Math.round(b/count)].map(v => v.toString(16).padStart(2,'0')).join('')
                          setAccentColor(hex)
                        }
                      }
                      img.src = logoUrl
                    } catch {}
                  }}
                  className="text-xs px-2.5 py-1 rounded-lg cursor-pointer hover:opacity-80"
                  style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                    🎨 Extract from logo
                  </button>
                )}
              </div>
              <div className="flex flex-wrap gap-2 mb-3">
                {[
                  '#ff7a6b', '#f97316', '#eab308', '#84cc16',
                  '#10b981', '#06b6d4', '#3b82f6', '#7c3aed',
                  '#ec4899', '#ef4444', '#6366f1', '#14b8a6',
                ].map(color => (
                  <button
                    key={color}
                    onClick={() => setAccentColor(color)}
                    className="w-10 h-10 rounded-full transition-all cursor-pointer hover:scale-110"
                    style={{
                      background: color,
                      boxShadow: accentColor === color ? `0 0 0 3px white, 0 0 0 5px ${color}` : '0 2px 4px rgba(0,0,0,0.1)',
                    }}
                    title={color}
                  />
                ))}
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="color"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="w-12 h-10 rounded cursor-pointer border"
                  style={{ borderColor: 'var(--border)' }}
                />
                <input
                  type="text"
                  value={accentColor}
                  onChange={(e) => setAccentColor(e.target.value)}
                  className="px-3 py-2 rounded-lg border text-sm font-mono"
                  style={{ borderColor: 'var(--border)', fontSize: '14px' }}
                />
                <div className="flex-1 h-10 rounded-lg flex items-center justify-center text-white text-sm font-semibold" style={{ background: accentColor }}>
                  Preview button
                </div>
              </div>
            </div>

            {/* Border Radius */}
            <div>
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>Corner style</label>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { key: 'sharp', label: 'Sharp', radius: '4px' },
                  { key: 'soft', label: 'Soft', radius: '12px' },
                  { key: 'rounded', label: 'Rounded', radius: '24px' },
                ] as const).map(t => (
                  <button
                    key={t.key}
                    onClick={() => setBorderRadius(t.key)}
                    className="p-4 border-2 transition-smooth cursor-pointer hover:shadow-md"
                    style={{
                      borderColor: borderRadius === t.key ? 'var(--coral)' : 'var(--border)',
                      background: borderRadius === t.key ? 'var(--peach)' : 'white',
                      borderRadius: t.radius,
                    }}>
                    <div className="w-full h-8 mb-2 mx-auto" style={{ background: accentColor, borderRadius: t.radius }} />
                    <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{t.label}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Email Customization */}
          <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
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

          {/* White Labelling */}
          <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
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
                <button
                  onClick={() => setHidePoweredBy(!hidePoweredBy)}
                  className="relative w-11 h-6 rounded-full transition-smooth cursor-pointer shrink-0 ml-3"
                  style={{ background: hidePoweredBy ? accentColor : '#d1d5db' }}>
                  <div className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform" 
                    style={{ transform: hidePoweredBy ? 'translateX(22px)' : 'translateX(2px)' }} />
                </button>
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={boardDomain}
                    onChange={e => setBoardDomain(e.target.value.toLowerCase())}
                    placeholder="feedback.yourcompany.com"
                    className="flex-1 px-4 py-2.5 rounded-xl border focus:outline-none text-sm"
                    style={{ borderColor: domainStatus['board'] === 'verified' ? '#10b981' : domainStatus['board'] === 'error' ? '#ef4444' : 'var(--border)', fontSize: '16px' }}
                  />
                  <button
                    onClick={async () => {
                      if (!boardDomain) return
                      setDomainStatus(p => ({ ...p, board: 'verifying' }))
                      try {
                        const res = await fetch(`/api/verify-domain?domain=${boardDomain}`)
                        const data = await res.json()
                        setDomainStatus(p => ({ ...p, board: data.verified ? 'verified' : 'error' }))
                      } catch {
                        setDomainStatus(p => ({ ...p, board: 'error' }))
                      }
                    }}
                    disabled={!boardDomain || domainStatus['board'] === 'verifying'}
                    className="px-4 py-2.5 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 shrink-0"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    {domainStatus['board'] === 'verifying' ? 'Checking...' : 'Verify'}
                  </button>
                </div>
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
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={helpDomain}
                    onChange={e => setHelpDomain(e.target.value.toLowerCase())}
                    placeholder="help.yourcompany.com"
                    className="flex-1 px-4 py-2.5 rounded-xl border focus:outline-none text-sm"
                    style={{ borderColor: domainStatus['help'] === 'verified' ? '#10b981' : domainStatus['help'] === 'error' ? '#ef4444' : 'var(--border)', fontSize: '16px' }}
                  />
                  <button
                    onClick={async () => {
                      if (!helpDomain) return
                      setDomainStatus(p => ({ ...p, help: 'verifying' }))
                      try {
                        const res = await fetch(`/api/verify-domain?domain=${helpDomain}`)
                        const data = await res.json()
                        setDomainStatus(p => ({ ...p, help: data.verified ? 'verified' : 'error' }))
                      } catch {
                        setDomainStatus(p => ({ ...p, help: 'error' }))
                      }
                    }}
                    disabled={!helpDomain || domainStatus['help'] === 'verifying'}
                    className="px-4 py-2.5 rounded-xl border text-sm font-medium cursor-pointer hover:bg-gray-50 disabled:opacity-50 shrink-0"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    {domainStatus['help'] === 'verifying' ? 'Checking...' : 'Verify'}
                  </button>
                </div>
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
                            <span style={{ color: 'var(--coral)' }}>cns.vercel-dns.com</span>
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
                            <span style={{ color: 'var(--coral)' }}>cns.vercel-dns.com</span>
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
          <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
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
          <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
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
          <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
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
          <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
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

          {/* Save */}
          <div className="flex items-center justify-end gap-3">
            {saved && <span className="text-sm text-green-600">✓ Saved</span>}
            <button
              onClick={handleSave}
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
  )
}
