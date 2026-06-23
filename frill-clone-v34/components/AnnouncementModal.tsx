'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

const TAGS = [
  { id: 'new_feature', label: 'New Feature', color: '#3b82f6', bg: '#dbeafe' },
  { id: 'improvement', label: 'Improvement', color: '#f59e0b', bg: '#fef3c7' },
  { id: 'bug_fix', label: 'Bug Fix', color: '#ef4444', bg: '#fee2e2' },
]

export default function AnnouncementModal({ onClose, onSubmitted }: {
  onClose: () => void
  onSubmitted: () => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [selectedTag, setSelectedTag] = useState('new_feature')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const titleRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 100)
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
  }, [onClose])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    setError('')

    const { error: err } = await supabase.from('announcements').insert({
      title: title.trim(),
      description: description.trim(),
      tag: selectedTag,
    })

    if (err) {
      setError('Failed to create announcement')
      setLoading(false)
      return
    }

    onSubmitted()
  }

  const tagConfig = TAGS.find(t => t.id === selectedTag)

  return (
    <>
      <div className="fixed inset-0 z-50 animate-backdrop" style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose} />

      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white rounded-2xl shadow-2xl animate-modal"
        style={{ borderColor: 'var(--border)' }}>

        <div className="border-b px-6 py-4 flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Create Announcement</h2>
          <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded-lg transition-smooth text-xl" style={{ color: 'var(--slate)' }}>
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">

          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Title</label>
            <input ref={titleRef} type="text" value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="What's new?"
              className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none transition-smooth"
              style={{ borderColor: 'var(--border)', fontSize: '16px' }}
              required
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Description</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="What changed?"
              rows={4}
              className="w-full px-4 py-2.5 border rounded-xl text-sm focus:outline-none transition-smooth resize-none"
              style={{ borderColor: 'var(--border)', fontSize: '16px' }}
            />
          </div>

          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>Tag</label>
            <div className="flex gap-2">
              {TAGS.map(tag => (
                <button key={tag.id} type="button" onClick={() => setSelectedTag(tag.id)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border transition-smooth"
                  style={{
                    background: selectedTag === tag.id ? tag.bg : 'white',
                    borderColor: selectedTag === tag.id ? tag.color : 'var(--border)',
                    color: selectedTag === tag.id ? tag.color : 'var(--slate)',
                  }}>
                  {tag.label}
                </button>
              ))}
            </div>
          </div>

          {error && <p className="text-sm" style={{ color: '#dc2626' }}>{error}</p>}

          <div className="flex gap-3 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
            <button type="button" onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium border transition-smooth"
              style={{ color: 'var(--slate)', borderColor: 'var(--border)' }}>
              Cancel
            </button>
            <button type="submit" disabled={loading || !title.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold text-white transition-smooth disabled:opacity-50"
              style={{ background: 'var(--coral)' }}>
              {loading ? 'Publishing…' : 'Publish'}
            </button>
          </div>
        </form>
      </div>
    </>
  )
}
