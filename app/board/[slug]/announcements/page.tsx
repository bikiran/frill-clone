'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import Link from 'next/link'

const TAG_COLORS: Record<string, any> = {
  'Feature':     { bg: '#dbeafe', color: '#2563eb' },
  'Update':      { bg: 'var(--peach)', color: 'var(--coral)' },
  'Bug Fix':     { bg: '#fef3c7', color: '#d97706' },
  'Improvement': { bg: '#d1fae5', color: '#059669' },
  'New Feature': { bg: '#ede9fe', color: '#7c3aed' },
}

export default function BoardAnnouncementsPage() {
  const params = useParams()
  const slug = params?.slug as string
  const [company, setCompany] = useState<any>(null)
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<any>(null)

  useEffect(() => {
    if (!slug) return
    getCompanyBySlug(slug).then(async co => {
      if (!co) { setLoading(false); return }
      setCompany(co)
      const { data } = await (supabase as any)
        .from('announcements').select('*')
        .eq('company_id', co.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false })
      const list = data || []
      setAnnouncements(list)
      if (list.length > 0) setSelected(list[0])
      setLoading(false)
    })
  }, [slug])

  const accent = company?.accent_color || 'var(--coral)'

  const formatDate = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
  const getMonthYear = (d: string) => new Date(d).toLocaleDateString('en-US', { month: 'long', year: 'numeric' })

  // Group by month
  const grouped: Record<string, any[]> = {}
  announcements.forEach(a => {
    const m = getMonthYear(a.created_at)
    if (!grouped[m]) grouped[m] = []
    grouped[m].push(a)
  })

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: accent, borderTopColor: 'transparent' }} /></div>

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <header className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {company?.logo_url ? <img src={company.logo_url} alt={company.name} className="h-7 w-auto" />
              : <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-sm font-bold" style={{ background: accent }}>{company?.name?.[0]?.toUpperCase()}</div>}
            <span className="font-bold" style={{ color: 'var(--ink)' }}>{company?.name}</span>
          </div>
          <nav className="hidden md:flex items-center gap-1">
            {[
              { label: 'Ideas', href: `/board/${slug}` },
              { label: 'Roadmap', href: `/board/${slug}/roadmap` },
              { label: 'Updates', href: `/board/${slug}/announcements`, active: true },
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

      {announcements.length === 0 ? (
        <div className="min-h-[60vh] flex flex-col items-center justify-center text-center px-6">
          <div className="text-5xl mb-4">📢</div>
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>No updates yet</h2>
          <p style={{ color: 'var(--slate)' }}>Check back soon for product updates and announcements.</p>
        </div>
      ) : (
        <div className="max-w-5xl mx-auto px-6 py-8 flex gap-8">
          {/* Timeline sidebar */}
          <aside className="hidden md:block w-52 shrink-0">
            <div className="sticky top-20">
              {Object.entries(grouped).map(([month, anns]) => (
                <div key={month} className="mb-5">
                  <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: 'var(--slate)' }}>{month}</p>
                  {anns.map(a => (
                    <button key={a.id} onClick={() => setSelected(a)}
                      className="w-full text-left px-3 py-2 rounded-lg text-sm mb-0.5 cursor-pointer transition-all"
                      style={{ background: selected?.id === a.id ? accent + '15' : 'transparent', color: selected?.id === a.id ? accent : 'var(--slate)', fontWeight: selected?.id === a.id ? 600 : 400 }}>
                      <span className="truncate block">{a.title}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </aside>

          {/* Main content */}
          <div className="flex-1 min-w-0 space-y-10">
            {announcements.map(ann => {
              const tagStyle = TAG_COLORS[ann.tag] || { bg: 'var(--canvas)', color: 'var(--slate)' }
              return (
                <div key={ann.id} id={ann.id}
                  className="pb-10 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                  <div className="flex items-center gap-2 mb-3">
                    {ann.tag && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: tagStyle.bg, color: tagStyle.color }}>
                        {ann.tag}
                      </span>
                    )}
                    <span className="text-sm" style={{ color: 'var(--slate)' }}>{formatDate(ann.created_at)}</span>
                  </div>
                  <h2 className="text-2xl font-bold mb-4" style={{ color: 'var(--ink)' }}>{ann.title}</h2>
                  <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>
                    {ann.description}
                  </div>
                  <div className="flex items-center gap-4 mt-4">
                    <span className="text-xs" style={{ color: 'var(--slate)' }}>👍 {ann.likes || 0}</span>
                    <span className="text-xs" style={{ color: 'var(--slate)' }}>👁️ {ann.views || 0} views</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
