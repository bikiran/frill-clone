'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

export default function FormResults() {
  const params = useParams()
  const formId = params.id as string

  const [form, setForm] = useState<any>(null)
  const [responses, setResponses] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [view, setView] = useState<'summary' | 'individual'>('summary')
  const [selectedResponse, setSelectedResponse] = useState<any>(null)

  useEffect(() => {
    ;(async () => {
      const [formRes, responsesRes] = await Promise.all([
        (supabase as any).from('forms').select('*').eq('id', formId).single(),
        (supabase as any).from('form_responses').select('*').eq('form_id', formId).order('created_at', { ascending: false }),
      ])
      setForm(formRes.data)
      setResponses(responsesRes.data || [])
      setLoading(false)
    })()
  }, [formId])

  if (loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>
  if (!form) return <div className="p-8" style={{ color: 'var(--slate)' }}>Form not found</div>

  const questions = form.questions || []
  const themeColor = form.theme?.color || '#ff7a6b'
  const completionRate = responses.length > 0 ? 100 : 0 // all stored responses are completed submissions

  // Aggregate stats per question
  const getQuestionStats = (q: any) => {
    const answers = responses.map(r => r.answers?.[q.id]).filter(a => a !== undefined && a !== '')
    if (q.type === 'multiple_choice' || q.type === 'yes_no') {
      const counts: Record<string, number> = {}
      answers.forEach(a => { counts[a] = (counts[a] || 0) + 1 })
      return { type: 'distribution', counts, total: answers.length }
    }
    if (q.type === 'rating') {
      const nums = answers.map(a => Number(a)).filter(n => !isNaN(n))
      const avg = nums.length ? (nums.reduce((s, n) => s + n, 0) / nums.length) : 0
      return { type: 'average', avg, total: nums.length }
    }
    return { type: 'text', samples: answers.slice(0, 5), total: answers.length }
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-5xl mx-auto px-4 md:px-6 py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
          <div>
            <Link href="/admin/forms" className="text-sm font-medium hover:opacity-70 transition-smooth" style={{ color: 'var(--coral)' }}>
              ← Back to forms
            </Link>
            <h1 className="text-2xl font-bold mt-2" style={{ color: 'var(--ink)' }}>{form.title}</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--slate)' }}>{responses.length} response{responses.length !== 1 ? 's' : ''}</p>
          </div>
          <Link href={`/admin/forms/${formId}`} className="px-4 py-2 rounded-xl text-sm font-semibold border cursor-pointer hover:bg-gray-50" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
            ✎ Edit form
          </Link>
        </div>

        {/* View toggle */}
        <div className="flex gap-2 mb-6">
          <button onClick={() => setView('summary')}
            className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
            style={{ background: view === 'summary' ? themeColor : 'transparent', color: view === 'summary' ? '#fff' : 'var(--slate)', border: view === 'summary' ? 'none' : '1px solid var(--border)' }}>
            Summary
          </button>
          <button onClick={() => setView('individual')}
            className="px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer"
            style={{ background: view === 'individual' ? themeColor : 'transparent', color: view === 'individual' ? '#fff' : 'var(--slate)', border: view === 'individual' ? 'none' : '1px solid var(--border)' }}>
            Individual responses
          </button>
        </div>

        {responses.length === 0 ? (
          <div className="text-center py-20 rounded-2xl border" style={{ borderColor: 'var(--border)' }}>
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="1.5" className="mx-auto mb-4"><rect x="3" y="3" width="18" height="18" rx="3"/><line x1="7" y1="8" x2="17" y2="8"/><line x1="7" y1="12" x2="13" y2="12"/></svg>
            <h3 className="text-lg font-semibold mb-2" style={{ color: 'var(--ink)' }}>No responses yet</h3>
            <p style={{ color: 'var(--slate)' }}>Share your form to start collecting responses.</p>
          </div>
        ) : view === 'summary' ? (
          <div className="space-y-4">
            {/* Top stats */}
            <div className="grid grid-cols-3 gap-4 mb-6">
              <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                <p className="text-2xl font-black" style={{ color: 'var(--ink)' }}>{responses.length}</p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Total responses</p>
              </div>
              <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                <p className="text-2xl font-black" style={{ color: 'var(--ink)' }}>{questions.length}</p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Questions</p>
              </div>
              <div className="bg-white rounded-2xl border p-5" style={{ borderColor: 'var(--border)' }}>
                <p className="text-2xl font-black" style={{ color: 'var(--ink)' }}>
                  {responses[0] ? new Date(responses[0].created_at).toLocaleDateString() : '—'}
                </p>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>Last response</p>
              </div>
            </div>

            {/* Per-question breakdown */}
            {questions.map((q: any, qi: number) => {
              const stats = getQuestionStats(q)
              return (
                <div key={q.id} className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-xs font-bold mb-1" style={{ color: themeColor }}>QUESTION {qi + 1}</p>
                  <h3 className="text-base font-bold mb-4" style={{ color: 'var(--ink)' }}>{q.title}</h3>

                  {stats.type === 'distribution' && (
                    <div className="space-y-2">
                      {Object.entries(stats.counts).sort((a, b) => (b[1] as number) - (a[1] as number)).map(([opt, count]) => {
                        const pct = stats.total > 0 ? Math.round((count as number) / stats.total * 100) : 0
                        return (
                          <div key={opt}>
                            <div className="flex justify-between mb-1">
                              <span className="text-sm" style={{ color: 'var(--ink)' }}>{opt}</span>
                              <span className="text-sm font-semibold" style={{ color: 'var(--slate)' }}>{count} ({pct}%)</span>
                            </div>
                            <div className="h-2 rounded-full" style={{ background: 'var(--border)' }}>
                              <div className="h-full rounded-full" style={{ width: `${pct}%`, background: themeColor }} />
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  )}

                  {stats.type === 'average' && (
                    <div className="flex items-center gap-3">
                      <span className="text-3xl font-black" style={{ color: themeColor }}>{stats.avg.toFixed(1)}</span>
                      <span className="text-sm" style={{ color: 'var(--slate)' }}>average out of 5 ({stats.total} ratings)</span>
                    </div>
                  )}

                  {stats.type === 'text' && (
                    <div className="space-y-2">
                      {stats.samples.length === 0 ? (
                        <p className="text-sm" style={{ color: 'var(--slate)' }}>No answers yet</p>
                      ) : stats.samples.map((s: any, si: number) => (
                        <p key={si} className="text-sm p-3 rounded-lg" style={{ background: 'var(--canvas, #fafafa)', color: 'var(--ink)' }}>"{s}"</p>
                      ))}
                      {stats.total > 5 && <p className="text-xs" style={{ color: 'var(--slate)' }}>+{stats.total - 5} more responses</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <div className="grid md:grid-cols-2 gap-4">
            {responses.map(r => (
              <button key={r.id} onClick={() => setSelectedResponse(r)}
                className="text-left bg-white rounded-2xl border p-5 hover:shadow-md transition-smooth cursor-pointer" style={{ borderColor: 'var(--border)' }}>
                <p className="text-xs mb-2" style={{ color: 'var(--slate)' }}>{new Date(r.created_at).toLocaleString()}</p>
                {questions.slice(0, 2).map((q: any) => (
                  <p key={q.id} className="text-sm mb-1 truncate" style={{ color: 'var(--ink)' }}>
                    <span style={{ color: 'var(--slate)' }}>{q.title}:</span> {String(r.answers?.[q.id] ?? '—')}
                  </p>
                ))}
                <p className="text-xs mt-2 font-semibold" style={{ color: themeColor }}>View full response →</p>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Individual response modal */}
      {selectedResponse && (
        <>
          <div className="fixed inset-0 z-50 backdrop-blur-sm" style={{ background: 'rgba(0,0,0,0.4)' }} onClick={() => setSelectedResponse(null)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-lg bg-white rounded-2xl shadow-2xl mx-4 max-h-[85vh] overflow-y-auto">
            <div className="p-6 border-b flex items-center justify-between" style={{ borderColor: 'var(--border)' }}>
              <div>
                <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Response</h2>
                <p className="text-xs" style={{ color: 'var(--slate)' }}>{new Date(selectedResponse.created_at).toLocaleString()}</p>
              </div>
              <button onClick={() => setSelectedResponse(null)} className="text-2xl cursor-pointer" style={{ color: 'var(--slate)' }}>×</button>
            </div>
            <div className="p-6 space-y-4">
              {questions.map((q: any) => (
                <div key={q.id}>
                  <p className="text-xs font-semibold mb-1" style={{ color: 'var(--slate)' }}>{q.title}</p>
                  <p className="text-sm" style={{ color: 'var(--ink)' }}>{String(selectedResponse.answers?.[q.id] ?? '—')}</p>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
