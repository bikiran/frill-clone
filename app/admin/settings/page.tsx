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
    { label: 'Integrations', href: '/admin/integrations' },
  ]},
  { section: 'Site Navigation', items: [
    { label: 'Navigation', tab: 'nav' },
  ]},
]

export default function SettingsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
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
  const [activeSettingsTab, setActiveSettingsTab] = useState('general')
  const logoFileRef = useRef<HTMLInputElement>(null)
  const faviconFileRef = useRef<HTMLInputElement>(null)
  const ogFileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      setUser(u)
    })
    // Load saved settings from DB
    const loadSettings = async () => {
      try {
        const { data } = await supabase.from('site_settings').select('*').eq('key', 'general').single()
        if (data?.value) {
          const s = data.value
          if (s.companyName) setCompanyName(s.companyName)
          if (s.logoUrl) setLogoUrl(s.logoUrl)
          if (s.faviconUrl) setFaviconUrl(s.faviconUrl)
          if (s.ogImageUrl) setOgImageUrl(s.ogImageUrl)
          if (s.logoLink) setLogoLink(s.logoLink)
          if (s.customScript) setCustomScript(s.customScript)
          if (s.navIdeas !== undefined) setNavIdeas(s.navIdeas)
          if (s.navRoadmap !== undefined) setNavRoadmap(s.navRoadmap)
          if (s.navAnnouncements !== undefined) setNavAnnouncements(s.navAnnouncements)
          if (s.accentColor) setAccentColor(s.accentColor)
          if (s.themeMode) setThemeMode(s.themeMode)
          if (s.borderRadius) setBorderRadius(s.borderRadius)
          if (s.emailFromName) setEmailFromName(s.emailFromName)
          if (s.emailReplyTo) setEmailReplyTo(s.emailReplyTo)
          if (s.emailSignature) setEmailSignature(s.emailSignature)
          if (s.hidePoweredBy !== undefined) setHidePoweredBy(s.hidePoweredBy)
          if (s.customDomain) setCustomDomain(s.customDomain)
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
          // Also cache in localStorage for layout to use without DB call
          if (typeof window !== 'undefined') {
            localStorage.setItem('site_settings', JSON.stringify(s))
          }
        }
      } catch {
        // Table might not exist yet, fall back to localStorage
        if (typeof window !== 'undefined') {
          try {
            const s = JSON.parse(localStorage.getItem('site_settings') || '{}')
            if (s.companyName) setCompanyName(s.companyName)
            if (s.logoUrl) setLogoUrl(s.logoUrl)
            if (s.faviconUrl) setFaviconUrl(s.faviconUrl)
            if (s.ogImageUrl) setOgImageUrl(s.ogImageUrl)
            if (s.logoLink) setLogoLink(s.logoLink)
            if (s.customScript) setCustomScript(s.customScript)
            if (s.navIdeas !== undefined) setNavIdeas(s.navIdeas)
            if (s.navRoadmap !== undefined) setNavRoadmap(s.navRoadmap)
            if (s.navAnnouncements !== undefined) setNavAnnouncements(s.navAnnouncements)
          } catch {}
        }
      }
    }
    loadSettings()
  }, [router])

  const handleSave = async () => {
    setSaving(true)
    const settingsData = {
      companyName, logoUrl, faviconUrl, ogImageUrl, logoLink, customScript,
      navIdeas, navRoadmap, navAnnouncements, navHelp,
      accentColor, themeMode, borderRadius,
      emailFromName, emailReplyTo, emailSignature,
      hidePoweredBy, customDomain,
      guestVotingEnabled, guestSubmitEnabled,
      allowAnnSubsc, allowAnnComments, showAnnComments, disableAnnReactions,
      disableAnimGifs, disableCommentReactions, allowIdeaComments, showIdeaMRR,
      showIdeaNumber, showRoadmapDesc, showIdeaDate, showIdeaActivity, requireIdeaTopic,
    }
    
    try {
      // Save to database (cross-device)
      await supabase.from('site_settings').upsert({
        key: 'general',
        value: settingsData,
        updated_at: new Date().toISOString(),
      })
    } catch (e) {
      console.error('DB save failed:', e)
    }
    
    // Also cache in localStorage for immediate layout access
    if (typeof window !== 'undefined') {
      localStorage.setItem('site_settings', JSON.stringify(settingsData))
    }
    
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const uploadFile = async (file: File, folder: string, setter: (url: string) => void, settingKey: string) => {
    try {
      const ext = file.name.split('.').pop()
      const fileName = `${folder}/${Date.now()}.${ext}`
      // Try 'settings' bucket first, fallback to 'idea-images'
      let uploadBucket = 'settings'
      let { data, error } = await supabase.storage.from(uploadBucket).upload(fileName, file, { upsert: true })
      if (error) {
        // Fallback bucket
        uploadBucket = 'idea-images'
        const result = await supabase.storage.from(uploadBucket).upload(fileName, file, { upsert: true })
        data = result.data
        error = result.error
      }
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from(uploadBucket).getPublicUrl(data!.path)
      setter(publicUrl)
      
      // Save the URL directly to DB immediately (don't rely on state update timing)
      const currentSettings: any = {}
      try {
        const { data: s } = await supabase.from('site_settings').select('value').eq('key', 'general').single()
        if (s?.value) Object.assign(currentSettings, s.value)
      } catch {}
      currentSettings[settingKey] = publicUrl
      await supabase.from('site_settings').upsert({ key: 'general', value: currentSettings, updated_at: new Date().toISOString() })
      if (typeof window !== 'undefined') {
        localStorage.setItem('site_settings', JSON.stringify({ ...currentSettings, [settingKey]: publicUrl }))
      }
    } catch (err: any) {
      alert('Upload failed: ' + err.message + '\n\nMake sure a "settings" or "idea-images" storage bucket exists in Supabase with public access.')
    }
  }

  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) uploadFile(file, 'logo', setLogoUrl, 'logoUrl')
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
      <aside className="hidden md:flex flex-col w-56 shrink-0 bg-white border-r overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
        <div className="py-4 px-3">
          {SIDEBAR_ITEMS.map((group, gi) => (
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
                  <button key={item.label} onClick={() => setActiveSettingsTab(item.tab)}
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
        /* ALL OTHER TABS — existing content */
        <>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--ink)' }}>General Settings</h1>
          <p className="mb-8" style={{ color: 'var(--slate)' }}>Manage your company settings.</p>

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
                    <span className="text-lg font-bold" style={{ color: 'var(--coral)' }}>A</span>
                  )}
                </button>
                <input ref={faviconFileRef} type="file" accept="image/png" className="hidden" onChange={handleFaviconUpload} />
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
              <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>Accent color</label>
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

              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Custom domain</label>
                <input
                  type="text"
                  value={customDomain}
                  onChange={(e) => setCustomDomain(e.target.value)}
                  placeholder="feedback.yourcompany.com"
                  className="w-full px-4 py-2.5 rounded-lg border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }}
                />
                <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>
                  Point a CNAME record from your domain to <code className="px-1 py-0.5 rounded" style={{ background: 'var(--canvas)', color: 'var(--coral)' }}>cname.yourapp.com</code>
                </p>
              </div>

              <div className="p-4 rounded-lg" style={{ background: '#fef3c7' }}>
                <p className="text-sm font-medium mb-1" style={{ color: '#92400e' }}>📚 How to set up:</p>
                <ol className="text-xs space-y-1 ml-4 list-decimal" style={{ color: '#92400e' }}>
                  <li>Enter your custom subdomain above</li>
                  <li>Go to your DNS provider</li>
                  <li>Add a CNAME record pointing to your app's CNAME</li>
                  <li>Wait up to 24 hours for DNS to propagate</li>
                  <li>Your feedback board is now on your own domain!</li>
                </ol>
              </div>
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
        </>
      )}
      </div>
      </div>
    </div>
  )
}
