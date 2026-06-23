'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

export default function AnalyticsPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [stats, setStats] = useState({
    totalIdeas: 0,
    totalVotes: 0,
    totalComments: 0,
    topIdeas: [] as any[],
  })

  useEffect(() => {
    supabase.auth.getSession().then((res: any) => {
      const u = res.data.session?.user
      if (u?.email !== ADMIN_EMAIL) {
        router.push('/')
        return
      }
      setUser(u)
      loadAnalytics()
    })
  }, [router])

  const loadAnalytics = async () => {
    try {
      const { count: ic } = await supabase.from('ideas').select('*', { count: 'exact', head: true })
      const { count: vc } = await supabase.from('votes').select('*', { count: 'exact', head: true })
      const { count: cc } = await supabase.from('comments').select('*', { count: 'exact', head: true })
      const { data: top } = await supabase.from('ideas').select('id,title,votes').order('votes', { ascending: false }).limit(5)
      
      setStats({ totalIdeas: ic || 0, totalVotes: vc || 0, totalComments: cc || 0, topIdeas: top || [] })
    } catch (err) {
      console.error('Analytics failed:', err)
    }
    setLoading(false)
  }

  if (!user) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  return (
    <div className="max-w-6xl mx-auto px-6 py-8">
      <h1 className="text-3xl font-bold mb-8" style={{ color: 'var(--ink)' }}>Analytics</h1>
      
      <div className="grid sm:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'Ideas', value: stats.totalIdeas, icon: '💡' },
          { label: 'Votes', value: stats.totalVotes, icon: '👍' },
          { label: 'Comments', value: stats.totalComments, icon: '💬' },
          { label: 'Trending', value: stats.topIdeas.length, icon: '⭐' },
        ].map(s => (
          <div key={s.label} className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
            <div className="text-3xl mb-2">{s.icon}</div>
            <p className="text-sm" style={{ color: 'var(--slate)' }}>{s.label}</p>
            <p className="text-3xl font-bold mt-1" style={{ color: 'var(--coral)' }}>{s.value}</p>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
        <h2 className="text-lg font-bold mb-4" style={{ color: 'var(--ink)' }}>Top Ideas</h2>
        {loading ? <p style={{ color: 'var(--slate)' }}>Loading...</p> : <div className="space-y-2">
          {stats.topIdeas.map((i: any, idx: number) => (
            <div key={i.id} className="flex justify-between py-2 border-b" style={{ borderColor: 'var(--border)' }}>
              <span>#{idx + 1} {i.title}</span>
              <span style={{ color: 'var(--coral)' }}>{i.votes} votes</span>
            </div>
          ))}
        </div>}
      </div>
    </div>
  )
}
