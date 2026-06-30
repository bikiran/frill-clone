'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function PublicForm() {
  const params = useParams()
  const formId = params.id as string

  const [form, setForm] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)
  const [step, setStep] = useState(-1) // -1 = welcome
  const [answers, setAnswers] = useState<Record<string, any>>({})
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await (supabase as any).from('forms').select('*').eq('id', formId).single()
      if (error || !data || !data.is_published) { setNotFound(true); setLoading(false); return }
      setForm(data)
      setLoading(false)
    })()
  }, [formId])

  const questions = form?.questions || []
  const themeColor = form?.theme?.color || '#ff7a6b'
  const current = questions[step]

  const handleNext = () => {
    if (current?.required && !answers[current.id]) {
      alert('This question is required')
      return
    }
    if (step < questions.length - 1) setStep(step + 1)
    else handleSubmit()
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await (supabase as any).from('form_responses').insert({
        form_id: formId,
        answers,
      })
      setSubmitted(true)
    } catch (e) {
      alert('Failed to submit. Please try again.')
    }
    setSubmitting(false)
  }

  // Keyboard: Enter to advance
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Enter' && !e.shiftKey && step >= -1 && step < questions.length && !submitted) {
        e.preventDefault()
        handleNext()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [step, answers, questions])

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #f0f0f0', borderTopColor: '#ff7a6b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  if (notFound) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 18, fontWeight: 700, color: '#0d0d0d' }}>Form not found</p>
      <p style={{ fontSize: 14, color: '#6b6b70' }}>This form may have been unpublished or deleted.</p>
    </div>
  )

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#fff', padding: 24, position: 'relative' }}>
      <style>{`
        @keyframes ffFade { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        .ff-anim { animation: ffFade 0.4s cubic-bezier(0.16,1,0.3,1) both; }
        .ff-input { transition: border-color 0.2s; }
        .ff-input:focus { border-color: var(--ff-color) !important; }
      `}</style>

      {/* Progress bar */}
      {step >= 0 && !submitted && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, height: 4, background: '#f0f0f0', zIndex: 10 }}>
          <div style={{ height: '100%', width: `${((step + 1) / questions.length) * 100}%`, background: themeColor, transition: 'width 0.3s ease' }} />
        </div>
      )}

      <div style={{ width: '100%', maxWidth: 600 }}>
        {submitted ? (
          <div key="thanks" className="ff-anim" style={{ textAlign: 'center' }}>
            <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d' }}>{form.thank_you_message || 'Thanks for completing this form!'}</h1>
          </div>
        ) : step === -1 ? (
          <div key="welcome" className="ff-anim">
            <div style={{ width: 56, height: 56, borderRadius: 16, background: themeColor, marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
            <h1 style={{ fontSize: 32, fontWeight: 800, color: '#0d0d0d', marginBottom: 16, lineHeight: 1.2 }}>{form.title}</h1>
            <p style={{ fontSize: 16, color: '#6b6b70', lineHeight: 1.6, marginBottom: 32 }}>{form.welcome_message}</p>
            <button onClick={() => setStep(0)}
              style={{ padding: '13px 32px', borderRadius: 14, background: themeColor, color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer' }}>
              Start →
            </button>
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 16 }}>Press <kbd style={{ padding: '1px 6px', borderRadius: 4, background: '#f0f0f0', fontSize: 11 }}>Enter ↵</kbd></p>
          </div>
        ) : current ? (
          <div key={current.id} className="ff-anim">
            <p style={{ fontSize: 13, fontWeight: 700, color: themeColor, marginBottom: 10 }}>{step + 1} → {questions.length}</p>
            <h2 style={{ fontSize: 26, fontWeight: 800, color: '#0d0d0d', marginBottom: 8, lineHeight: 1.3 }}>
              {current.title}{current.required && <span style={{ color: themeColor }}> *</span>}
            </h2>
            {current.description && <p style={{ fontSize: 15, color: '#6b6b70', marginBottom: 28 }}>{current.description}</p>}

            <div style={{ marginTop: current.description ? 0 : 28, marginBottom: 36 }}>
              {current.type === 'short_text' && (
                <input autoFocus value={answers[current.id] || ''} onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                  className="ff-input" style={{ ['--ff-color' as any]: themeColor, width: '100%', fontSize: 20, padding: '8px 0', border: 'none', borderBottom: '2.5px solid #e5e5e5', outline: 'none' }}
                  placeholder="Type your answer here..." />
              )}
              {current.type === 'long_text' && (
                <textarea autoFocus value={answers[current.id] || ''} onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                  className="ff-input" rows={3} style={{ ['--ff-color' as any]: themeColor, width: '100%', fontSize: 18, padding: '8px 0', border: 'none', borderBottom: '2.5px solid #e5e5e5', outline: 'none', resize: 'none' }}
                  placeholder="Type your answer here..." />
              )}
              {current.type === 'email' && (
                <input autoFocus type="email" value={answers[current.id] || ''} onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                  className="ff-input" style={{ ['--ff-color' as any]: themeColor, width: '100%', fontSize: 20, padding: '8px 0', border: 'none', borderBottom: '2.5px solid #e5e5e5', outline: 'none' }}
                  placeholder="name@example.com" />
              )}
              {current.type === 'number' && (
                <input autoFocus type="number" value={answers[current.id] || ''} onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                  className="ff-input" style={{ ['--ff-color' as any]: themeColor, width: '100%', fontSize: 20, padding: '8px 0', border: 'none', borderBottom: '2.5px solid #e5e5e5', outline: 'none' }}
                  placeholder="0" />
              )}
              {current.type === 'date' && (
                <input autoFocus type="date" value={answers[current.id] || ''} onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                  className="ff-input" style={{ ['--ff-color' as any]: themeColor, width: '100%', fontSize: 18, padding: '8px 0', border: 'none', borderBottom: '2.5px solid #e5e5e5', outline: 'none' }} />
              )}
              {current.type === 'yes_no' && (
                <div style={{ display: 'flex', gap: 12 }}>
                  {['Yes', 'No'].map(o => (
                    <button key={o} onClick={() => setAnswers(p => ({ ...p, [current.id]: o }))}
                      style={{ flex: 1, padding: '16px', borderRadius: 14, border: `2.5px solid ${answers[current.id] === o ? themeColor : '#e5e5e5'}`, background: answers[current.id] === o ? `${themeColor}10` : '#fff', fontSize: 16, fontWeight: 600, color: answers[current.id] === o ? themeColor : '#374151', cursor: 'pointer', transition: 'all 0.15s' }}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {current.type === 'rating' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => setAnswers(p => ({ ...p, [current.id]: n }))} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill={(answers[current.id] || 0) >= n ? themeColor : 'none'} stroke={themeColor} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </button>
                  ))}
                </div>
              )}
              {current.type === 'multiple_choice' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(current.options || []).map((opt: string, oi: number) => (
                    <button key={oi} onClick={() => setAnswers(p => ({ ...p, [current.id]: opt }))}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 12, border: `2.5px solid ${answers[current.id] === opt ? themeColor : '#e5e5e5'}`, background: answers[current.id] === opt ? `${themeColor}10` : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ width: 26, height: 26, borderRadius: 7, border: `2px solid ${answers[current.id] === opt ? themeColor : '#d1d5db'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: answers[current.id] === opt ? themeColor : '#9ca3af', flexShrink: 0 }}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span style={{ fontSize: 16, color: '#0d0d0d' }}>{opt}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <button onClick={handleNext} disabled={submitting}
                style={{ padding: '12px 28px', borderRadius: 12, background: themeColor, color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                {submitting ? 'Submitting...' : step === questions.length - 1 ? 'Submit →' : 'OK →'}
              </button>
              {step > 0 && (
                <button onClick={() => setStep(step - 1)} style={{ background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer' }}>
                  ← Back
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
