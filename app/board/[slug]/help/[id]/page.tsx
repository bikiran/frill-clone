'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import Link from 'next/link'

export default function BoardHelpArticlePage() {
  const params = useParams()
  const slug = params?.slug as string
  const id = params?.id as string
  const [company, setCompany] = useState<any>(null)
  const [article, setArticle] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [helpful, setHelpful] = useState<boolean | null>(null)

  useEffect(() => {
    if (!slug || !id) return
    getCompanyBySlug(slug).then(async co => {
      if (!co) { setLoading(false); return }
      setCompany(co)
      const { data } = await (supabase as any).from('help_articles').select('*').eq('id', id).eq('company_id', co.id).single()
      setArticle(data)
      if (data) {
        await (supabase as any).from('help_articles').update({ views: (data.views || 0) + 1 }).eq('id', id)
      }
      setLoading(false)
    })
  }, [slug, id])

  const accent = company?.accent_color || 'var(--coral)'

  const renderContent = (content: string) => {
    if (!content) return ''
    return content
      .replace(/^### (.+)$/gm, '<h3 class="text-lg font-bold mt-5 mb-2" style="color:var(--ink)">$1</h3>')
      .replace(/^## (.+)$/gm, '<h2 class="text-xl font-bold mt-7 mb-3" style="color:var(--ink)">$1</h2>')
      .replace(/^# (.+)$/gm, '<h1 class="text-2xl font-bold mt-2 mb-4" style="color:var(--ink)">$1</h1>')
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/`(.+?)`/g, '<code class="px-1.5 py-0.5 rounded text-sm" style="background:var(--canvas);color:var(--coral)">$1</code>')
      .replace(/^- (.+)$/gm, '<li class="ml-4 mb-1" style="color:var(--ink)">• $1</li>')
      .replace(/^\| (.+) \|$/gm, (m: string) => `<tr>${m.split('|').filter((c:string) => c.trim()).map((c:string) => `<td class="px-3 py-2 border" style="border-color:var(--border)">${c.trim()}</td>`).join('')}</tr>`)
      .replace(/\n\n/g, '</p><p class="mb-3" style="color:var(--ink)">')
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center"><div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: accent, borderTopColor: 'transparent' }} /></div>
  if (!article) return <div className="min-h-screen flex items-center justify-center"><p style={{ color: 'var(--slate)' }}>Article not found</p></div>

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <header className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center gap-3">
          {company?.logo_url ? <img src={company.logo_url} alt={company.name} className="h-6 w-auto" />
            : <div className="w-6 h-6 rounded flex items-center justify-center text-white text-xs font-bold" style={{ background: accent }}>{company?.name?.[0]?.toUpperCase()}</div>}
          <Link href={`/board/${slug}/help`} className="text-sm hover:underline" style={{ color: 'var(--slate)' }}>← Help Centre</Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-10">
        <div className="mb-6">
          <span className="text-xs px-2 py-0.5 rounded-full inline-block mb-3" style={{ background: accent + '15', color: accent }}>{article.category}</span>
          <h1 className="text-3xl font-black mb-3" style={{ color: 'var(--ink)' }}>{article.title}</h1>
          <p className="text-sm" style={{ color: 'var(--slate)' }}>{article.views || 0} views · {article.likes || 0} found this helpful</p>
        </div>

        <div className="bg-white rounded-2xl border p-8 mb-8 prose max-w-none" style={{ borderColor: 'var(--border)' }}>
          <div className="text-sm leading-relaxed" style={{ color: 'var(--ink)' }}
            dangerouslySetInnerHTML={{ __html: '<p class="mb-3">' + renderContent(article.content || '') + '</p>' }} />
        </div>

        {/* Helpful? */}
        <div className="bg-white rounded-2xl border p-5 text-center" style={{ borderColor: 'var(--border)' }}>
          <p className="text-sm font-medium mb-3" style={{ color: 'var(--ink)' }}>Was this article helpful?</p>
          <div className="flex justify-center gap-3">
            {[{ label: '👍 Yes', val: true }, { label: '👎 No', val: false }].map(btn => (
              <button key={String(btn.val)} onClick={async () => {
                  setHelpful(btn.val)
                  if (btn.val) await (supabase as any).from('help_articles').update({ likes: (article.likes || 0) + 1 }).eq('id', id)
                }}
                className="px-6 py-2 rounded-xl border cursor-pointer transition-all text-sm font-medium"
                style={{ borderColor: helpful === btn.val ? accent : 'var(--border)', background: helpful === btn.val ? accent + '15' : 'white', color: helpful === btn.val ? accent : 'var(--ink)' }}>
                {btn.label}
              </button>
            ))}
          </div>
          {helpful !== null && <p className="text-sm mt-3" style={{ color: 'var(--slate)' }}>{helpful ? 'Thanks! Glad this helped 🎉' : 'Sorry to hear that. Contact support below.'}</p>}
        </div>
      </div>
    </div>
  )
}
