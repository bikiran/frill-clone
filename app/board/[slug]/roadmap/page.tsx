'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import Link from 'next/link'

const COLUMNS = [
  { key: 'under_review', label: 'Under Review', color: '#f59e0b' },
  { key: 'planned', label: 'Planned', color: '#6366f1' },
  { key: 'in_progress', label: 'In Progress', color: '#3b82f6' },
  { key: 'shipped', label: 'Shipped', color: '#10b981' },
]

export default function BoardRoadmapPage() {
  const params = useParams()
  const slug = params?.slug as string
  const [company, setCompany] = useState<any>(null)
  const [ideas, setIdeas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    getCompanyBySlug(slug).then(async co => {
      if (!co) { setLoading(false); return }
      setCompany(co)
      const { data } = await (supabase as any).from('ideas').select('*').eq('company_id', co.id).in('status', ['under_review','planned','in_progress','shipped'])
      setIdeas(data || [])
      setLoading(false)
    })
  }, [slug])

  const accentColor = company?.accent_color || 'var(--coral)'

  if (loading) return <div className="p-8 text-center">Loading...</div>
  if (!company) return <div className="p-8 text-center">Board not found</div>

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <header className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href={`/board/${slug}`} className="flex items-center gap-2 font-bold" style={{ color: 'var(--ink)' }}>
            ← {company.name}
          </Link>
          <span className="font-semibold text-sm" style={{ color: 'var(--slate)' }}>Roadmap</span>
        </div>
      </header>
      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-6" style={{ color: 'var(--ink)' }}>Roadmap</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {COLUMNS.map(col => {
            const colIdeas = ideas.filter(i => i.status === col.key)
            return (
              <div key={col.key}>
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-3 h-3 rounded-full" style={{ background: col.color }} />
                  <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>{col.label}</p>
                  <span className="text-xs" style={{ color: 'var(--slate)' }}>{colIdeas.length}</span>
                </div>
                <div className="space-y-2">
                  {colIdeas.map(idea => (
                    <div key={idea.id} className="bg-white rounded-xl border p-3" style={{ borderColor: 'var(--border)' }}>
                      <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{idea.title}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>▲ {idea.votes || 0} votes</p>
                    </div>
                  ))}
                  {colIdeas.length === 0 && (
                    <div className="rounded-xl border-2 border-dashed p-4 text-center" style={{ borderColor: 'var(--border)' }}>
                      <p className="text-xs" style={{ color: 'var(--slate)' }}>Nothing here yet</p>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
