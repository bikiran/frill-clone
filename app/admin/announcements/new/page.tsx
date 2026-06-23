'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

export default function NewAnnouncementPage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams?.get('edit')

  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

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
      if (editId) loadAnnouncement(editId)
      else setLoading(false)
    })
  }, [editId, router])

  const loadAnnouncement = async (id: string) => {
    try {
      const { data } = await (supabase as any).from('announcements').select('*').eq('id', id).single()
      if (data) {
        setTitle(data.title || '')
        setDescription(data.description || '')
        setTag(data.tag || 'Update')
        setStatus(data.status || 'draft')
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

  return (
    <div style={{ background: 'var(--canvas)', minHeight: '100vh' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>
              {editId ? 'Edit Announcement' : 'New Announcement'}
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/admin/announcements"
              className="px-4 py-2 rounded-lg text-sm font-medium border hover:bg-gray-50 cursor-pointer"
              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
            >
              Cancel
            </Link>
            <button
              onClick={handlePublish}
              disabled={saving || !title.trim() || !description.trim()}
              className="px-6 py-2.5 rounded-lg text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
              style={{ background: 'var(--coral)' }}
            >
              {saving ? 'Saving...' : 'Publish'}
            </button>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-3 gap-8">
          {/* Left: Editor */}
          <div className="col-span-2 space-y-6">
            {/* Title */}
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>
                Title
              </label>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Announcement title"
                className="w-full px-4 py-3 rounded-xl border focus:outline-none text-lg"
                style={{ borderColor: 'var(--border)', fontSize: '16px' }}
              />
            </div>

            {/* Content */}
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <label className="block text-sm font-semibold mb-3" style={{ color: 'var(--ink)' }}>
                Content
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Write your announcement..."
                rows={10}
                className="w-full px-4 py-3 rounded-xl border focus:outline-none"
                style={{ borderColor: 'var(--border)', fontSize: '16px' }}
              />
              <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>
                {description.length} characters
              </p>
            </div>
          </div>

          {/* Right: Sidebar */}
          <div className="col-span-1 space-y-4">
            {/* Overview */}
            <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--slate)' }}>
                Overview
              </p>

              {/* Tag */}
              <div className="mb-4">
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--ink)' }}>
                  Tag
                </label>
                <select
                  value={tag}
                  onChange={e => setTag(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <option>Feature</option>
                  <option>Bug Fix</option>
                  <option>Update</option>
                  <option>Improvement</option>
                  <option>News</option>
                </select>
              </div>

              {/* Language */}
              <div>
                <label className="block text-xs font-medium mb-2" style={{ color: 'var(--ink)' }}>
                  Language
                </label>
                <select
                  value={language}
                  onChange={e => setLanguage(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                  style={{ borderColor: 'var(--border)' }}
                >
                  <option>English</option>
                  <option>Spanish</option>
                  <option>French</option>
                  <option>German</option>
                </select>
              </div>
            </div>

            {/* Status */}
            <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--slate)' }}>
                Status
              </p>
              <div className="space-y-2">
                <button
                  onClick={() => setStatus('draft')}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer"
                  style={{
                    background: status === 'draft' ? 'var(--peach)' : 'var(--canvas)',
                    color: 'var(--ink)',
                    borderLeft: status === 'draft' ? '3px solid var(--coral)' : '3px solid transparent',
                  }}
                >
                  Draft
                </button>
                <button
                  onClick={() => setStatus('published')}
                  className="w-full text-left px-3 py-2.5 rounded-lg text-sm font-medium transition-all cursor-pointer"
                  style={{
                    background: status === 'published' ? 'var(--peach)' : 'var(--canvas)',
                    color: 'var(--ink)',
                    borderLeft: status === 'published' ? '3px solid var(--coral)' : '3px solid transparent',
                  }}
                >
                  Published
                </button>
              </div>
            </div>

            {/* Boost Announcement */}
            <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--slate)' }}>
                Boost Announcement
              </p>
              <p className="text-xs mb-3" style={{ color: 'var(--slate)' }}>
                When enabled, choose how this Announcement will display in Widget
              </p>
              <div className="flex items-center gap-2 mb-4">
                <input
                  type="checkbox"
                  checked={boostEnabled}
                  onChange={e => setBoostEnabled(e.target.checked)}
                  className="w-4 h-4 rounded cursor-pointer"
                  style={{ accentColor: 'var(--coral)' }}
                />
                <label className="text-sm font-medium cursor-pointer" style={{ color: 'var(--ink)' }}>
                  Enabled
                </label>
              </div>

              {boostEnabled && (
                <div>
                  <label className="block text-xs font-medium mb-2" style={{ color: 'var(--ink)' }}>
                    Display as
                  </label>
                  <select
                    value={boostType}
                    onChange={e => setBoostType(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ borderColor: 'var(--border)' }}
                  >
                    <option value="banner">Banner</option>
                    <option value="modal">Modal</option>
                    <option value="toast">Toast</option>
                  </select>
                </div>
              )}
            </div>

            {/* Segmentation */}
            <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-4" style={{ color: 'var(--slate)' }}>
                Segmentation
              </p>
              <p className="text-xs mb-3" style={{ color: 'var(--slate)' }}>
                Who should see this Announcement?
              </p>
              <select
                value={segmentation}
                onChange={e => setSegmentation(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none mb-3"
                style={{ borderColor: 'var(--border)' }}
              >
                <option value="all">All Users</option>
                <option value="logged_in">Logged In Users</option>
                <option value="new">New Users</option>
              </select>
              <a
                href="#"
                className="text-xs font-semibold"
                style={{ color: 'var(--coral)' }}
              >
                Manage segments →
              </a>
            </div>

            {/* Notify Subscribers */}
            <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <label className="text-sm font-semibold cursor-pointer" style={{ color: 'var(--ink)' }}>
                  Notify subscribers
                </label>
                <input
                  type="checkbox"
                  checked={notifySubscribers}
                  onChange={e => setNotifySubscribers(e.target.checked)}
                  className="w-4 h-4 rounded cursor-pointer"
                  style={{ accentColor: 'var(--coral)' }}
                />
              </div>
              <p className="text-xs mt-2" style={{ color: 'var(--slate)' }}>
                Send email notification to subscribers
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
