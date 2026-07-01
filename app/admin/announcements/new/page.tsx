'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'


const TAGS = ['Feature', 'Bug Fix', 'Update', 'Improvement', 'News']
const LANGUAGES = ['English', 'Español', 'Français', 'Deutsch', 'Português', 'Japanese', 'Chinese']

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer focus:outline-none"
      style={{ background: checked ? 'var(--coral)' : '#d1d5db' }}
    >
      <span
        className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow"
        style={{ transform: checked ? 'translateX(24px)' : 'translateX(4px)' }}
      />
    </button>
  )
}

export default function NewAnnouncementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams?.get('edit')

  const [user, setUser] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [saving, setSaving] = useState(false)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tag, setTag] = useState('Feature')
  const [status, setStatus] = useState('draft')
  const [language, setLanguage] = useState('English')
  const [boostEnabled, setBoostEnabled] = useState(false)
  const [boostType, setBoostType] = useState('snippet')
  const [boostUntil, setBoostUntil] = useState('next')
  const [boostUntilDate, setBoostUntilDate] = useState('')
  const [boostButtonLabel, setBoostButtonLabel] = useState('Learn More')
  const [boostTitle, setBoostTitle] = useState('')
  const [boostBlurb, setBoostBlurb] = useState('')
  const [boostImage, setBoostImage] = useState('')
  const [segmentation, setSegmentation] = useState('all')
  const [notifySubscribers, setNotifySubscribers] = useState(false)
  const [images, setImages] = useState<string[]>([])

  useEffect(() => {
    const init = async () => {
      console.log('[ANN INIT] Starting initialization...')
      const { data: authData } = await supabase.auth.getSession()
      const u = authData?.session?.user
      console.log('[ANN INIT] User:', u?.id)
      if (!u) return

      setUser(u)

      // Load company - try owner_id first, then slug from hostname
      try {
        console.log('[ANN INIT] Loading company for user:', u.id)
        let co: any = null
        const { data: coByOwner, error: ownerError } = await (supabase as any)
          .from('companies').select('*').eq('owner_id', u.id).maybeSingle()
        console.log('[ANN INIT] Company by owner_id result:', { found: !!coByOwner, id: coByOwner?.id, error: ownerError })
        co = coByOwner

        if (!co && typeof window !== 'undefined') {
          const h = window.location.hostname
          console.log('[ANN INIT] No company by owner_id, trying hostname:', h)
          if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
            const slug = h.replace('.colvy.com', '')
            console.log('[ANN INIT] Slug:', slug)
            const { data: coBySlug, error: slugError } = await (supabase as any)
              .from('companies').select('*').eq('slug', slug).maybeSingle()
            console.log('[ANN INIT] Company by slug result:', { found: !!coBySlug, id: coBySlug?.id, error: slugError })
            co = coBySlug
          }
        }

        if (co) {
          console.log('[ANN INIT] ✅ Company loaded:', { id: co.id, slug: co.slug })
          setCompany(co)
        } else {
          console.log('[ANN INIT] ❌ No company found!')
        }
      } catch (e: any) {
        console.error('[ANN INIT] ❌ Company load failed:', e.message)
      }

      if (editId) loadAnnouncement(editId)
    }
    init()
  }, [editId])

  const loadAnnouncement = async (id: string) => {
    try {
      const { data } = await (supabase as any).from('announcements').select('*').eq('id', id).single()
      if (data) {
        setTitle(data.title || '')
        setDescription(data.description || '')
        setTag(data.tag || 'Feature')
        setStatus(data.status || 'draft')
        setLanguage(data.language || 'English')
        setBoostEnabled(data.boost_enabled || false)
        setBoostType(data.boost_type || 'banner')
        setSegmentation(data.segmentation || 'all')
        setNotifySubscribers(data.notify_subscribers || false)
      }
    } catch (err) { console.error(err) }
  }

  const handlePublish = async () => {
    console.log('[ANN PUBLISH] Starting publish...')
    console.log('[ANN PUBLISH] company:', company)
    console.log('[ANN PUBLISH] company?.id:', company?.id)
    
    if (!title.trim()) { 
      alert('Title is required')
      console.log('[ANN PUBLISH] Failed: No title')
      return 
    }
    
    if (!company?.id) { 
      alert('Company not loaded. Please refresh the page.')
      console.log('[ANN PUBLISH] Failed: No company loaded')
      return 
    }
    
    setSaving(true)
    try {
      const payload = {
        company_id: company.id,
        title: title.trim(), 
        description: description.trim(),
        tag, 
        status,
        boost_enabled: boostEnabled,
        boost_type: boostType, 
        boost_until: boostUntil, 
        boost_until_date: boostUntilDate,
        boost_button_label: boostButtonLabel, 
        boost_title: boostTitle, 
        boost_blurb: boostBlurb,
        boost_image: boostImage, 
        segmentation, 
        notify_subscribers: notifySubscribers,
      }
      
      console.log('[ANN PUBLISH] Payload to save:', payload)
      
      if (editId) {
        console.log('[ANN PUBLISH] Updating announcement:', editId)
        const { data, error } = await (supabase as any).from('announcements').update(payload).eq('id', editId)
        console.log('[ANN PUBLISH] Update result:', { data, error })
        if (error) throw error
      } else {
        console.log('[ANN PUBLISH] Inserting new announcement')
        const { data, error } = await (supabase as any).from('announcements').insert({ ...payload, views: 0, impressions: 0 })
        console.log('[ANN PUBLISH] Insert result:', { data, error })
        if (error) throw error
      }
      
      console.log('[ANN PUBLISH] ✅ Successfully saved!')
      alert('Announcement published successfully!')
      router.push('/admin/announcements')
    } catch (err: any) { 
      console.error('[ANN PUBLISH] ❌ Error:', err)
      alert('Error: ' + err.message) 
    }
    setSaving(false)
  }

  if (!user) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>Loading...</div>

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/announcements" className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer" style={{ color: 'var(--slate)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </Link>
            <h1 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>
              {editId ? 'Edit Announcement' : 'Just now'}
            </h1>
          </div>
          <button
            onClick={handlePublish}
            disabled={saving || !title.trim()}
            className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
            style={{ background: 'var(--coral)' }}
          >
            {saving ? 'Saving...' : 'Publish'}
          </button>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-8">

          {/* LEFT — Editor */}
          <div className="flex-1 min-w-0 space-y-4">
            {/* Title input */}
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Title"
              className="w-full text-3xl font-bold bg-transparent focus:outline-none placeholder:font-bold"
              style={{ color: 'var(--ink)', caretColor: 'var(--coral)' }}
            />

            {/* Toolbar row */}
            <div className="flex items-center gap-1 border-b pb-3" style={{ borderColor: 'var(--border)' }}>
              {[
                { label: 'B', style: 'font-bold', title: 'Bold' },
                { label: 'I', style: 'italic', title: 'Italic' },
                { label: 'U', style: 'underline', title: 'Underline' },
              ].map(btn => (
                <button key={btn.label} title={btn.title} className={`w-8 h-8 rounded flex items-center justify-center text-sm ${btn.style} hover:bg-gray-100 cursor-pointer`} style={{ color: 'var(--slate)' }}>
                  {btn.label}
                </button>
              ))}
              <div className="w-px h-5 mx-1" style={{ background: 'var(--border)' }} />
              {['H1', 'H2', 'H3'].map(h => (
                <button key={h} className="px-2 h-8 rounded text-xs font-bold hover:bg-gray-100 cursor-pointer" style={{ color: 'var(--slate)' }}>{h}</button>
              ))}
              <div className="w-px h-5 mx-1" style={{ background: 'var(--border)' }} />
              <button className="w-8 h-8 rounded flex items-center justify-center hover:bg-gray-100 cursor-pointer" title="Link" style={{ color: 'var(--slate)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
              </button>
              <label className="w-8 h-8 rounded flex items-center justify-center hover:bg-gray-100 cursor-pointer" title="Insert Image">
                <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  const reader = new FileReader()
                  reader.onload = (ev) => {
                    const url = ev.target?.result as string
                    setImages(prev => [...prev, url])
                  }
                  reader.readAsDataURL(file)
                }} />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)' }}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </label>
            </div>

            {/* Content area */}
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Write your announcement here..."
              rows={18}
              className="w-full bg-transparent focus:outline-none resize-none text-base leading-relaxed"
              style={{ color: 'var(--ink)', caretColor: 'var(--coral)', fontSize: '16px' }}
            />
            {images.length > 0 && (
              <div className="flex flex-wrap gap-3 mt-4">
                {images.map((src, i) => (
                  <div key={i} className="relative group rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                    <img src={src} alt="" className="w-32 h-24 object-cover" />
                    <button
                      onClick={() => setImages(prev => prev.filter((_, j) => j !== i))}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-black bg-opacity-60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all cursor-pointer text-white text-xs"
                    >✕</button>
                  </div>
                ))}
                <label className="w-32 h-24 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-all" style={{ borderColor: 'var(--border)' }}>
                  <input type="file" accept="image/*" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0]
                    if (!file) return
                    const reader = new FileReader()
                    reader.onload = (ev) => {
                      setImages(prev => [...prev, ev.target?.result as string])
                    }
                    reader.readAsDataURL(file)
                  }} />
                  <div className="text-center">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="mx-auto mb-1" style={{ color: 'var(--slate)' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    <span className="text-xs" style={{ color: 'var(--slate)' }}>Add image</span>
                  </div>
                </label>
              </div>
            )}
          </div>

          {/* RIGHT — Sidebar panels */}
          <div className="w-72 shrink-0 space-y-4">

            {/* Overview */}
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Overview</p>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--slate)' }}>Status</label>
                  <div className="flex gap-2">
                    {['draft', 'published'].map(s => (
                      <button
                        key={s}
                        onClick={() => setStatus(s)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold border capitalize cursor-pointer transition-all"
                        style={{
                          background: status === s ? 'var(--peach)' : 'white',
                          borderColor: status === s ? 'var(--coral)' : 'var(--border)',
                          color: status === s ? 'var(--coral)' : 'var(--slate)',
                        }}
                      >
                        {s === 'draft' ? '● Draft' : '◉ Published'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--slate)' }}>Language</label>
                  <select value={language} onChange={e => setLanguage(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    {LANGUAGES.map(l => <option key={l}>{l}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--slate)' }}>Tag</label>
                  <select value={tag} onChange={e => setTag(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    {TAGS.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* Boost Announcement */}
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Boost Announcement</p>
              </div>
              <div className="p-4 space-y-4">
                <p className="text-xs" style={{ color: 'var(--slate)' }}>When enabled, choose how this Announcement will display in Widget</p>
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Enabled</span>
                  <Toggle checked={boostEnabled} onChange={setBoostEnabled} />
                </div>

                {boostEnabled && (
                  <div className="space-y-4 pt-2 border-t" style={{ borderColor: 'var(--border)' }}>
                    {/* Display as */}
                    <div>
                      <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--slate)' }}>Display as</label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {['Snippet', 'Banner', 'Modal'].map(type => (
                          <button key={type} onClick={() => setBoostType(type.toLowerCase())}
                            className="py-2 rounded-lg text-xs font-semibold border cursor-pointer transition-all"
                            style={{
                              background: boostType === type.toLowerCase() ? 'var(--peach)' : 'white',
                              borderColor: boostType === type.toLowerCase() ? 'var(--coral)' : 'var(--border)',
                              color: boostType === type.toLowerCase() ? 'var(--coral)' : 'var(--slate)',
                            }}>
                            {type}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Boost until */}
                    <div>
                      <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--slate)' }}>Boost until</label>
                      <select value={boostUntil} onChange={e => setBoostUntil(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none mb-2"
                        style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                        <option value="next">Next Announcement</option>
                        <option value="next_boosted">Next Boosted Announcement</option>
                        <option value="date">Date</option>
                      </select>
                      {boostUntil === 'date' && (
                        <input type="date" value={boostUntilDate} onChange={e => setBoostUntilDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                          style={{ borderColor: 'var(--border)', color: 'var(--ink)' }} />
                      )}
                    </div>

                    {/* Button label */}
                    <div>
                      <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--slate)' }}>Button label</label>
                      <input type="text" value={boostButtonLabel} onChange={e => setBoostButtonLabel(e.target.value)}
                        placeholder="Learn More"
                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                        style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                    </div>

                    {/* Title */}
                    <div>
                      <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--slate)' }}>Title</label>
                      <input type="text" value={boostTitle} onChange={e => setBoostTitle(e.target.value)}
                        placeholder="Boost title (optional)"
                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                        style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                    </div>

                    {/* Blurb */}
                    <div>
                      <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--slate)' }}>Blurb</label>
                      <textarea value={boostBlurb} onChange={e => setBoostBlurb(e.target.value)}
                        placeholder="Short description for the boost..."
                        rows={2}
                        className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none resize-none"
                        style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                    </div>

                    {/* Image */}
                    <div>
                      <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--slate)' }}>Image</label>
                      {boostImage ? (
                        <div className="relative rounded-xl overflow-hidden border group" style={{ borderColor: 'var(--border)' }}>
                          <img src={boostImage} alt="Boost" className="w-full h-24 object-cover" />
                          <button onClick={() => setBoostImage('')}
                            className="absolute top-2 right-2 w-6 h-6 rounded-full flex items-center justify-center text-white text-xs cursor-pointer opacity-0 group-hover:opacity-100 transition-all"
                            style={{ background: '#ef4444' }}>✕</button>
                        </div>
                      ) : (
                        <label className="flex flex-col items-center justify-center w-full h-20 rounded-xl border-2 border-dashed cursor-pointer hover:bg-gray-50 transition-all"
                          style={{ borderColor: 'var(--border)' }}>
                          <input type="file" accept="image/*" className="hidden" onChange={e => {
                            const file = e.target.files?.[0]
                            if (!file) return
                            const reader = new FileReader()
                            reader.onload = ev => setBoostImage(ev.target?.result as string)
                            reader.readAsDataURL(file)
                          }} />
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ color: 'var(--slate)' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                          <span className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Upload image</span>
                        </label>
                      )}
                    </div>

                    {/* Preview */}
                    {(boostTitle || boostBlurb || boostImage) && (
                      <div className="rounded-xl border p-3" style={{ borderColor: 'var(--coral)', background: 'var(--peach)' }}>
                        <p className="text-xs font-bold mb-1" style={{ color: 'var(--slate)' }}>Preview</p>
                        {boostImage && <img src={boostImage} alt="" className="w-full h-16 object-cover rounded-lg mb-2" />}
                        {boostTitle && <p className="text-sm font-bold" style={{ color: 'var(--ink)' }}>{boostTitle}</p>}
                        {boostBlurb && <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>{boostBlurb}</p>}
                        {boostButtonLabel && (
                          <div className="mt-2">
                            <span className="px-3 py-1 rounded-lg text-xs font-semibold text-white inline-block" style={{ background: 'var(--coral)' }}>
                              {boostButtonLabel}
                            </span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Segmentation */}
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Segmentation</p>
              </div>
              <div className="p-4 space-y-3">
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Who should see this Announcement?</p>
                <select value={segmentation} onChange={e => setSegmentation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  <option value="all">All Users</option>
                  <option value="logged_in">Logged In Users</option>
                  <option value="new">New Users</option>
                </select>
                <a href="/admin/segments" className="text-xs font-semibold" style={{ color: 'var(--coral)' }}>
                  Manage segments →
                </a>
              </div>
            </div>

            {/* Notify Subscribers */}
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="p-4 flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Notify subscribers</p>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>Email notification on publish</p>
                </div>
                <Toggle checked={notifySubscribers} onChange={setNotifySubscribers} />
              </div>
            </div>

          </div>
        </div>
      </div>
    </div>
  )
}
