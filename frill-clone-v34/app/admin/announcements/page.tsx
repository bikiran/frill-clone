'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import AnnouncementModal from '@/components/AnnouncementModal'
import ConfirmModal from '@/components/ConfirmModal'
import Link from 'next/link'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

export default function AnnouncementsAdmin() {
  const [user, setUser] = useState<any>(null)
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; title: string } | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (u?.email !== ADMIN_EMAIL) {
        window.location.href = '/'
        return
      }
      setUser(u)
    })
    fetchAnnouncements()
  }, [])

  const fetchAnnouncements = async () => {
    const { data } = await supabase
      .from('announcements')
      .select('*')
      .order('created_at', { ascending: false })
    if (data) setAnnouncements(data)
    setLoading(false)
  }

  const deleteAnnouncement = async (id: string) => {
    await supabase.from('announcements').delete().eq('id', id)
    fetchAnnouncements()
    setDeleteConfirm(null)
  }

  if (loading) return <div className="p-8">Loading...</div>
  if (!user) return null

  return (
    <div className="min-h-screen bg-white">
      {/* Header */}
      <div className="border-b sticky top-14" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
            📢 Announcements
          </h1>
          <Link
            href="/admin/announcements/new"
            className="px-4 md:px-6 py-2.5 rounded-xl font-semibold text-white text-sm transition-smooth press-effect"
            style={{ background: 'var(--coral)' }}>
            <span className="hidden sm:inline">+ New Announcement</span>
            <span className="sm:hidden">+ New</span>
          </Link>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        {announcements.length === 0 ? (
          <div className="text-center py-20">
            <div className="text-5xl mb-4">📢</div>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--ink)' }}>
              No announcements yet
            </h3>
            <p className="text-sm mb-6" style={{ color: 'var(--slate)' }}>
              Create your first announcement to get started!
            </p>
            <Link
              href="/admin/announcements/new"
              className="inline-block px-6 py-3 rounded-xl font-semibold text-white text-sm transition-smooth press-effect"
              style={{ background: 'var(--coral)' }}>
              Create Announcement
            </Link>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {announcements.map(ann => (
              <div
                key={ann.id}
                className="bg-white rounded-2xl border p-6 hover:shadow-md transition-smooth"
                style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-start justify-between mb-3">
                  <div className="flex-1">
                    <h3 className="font-semibold text-lg mb-1" style={{ color: 'var(--ink)' }}>
                      {ann.title}
                    </h3>
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>
                      {new Date(ann.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span
                    className="text-xs px-2 py-1 rounded-full font-semibold shrink-0"
                    style={{
                      background:
                        ann.tag === 'new_feature'
                          ? '#dbeafe'
                          : ann.tag === 'improvement'
                            ? '#fef3c7'
                            : '#fee2e2',
                      color:
                        ann.tag === 'new_feature'
                          ? '#0284c7'
                          : ann.tag === 'improvement'
                            ? '#ca8a04'
                            : '#dc2626',
                    }}>
                    {ann.tag === 'new_feature' ? '✨ New' : ann.tag === 'improvement' ? '⬆️ Improved' : '🐛 Fixed'}
                  </span>
                </div>

                <p className="text-sm mb-4 line-clamp-3" style={{ color: 'var(--slate)' }}>
                  {ann.description?.replace(/<[^>]*>/g, '').slice(0, 150)}
                </p>

                <div className="flex items-center gap-3 text-xs mb-3" style={{ color: 'var(--slate)' }}>
                  <span>{ann.views || 0} views</span>
                  <span>•</span>
                  <span>{ann.impressions || 0} impressions</span>
                </div>

                {/* Quick emoji reactions */}
                <div className="flex items-center gap-2 mb-3 pb-3 border-b" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-xs font-medium" style={{ color: 'var(--slate)' }}>React:</span>
                  <div className="flex gap-1 rounded-full px-1 py-0.5" style={{ background: 'var(--canvas)' }}>
                    {['👍', '❤️', '🎉', '🚀'].map(emoji => (
                      <button
                        key={emoji}
                        onClick={async () => {
                          const reactions = ann.reactions || {}
                          reactions[emoji] = (reactions[emoji] || 0) + 1
                          await supabase.from('announcements').update({ reactions }).eq('id', ann.id)
                          fetchAnnouncements()
                        }}
                        className="w-7 h-7 rounded-full flex items-center justify-center hover:bg-white hover:shadow-sm transition-all hover:scale-125 cursor-pointer text-sm">
                        {emoji}
                        {ann.reactions?.[emoji] > 0 && (
                          <span className="ml-0.5 text-[10px] font-bold" style={{ color: 'var(--coral)' }}>{ann.reactions[emoji]}</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex gap-1.5 flex-wrap">
                  <Link
                    href={`/admin/announcements/new?edit=${ann.id}`}
                    className="py-1.5 px-3 rounded-lg text-xs font-medium border transition-smooth hover:bg-gray-50 cursor-pointer flex items-center gap-1"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    Edit
                  </Link>
                  <button
                    onClick={async () => {
                      await supabase.from('announcements').update({ is_pinned: !ann.is_pinned }).eq('id', ann.id)
                      fetchAnnouncements()
                    }}
                    className="py-1.5 px-3 rounded-lg text-xs font-medium border transition-smooth hover:bg-gray-50 cursor-pointer flex items-center gap-1"
                    style={{ borderColor: ann.is_pinned ? 'var(--coral)' : 'var(--border)', color: ann.is_pinned ? 'var(--coral)' : 'var(--ink)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill={ann.is_pinned ? 'var(--coral)' : 'none'} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24Z"/></svg>
                    {ann.is_pinned ? 'Pinned' : 'Pin'}
                  </button>
                  <button
                    onClick={async () => {
                      const { error } = await supabase.from('announcements').insert({
                        title: ann.title + ' (copy)',
                        description: ann.description,
                        tag: ann.tag,
                        views: 0,
                        impressions: 0,
                      })
                      if (!error) fetchAnnouncements()
                      else alert('Failed to duplicate: ' + error.message)
                    }}
                    className="py-1.5 px-3 rounded-lg text-xs font-medium border transition-smooth hover:bg-gray-50 cursor-pointer flex items-center gap-1"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                    Duplicate
                  </button>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/announcements?id=${ann.id}`)
                      alert('Link copied!')
                    }}
                    className="py-1.5 px-3 rounded-lg text-xs font-medium border transition-smooth hover:bg-gray-50 cursor-pointer flex items-center gap-1"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    Copy link
                  </button>
                  <button
                    onClick={() => setDeleteConfirm({ id: ann.id, title: ann.title })}
                    className="py-1.5 px-3 rounded-lg text-xs font-medium border transition-smooth hover:bg-red-50 text-red-500 cursor-pointer flex items-center gap-1 ml-auto"
                    style={{ borderColor: '#fca5a5' }}>
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {showCreateModal && (
        <AnnouncementModal
          onClose={() => setShowCreateModal(false)}
          onSubmitted={() => {
            setShowCreateModal(false)
            fetchAnnouncements()
          }}
        />
      )}

      {deleteConfirm && (
        <ConfirmModal
          title="Delete Announcement"
          message={`Are you sure you want to delete "${deleteConfirm.title}"? This cannot be undone.`}
          confirmLabel="Delete"
          cancelLabel="Cancel"
          variant="danger"
          onConfirm={() => deleteAnnouncement(deleteConfirm.id)}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}
    </div>
  )
}
