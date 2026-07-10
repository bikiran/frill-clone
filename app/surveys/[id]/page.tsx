'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function PublicSurveyPage() {
  const params = useParams()
  const surveyId = params?.id as string
  const [survey, setSurvey] = useState<any>(null)
  const [score, setScore] = useState<number | null>(null)
  const [comment, setComment] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    fetchSurvey()
  }, [surveyId])

  const fetchSurvey = async () => {
    const { data } = await supabase.from('surveys').select('*').eq('id', surveyId).maybeSingle()
    setSurvey(data)
    setLoading(false)
  }

  const submit = async () => {
    if (score === null) return
    setSubmitting(true)
    const { error } = await supabase.from('survey_responses').insert({
      survey_id: surveyId,
      answer: score.toString(),
      comment: comment.trim() || null,
    })
    if (error) {
      alert('Failed to submit: ' + error.message)
      setSubmitting(false)
      return
    }
    setSubmitted(true)
  }

  if (loading) return <div className="p-8 text-center" style={{ color: 'var(--slate)' }}>Loading survey...</div>
  if (!survey) return <div className="p-8 text-center">Survey not found.</div>
  if (!survey.is_active) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Survey is closed</h2>
          <p style={{ color: 'var(--slate)' }}>This survey is no longer accepting responses.</p>
        </div>
      </div>
    )
  }
  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="text-6xl mb-4">🎉</div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>Thank you!</h2>
          <p style={{ color: 'var(--slate)' }}>Your feedback has been recorded. We appreciate your time.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: 'var(--peach)' }}>
      <div className="w-full max-w-2xl">
        <div className="bg-white rounded-2xl shadow-xl p-6 md:p-10">
          <h1 className="text-xl md:text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>{survey.title}</h1>
          <h2 className="text-base mb-6" style={{ color: 'var(--slate)' }}>{survey.question}</h2>

          {(survey.type === 'nps' || survey.type === 'csat') && (
            <>
              <div className="grid grid-cols-11 gap-1 md:gap-2 mb-3">
                {[0,1,2,3,4,5,6,7,8,9,10].map(n => (
                  <button
                    key={n}
                    onClick={() => setScore(n)}
                    className="aspect-square rounded-lg border-2 text-sm md:text-base font-bold transition-smooth press-effect cursor-pointer"
                    style={{
                      background: score === n ? 'var(--coral)' : 'white',
                      borderColor: score === n ? 'var(--coral)' : 'var(--border)',
                      color: score === n ? 'white' : 'var(--ink)',
                    }}>
                    {n}
                  </button>
                ))}
              </div>
              <div className="flex justify-between text-xs mb-6" style={{ color: 'var(--slate)' }}>
                <span>Least likely</span>
                <span>Most likely</span>
              </div>
            </>
          )}

          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            placeholder="Tell us more (optional)..."
            rows={4}
            className="w-full px-4 py-3 rounded-lg border focus:outline-none transition-smooth resize-none mb-4"
            style={{ borderColor: 'var(--border)', fontSize: '16px' }}
          />

          <button
            onClick={submit}
            disabled={score === null || submitting}
            className="w-full py-3 rounded-xl font-semibold text-white text-sm transition-smooth press-effect disabled:opacity-50 cursor-pointer"
            style={{ background: 'var(--coral)' }}>
            {submitting ? 'Submitting...' : 'Submit Response'}
          </button>

          <p className="text-xs text-center mt-4" style={{ color: 'var(--slate)' }}>Powered by YourApp</p>
        </div>
      </div>
    </div>
  )
}
