'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

export default function HelpAdminPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [articles, setArticles] = useState<any[]>([])
  const [selected, setSelected] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      if (u?.email !== ADMIN_EMAIL) { router.push('/'); return }
      setUser(u)
    })
    fetchArticles()
  }, [router])

  const fetchArticles = async () => {
    try {
      const { data } = await (supabase as any).from('help_articles').select('*').order('created_at', { ascending: false })
      const list = data || []
      setArticles(list)
      if (list.length > 0) setSelected((prev: any) => prev ? list.find((a: any) => a.id === prev.id) || list[0] : list[0])
    } catch { setArticles([]) }
    setLoading(false)
  }

  const deleteArticle = async (id: string) => {
    if (!confirm('Delete this article?')) return
    if (!id.startsWith('demo-')) {
      await (supabase as any).from('help_articles').delete().eq('id', id)
    }
    setArticles(prev => prev.filter((a: any) => a.id !== id))
    if (selected?.id === id) setSelected(null)
  }

  const copyLink = (id: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/help/${id}`)
    alert('Link copied!')
  }

  if (!user || loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  return (
    <div className="flex min-h-[calc(100vh-56px)]">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-64 shrink-0 bg-white border-r" style={{ borderColor: 'var(--border)' }}>
        <div className="p-4 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
          <Link href="/admin" className="text-sm font-medium hover:opacity-70" style={{ color: 'var(--coral)' }}>← Admin</Link>
          <Link href="/admin/help/new" className="p-2 rounded-lg hover:bg-gray-100 cursor-pointer" title="New Article">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          </Link>
        </div>
        <div className="flex-1 overflow-y-auto py-2 px-2">
          <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Articles</p>
          {articles.length === 0 ? (
            <p className="px-3 py-4 text-sm" style={{ color: 'var(--slate)' }}>No articles yet</p>
          ) : articles.map(a => (
            <button key={a.id} onClick={() => setSelected(a)}
              className="w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all hover:bg-gray-50 cursor-pointer mb-0.5"
              style={{
                background: selected?.id === a.id ? 'var(--peach)' : 'transparent',
                color: 'var(--ink)',
                fontWeight: selected?.id === a.id ? 600 : 400,
                borderLeft: selected?.id === a.id ? '2px solid var(--coral)' : '2px solid transparent',
              }}>
              <p className="truncate">{a.title}</p>
              <p className="text-xs mt-0.5 truncate" style={{ color: 'var(--slate)', fontWeight: 400 }}>{a.category}</p>
            </button>
          ))}
        </div>
      </aside>

      {/* Main */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-4 md:px-8 py-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>Help Centre</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>Knowledge base articles</p>
            </div>
            <Link href="/admin/help/new"
              className="px-4 py-2.5 rounded-xl font-semibold text-white text-sm cursor-pointer flex items-center gap-2"
              style={{ background: 'var(--coral)' }}>
              + New Article
            </Link>
          </div>

          {!selected ? (
            <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="text-5xl mb-4">📚</div>
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>No articles yet</h2>
              <p className="mb-6" style={{ color: 'var(--slate)' }}>Create your first help article</p>
              <Link href="/admin/help/new" className="px-6 py-2.5 rounded-xl font-semibold text-white text-sm" style={{ background: 'var(--coral)' }}>
                + New Article
              </Link>
            </div>
          ) : (
            <div className="grid lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-4">
                {selected.category && (
                  <span className="px-3 py-1 rounded-full text-xs font-semibold inline-block" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                    {selected.category}
                  </span>
                )}
                {selected.featured && (
                  <span className="ml-2 px-3 py-1 rounded-full text-xs font-semibold inline-block" style={{ background: '#fef9c3', color: '#ca8a04' }}>
                    ⭐ Featured
                  </span>
                )}
                <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
                  <div className="prose max-w-none text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>
                    {selected.content || 'No content'}
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Stats</p>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: 'var(--slate)' }}>Views</span>
                      <span className="font-semibold" style={{ color: 'var(--ink)' }}>{selected.views || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: 'var(--slate)' }}>Likes</span>
                      <span className="font-semibold" style={{ color: 'var(--ink)' }}>{selected.likes || 0}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm" style={{ color: 'var(--slate)' }}>Status</span>
                      <span className="px-2 py-0.5 rounded-full text-xs font-semibold capitalize"
                        style={{ background: selected.status === 'published' ? '#dcfce7' : '#f3f4f6', color: selected.status === 'published' ? '#16a34a' : '#6b7280' }}>
                        {selected.status}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--slate)' }}>Actions</p>
                  <div className="space-y-2">
                    <Link href={`/admin/help/new?edit=${selected.id}`}
                      className="w-full block text-center py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      ✏️ Edit
                    </Link>
                    <button onClick={() => copyLink(selected.id)}
                      className="w-full py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      🔗 Copy link
                    </button>
                    <Link href={`/help/${selected.id}`} target="_blank"
                      className="w-full block text-center py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 cursor-pointer"
                      style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                      👁️ View
                    </Link>
                    <button onClick={() => deleteArticle(selected.id)}
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
    </div>
  )
}
