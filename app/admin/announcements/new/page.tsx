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
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [primaryTag, setPrimaryTag] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    (supabase as any).auth.getSession().then((res: any) => {
      const u = res.data.session?.user
      if (u?.email !== ADMIN_EMAIL) {
        router.push('/')
        return
      }
      setUser(u)
      if (editId) loadAnnouncement(editId)
    })
  }, [editId, router])

  const loadAnnouncement = async (id: string) => {
    const { data } = await (supabase as any).from('announcements').select('*').eq('id', id).single()
    if (data) {
      setTitle(data.title || '')
      setContent(data.description || '')
      setPrimaryTag(data.tag || '')
    }
  }

  const handlePublish = async () => {
    if (!title.trim() || !content.trim()) {
      alert('Title and content required')
      return
    }

    setLoading(true)
    try {
      if (editId) {
        await (supabase as any).from('announcements').update({
          title: title.trim(),
          description: content.trim(),
          tag: primaryTag,
        }).eq('id', editId)
      } else {
        await (supabase as any).from('announcements').insert({
          title: title.trim(),
          description: content.trim(),
          tag: primaryTag,
          views: 0,
          impressions: 0,
        })
      }
      router.push('/admin/announcements')
    } catch (err: any) {
      alert('Publish failed: ' + err.message)
    }
    setLoading(false)
  }

  if (!user) return <div className="p-8">Loading...</div>

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <Link href="/admin/announcements" className="text-sm font-medium mb-6 inline-block" style={{ color: 'var(--slate)' }}>
        ← Back
      </Link>

      <h1 className="text-3xl font-bold mb-8" style={{ color: 'var(--ink)' }}>
        {editId ? 'Edit Announcement' : 'New Announcement'}
      </h1>

      <div className="space-y-6">
        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>Title</label>
          <input
            type="text"
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Announcement title"
            className="w-full px-4 py-3 rounded-xl border focus:outline-none"
            style={{ borderColor: 'var(--border)' }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>Content</label>
          <textarea
            value={content}
            onChange={e => setContent(e.target.value)}
            placeholder="Write your announcement..."
            rows={8}
            className="w-full px-4 py-3 rounded-xl border focus:outline-none"
            style={{ borderColor: 'var(--border)' }}
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>Tag</label>
          <input
            type="text"
            value={primaryTag}
            onChange={e => setPrimaryTag(e.target.value)}
            placeholder="e.g., Feature, Bug Fix, Update"
            className="w-full px-4 py-3 rounded-xl border focus:outline-none"
            style={{ borderColor: 'var(--border)' }}
          />
        </div>

        <div className="flex gap-3">
          <button
            onClick={handlePublish}
            disabled={loading}
            className="flex-1 py-3 rounded-lg text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
            style={{ background: 'var(--coral)' }}
          >
            {loading ? 'Publishing...' : editId ? 'Save Changes' : 'Publish'}
          </button>
          <Link href="/admin/announcements"
            className="flex-1 py-3 rounded-lg text-sm font-semibold border text-center cursor-pointer hover:bg-gray-50"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
          >
            Cancel
          </Link>
        </div>
      </div>
    </div>
  )
}
