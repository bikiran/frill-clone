'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type Question = {
  id: string
  type: 'short_text' | 'long_text' | 'multiple_choice' | 'rating' | 'yes_no' | 'email' | 'number' | 'date'
  title: string
  description: string
  required: boolean
  options?: string[]
}

const QUESTION_TYPES = [
  { type: 'short_text', label: 'Short Text', icon: 'text' },
  { type: 'long_text', label: 'Long Text', icon: 'paragraph' },
  { type: 'multiple_choice', label: 'Multiple Choice', icon: 'list' },
  { type: 'rating', label: 'Rating', icon: 'star' },
  { type: 'yes_no', label: 'Yes / No', icon: 'check' },
  { type: 'email', label: 'Email', icon: 'mail' },
  { type: 'number', label: 'Number', icon: 'hash' },
  { type: 'date', label: 'Date', icon: 'calendar' },
] as const

function TypeIcon({ type, size = 16 }: { type: string; size?: number }) {
  const p = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }
  switch (type) {
    case 'text': return <svg {...p}><path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/></svg>
    case 'paragraph': return <svg {...p}><line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
    case 'list': return <svg {...p}><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/></svg>
    case 'star': return <svg {...p}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
    case 'check': return <svg {...p}><polyline points="20 6 9 17 4 12"/></svg>
    case 'mail': return <svg {...p}><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-10 5L2 7"/></svg>
    case 'hash': return <svg {...p}><line x1="4" y1="9" x2="20" y2="9"/><line x1="4" y1="15" x2="20" y2="15"/><line x1="10" y1="3" x2="8" y2="21"/><line x1="16" y1="3" x2="14" y2="21"/></svg>
    case 'calendar': return <svg {...p}><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
    default: return <svg {...p}><circle cx="12" cy="12" r="10"/></svg>
  }
}

const THEME_COLORS = ['#ff7a6b', '#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0891b2', '#8b5cf6', '#262627']

export default function FormBuilder() {
  const params = useParams()
  const router = useRouter()
  const formId = params.id as string

  const [form, setForm] = useState<any>(null)
  const [title, setTitle] = useState('Untitled Form')
  const [welcomeMessage, setWelcomeMessage] = useState('Welcome! This will only take a minute.')
  const [thankYouMessage, setThankYouMessage] = useState('Thanks for completing this form!')
  const [questions, setQuestions] = useState<Question[]>([])
  const [selectedQ, setSelectedQ] = useState<string | null>(null)
  const [themeColor, setThemeColor] = useState('#ff7a6b')
  const [isPublished, setIsPublished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [previewStep, setPreviewStep] = useState(-1) // -1 = welcome screen
  const [showAddMenu, setShowAddMenu] = useState(false)
  const autoSaveTimer = useRef<NodeJS.Timeout | null>(null)
  const isFirstLoad = useRef(true)

  useEffect(() => {
    const init = async () => {
      const { data, error } = await (supabase as any).from('forms').select('*').eq('id', formId).single()
      if (error || !data) { router.push('/admin/forms'); return }
      setForm(data)
      setTitle(data.title || 'Untitled Form')
      setQuestions(data.questions || [])
      setIsPublished(data.is_published || false)
      if (data.theme?.color) setThemeColor(data.theme.color)
      if (data.welcome_message) setWelcomeMessage(data.welcome_message)
      if (data.thank_you_message) setThankYouMessage(data.thank_you_message)
      setLoading(false)
    }
    init()
  }, [formId])

  // Auto-save
  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return }
    if (loading) return
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => handleSave(), 1000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [title, questions, themeColor, welcomeMessage, thankYouMessage])

  const handleSave = async () => {
    setSaving(true)
    await (supabase as any).from('forms').update({
      title, questions, theme: { color: themeColor },
      welcome_message: welcomeMessage, thank_you_message: thankYouMessage,
      updated_at: new Date().toISOString(),
    }).eq('id', formId)
    setSaving(false)
  }

  const togglePublish = async () => {
    const next = !isPublished
    setIsPublished(next)
    await (supabase as any).from('forms').update({ is_published: next }).eq('id', formId)
  }

  const addQuestion = (type: Question['type']) => {
    const newQ: Question = {
      id: crypto.randomUUID(),
      type,
      title: 'New question',
      description: '',
      required: false,
      options: type === 'multiple_choice' ? ['Option 1', 'Option 2'] : undefined,
    }
    setQuestions(prev => [...prev, newQ])
    setSelectedQ(newQ.id)
    setShowAddMenu(false)
  }

  const updateQuestion = (id: string, patch: Partial<Question>) => {
    setQuestions(prev => prev.map(q => q.id === id ? { ...q, ...patch } : q))
  }

  const deleteQuestion = (id: string) => {
    setQuestions(prev => prev.filter(q => q.id !== id))
    if (selectedQ === id) setSelectedQ(null)
  }

  const reorder = (fromIdx: number, toIdx: number) => {
    const next = [...questions]
    const [moved] = next.splice(fromIdx, 1)
    next.splice(toIdx, 0, moved)
    setQuestions(next)
  }

  if (loading) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  const selected = questions.find(q => q.id === selectedQ)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 56px)' }}>
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 20px', borderBottom: '1px solid var(--border)', background: '#fff', flexShrink: 0 }}>
        <Link href="/admin/forms" style={{ color: 'var(--slate)', display: 'flex' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </Link>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', border: 'none', outline: 'none', background: 'transparent', minWidth: 120 }}
        />
        <span style={{ fontSize: 11, color: saving ? '#f59e0b' : '#16a34a', display: 'flex', alignItems: 'center', gap: 4 }}>
          {saving ? 'Saving...' : '✓ Saved'}
        </span>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, background: isPublished ? '#dcfce7' : '#f3f4f6', color: isPublished ? '#16a34a' : '#6b7280', fontWeight: 600 }}>
            {isPublished ? 'Live' : 'Draft'}
          </span>
          <button onClick={togglePublish}
            style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: isPublished ? '#f3f4f6' : 'var(--coral)', color: isPublished ? '#374151' : '#fff' }}>
            {isPublished ? 'Unpublish' : 'Publish'}
          </button>
          {isPublished && (
            <Link href={`/forms/${formId}`} target="_blank"
              style={{ padding: '8px 16px', borderRadius: 10, fontSize: 13, fontWeight: 600, border: '1px solid var(--border)', color: 'var(--ink)', textDecoration: 'none' }}>
              View →
            </Link>
          )}
        </div>
      </div>

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '280px 1fr 320px', overflow: 'hidden' }}>
        {/* LEFT: Question list */}
        <div style={{ borderRight: '1px solid var(--border)', overflowY: 'auto', padding: 16, background: '#fafafa' }}>
          <button
            onClick={() => setPreviewStep(-1)}
            style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, marginBottom: 6, cursor: 'pointer', border: 'none', background: previewStep === -1 ? '#fff' : 'transparent', boxShadow: previewStep === -1 ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>👋 Welcome screen</span>
          </button>

          {questions.map((q, i) => (
            <div key={q.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { const from = parseInt(e.dataTransfer.getData('text/plain')); reorder(from, i) }}
              onClick={() => { setSelectedQ(q.id); setPreviewStep(i) }}
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderRadius: 10, marginBottom: 6, cursor: 'grab',
                background: selectedQ === q.id ? '#fff' : 'transparent',
                boxShadow: selectedQ === q.id ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                border: selectedQ === q.id ? `1.5px solid ${themeColor}` : '1.5px solid transparent',
              }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--slate)', width: 16, flexShrink: 0 }}>{i + 1}</span>
              <span style={{ color: themeColor, flexShrink: 0 }}><TypeIcon type={QUESTION_TYPES.find(t => t.type === q.type)?.icon || 'text'} size={14} /></span>
              <span style={{ fontSize: 13, color: 'var(--ink)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{q.title || 'Untitled'}</span>
              <button onClick={e => { e.stopPropagation(); deleteQuestion(q.id) }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.6, flexShrink: 0 }}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </button>
            </div>
          ))}

          <button
            onClick={() => setPreviewStep(questions.length)}
            style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, marginBottom: 12, cursor: 'pointer', border: 'none', background: previewStep === questions.length ? '#fff' : 'transparent', boxShadow: previewStep === questions.length ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>🎉 Thank you screen</span>
          </button>

          <div style={{ position: 'relative' }}>
            <button onClick={() => setShowAddMenu(!showAddMenu)}
              style={{ width: '100%', padding: '10px', borderRadius: 10, border: `1.5px dashed ${themeColor}`, background: 'transparent', color: themeColor, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add question
            </button>
            {showAddMenu && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: '#fff', borderRadius: 12, boxShadow: '0 8px 24px rgba(0,0,0,0.15)', border: '1px solid var(--border)', overflow: 'hidden', zIndex: 10 }}>
                {QUESTION_TYPES.map(t => (
                  <button key={t.type} onClick={() => addQuestion(t.type as Question['type'])}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <span style={{ color: themeColor }}><TypeIcon type={t.icon} /></span>
                    <span style={{ fontSize: 13, color: 'var(--ink)' }}>{t.label}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* CENTER: Live preview */}
        <div style={{ overflowY: 'auto', background: '#f4f4f5', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
          <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: 20, boxShadow: '0 8px 32px rgba(0,0,0,0.08)', padding: 48, minHeight: 360, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            {previewStep === -1 ? (
              <div>
                <div style={{ width: 48, height: 48, borderRadius: 14, background: themeColor, marginBottom: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2" strokeLinecap="round"><polyline points="9 18 15 12 9 6"/></svg>
                </div>
                <h1 style={{ fontSize: 28, fontWeight: 800, color: '#0d0d0d', marginBottom: 12, lineHeight: 1.2 }}>{title}</h1>
                <textarea value={welcomeMessage} onChange={e => setWelcomeMessage(e.target.value)}
                  style={{ fontSize: 15, color: '#6b6b70', lineHeight: 1.6, marginBottom: 28, border: 'none', outline: 'none', resize: 'none', width: '100%', background: 'transparent' }} rows={2} />
                <button style={{ padding: '12px 28px', borderRadius: 12, background: themeColor, color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer', width: 'fit-content' }}>
                  Start →
                </button>
              </div>
            ) : previewStep === questions.length ? (
              <div style={{ textAlign: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <textarea value={thankYouMessage} onChange={e => setThankYouMessage(e.target.value)}
                  style={{ fontSize: 18, fontWeight: 700, color: '#0d0d0d', textAlign: 'center', border: 'none', outline: 'none', resize: 'none', width: '100%', background: 'transparent' }} rows={2} />
              </div>
            ) : questions[previewStep] ? (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: themeColor, marginBottom: 8 }}>QUESTION {previewStep + 1} OF {questions.length}</p>
                <input value={questions[previewStep].title} onChange={e => updateQuestion(questions[previewStep].id, { title: e.target.value })}
                  placeholder="Type your question..."
                  style={{ fontSize: 24, fontWeight: 800, color: '#0d0d0d', border: 'none', outline: 'none', width: '100%', marginBottom: 8, background: 'transparent' }} />
                <input value={questions[previewStep].description} onChange={e => updateQuestion(questions[previewStep].id, { description: e.target.value })}
                  placeholder="Add a description (optional)"
                  style={{ fontSize: 14, color: '#6b6b70', border: 'none', outline: 'none', width: '100%', marginBottom: 24, background: 'transparent' }} />

                {/* Render input type preview */}
                {questions[previewStep].type === 'short_text' && (
                  <div style={{ borderBottom: '2px solid #e5e5e5', paddingBottom: 8, fontSize: 16, color: '#9ca3af' }}>Type your answer here...</div>
                )}
                {questions[previewStep].type === 'long_text' && (
                  <div style={{ borderBottom: '2px solid #e5e5e5', paddingBottom: 8, fontSize: 16, color: '#9ca3af', minHeight: 60 }}>Type your answer here...</div>
                )}
                {questions[previewStep].type === 'email' && (
                  <div style={{ borderBottom: '2px solid #e5e5e5', paddingBottom: 8, fontSize: 16, color: '#9ca3af' }}>name@example.com</div>
                )}
                {questions[previewStep].type === 'number' && (
                  <div style={{ borderBottom: '2px solid #e5e5e5', paddingBottom: 8, fontSize: 16, color: '#9ca3af' }}>0</div>
                )}
                {questions[previewStep].type === 'date' && (
                  <div style={{ borderBottom: '2px solid #e5e5e5', paddingBottom: 8, fontSize: 16, color: '#9ca3af' }}>DD / MM / YYYY</div>
                )}
                {questions[previewStep].type === 'yes_no' && (
                  <div style={{ display: 'flex', gap: 10 }}>
                    {['Yes', 'No'].map(o => (
                      <div key={o} style={{ flex: 1, padding: '12px', borderRadius: 10, border: '2px solid #e5e5e5', textAlign: 'center', fontSize: 14, color: '#374151' }}>{o}</div>
                    ))}
                  </div>
                )}
                {questions[previewStep].type === 'rating' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1, 2, 3, 4, 5].map(n => (
                      <svg key={n} width="32" height="32" viewBox="0 0 24 24" fill="none" stroke={themeColor} strokeWidth="1.5"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    ))}
                  </div>
                )}
                {questions[previewStep].type === 'multiple_choice' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(questions[previewStep].options || []).map((opt, oi) => (
                      <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: '2px solid #e5e5e5' }}>
                        <span style={{ width: 22, height: 22, borderRadius: 6, border: '2px solid #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#9ca3af', flexShrink: 0 }}>
                          {String.fromCharCode(65 + oi)}
                        </span>
                        <input value={opt} onChange={e => {
                          const opts = [...(questions[previewStep].options || [])]
                          opts[oi] = e.target.value
                          updateQuestion(questions[previewStep].id, { options: opts })
                        }} style={{ flex: 1, border: 'none', outline: 'none', fontSize: 14, background: 'transparent' }} />
                        <button onClick={() => {
                          const opts = (questions[previewStep].options || []).filter((_, idx) => idx !== oi)
                          updateQuestion(questions[previewStep].id, { options: opts })
                        }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#ef4444', opacity: 0.5 }}>×</button>
                      </div>
                    ))}
                    <button onClick={() => {
                      const opts = [...(questions[previewStep].options || []), `Option ${(questions[previewStep].options || []).length + 1}`]
                      updateQuestion(questions[previewStep].id, { options: opts })
                    }} style={{ fontSize: 13, color: themeColor, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', fontWeight: 600 }}>+ Add option</button>
                  </div>
                )}

                <button style={{ marginTop: 28, padding: '11px 24px', borderRadius: 12, background: themeColor, color: '#fff', fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}>
                  OK →
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* RIGHT: Settings panel */}
        <div style={{ borderLeft: '1px solid var(--border)', overflowY: 'auto', padding: 20 }}>
          {selected ? (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Question Settings</h3>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 6 }}>Type</label>
                <select value={selected.type} onChange={e => updateQuestion(selected.id, { type: e.target.value as Question['type'], options: e.target.value === 'multiple_choice' ? (selected.options || ['Option 1', 'Option 2']) : undefined })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' }}>
                  {QUESTION_TYPES.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>Required</label>
                <button onClick={() => updateQuestion(selected.id, { required: !selected.required })}
                  style={{ width: 38, height: 21, borderRadius: 999, background: selected.required ? themeColor : '#d1d5db', border: 'none', cursor: 'pointer', position: 'relative' }}>
                  <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: selected.required ? 20 : 3, transition: 'left 0.15s' }} />
                </button>
              </div>
            </>
          ) : (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Form Design</h3>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 8 }}>Theme color</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  {THEME_COLORS.map(c => (
                    <button key={c} onClick={() => setThemeColor(c)}
                      style={{ width: 28, height: 28, borderRadius: 8, background: c, border: themeColor === c ? '2.5px solid #0d0d0d' : '2.5px solid transparent', cursor: 'pointer' }} />
                  ))}
                </div>
              </div>
              <div style={{ padding: 14, borderRadius: 12, background: '#fafafa', fontSize: 12, color: 'var(--slate)', lineHeight: 1.6 }}>
                Select a question on the left to edit its settings, or click "Welcome screen" / "Thank you screen" to edit those messages.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
