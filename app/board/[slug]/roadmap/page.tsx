'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import Link from 'next/link'

const COLUMNS = [
  { key: 'under_review', label: 'Under consideration', color: '#f59e0b', bg: '#fffbeb', icon: '🔍' },
  { key: 'planned',      label: 'Planned',             color: '#6366f1', bg: '#f0f0ff', icon: '📋' },
  { key: 'in_progress',  label: 'In Development',      color: '#3b82f6', bg: '#eff6ff', icon: '🚀' },
  { key: 'shipped',      label: 'Shipped',              color: '#10b981', bg: '#f0fdf4', icon: '✅' },
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
      const { data } = await (supabase as any)
        .from('ideas').select('*')
        .eq('company_id', co.id)
        .order('votes', { ascending: false })
      setIdeas(data || [])
      setLoading(false)
    })
  }, [slug])

  const accent = company?.accent_color || 'var(--coral)'

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: accent, borderTopColor: 'transparent' }} /></div>

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <header className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {company?.logo_url ? <img src={company.logo_url} alt={company.name} className="h-7 w-auto" />
              : <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: accent }}>{company?.name?.[0]?.toUpperCase()}</div>}
            <span className="font-bold" style={{ color: 'var(--ink)' }}>{company?.name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: 'Ideas', href: `/board/${slug}` },
              { label: 'Roadmap', href: `/board/${slug}/roadmap`, active: true },
              { label: 'Updates', href: `/board/${slug}/announcements` },
              { label: 'Help', href: `/board/${slug}/help` },
            ].map(n => (
              <Link key={n.label} href={n.href}
                className="px-3 py-1.5 rounded-lg text-sm transition-all"
                style={{ color: n.active ? accent : 'var(--slate)', background: n.active ? accent + '15' : 'transparent', fontWeight: n.active ? 600 : 400 }}>
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-8" style={{ color: 'var(--ink)' }}>Roadmap</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-5">
          {COLUMNS.map(col => {
            const colIdeas = ideas.filter(i => {
              if (col.key === 'under_review') return i.status === 'under_review' || i.status === 'new' || !i.status
              if (col.key === 'in_progress') return i.status === 'in_progress' || i.status === 'in_development'
              return i.status === col.key
            })
            return (
              <div key={col.key}>
                <div className="flex items-center gap-2 mb-4">
                  <span>{col.icon}</span>
                  <p className="text-sm font-bold" style={{ color: col.color }}>{col.label}</p>
                  <span className="text-xs px-1.5 py-0.5 rounded-full font-bold" style={{ background: col.bg, color: col.color }}>{colIdeas.length}</span>
                </div>
                <div className="space-y-2.5">
                  {colIdeas.map(idea => (
                    <div key={idea.id} className="bg-white rounded-xl border p-4 hover:shadow-sm transition-all" style={{ borderColor: 'var(--border)' }}>
                      <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>{idea.title}</p>
                      {idea.description && <p className="text-xs mb-2 line-clamp-2" style={{ color: 'var(--slate)' }}>{idea.description}</p>}
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold" style={{ color: accent }}>▲ {idea.votes || 0}</span>
                      </div>
                    </div>
                  ))}
                  {colIdeas.length === 0 && (
                    <div className="rounded-xl border-2 border-dashed p-6 text-center" style={{ borderColor: 'var(--border)' }}>
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
