'use client'
import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import Link from 'next/link'

export default function BoardAnnouncementsPage() {
  const params = useParams()
  const slug = params?.slug as string
  const [company, setCompany] = useState<any>(null)
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!slug) return
    getCompanyBySlug(slug).then(async co => {
      if (!co) { setLoading(false); return }
      setCompany(co)
      const { data } = await (supabase as any).from('announcements').select('*').eq('company_id', co.id).eq('status', 'published').order('created_at', { ascending: false })
      setAnnouncements(data || [])
      setLoading(false)
    })
  }, [slug])

  if (loading) return <div className="p-8 text-center">Loading...</div>
  if (!company) return <div className="p-8 text-center">Board not found</div>

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <header className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-4xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href={`/board/${slug}`} className="font-bold" style={{ color: 'var(--ink)' }}>← {company.name}</Link>
          <span className="font-semibold text-sm" style={{ color: 'var(--slate)' }}>Updates</span>
        </div>
      </header>
      <div className="max-w-3xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-bold mb-8" style={{ color: 'var(--ink)' }}>Updates</h1>
        {announcements.length === 0 ? (
          <div className="text-center py-16">
            <div className="text-4xl mb-3">📢</div>
            <p style={{ color: 'var(--slate)' }}>No announcements yet</p>
          </div>
        ) : (
          <div className="space-y-0">
            {announcements.map((ann, i) => (
              <div key={ann.id} className="pb-10 mb-10" style={{ borderBottom: i < announcements.length - 1 ? '1px solid #e5e7eb' : 'none' }}>
                <div className="flex items-center gap-2 mb-3">
                  {ann.tag && <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>{ann.tag}</span>}
                  <span className="text-sm" style={{ color: 'var(--slate)' }}>{new Date(ann.created_at).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}</span>
                </div>
                <h2 className="text-xl font-bold mb-3" style={{ color: 'var(--ink)' }}>{ann.title}</h2>
                <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: 'var(--ink)' }}>{ann.description}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
