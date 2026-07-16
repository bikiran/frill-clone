'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import ConfirmModal from '@/components/ConfirmModal'
import { PlusIcon, TrashIcon } from '@/components/Icons'
import { SkeletonList } from '@/components/Skeleton'


const TAG_COLORS: any = {
  'Feature': { bg: '#ecfdf5', color: '#059669' },
  'Bug Fix': { bg: '#fef2f2', color: '#dc2626' },
  'Update': { bg: '#eff6ff', color: '#2563eb' },
  'Improvement': { bg: '#f5f3ff', color: '#7c3aed' },
  'News': { bg: '#fff7ed', color: '#ea580c' },
}

export default function AnnouncementsAdmin() {
  // Get company_id from hostname slug (most reliable approach)
  const getMyCompanyId = async () => {
    if (typeof window !== 'undefined') {
      const h = window.location.hostname
      if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
        const slug = h.replace('.colvy.com', '')
        const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
        if (co?.id) return co.id
      }
    }
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user) {
      const { data: co } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
      return co?.id || null
    }
    return null
  }

  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [confirmDelete, setConfirmDelete] = useState<any>(null)
  const [reacting, setReacting] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      setUser(u)
    })
    fetchAnnouncements()
  }, [router])

  const fetchAnnouncements = async () => {
    try {
      const companyId = await getMyCompanyId()
      let q = supabase.from('announcements').select('*').order('created_at', { ascending: false })
      if (companyId) q = (q as any).eq('company_id', companyId)
      const { data } = await q
      const list = data || []
      setAnnouncements(list)
      if (list.length > 0) setSelected((prev: any) => prev ? list.find((a: any) => a.id === prev.id) || list[0] : list[0])
    } catch {}
    setLoading(false)
  }

  const deleteAnnouncement = async (id: string) => {
    await supabase.from('announcements').delete().eq('id', id)
    if (selected?.id === id) setSelected(null)
    fetchAnnouncements()
    setConfirmDelete(null)
  }

  const addReaction = async (emoji: string) => {
    if (!selected || reacting) return
    setReacting(true)
    try {
      const reactions = { ...(selected.reactions || {}) }
      reactions[emoji] = (reactions[emoji] || 0) + 1
      await supabase.from('announcements').update({ reactions } as any).eq('id', selected.id)
      fetchAnnouncements()
    } catch {}
    setReacting(false)
  }

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })

  if (loading || !user) return <SkeletonList rows={6} />

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white border-r" style={{ borderColor: 'var(--border)' }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <Link href="/admin" className="text-sm font-medium hover:opacity-70" style={{ color: 'var(--coral)' }}>← Admin</Link>
          <Link href="/admin/announcements/new" className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer" title="New Announcement">
            <PlusIcon size={16} color="var(--coral)" />
          </Link>
        </div>

        <div className="flex-1 overflow-y-auto py-2 px-2">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>
            Announcements
          </p>
          {announcements.length === 0 ? (
            <p className="px-3 py-4 text-sm" style={{ color: 'var(--slate)' }}>No announcements yet</p>
          ) : (
            announcements.map(a => (
              <button
                key={a.id}
                onClick={() => setSelected(a)}
                className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all hover:bg-gray-50 cursor-pointer mb-0.5"
                style={{
                  background: selected?.id === a.id ? 'var(--peach)' : 'transparent',
                  color: 'var(--ink)',
                  fontWeight: selected?.id === a.id ? 600 : 400,
                  borderLeft: selected?.id === a.id ? '2px solid var(--coral)' : '2px solid transparent',
                }}
              >
                <p className="truncate">{a.title}</p>
                <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--slate)', fontWeight: 400 }}>
                  {formatDate(a.created_at)}
                </p>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>
                {selected ? selected.title : 'Announcements'}
              </h1>
              {selected && (
                <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>
                  {formatDate(selected.created_at)}
                  {selected.views ? ` · ${selected.views} views` : ''}
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {selected && (
                <>
                  <button
                    onClick={() => setConfirmDelete({ id: selected.id, title: selected.title })}
                    className="p-2 rounded-lg border text-red-500 hover:bg-red-50 cursor-pointer"
                    style={{ borderColor: '#fca5a5' }}
                  >
                    <TrashIcon size={15} color="#dc2626" />
                  </button>
                  <Link
                    href={`/admin/announcements/new?edit=${selected.id}`}
                    className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer hover:bg-gray-50"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}
                  >
                    Edit
                  </Link>
                </>
              )}
              <Link
                href="/admin/announcements/new"
                className="px-4 py-2.5 rounded-xl font-semibold text-white text-sm cursor-pointer flex items-center gap-2"
                style={{ background: 'var(--coral)' }}
              >
                <PlusIcon size={14} color="white" /> New
              </Link>
            </div>
          </div>

          {!selected ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-5xl mb-4">📢</div>
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>No announcements yet</h2>
              <p className="mb-6" style={{ color: 'var(--slate)' }}>Create your first announcement to keep users informed.</p>
              <Link href="/admin/announcements/new"
                className="px-6 py-2.5 rounded-xl font-semibold text-white text-sm"
                style={{ background: 'var(--coral)' }}>
                + New Announcement
              </Link>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              {/* Content */}
              <div className="lg:col-span-2 space-y-4">
                {/* Tag */}
                {selected.tag && (
                  <div className="inline-flex">
                    <span className="px-3 py-1 rounded-full text-xs font-semibold"
                      style={TAG_COLORS[selected.tag] || { bg: 'var(--peach)', color: 'var(--coral)' }}>
                      {selected.tag}
                    </span>
                  </div>
                )}

                {/* Body */}
                <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
                  <div className="prose max-w-none text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>
                    {selected.description || selected.content || 'No content'}
                  </div>
                </div>

                {/* Reactions */}
                <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Reactions</p>
                  <div className="flex items-center gap-2 flex-wrap">
                    {['👍', '❤️', '😂', '🔥', '😮', '🎉'].map(emoji => (
                      <button
                        key={emoji}
                        onClick={() => addReaction(emoji)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm hover:shadow-sm cursor-pointer transition-all"
                        style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}
                      >
                        <span>{emoji}</span>
                        {selected.reactions?.[emoji] ? (
                          <span className="text-xs font-medium" style={{ color: 'var(--ink)' }}>
                            {selected.reactions[emoji]}
                          </span>
                        ) : null}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Sidebar detail */}
              <div className="space-y-4">
                {/* Stats */}
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Stats</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: 'var(--slate)' }}>Views</span>
                      <span className="font-semibold" style={{ color: 'var(--ink)' }}>{selected.views || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: 'var(--slate)' }}>Impressions</span>
                      <span className="font-semibold" style={{ color: 'var(--ink)' }}>{selected.impressions || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: 'var(--slate)' }}>Reactions</span>
                      <span className="font-semibold" style={{ color: 'var(--ink)' }}>
                        {Object.values(selected.reactions || {}).reduce((a: any, b: any) => a + b, 0)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Details */}
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Details</p>
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs" style={{ color: 'var(--slate)' }}>Tag</span>
                      <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--ink)' }}>{selected.tag || '—'}</p>
                    </div>
                    <div>
                      <span className="text-xs" style={{ color: 'var(--slate)' }}>Published</span>
                      <p className="text-sm font-medium mt-0.5" style={{ color: 'var(--ink)' }}>{formatDate(selected.created_at)}</p>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Actions</p>
                  <div className="space-y-2">
                    <button
                      onClick={async () => {
                        const next = !(selected as any).is_pinned
                        await (supabase as any).from('announcements').update({ is_pinned: next }).eq('id', selected.id)
                        setSelected({ ...selected, is_pinned: next })
                        fetchAnnouncements()
                      }}
                      className="w-full py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      {(selected as any).is_pinned ? '📌 Unpin from top' : '📌 Pin to top'}
                    </button>
                    <Link href={`/admin/announcements/new?edit=${selected.id}`}
                      className="w-full block text-center py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      ✏️ Edit
                    </Link>
                    <button
                      onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/announcements`); alert('Link copied!') }}
                      className="w-full py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      🔗 Copy link
                    </button>
                    <button
                      onClick={() => setConfirmDelete({ id: selected.id, title: selected.title })}
                      className="w-full py-2 rounded-lg border text-sm font-medium hover:bg-red-50 cursor-pointer"
                      style={{ borderColor: '#fca5a5', color: '#dc2626' }}>
                      🗑️ Delete
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {confirmDelete && (
        <ConfirmModal
          title="Delete Announcement"
          message={`Are you sure you want to delete "${confirmDelete.title}"? This cannot be undone.`}
          onConfirm={() => deleteAnnouncement(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      )}
    </div>
  )
}
