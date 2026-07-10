'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'


export default function SurveyDetailPage() {
  const params = useParams()
  const router = useRouter()
  const surveyId = params?.id as string
  const [survey, setSurvey] = useState<any>(null)
  const [responses, setResponses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      })
    fetchData()
  }, [surveyId, router])

  const fetchData = async () => {
    try {
      const { data: s } = await supabase.from('surveys').select('*').eq('id', surveyId).maybeSingle()
      setSurvey(s)
      const { data: r } = await supabase.from('survey_responses').select('*').eq('survey_id', surveyId).order('created_at', { ascending: false })
      setResponses(r || [])
    } catch (e) {
      console.error(e)
    }
    setLoading(false)
  }

  if (loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>
  if (!survey) return <div className="p-8">Survey not found.</div>

  // NPS analytics
  const npsScores = responses.map(r => parseInt(r.answer)).filter(n => !isNaN(n))
  const promoters = npsScores.filter(n => n >= 9).length
  const passives = npsScores.filter(n => n >= 7 && n <= 8).length
  const detractors = npsScores.filter(n => n <= 6).length
  const total = npsScores.length
  const nps = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0
  const avgScore = total > 0 ? (npsScores.reduce((a, b) => a + b, 0) / total).toFixed(1) : '0'

  return (
    <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
      <Link href="/admin/surveys" className="text-sm font-medium hover:opacity-70 transition-smooth" style={{ color: 'var(--coral)' }}>
        ← Back to surveys
      </Link>
      <h1 className="text-3xl font-bold mt-3 mb-2" style={{ color: 'var(--ink)' }}>{survey.title}</h1>
      <p className="mb-8" style={{ color: 'var(--slate)' }}>{survey.question}</p>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--slate)' }}>Responses</p>
          <p className="text-3xl font-bold" style={{ color: 'var(--ink)' }}>{responses.length}</p>
        </div>
        {survey.type === 'nps' && (
          <>
            <div className="bg-white rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--slate)' }}>NPS Score</p>
              <p className="text-3xl font-bold" style={{ color: nps >= 50 ? '#10b981' : nps >= 0 ? '#eab308' : '#dc2626' }}>{nps}</p>
            </div>
            <div className="bg-white rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--slate)' }}>Avg Score</p>
              <p className="text-3xl font-bold" style={{ color: 'var(--ink)' }}>{avgScore}</p>
            </div>
          </>
        )}
        <div className="bg-white rounded-xl border p-4" style={{ borderColor: 'var(--border)' }}>
          <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--slate)' }}>Status</p>
          <p className="text-base font-semibold" style={{ color: survey.is_active ? '#10b981' : '#6b7280' }}>
            {survey.is_active ? '● Active' : '○ Inactive'}
          </p>
        </div>
      </div>

      {/* NPS breakdown */}
      {survey.type === 'nps' && total > 0 && (
        <div className="bg-white rounded-2xl border p-6 mb-6" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>NPS Breakdown</h3>
          <div className="space-y-3">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span style={{ color: 'var(--ink)' }}>Promoters (9-10)</span>
                <span style={{ color: 'var(--slate)' }}>{promoters} ({Math.round(promoters/total*100)}%)</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div className="h-2 rounded-full" style={{ background: '#10b981', width: `${(promoters/total*100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span style={{ color: 'var(--ink)' }}>Passives (7-8)</span>
                <span style={{ color: 'var(--slate)' }}>{passives} ({Math.round(passives/total*100)}%)</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div className="h-2 rounded-full" style={{ background: '#eab308', width: `${(passives/total*100)}%` }} />
              </div>
            </div>
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span style={{ color: 'var(--ink)' }}>Detractors (0-6)</span>
                <span style={{ color: 'var(--slate)' }}>{detractors} ({Math.round(detractors/total*100)}%)</span>
              </div>
              <div className="h-2 rounded-full bg-gray-100">
                <div className="h-2 rounded-full" style={{ background: '#dc2626', width: `${(detractors/total*100)}%` }} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent responses */}
      <div className="bg-white rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
        <div className="p-5 border-b" style={{ borderColor: 'var(--border)' }}>
          <h3 className="font-bold" style={{ color: 'var(--ink)' }}>Recent Responses</h3>
        </div>
        {responses.length === 0 ? (
          <div className="p-12 text-center">
            <p style={{ color: 'var(--slate)' }}>No responses yet. Share your survey link to start collecting feedback.</p>
            <div className="flex items-center gap-2 mt-3 max-w-lg mx-auto">
              <input type="text" readOnly value={typeof window !== 'undefined' ? `${window.location.origin}/surveys/${surveyId}` : ''} className="flex-1 px-3 py-2 rounded-lg border text-xs font-mono" style={{ borderColor: 'var(--border)', color: 'var(--coral)' }} />
              <button onClick={() => { navigator.clipboard.writeText(`${window.location.origin}/surveys/${surveyId}`); alert('Copied!') }} className="px-4 py-2 rounded-lg border text-sm font-medium transition-smooth hover:bg-gray-50 cursor-pointer flex items-center gap-1.5" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>
                Copy
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y" style={{ borderColor: 'var(--border)' }}>
            {responses.slice(0, 20).map(r => (
              <div key={r.id} className="p-4 flex items-center gap-4">
                <span className="text-2xl font-bold w-12 text-center" style={{ 
                  color: parseInt(r.answer) >= 9 ? '#10b981' : parseInt(r.answer) >= 7 ? '#eab308' : '#dc2626' 
                }}>
                  {r.answer}
                </span>
                <div className="flex-1">
                  {r.comment && <p className="text-sm" style={{ color: 'var(--ink)' }}>{r.comment}</p>}
                  <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>{new Date(r.created_at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
