'use client'

import { useState, useEffect, useRef } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type Question = {
  id: string
  type: string
  title: string
  description: string
  required: boolean
  options?: string[]
  mediaUrl?: string
  mediaType?: 'image' | 'video'
  fileAccept?: string
  conditional_logic?: {
    condition: 'show' | 'hide'
    rules: Array<{
      questionId: string
      operator: 'equals' | 'contains' | 'is_empty'
      value: string
    }>
    logic: 'all' | 'any'
  }
}

const QUESTION_CATEGORIES = [
  {
    label: 'Contact info',
    types: [
      { type: 'contact_info', label: 'Contact Info', icon: 'user' },
      { type: 'email', label: 'Email', icon: 'mail' },
      { type: 'phone', label: 'Phone Number', icon: 'phone' },
      { type: 'address', label: 'Address', icon: 'map' },
      { type: 'website', label: 'Website', icon: 'link' },
    ],
  },
  {
    label: 'Choice',
    types: [
      { type: 'multiple_choice', label: 'Multiple Choice', icon: 'list' },
      { type: 'dropdown', label: 'Dropdown', icon: 'chevron' },
      { type: 'picture_choice', label: 'Picture Choice', icon: 'image' },
      { type: 'yes_no', label: 'Yes/No', icon: 'check' },
      { type: 'legal', label: 'Legal', icon: 'shield' },
      { type: 'checkbox', label: 'Checkbox', icon: 'square-check' },
    ],
  },
  {
    label: 'Rating & ranking',
    types: [
      { type: 'nps', label: 'Net Promoter Score®', icon: 'gauge' },
      { type: 'opinion_scale', label: 'Opinion Scale', icon: 'bar' },
      { type: 'rating', label: 'Rating', icon: 'star' },
      { type: 'ranking', label: 'Ranking', icon: 'sort' },
      { type: 'matrix', label: 'Matrix', icon: 'grid' },
    ],
  },
  {
    label: 'Text & video',
    types: [
      { type: 'long_text', label: 'Long Text', icon: 'paragraph' },
      { type: 'short_text', label: 'Short Text', icon: 'text' },
      { type: 'video_audio', label: 'Video and Audio', icon: 'video' },
    ],
  },
  {
    label: 'Other',
    types: [
      { type: 'number', label: 'Number', icon: 'hash' },
      { type: 'date', label: 'Date', icon: 'calendar' },
      { type: 'signature', label: 'Signature', icon: 'edit' },
      { type: 'payment', label: 'Payment', icon: 'card' },
      { type: 'file_upload', label: 'File Upload', icon: 'upload' },
      { type: 'scheduler', label: 'Scheduler', icon: 'clock' },
    ],
  },
] as const

const QUESTION_TYPES = QUESTION_CATEGORIES.flatMap(c => c.types)

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
    case 'user': return <svg {...p}><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    case 'phone': return <svg {...p}><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z"/></svg>
    case 'map': return <svg {...p}><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
    case 'link': return <svg {...p}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
    case 'chevron': return <svg {...p}><polyline points="6 9 12 15 18 9"/></svg>
    case 'image': return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
    case 'shield': return <svg {...p}><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
    case 'square-check': return <svg {...p}><rect x="3" y="3" width="18" height="18" rx="2"/><polyline points="9 12 11 14 15 10"/></svg>
    case 'gauge': return <svg {...p}><path d="M12 14 16 8"/><circle cx="12" cy="14" r="2"/><path d="M3.34 19a10 10 0 1 1 17.32 0"/></svg>
    case 'bar': return <svg {...p}><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
    case 'sort': return <svg {...p}><path d="M11 5h10"/><path d="M11 9h7"/><path d="M11 13h4"/><path d="m3 17 3 3 3-3"/><path d="M6 18V4"/></svg>
    case 'grid': return <svg {...p}><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
    case 'video': return <svg {...p}><polygon points="23 7 16 12 23 17 23 7"/><rect x="1" y="5" width="15" height="14" rx="2"/></svg>
    case 'edit': return <svg {...p}><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.12 2.12 0 0 1 3 3L12 15l-4 1 1-4Z"/></svg>
    case 'card': return <svg {...p}><rect x="1" y="4" width="22" height="16" rx="2"/><line x1="1" y1="10" x2="23" y2="10"/></svg>
    case 'upload': return <svg {...p}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
    case 'clock': return <svg {...p}><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
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
  const [endActions, setEndActions] = useState<{ type: string; label: string; url: string }[]>([])
  const [showConfetti, setShowConfetti] = useState(true)
  const [scheduledStart, setScheduledStart] = useState<string>('')
  const [scheduledEnd, setScheduledEnd] = useState<string>('')
  const [mediaUploading, setMediaUploading] = useState<string>('')
  const [questions, setQuestions] = useState<Question[]>([])
  const [selectedQ, setSelectedQ] = useState<string | null>(null)
  const [themeColor, setThemeColor] = useState('#ff7a6b')
  const [isPublished, setIsPublished] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [isDirty, setIsDirty] = useState(false)
  const [previewStep, setPreviewStep] = useState(-1) // -1 = welcome screen
  const [showAddMenu, setShowAddMenu] = useState(false)
  // Mobile responsiveness
  const [isMobile, setIsMobile] = useState(false)
  const [mobilePanel, setMobilePanel] = useState<'steps' | 'preview' | 'settings'>('preview')
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check()
    window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
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
      if (data.end_actions) setEndActions(data.end_actions)
      if (data.show_confetti !== undefined) setShowConfetti(data.show_confetti)
      setLoading(false)
    }
    init()
  }, [formId])

  // Track unsaved changes + auto-save
  useEffect(() => {
    if (isFirstLoad.current) { isFirstLoad.current = false; return }
    if (loading) return
    setIsDirty(true)
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
    autoSaveTimer.current = setTimeout(() => handleSave(), 1000)
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current) }
  }, [title, questions, themeColor, welcomeMessage, thankYouMessage, endActions, showConfetti])

  const handleSave = async () => {
    setSaving(true)
    await (supabase as any).from('forms').update({
      title, questions, theme: { color: themeColor },
      welcome_message: welcomeMessage, thank_you_message: thankYouMessage, end_actions: endActions,
      show_confetti: showConfetti,
      scheduled_start: scheduledStart || null,
      scheduled_end: scheduledEnd || null,
      updated_at: new Date().toISOString(),
    }).eq('id', formId)
    setSaving(false)
    setIsDirty(false)
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

  const uploadQuestionMedia = async (file: File, questionId: string) => {
    setMediaUploading(questionId)
    try {
      const ext = file.name.split('.').pop()
      const fileName = `forms/${formId}/${Date.now()}.${ext}`
      let uploadBucket = 'idea-images'
      const { data, error } = await supabase.storage.from(uploadBucket).upload(fileName, file, { upsert: true })
      if (error) throw error
      const { data: { publicUrl } } = supabase.storage.from(uploadBucket).getPublicUrl(data.path)
      const mediaType = file.type.startsWith('video') ? 'video' : 'image'
      updateQuestion(questionId, { mediaUrl: publicUrl, mediaType })
    } catch (e: any) {
      alert('Media upload failed: ' + e.message)
    }
    setMediaUploading('')
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
      <div style={{ display: 'flex', alignItems: 'center', gap: isMobile ? 8 : 12, padding: isMobile ? '8px 12px' : '10px 20px', borderBottom: '1px solid var(--border)', background: '#fff', flexShrink: 0, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
        <Link href="/admin/forms" style={{ color: 'var(--slate)', display: 'flex' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
        </Link>
        <input
          value={title}
          onChange={e => setTitle(e.target.value)}
          style={{ fontSize: isMobile ? 14 : 15, fontWeight: 700, color: 'var(--ink)', border: 'none', outline: 'none', background: 'transparent', minWidth: 0, flex: isMobile ? 1 : 'none', width: isMobile ? undefined : undefined }}
        />
        <span style={{ fontSize: 11, color: saving ? '#f59e0b' : isDirty ? '#6b6b70' : '#16a34a', display: 'flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          {saving ? 'Saving...' : isDirty ? (isMobile ? '●' : 'Unsaved changes') : (isMobile ? '✓' : '✓ Saved')}
        </span>
        <button onClick={handleSave} disabled={saving || !isDirty}
          style={{ padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: (saving || !isDirty) ? 'default' : 'pointer', border: 'none', background: isDirty ? 'var(--coral)' : '#f3f4f6', color: isDirty ? '#fff' : '#9ca3af', opacity: saving ? 0.7 : 1 }}>
          {saving ? 'Saving...' : 'Save'}
        </button>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: isMobile ? 6 : 10, flexWrap: isMobile ? 'wrap' : 'nowrap' }}>
          {!isMobile && (
            <span style={{ fontSize: 12, padding: '3px 10px', borderRadius: 999, background: isPublished ? '#dcfce7' : '#f3f4f6', color: isPublished ? '#16a34a' : '#6b7280', fontWeight: 600 }}>
              {isPublished ? 'Live' : 'Draft'}
            </span>
          )}
          <button onClick={togglePublish}
            style={{ padding: isMobile ? '6px 12px' : '8px 16px', borderRadius: 10, fontSize: isMobile ? 12 : 13, fontWeight: 700, cursor: 'pointer', border: 'none', background: isPublished ? '#f3f4f6' : 'var(--coral)', color: isPublished ? '#374151' : '#fff' }}>
            {isPublished ? 'Unpublish' : 'Publish'}
          </button>
          {isPublished && (
            <Link href={`/forms/${formId}`} target="_blank"
              style={{ padding: isMobile ? '6px 12px' : '8px 16px', borderRadius: 10, fontSize: isMobile ? 12 : 13, fontWeight: 600, border: '1px solid var(--border)', color: 'var(--ink)', textDecoration: 'none' }}>
              View →
            </Link>
          )}
          <Link href={`/admin/forms/${formId}/results`}
            style={{ padding: isMobile ? '6px 12px' : '8px 16px', borderRadius: 10, fontSize: isMobile ? 12 : 13, fontWeight: 600, border: '1px solid var(--border)', color: 'var(--ink)', textDecoration: 'none' }}>
            Results
          </Link>
        </div>
      </div>

      {/* Mobile panel switcher */}
      {isMobile && (
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', background: '#fff', flexShrink: 0 }}>
          {([['steps', '☰ Steps'], ['preview', '👁 Preview'], ['settings', '⚙ Settings']] as const).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setMobilePanel(key)}
              style={{
                flex: 1,
                padding: '10px 8px',
                fontSize: 12,
                fontWeight: 700,
                border: 'none',
                cursor: 'pointer',
                background: 'transparent',
                color: mobilePanel === key ? themeColor : 'var(--slate)',
                borderBottom: mobilePanel === key ? `2px solid ${themeColor}` : '2px solid transparent',
              }}>
              {label}
            </button>
          ))}
        </div>
      )}

      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '280px 1fr 320px', overflow: 'hidden' }}>
        {/* LEFT: Question list */}
        <div style={{ borderRight: isMobile ? 'none' : '1px solid var(--border)', overflowY: 'auto', padding: 16, background: '#fafafa', display: isMobile && mobilePanel !== 'steps' ? 'none' : 'block' }}>
          <button
            onClick={() => { setPreviewStep(-1); if (isMobile) setMobilePanel('preview') }}
            style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, marginBottom: 6, cursor: 'pointer', border: 'none', background: previewStep === -1 ? '#fff' : 'transparent', boxShadow: previewStep === -1 ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)' }}>👋 Welcome screen</span>
          </button>

          {questions.map((q, i) => (
            <div key={q.id}
              draggable
              onDragStart={(e) => e.dataTransfer.setData('text/plain', String(i))}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { const from = parseInt(e.dataTransfer.getData('text/plain')); reorder(from, i) }}
              onClick={() => { setSelectedQ(q.id); setPreviewStep(i); if (isMobile) setMobilePanel('preview') }}
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
            onClick={() => { setPreviewStep(questions.length); if (isMobile) setMobilePanel('preview') }}
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
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6, background: '#fff', borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,0.18)', border: '1px solid var(--border)', overflow: 'hidden', zIndex: 10, maxHeight: 420, display: 'flex', flexDirection: 'column' }}>
                <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 8 }}>
                  <button style={{ fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 999, background: themeColor, color: '#fff', border: 'none', cursor: 'pointer' }}>Add elements</button>
                  <button style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'transparent', color: 'var(--slate)', border: '1px solid var(--border)', cursor: 'pointer' }}>Import questions</button>
                  <button style={{ fontSize: 11, fontWeight: 600, padding: '4px 10px', borderRadius: 999, background: 'transparent', color: 'var(--slate)', border: '1px solid var(--border)', cursor: 'pointer' }}>Create with AI</button>
                </div>
                <div style={{ overflowY: 'auto', padding: '8px 0' }}>
                  {QUESTION_CATEGORIES.map(cat => (
                    <div key={cat.label} style={{ marginBottom: 4 }}>
                      <p style={{ fontSize: 10, fontWeight: 700, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '6px 14px 4px' }}>{cat.label}</p>
                      {cat.types.map(t => (
                        <button key={t.type} onClick={() => addQuestion(t.type as Question['type'])}
                          style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 14px', border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                          onMouseEnter={e => (e.currentTarget.style.background = '#fafafa')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                          <span style={{ color: themeColor, flexShrink: 0 }}><TypeIcon type={t.icon} size={15} /></span>
                          <span style={{ fontSize: 13, color: 'var(--ink)' }}>{t.label}</span>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* CENTER: Live preview */}
        <div style={{ overflowY: 'auto', background: '#f4f4f5', display: isMobile && mobilePanel !== 'preview' ? 'none' : 'flex', alignItems: isMobile ? 'flex-start' : 'center', justifyContent: 'center', padding: isMobile ? 12 : 32 }}>
          <div style={{ width: '100%', maxWidth: 560, background: '#fff', borderRadius: isMobile ? 14 : 20, boxShadow: '0 8px 32px rgba(0,0,0,0.08)', padding: isMobile ? 20 : 48, minHeight: isMobile ? 280 : 360, display: 'flex', flexDirection: 'column', justifyContent: 'center', marginTop: isMobile ? 8 : 0 }}>
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
                  style={{ fontSize: 18, fontWeight: 700, color: '#0d0d0d', textAlign: 'center', border: 'none', outline: 'none', resize: 'none', width: '100%', background: 'transparent', marginBottom: 20 }} rows={2} />
                {endActions.length > 0 && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 280, margin: '0 auto' }}>
                    {endActions.map((a, i) => (
                      <div key={i} style={{ padding: '10px 16px', borderRadius: 10, background: i === 0 ? themeColor : '#fff', color: i === 0 ? '#fff' : themeColor, border: i === 0 ? 'none' : `1.5px solid ${themeColor}`, fontSize: 13, fontWeight: 600 }}>
                        {a.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : questions[previewStep] ? (
              <div>
                <p style={{ fontSize: 12, fontWeight: 700, color: themeColor, marginBottom: 8 }}>QUESTION {previewStep + 1} OF {questions.length}</p>
                {questions[previewStep].mediaUrl && (
                  questions[previewStep].mediaType === 'video' ? (
                    <video src={questions[previewStep].mediaUrl} controls style={{ width: '100%', borderRadius: 14, marginBottom: 16, maxHeight: 220, objectFit: 'cover' }} />
                  ) : (
                    <img src={questions[previewStep].mediaUrl} alt="" style={{ width: '100%', borderRadius: 14, marginBottom: 16, maxHeight: 220, objectFit: 'cover' }} />
                  )
                )}
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
                {['multiple_choice', 'dropdown', 'checkbox', 'picture_choice'].includes(questions[previewStep].type) && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(questions[previewStep].options || []).map((opt, oi) => (
                      <div key={oi} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: '2px solid #e5e5e5' }}>
                        <span style={{ width: 22, height: 22, borderRadius: questions[previewStep].type === 'checkbox' ? 6 : 6, border: '2px solid #d1d5db', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#9ca3af', flexShrink: 0 }}>
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
                {questions[previewStep].type === 'nps' && (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {[...Array(11)].map((_, n) => (
                      <div key={n} style={{ width: 32, height: 32, borderRadius: 8, border: '2px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>{n}</div>
                    ))}
                  </div>
                )}
                {questions[previewStep].type === 'opinion_scale' && (
                  <div style={{ display: 'flex', gap: 6 }}>
                    {[1,2,3,4,5,6,7].map(n => (
                      <div key={n} style={{ width: 34, height: 34, borderRadius: '50%', border: '2px solid #e5e5e5', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>{n}</div>
                    ))}
                  </div>
                )}
                {['contact_info', 'phone', 'address', 'website', 'video_audio', 'signature', 'payment', 'file_upload', 'scheduler', 'legal', 'ranking', 'matrix'].includes(questions[previewStep].type) && (
                  <div style={{ borderBottom: '2px solid #e5e5e5', paddingBottom: 8, fontSize: 14, color: '#9ca3af' }}>
                    {QUESTION_TYPES.find(t => t.type === questions[previewStep].type)?.label} input preview
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
        <div style={{ borderLeft: isMobile ? 'none' : '1px solid var(--border)', overflowY: 'auto', padding: isMobile ? 16 : 20, display: isMobile && mobilePanel !== 'settings' ? 'none' : 'block' }}>
          {selected ? (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 16 }}>Question Settings</h3>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 6 }}>Type</label>
                <select value={selected.type} onChange={e => updateQuestion(selected.id, { type: e.target.value as Question['type'], options: e.target.value === 'multiple_choice' ? (selected.options || ['Option 1', 'Option 2']) : undefined })}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' }}>
                  {QUESTION_CATEGORIES.map(cat => (
                    <optgroup key={cat.label} label={cat.label}>
                      {cat.types.map(t => <option key={t.type} value={t.type}>{t.label}</option>)}
                    </optgroup>
                  ))}
                </select>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <label style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600 }}>Required</label>
                <button onClick={() => updateQuestion(selected.id, { required: !selected.required })}
                  style={{ width: 38, height: 21, borderRadius: 999, background: selected.required ? themeColor : '#d1d5db', border: 'none', cursor: 'pointer', position: 'relative' }}>
                  <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: selected.required ? 20 : 3, transition: 'left 0.15s' }} />
                </button>
              </div>

              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 8 }}>Image or video</label>
                {selected.mediaUrl ? (
                  <div style={{ position: 'relative' }}>
                    {selected.mediaType === 'video' ? (
                      <video src={selected.mediaUrl} controls style={{ width: '100%', borderRadius: 10, maxHeight: 140, objectFit: 'cover' }} />
                    ) : (
                      <img src={selected.mediaUrl} alt="" style={{ width: '100%', borderRadius: 10, maxHeight: 140, objectFit: 'cover' }} />
                    )}
                    <button onClick={() => updateQuestion(selected.id, { mediaUrl: '', mediaType: undefined })}
                      style={{ position: 'absolute', top: 6, right: 6, width: 24, height: 24, borderRadius: '50%', background: 'rgba(0,0,0,0.6)', color: '#fff', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                ) : (
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '14px', borderRadius: 10, border: `1.5px dashed ${themeColor}`, color: themeColor, fontSize: 12, fontWeight: 600, cursor: mediaUploading === selected.id ? 'wait' : 'pointer' }}>
                    {mediaUploading === selected.id ? 'Uploading...' : (
                      <>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                        Add image or video
                      </>
                    )}
                    <input type="file" accept="image/*,video/*" className="hidden" disabled={mediaUploading === selected.id}
                      onChange={e => { const f = e.target.files?.[0]; if (f) uploadQuestionMedia(f, selected.id) }} />
                  </label>
                )}
              </div>

              {selected.type === 'file_upload' && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 6 }}>Accepted file types</label>
                  <select value={selected.fileAccept || 'any'} onChange={e => updateQuestion(selected.id, { fileAccept: e.target.value })}
                    style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer' }}>
                    <option value="any">Any file</option>
                    <option value="image/*">Images only</option>
                    <option value=".pdf,.doc,.docx">Documents (PDF, Word)</option>
                    <option value="video/*">Videos only</option>
                  </select>
                </div>
              )}

              {/* Conditional Logic */}
              <div style={{ marginBottom: 16, paddingTop: 16, borderTop: '1px solid var(--border)' }}>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--slate)', display: 'block', marginBottom: 6 }}>Conditional Logic</label>
                <p style={{ fontSize: 11, color: 'var(--slate)', marginBottom: 10 }}>Show or hide this question based on previous answers</p>
                {selected.conditional_logic ? (
                  <div style={{ padding: 10, background: 'var(--canvas)', borderRadius: 8, marginBottom: 10 }}>
                    <div style={{ fontSize: 11, marginBottom: 6 }}>
                      <select value={selected.conditional_logic.condition} onChange={e => updateQuestion(selected.id, { conditional_logic: { ...selected.conditional_logic, condition: e.target.value as 'show' | 'hide' } })}
                        style={{ width: '100%', padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', fontSize: 12, marginBottom: 8, cursor: 'pointer' }}>
                        <option value="show">Show this question if</option>
                        <option value="hide">Hide this question if</option>
                      </select>
                    </div>
                    <button onClick={() => updateQuestion(selected.id, { conditional_logic: undefined })}
                      style={{ width: '100%', padding: '6px 12px', borderRadius: 6, background: 'white', border: '1px solid var(--border)', fontSize: 11, color: 'var(--slate)', cursor: 'pointer', fontWeight: 500 }}>
                      Remove condition
                    </button>
                  </div>
                ) : (
                  <button onClick={() => updateQuestion(selected.id, { conditional_logic: { condition: 'show', rules: [], logic: 'all' } })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'var(--canvas)', border: '1px dashed var(--border)', fontSize: 12, color: 'var(--ink)', cursor: 'pointer', fontWeight: 500 }}>
                    + Add condition
                  </button>
                )}
              </div>
            </>
          ) : previewStep === questions.length ? (
            <>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 4 }}>After Submit</h3>
              <p style={{ fontSize: 12, color: 'var(--slate)', marginBottom: 16 }}>Show buttons to guide people after they finish.</p>
              {endActions.map((a, i) => (
                <div key={i} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <select value={a.type} onChange={e => {
                        const next = [...endActions]
                        next[i] = { ...next[i], type: e.target.value }
                        setEndActions(next)
                      }}
                      style={{ fontSize: 12, padding: '4px 6px', borderRadius: 6, border: '1px solid var(--border)', cursor: 'pointer' }}>
                      <option value="website">Visit website</option>
                      <option value="video">Watch video</option>
                      <option value="social">Social media</option>
                      <option value="custom">Custom link</option>
                    </select>
                    <button onClick={() => setEndActions(endActions.filter((_, idx) => idx !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <input value={a.label} onChange={e => {
                      const next = [...endActions]
                      next[i] = { ...next[i], label: e.target.value }
                      setEndActions(next)
                    }}
                    placeholder="Button label (e.g. Visit our site)"
                    style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', marginBottom: 6, boxSizing: 'border-box' }} />
                  <input value={a.url} onChange={e => {
                      const next = [...endActions]
                      next[i] = { ...next[i], url: e.target.value }
                      setEndActions(next)
                    }}
                    placeholder="https://..."
                    style={{ width: '100%', fontSize: 12, padding: '6px 8px', borderRadius: 6, border: '1px solid var(--border)', boxSizing: 'border-box' }} />
                </div>
              ))}
              <button onClick={() => setEndActions([...endActions, { type: 'website', label: 'Visit our website', url: '' }])}
                style={{ width: '100%', padding: '9px', borderRadius: 10, border: `1.5px dashed ${themeColor}`, background: 'transparent', color: themeColor, fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                + Add button
              </button>
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
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                <div>
                  <label style={{ fontSize: 13, color: 'var(--ink)', fontWeight: 600, display: 'block' }}>🎉 Confetti on submit</label>
                  <span style={{ fontSize: 11, color: 'var(--slate)' }}>Celebrate when someone finishes the form</span>
                </div>
                <button onClick={() => setShowConfetti(!showConfetti)}
                  style={{ width: 38, height: 21, borderRadius: 999, background: showConfetti ? themeColor : '#d1d5db', border: 'none', cursor: 'pointer', position: 'relative', flexShrink: 0, marginLeft: 12 }}>
                  <span style={{ width: 15, height: 15, borderRadius: '50%', background: '#fff', position: 'absolute', top: 3, left: showConfetti ? 20 : 3, transition: 'left 0.15s' }} />
                </button>
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
