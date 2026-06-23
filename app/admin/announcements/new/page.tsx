'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

const TAG_OPTIONS = [
  { value: 'Feature', label: '✨ Feature', color: '#0284c7', bg: '#dbeafe' },
  { value: 'Bug Fix', label: '🐛 Bug Fix', color: '#dc2626', bg: '#fee2e2' },
  { value: 'Update', label: '📝 Update', color: '#ca8a04', bg: '#fef3c7' },
  { value: 'Improvement', label: '⬆️ Improvement', color: '#16a34a', bg: '#dcfce7' },
  { value: 'News', label: '📢 News', color: '#7c3aed', bg: '#f3e8ff' },
]

export default function NewAnnouncementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams?.get('edit')

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [selectedAnnId, setSelectedAnnId] = useState<string | null>(null)

  // Form state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [tag, setTag] = useState('Update')
  const [status, setStatus] = useState('draft')
  const [language, setLanguage] = useState('English')
  const [boostEnabled, setBoostEnabled] = useState(false)
  const [boostType, setBoostType] = useState('banner')
  const [segmentation, setSegmentation] = useState('all')
  const [notifySubscribers, setNotifySubscribers] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      if (u?.email !== ADMIN_EMAIL) {
        router.push('/')
        return
      }
      setUser(u)
      fetchAnnouncements()
      if (editId) loadAnnouncement(editId)
      else setLoading(false)
    })
  }, [editId, router])

  const fetchAnnouncements = async () => {
    try {
      const { data } = await supabase
        .from('announcements')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20)
      if (data) {
        setAnnouncements(data)
        if (data.length > 0 && !selectedAnnId && !editId) {
          setSelectedAnnId(data[0].id)
        }
      }
    } catch (err) {
      console.error('Fetch error:', err)
    }
  }

  const loadAnnouncement = async (id: string) => {
    try {
      const { data } = await (supabase as any).from('announcements').select('*').eq('id', id).single()
      if (data) {
        setTitle(data.title || '')
        setDescription(data.description || '')
        setTag(data.tag || 'Update')
        setStatus(data.status || 'draft')
        setLanguage(data.language || 'English')
        setBoostEnabled(data.boost_enabled || false)
        setBoostType(data.boost_type || 'banner')
        setSegmentation(data.segmentation || 'all')
        setNotifySubscribers(data.notify_subscribers || false)
        setSelectedAnnId(id)
      }
    } catch (err) {
      console.error('Load error:', err)
    }
    setLoading(false)
  }

  const handlePublish = async () => {
    if (!title.trim() || !description.trim()) {
      alert('Title and content are required')
      return
    }

    setSaving(true)
    try {
      if (editId) {
        await (supabase as any).from('announcements').update({
          title: title.trim(),
          description: description.trim(),
          tag,
          status,
          language,
          boost_enabled: boostEnabled,
          boost_type: boostType,
          segmentation,
          notify_subscribers: notifySubscribers,
        }).eq('id', editId)
      } else {
        await (supabase as any).from('announcements').insert({
          title: title.trim(),
          description: description.trim(),
          tag,
          status,
          language,
          boost_enabled: boostEnabled,
          boost_type: boostType,
          segmentation,
          notify_subscribers: notifySubscribers,
          views: 0,
          impressions: 0,
        })
      }
      router.push('/admin/announcements')
    } catch (err: any) {
      alert('Error: ' + err.message)
    }
    setSaving(false)
  }

  if (!user) return <div className="p-8">Loading...</div>

  const tagConfig = TAG_OPTIONS.find(t => t.value === tag)
  const months: Record<string, any[]> = {}
  announcements.forEach(ann => {
    const month = new Date(ann.created_at).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })
    if (!months[month]) months[month] = []
    months[month].push(ann)
  })

  return (
    <div style={{ background: 'white', minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto w-full px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
              {editId ? 'Edit Announcement' : 'New Announcement'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/announcements"
              className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-gray-50 cursor-pointer transition-smooth"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              Cancel
            </Link>
            <button
              onClick={handlePublish}
              disabled={saving || !title.trim() || !description.trim()}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer disabled:opacity-50 transition-all hover:shadow-lg active:scale-95"
              style={{ background: 'var(--coral)' }}
            >
              {saving ? 'Saving...' : 'Publish'}
            </button>
          </div>
        </div>
      </div>

      {/* Main content with timeline */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left sidebar: Timeline */}
        <aside className="w-80 border-r overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
          <div className="p-4">
            <Link
              href="/admin/announcements/new"
              className="w-full flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-semibold text-white transition-smooth hover:shadow-lg active:scale-95"
              style={{ background: 'var(--coral)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New Announcement
            </Link>
          </div>

          {/* Timeline */}
          {Object.entries(months).length > 0 ? (
            <div className="relative px-4 pb-8">
              {/* Vertical line */}
              <div className="absolute left-[27px] top-0 bottom-0 w-px" style={{ background: 'var(--border)' }} />

              {Object.entries(months).map(([month, anns]) => (
                <div key={month} className="mb-6">
                  {/* Month label */}
                  <p className="text-[11px] font-bold uppercase tracking-widest mb-3 pl-12" style={{ color: 'var(--slate)' }}>
                    {month}
                  </p>

                  {/* Announcements in month */}
                  <div className="space-y-2">
                    {anns.map(ann => {
                      const isSelected = selectedAnnId === ann.id
                      const annTagConfig = TAG_OPTIONS.find(t => t.value === ann.tag)
                      return (
                        <button
                          key={ann.id}
                          onClick={() => {
                            setSelectedAnnId(ann.id)
                            loadAnnouncement(ann.id)
                          }}
                          className="w-full text-left group relative transition-all"
                          style={{ paddingLeft: '12px' }}>
                          {/* Timeline dot */}
                          <div className="absolute left-0 top-3 z-10">
                            <div
                              className="w-3.5 h-3.5 rounded-full border-2 border-white flex items-center justify-center transition-all"
                              style={{
                                background: isSelected ? 'var(--coral)' : annTagConfig?.color || 'var(--border)',
                                boxShadow: isSelected ? '0 0 0 3px var(--peach), 0 0 0 5px var(--coral)' : 'none',
                                transform: isSelected ? 'scale(1.3)' : 'scale(1)',
                              }}
                            />
                          </div>

                          {/* Card */}
                          <div
                            className="p-3 rounded-lg border transition-all group-hover:shadow-md cursor-pointer"
                            style={{
                              borderColor: isSelected ? 'var(--coral)' : 'var(--border)',
                              background: isSelected ? 'var(--peach)' : 'white',
                              marginLeft: '16px',
                            }}>
                            <div className="flex items-start gap-2 mb-2">
                              <span
                                className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0"
                                style={{ background: annTagConfig?.bg, color: annTagConfig?.color }}>
                                {annTagConfig?.label || ann.tag}
                              </span>
                              {ann.status === 'published' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: '#dcfce7', color: '#16a34a' }}>
                                  Published
                                </span>
                              )}
                              {ann.status === 'draft' && (
                                <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0" style={{ background: '#f3f4f6', color: '#6b7280' }}>
                                  Draft
                                </span>
                              )}
                            </div>
                            <h3 className="text-xs font-semibold line-clamp-2 mb-1.5 leading-tight" style={{ color: 'var(--ink)' }}>
                              {ann.title}
                            </h3>
                            <p className="text-[11px] line-clamp-2 mb-2" style={{ color: 'var(--slate)' }}>
                              {ann.description?.replace(/<[^>]*>/g, '')}
                            </p>
                            <p className="text-[10px]" style={{ color: 'var(--slate)' }}>
                              {new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                            </p>
                          </div>
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6 text-center">
              <p className="text-sm" style={{ color: 'var(--slate)' }}>No announcements yet</p>
            </div>
          )}
        </aside>

        {/* Right: Editor */}
        <main className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto px-8 py-8">
            {/* Title */}
            <div className="mb-8">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Announcement title"
                className="w-full px-4 py-4 rounded-xl border focus:outline-none text-2xl font-bold"
                style={{ borderColor: 'var(--border)', fontSize: '28px' }}
              />
            </div>

            {/* Content */}
            <div className="mb-8">
              <label className="block text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>
                Content
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Write your announcement..."
                rows={14}
                className="w-full px-4 py-4 rounded-xl border focus:outline-none font-sans"
                style={{ borderColor: 'var(--border)', fontSize: '16px' }}
              />
              <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>
                {description.length} characters
              </p>
            </div>

            {/* Settings Grid */}
            <div className="grid grid-cols-2 gap-6 mb-8">
              {/* Tag */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>
                  Tag
                </label>
                <div className="space-y-2">
                  {TAG_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setTag(opt.value)}
                      className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all border-2"
                      style={{
                        background: tag === opt.value ? opt.bg : 'white',
                        color: tag === opt.value ? opt.color : 'var(--ink)',
                        borderColor: tag === opt.value ? opt.color : 'var(--border)',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Status */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>
                  Status
                </label>
                <div className="space-y-2">
                  <button
                    onClick={() => setStatus('draft')}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all border-2"
                    style={{
                      background: status === 'draft' ? 'var(--peach)' : 'white',
                      color: status === 'draft' ? 'var(--coral)' : 'var(--ink)',
                      borderColor: status === 'draft' ? 'var(--coral)' : 'var(--border)',
                    }}
                  >
                    Draft
                  </button>
                  <button
                    onClick={() => setStatus('published')}
                    className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all border-2"
                    style={{
                      background: status === 'published' ? '#dcfce7' : 'white',
                      color: status === 'published' ? '#16a34a' : 'var(--ink)',
                      borderColor: status === 'published' ? '#16a34a' : 'var(--border)',
                    }}
                  >
                    Published
                  </button>
                </div>
              </div>

              {/* Language */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>
                  Language
                </label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none transition-smooth"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                  <option>German</option>
                </select>
              </div>

              {/* Audience */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>
                  Audience
                </label>
                <select
                  value={segmentation}
                  onChange={e => setSegmentation(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none transition-smooth"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <option value="all">All Users</option>
                  <option value="logged_in">Logged In Users</option>
                  <option value="new">New Users</option>
                </select>
              </div>

              {/* Boost Type */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>
                  Boost Display
                </label>
                <select
                  value={boostType}
                  onChange={e => setBoostType(e.target.value)}
                  disabled={!boostEnabled}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none transition-smooth disabled:opacity-50"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <option value="banner">Banner</option>
                  <option value="modal">Modal</option>
                  <option value="toast">Toast</option>
                </select>
              </div>

              {/* Boost Toggle */}
              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>
                  Settings
                </label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-smooth hover:bg-gray-50" style={{ borderColor: 'var(--border)' }}>
                    <input
                      type="checkbox"
                      checked={boostEnabled}
                      onChange={e => setBoostEnabled(e.target.checked)}
                      className="w-4 h-4 rounded cursor-pointer"
                      style={{ accentColor: 'var(--coral)' }}
                    />
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                      Boost announcement
                    </span>
                  </label>
                  <label className="flex items-center gap-2 px-3 py-2.5 rounded-lg border cursor-pointer transition-smooth hover:bg-gray-50" style={{ borderColor: 'var(--border)' }}>
                    <input
                      type="checkbox"
                      checked={notifySubscribers}
                      onChange={e => setNotifySubscribers(e.target.checked)}
                      className="w-4 h-4 rounded cursor-pointer"
                      style={{ accentColor: 'var(--coral)' }}
                    />
                    <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>
                      Notify subscribers
                    </span>
                  </label>
                </div>
              </div>
            </div>

            {/* Preview card */}
            <div className="bg-gray-50 rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--slate)' }}>Preview</p>
              <div className="space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  {tagConfig && (
                    <span className="text-xs px-2.5 py-1 rounded-full font-semibold" style={{ background: tagConfig.bg, color: tagConfig.color }}>
                      {tagConfig.label}
                    </span>
                  )}
                  <span className="text-xs" style={{ color: 'var(--slate)' }}>
                    {new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </span>
                </div>
                <h3 className="text-lg font-bold leading-tight" style={{ color: 'var(--ink)' }}>
                  {title || 'Your title here'}
                </h3>
                <p className="text-sm line-clamp-3" style={{ color: 'var(--slate)' }}>
                  {description || 'Your content preview...'}
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  )
}
