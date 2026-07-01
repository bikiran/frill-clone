'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function Confetti({ color }: { color: string }) {
  const pieces = Array.from({ length: 60 }, (_, i) => i)
  const colors = [color, '#10b981', '#f59e0b', '#6366f1', '#ec4899']
  return (
    <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden', zIndex: 50 }}>
      <style>{`
        @keyframes confettiFall {
          0% { transform: translateY(-10vh) rotate(0deg); opacity: 1; }
          100% { transform: translateY(110vh) rotate(720deg); opacity: 0.3; }
        }
      `}</style>
      {pieces.map(i => {
        const left = Math.random() * 100
        const delay = Math.random() * 0.6
        const duration = 2.2 + Math.random() * 1.6
        const size = 6 + Math.random() * 6
        const c = colors[i % colors.length]
        const isCircle = i % 3 === 0
        return (
          <div key={i} style={{
            position: 'absolute', top: 0, left: `${left}%`,
            width: size, height: isCircle ? size : size * 1.6,
            background: c, borderRadius: isCircle ? '50%' : 2,
            animation: `confettiFall ${duration}s ease-in ${delay}s both`,
          }} />
        )
      })}
    </div>
  )
}

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
  const [showConfetti, setShowConfetti] = useState(false)
  const [uploadingFile, setUploadingFile] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

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

  // Question types where a single tap/click is an unambiguous answer — auto-advance
  const AUTO_ADVANCE_TYPES = ['multiple_choice', 'dropdown', 'yes_no', 'rating', 'nps', 'opinion_scale', 'legal']

  const handleNext = () => {
    if (current?.required && (answers[current.id] === undefined || answers[current.id] === '' || (Array.isArray(answers[current.id]) && answers[current.id].length === 0))) {
      alert('This question is required')
      return
    }
    if (step < questions.length - 1) setStep(step + 1)
    else handleSubmit()
  }

  const selectAndAdvance = (questionId: string, value: any) => {
    setAnswers(p => ({ ...p, [questionId]: value }))
    setTimeout(() => {
      setStep(s => {
        if (s < questions.length - 1) return s + 1
        return s
      })
      if (step === questions.length - 1) handleSubmit()
    }, 280)
  }

  const handleSubmit = async () => {
    setSubmitting(true)
    try {
      await (supabase as any).from('form_responses').insert({
        form_id: formId,
        answers,
      })
      
      // Trigger email notification to form admin
      try {
        if (form && form.company_id) {
          const { data: company } = await (supabase as any).from('companies').select('owner_id').eq('id', form.company_id).single()
          if (company?.owner_id) {
            await fetch('/api/form-notifications', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ formId, userId: company.owner_id }),
            })
          }
        }
      } catch (error) {
        console.error('Failed to send notification:', error)
      }
      
      setSubmitted(true)
      if (form.show_confetti !== false) {
        setShowConfetti(true)
        setTimeout(() => setShowConfetti(false), 3500)
      }
    } catch (e) {
      alert('Failed to submit. Please try again.')
    }
    setSubmitting(false)
  }

  const handleFileUpload = async (file: File, questionId: string) => {
    setUploadingFile(true)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `form-uploads/${formId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`
      const { data, error } = await supabase.storage.from('idea-images').upload(fileName, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from('idea-images').getPublicUrl(data.path)
      setAnswers(p => ({ ...p, [questionId]: { name: file.name, url: publicUrl } }))
    } catch (e: any) {
      alert('File upload failed: ' + e.message)
    }
    setUploadingFile(false)
  }

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

      {showConfetti && <Confetti color={themeColor} />}

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
            <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', marginBottom: (form.end_actions || []).length > 0 ? 28 : 0 }}>{form.thank_you_message || 'Thanks for completing this form!'}</h1>
            {(form.end_actions || []).length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxWidth: 320, margin: '0 auto' }}>
                {(form.end_actions || []).map((a: any, i: number) => (
                  <a key={i} href={a.url || '#'} target="_blank" rel="noopener"
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                      padding: '13px 20px', borderRadius: 12, fontSize: 14, fontWeight: 700, textDecoration: 'none',
                      background: i === 0 ? themeColor : '#fff',
                      color: i === 0 ? '#fff' : themeColor,
                      border: i === 0 ? 'none' : `1.5px solid ${themeColor}`,
                    }}>
                    {a.type === 'video' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>}
                    {a.type === 'social' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>}
                    {(a.type === 'website' || a.type === 'custom') && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>}
                    {a.label}
                  </a>
                ))}
              </div>
            )}
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

            {current.mediaUrl && (
              current.mediaType === 'video' ? (
                <video src={current.mediaUrl} controls style={{ width: '100%', borderRadius: 16, marginBottom: 20, maxHeight: 280, objectFit: 'cover' }} />
              ) : (
                <img src={current.mediaUrl} alt="" style={{ width: '100%', borderRadius: 16, marginBottom: 20, maxHeight: 280, objectFit: 'cover' }} />
              )
            )}

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
                    <button key={o} onClick={() => selectAndAdvance(current.id, o)}
                      style={{ flex: 1, padding: '16px', borderRadius: 14, border: `2.5px solid ${answers[current.id] === o ? themeColor : '#e5e5e5'}`, background: answers[current.id] === o ? `${themeColor}10` : '#fff', fontSize: 16, fontWeight: 600, color: answers[current.id] === o ? themeColor : '#374151', cursor: 'pointer', transition: 'all 0.15s' }}>
                      {o}
                    </button>
                  ))}
                </div>
              )}
              {current.type === 'rating' && (
                <div style={{ display: 'flex', gap: 10 }}>
                  {[1, 2, 3, 4, 5].map(n => (
                    <button key={n} onClick={() => selectAndAdvance(current.id, n)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
                      <svg width="40" height="40" viewBox="0 0 24 24" fill={(answers[current.id] || 0) >= n ? themeColor : 'none'} stroke={themeColor} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    </button>
                  ))}
                </div>
              )}
              {current.type === 'multiple_choice' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(current.options || []).map((opt: string, oi: number) => (
                    <button key={oi} onClick={() => selectAndAdvance(current.id, opt)}
                      style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 12, border: `2.5px solid ${answers[current.id] === opt ? themeColor : '#e5e5e5'}`, background: answers[current.id] === opt ? `${themeColor}10` : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                      <span style={{ width: 26, height: 26, borderRadius: 7, border: `2px solid ${answers[current.id] === opt ? themeColor : '#d1d5db'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 700, color: answers[current.id] === opt ? themeColor : '#9ca3af', flexShrink: 0 }}>
                        {String.fromCharCode(65 + oi)}
                      </span>
                      <span style={{ fontSize: 16, color: '#0d0d0d' }}>{opt}</span>
                    </button>
                  ))}
                </div>
              )}
              {current.type === 'dropdown' && (
                <select value={answers[current.id] || ''} onChange={e => selectAndAdvance(current.id, e.target.value)}
                  className="ff-input" style={{ ['--ff-color' as any]: themeColor, width: '100%', fontSize: 18, padding: '10px 0', border: 'none', borderBottom: '2.5px solid #e5e5e5', outline: 'none', background: 'transparent', cursor: 'pointer' }}>
                  <option value="">Select an option...</option>
                  {(current.options || []).map((opt: string, oi: number) => <option key={oi} value={opt}>{opt}</option>)}
                </select>
              )}
              {current.type === 'checkbox' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {(current.options || []).map((opt: string, oi: number) => {
                    const selectedArr: string[] = answers[current.id] || []
                    const isChecked = selectedArr.includes(opt)
                    return (
                      <button key={oi} onClick={() => {
                          const next = isChecked ? selectedArr.filter(o => o !== opt) : [...selectedArr, opt]
                          setAnswers(p => ({ ...p, [current.id]: next }))
                        }}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 12, border: `2.5px solid ${isChecked ? themeColor : '#e5e5e5'}`, background: isChecked ? `${themeColor}10` : '#fff', cursor: 'pointer', textAlign: 'left' }}>
                        <span style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${isChecked ? themeColor : '#d1d5db'}`, background: isChecked ? themeColor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          {isChecked && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                        </span>
                        <span style={{ fontSize: 16, color: '#0d0d0d' }}>{opt}</span>
                      </button>
                    )
                  })}
                  <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Select all that apply, then press OK</p>
                </div>
              )}
              {current.type === 'nps' && (
                <div>
                  <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 8 }}>
                    {[...Array(11)].map((_, n) => (
                      <button key={n} onClick={() => selectAndAdvance(current.id, n)}
                        style={{ width: 38, height: 38, borderRadius: 10, border: `2px solid ${answers[current.id] === n ? themeColor : '#e5e5e5'}`, background: answers[current.id] === n ? themeColor : '#fff', color: answers[current.id] === n ? '#fff' : '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                        {n}
                      </button>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#9ca3af' }}>
                    <span>Not likely</span><span>Very likely</span>
                  </div>
                </div>
              )}
              {current.type === 'opinion_scale' && (
                <div style={{ display: 'flex', gap: 8 }}>
                  {[1,2,3,4,5,6,7].map(n => (
                    <button key={n} onClick={() => selectAndAdvance(current.id, n)}
                      style={{ width: 42, height: 42, borderRadius: '50%', border: `2px solid ${answers[current.id] === n ? themeColor : '#e5e5e5'}`, background: answers[current.id] === n ? themeColor : '#fff', color: answers[current.id] === n ? '#fff' : '#374151', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
                      {n}
                    </button>
                  ))}
                </div>
              )}
              {['contact_info', 'phone', 'address', 'website'].includes(current.type) && (
                <input autoFocus value={answers[current.id] || ''} onChange={e => setAnswers(p => ({ ...p, [current.id]: e.target.value }))}
                  className="ff-input" style={{ ['--ff-color' as any]: themeColor, width: '100%', fontSize: 20, padding: '8px 0', border: 'none', borderBottom: '2.5px solid #e5e5e5', outline: 'none' }}
                  placeholder={current.type === 'phone' ? '+1 (555) 000-0000' : current.type === 'website' ? 'https://...' : current.type === 'address' ? 'Street, city, country' : 'Your name'} />
              )}
              {current.type === 'legal' && (
                <button onClick={() => selectAndAdvance(current.id, true)}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '13px 16px', borderRadius: 12, border: `2.5px solid ${answers[current.id] ? themeColor : '#e5e5e5'}`, background: answers[current.id] ? `${themeColor}10` : '#fff', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                  <span style={{ width: 22, height: 22, borderRadius: 6, border: `2px solid ${answers[current.id] ? themeColor : '#d1d5db'}`, background: answers[current.id] ? themeColor : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {answers[current.id] && <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>}
                  </span>
                  <span style={{ fontSize: 15, color: '#0d0d0d' }}>I agree</span>
                </button>
              )}
              {current.type === 'file_upload' && (
                <div>
                  {answers[current.id]?.url ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: `2px solid ${themeColor}`, background: `${themeColor}10` }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                      <span style={{ fontSize: 14, color: '#0d0d0d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{answers[current.id].name}</span>
                      <button onClick={() => setAnswers(p => ({ ...p, [current.id]: undefined }))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444' }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  ) : (
                    <label style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '32px', borderRadius: 14, border: `2px dashed ${themeColor}`, cursor: uploadingFile ? 'wait' : 'pointer', color: themeColor }}>
                      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                      <span style={{ fontSize: 14, fontWeight: 600 }}>{uploadingFile ? 'Uploading...' : 'Click to upload a file'}</span>
                      <input ref={fileInputRef} type="file" accept={current.fileAccept !== 'any' ? current.fileAccept : undefined} className="hidden" disabled={uploadingFile}
                        onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f, current.id) }} />
                    </label>
                  )}
                </div>
              )}
              {['video_audio', 'signature', 'payment', 'scheduler', 'ranking', 'matrix', 'picture_choice'].includes(current.type) && (
                <div style={{ padding: '20px', borderRadius: 12, border: '2px dashed #e5e5e5', textAlign: 'center', color: '#9ca3af', fontSize: 14 }}>
                  This question type isn't fillable yet — coming soon.
                </div>
              )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {!AUTO_ADVANCE_TYPES.includes(current.type) && (
                <button onClick={handleNext} disabled={submitting}
                  style={{ padding: '12px 28px', borderRadius: 12, background: themeColor, color: '#fff', fontWeight: 700, fontSize: 15, border: 'none', cursor: 'pointer', opacity: submitting ? 0.6 : 1 }}>
                  {submitting ? 'Submitting...' : step === questions.length - 1 ? 'Submit →' : 'OK →'}
                </button>
              )}
              {step > 0 && (
                <button onClick={() => setStep(step - 1)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#9ca3af', fontSize: 13, cursor: 'pointer', fontWeight: 500 }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                  Back
                </button>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}
