'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

export default function PollDetailPage() {
  const params = useParams()
  const router = useRouter()
  const pollId = params?.id as string
  const [poll, setPoll] = useState<any>(null)
  const [votes, setVotes] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user.email !== ADMIN_EMAIL) router.push('/')
    })
    fetchData()
  }, [pollId, router])

  const fetchData = async () => {
    const { data: p } = await supabase.from('polls').select('*').eq('id', pollId).single()
    setPoll(p)
    const { data: v } = await supabase.from('poll_votes').select('*').eq('poll_id', pollId)
    setVotes(v || [])
    setLoading(false)
  }

  if (loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>
  if (!poll) return <div className="p-8">Poll not found</div>

  const counts: Record<string, number> = {}
  votes.forEach(v => {
    const key = v.option ?? (Array.isArray(poll.options) ? poll.options[v.option_index] : undefined)
    if (key) counts[key] = (counts[key] || 0) + 1
  })
  const total = votes.length

  return (
    <div className="max-w-3xl mx-auto px-4 md:px-6 py-8">
      <Link href="/admin/polls" className="text-sm font-medium hover:opacity-70" style={{ color: 'var(--coral)' }}>← Back to polls</Link>
      <h1 className="text-3xl font-bold mt-3 mb-2" style={{ color: 'var(--ink)' }}>{poll.question}</h1>
      <p className="mb-8" style={{ color: 'var(--slate)' }}>{total} {total === 1 ? 'vote' : 'votes'}</p>

      <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
        <h3 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Results</h3>
        <div className="space-y-4">
          {(Array.isArray(poll.options) ? poll.options : []).map((opt: string) => {
            const count = counts[opt] || 0
            const pct = total > 0 ? Math.round(count / total * 100) : 0
            return (
              <div key={opt}>
                <div className="flex justify-between text-sm mb-1.5">
                  <span style={{ color: 'var(--ink)' }}>{opt}</span>
                  <span style={{ color: 'var(--slate)' }}>{count} ({pct}%)</span>
                </div>
                <div className="h-3 rounded-full bg-gray-100">
                  <div className="h-3 rounded-full transition-smooth" style={{ background: 'var(--coral)', width: `${pct}%` }} />
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
        <p className="text-sm font-semibold mb-2" style={{ color: 'var(--ink)' }}>Share this poll</p>
        <div className="flex items-center gap-2">
          <input 
            type="text" 
            readOnly 
            value={typeof window !== 'undefined' ? `${window.location.origin}/polls/${pollId}` : ''} 
            className="flex-1 px-3 py-2 rounded-lg border text-xs font-mono" 
            style={{ borderColor: 'var(--border)', color: 'var(--coral)' }} 
          />
          <button 
            onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/polls/${pollId}`); alert('Copied!') }}
            className="px-4 py-2 rounded-lg border text-sm font-medium transition-smooth hover:bg-gray-50 cursor-pointer flex items-center gap-1.5"
            style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
            Copy
          </button>
        </div>
      </div>
    </div>
  )
}
