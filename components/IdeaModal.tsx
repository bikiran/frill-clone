'use client'

import { useState, useEffect, useRef } from 'react'
import ImageViewer from './ImageViewer'
import { supabase } from '@/lib/supabase'
import { useToast } from '@/components/ToastProvider'
import { SurveyQuestionBuilder, type SurveyQuestion } from '@/components/SurveyQuestionBuilder'
import { FormFieldBuilder, type FormField } from '@/components/FormFieldBuilder'

const TOPICS = [
  { id: 'welcome', label: 'Welcome', emoji: '👋' },
  { id: 'improvement', label: 'Improvement', emoji: '⬆️' },
  { id: 'integrations', label: 'Integrations', emoji: '🔗' },
  { id: 'styling', label: 'Styling', emoji: '🎨' },
  { id: 'misc', label: 'Misc', emoji: '✨' },
  { id: 'bug', label: 'Bug Report', emoji: '🐛' },
]

export default function IdeaModal({ onClose, onSubmitted }: {
  onClose: () => void
  onSubmitted: () => void
}) {
  const { addToast } = useToast()
  const [companyId, setCompanyId] = useState<string | null>(null)
  
  const [title, setTitle]               = useState('')
  const [description, setDescription]   = useState('')
  const [name, setName]                 = useState('')
  const [selectedTopics, setTopics]     = useState<string[]>([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [authed, setAuthed]             = useState<boolean | null>(null)
  const [imageFile, setImageFile]       = useState<File | null>(null)
  const [showImagePreviewViewer, setShowImagePreviewViewer] = useState(false)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [submitted, setSubmitted]       = useState(false)
  const [attachedPoll, setAttachedPoll] = useState<string | null>(null)
  const [attachedSurvey, setAttachedSurvey] = useState<string | null>(null)
  const [availablePolls, setAvailablePolls] = useState<any[]>([])
  const [availableSurveys, setAvailableSurveys] = useState<any[]>([])
  const [showPollPicker, setShowPollPicker] = useState(false)
  const [showSurveyPicker, setShowSurveyPicker] = useState(false)
  const [isPrivate, setIsPrivate]       = useState(false)
  const [showNameDropdown, setShowNameDropdown] = useState(false)
  const [currentUser, setCurrentUser]   = useState<any>(null)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)
  const [creatingPoll, setCreatingPoll] = useState(false)
  const [creatingSurvey, setCreatingSurvey] = useState(false)
  const [newPollQuestion, setNewPollQuestion] = useState('')
  const [newPollOptions, setNewPollOptions] = useState(['', ''])
  const [newPollDescription, setNewPollDescription] = useState('')
  const [newPollType, setNewPollType] = useState<'single_choice' | 'multiple_choice' | 'rating' | 'ranking'>('single_choice')
  const [newSurveyTitle, setNewSurveyTitle] = useState('')
  const [surveyQuestions, setSurveyQuestions] = useState<any[]>([])
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(null)
  const [showAddUserModal, setShowAddUserModal] = useState(false)
  const [newUserName, setNewUserName] = useState('')
  const [newUserEmail, setNewUserEmail] = useState('')
  const [newUserPermission, setNewUserPermission] = useState(false)
  const [attachedForm, setAttachedForm] = useState<string | null>(null)
  const [availableForms, setAvailableForms] = useState<any[]>([])
  const [showFormPicker, setShowFormPicker] = useState(false)
  const [creatingForm, setCreatingForm] = useState(false)
  const [newFormTitle, setNewFormTitle] = useState('')
  const [formFields, setFormFields] = useState<any[]>([])
  const [activeFieldId, setActiveFieldId] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [aiError, setAiError] = useState('')
  
  const titleRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 100)

    // Resolve the current board's company_id, then fetch ONLY that company's polls/surveys.
    // Fetching unscoped here leaked every company's polls, surveys and forms into the idea panel.
    const resolveCompanyAndFetch = async () => {
      let cid: string | null = null
      if (typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com' && h !== 'www.colvy.com' && !h.includes('localhost')) {
          const slug = h.replace('.colvy.com', '')
          const { data } = await (supabase as any).from('companies').select('id').eq('slug', slug).maybeSingle()
          if (data?.id) cid = data.id
        }
      }
      // Main domain / localhost: fall back to the signed-in user's own company
      if (!cid) {
        const { data: sess } = await supabase.auth.getSession()
        if (sess.session?.user) {
          const { data: own } = await (supabase as any).from('companies').select('id').eq('owner_id', sess.session.user.id).maybeSingle()
          if (own?.id) cid = own.id
        }
      }
      if (cid) setCompanyId(cid)

      // Scoped fetch — only this company's polls/surveys appear in the idea panel
      if (cid) {
        const { data: pollData } = await (supabase as any).from('polls').select('*').eq('company_id', cid)
        setAvailablePolls(pollData || [])
        const { data: surveyData } = await (supabase as any).from('surveys').select('*').eq('company_id', cid)
        setAvailableSurveys(surveyData || [])
      } else {
        setAvailablePolls([])
        setAvailableSurveys([])
      }
    }
    resolveCompanyAndFetch()

    supabase.auth.getSession().then(async ({ data }) => {
      setAuthed(!!data.session)
      const user = data.session?.user
      if (user) {
        setCurrentUser(user)
        const displayName = user.user_metadata?.display_name || user.email?.split('@')[0] || 'Anonymous'
        setName(displayName)

        // Check if user administers THIS board (owner / elevated team member / super admin)
        try {
          const { isCompanyAdminUser } = await import('@/lib/board')
          setIsCompanyAdmin(await isCompanyAdminUser(user))
        } catch {}
      }
    })
    const handleKey = (e: KeyboardEvent) => { 
      if (e.key === 'Escape') {
        // Close open panels first, then modal
        if (creatingPoll) setCreatingPoll(false)
        else if (creatingSurvey) setCreatingSurvey(false)
        else if (creatingForm) setCreatingForm(false)
        else if (showAddUserModal) setShowAddUserModal(false)
        else onClose()
      }
    }
    window.addEventListener('keydown', handleKey)
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', handleKey)
      document.body.style.overflow = ''
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleImageSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      const reader = new FileReader()
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const createNewPoll = async () => {
    if (!newPollQuestion.trim() || (newPollType !== 'rating' && newPollOptions.filter(o => o.trim()).length < 2)) {
      return
    }
    try {
      const { data, error } = await supabase.from('polls').insert({
        question: newPollQuestion,
        description: newPollDescription.trim() || null,
        poll_type: newPollType,
        options: newPollType !== 'rating' ? newPollOptions.filter(o => o.trim()) : null,
        status: 'active',
        company_id: companyId,
      }).select().single()
      
      if (error) throw error
      
      setAvailablePolls([...availablePolls, data])
      setAttachedPoll(data.id)
      setCreatingPoll(false)
      setNewPollQuestion('')
      setNewPollOptions(['', ''])
      setNewPollDescription('')
      setNewPollType('single_choice')
      addToast('Poll created successfully!', 'success')
    } catch (err) {
      console.error('Error creating poll:', err)
      addToast('Failed to create poll', 'error')
    }
  }

  const createNewSurvey = async () => {
    if (!newSurveyTitle.trim() || surveyQuestions.length === 0) return
    try {
      const { data, error } = await supabase.from('surveys').insert({
        title: newSurveyTitle,
        questions: surveyQuestions,
        status: 'active',
        company_id: companyId,
      }).select().single()
      
      if (error) throw error
      
      setAvailableSurveys([...availableSurveys, data])
      setAttachedSurvey(data.id)
      setCreatingSurvey(false)
      setNewSurveyTitle('')
      setSurveyQuestions([])
      addToast('Survey created successfully!', 'success')
    } catch (err) {
      console.error('Error creating survey:', err)
      addToast('Failed to create survey', 'error')
    }
  }

  const addNewUser = async () => {
    if (!newUserName.trim() || !newUserEmail.trim() || !newUserPermission) {
      setError('Please fill all fields and confirm permission')
      addToast('Please complete all fields', 'warning')
      return
    }
    try {
      setLoading(true)
      // Add user to team_members (they'll be invited)
      const { data, error } = await fetch('/api/team-members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newUserEmail,
          name: newUserName,
          role: 'viewer',
        })
      }).then(r => r.json())
      
      if (error) throw new Error(error.message)
      
      // Add to name dropdown
      setCurrentUser({ ...currentUser, name: newUserName, email: newUserEmail })
      setShowAddUserModal(false)
      setNewUserName('')
      setNewUserEmail('')
      setNewUserPermission(false)
      setLoading(false)
      addToast('User added successfully!', 'success')
    } catch (err: any) {
      setError(err.message || 'Error adding user')
      setLoading(false)
      addToast('Failed to add user', 'error')
    }
  }

  const createNewForm = async () => {
    if (!newFormTitle.trim() || formFields.length === 0) return
    try {
      const { data, error } = await supabase.from('forms').insert({
        title: newFormTitle,
        fields: formFields,
        display_style: 'modal',
        status: 'active',
        company_id: companyId,
      }).select().single()
      
      if (error) throw error
      
      setAvailableForms([...availableForms, data])
      setAttachedForm(data.id)
      setCreatingForm(false)
      setNewFormTitle('')
      setFormFields([])
      addToast('Form created successfully!', 'success')
    } catch (err) {
      console.error('Error creating form:', err)
      addToast('Failed to create form', 'error')
    }
  }

  const triggerConfetti = () => {
    // Futuristic particle explosion - geometric shapes, sparkles, neon trails
    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999;overflow:hidden;'
    document.body.appendChild(container)

    // Inject futuristic keyframes
    if (!document.getElementById('confetti-keyframe-style')) {
      const style = document.createElement('style')
      style.id = 'confetti-keyframe-style'
      style.innerHTML = `
        @keyframes particleBlast {
          0% { 
            transform: translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(0.3); 
            opacity: 0;
          }
          15% {
            opacity: 1;
            transform: translate(-50%, -50%) translate(0, 0) rotate(0deg) scale(1.2);
          }
          100% { 
            transform: translate(-50%, -50%) translate(var(--tx), var(--ty)) rotate(var(--rot)) scale(0.4); 
            opacity: 0;
          }
        }
        @keyframes sparkleShine {
          0%, 100% { opacity: 0; transform: translate(-50%, -50%) scale(0); }
          50% { opacity: 1; transform: translate(-50%, -50%) scale(1.5); }
        }
        @keyframes neonRing {
          0% { transform: translate(-50%, -50%) scale(0); opacity: 1; border-width: 6px; }
          100% { transform: translate(-50%, -50%) scale(8); opacity: 0; border-width: 1px; }
        }
        @keyframes trailDrop {
          0% { transform: translateY(-20px) scale(1); opacity: 0; }
          15% { opacity: 1; }
          100% { transform: translateY(110vh) scale(0.5); opacity: 0; }
        }
      `
      document.head.appendChild(style)
    }

    // Get center of submit button or use viewport center
    const submitBtn = document.querySelector('button[type="submit"]') as HTMLElement
    let centerX = window.innerWidth / 2
    let centerY = window.innerHeight / 2
    if (submitBtn) {
      const rect = submitBtn.getBoundingClientRect()
      centerX = rect.left + rect.width / 2
      centerY = rect.top + rect.height / 2
    }

    // 1. NEON SHOCKWAVE RINGS — 3 expanding rings
    const ringColors = ['#ff7a6b', '#ffb84d', '#7c3aed']
    ringColors.forEach((color, i) => {
      setTimeout(() => {
        const ring = document.createElement('div')
        ring.style.cssText = `
          position: absolute;
          left: ${centerX}px;
          top: ${centerY}px;
          width: 40px;
          height: 40px;
          border: 4px solid ${color};
          border-radius: 50%;
          box-shadow: 0 0 20px ${color}, inset 0 0 20px ${color};
          animation: neonRing 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
        `
        container.appendChild(ring)
        setTimeout(() => ring.remove(), 1300)
      }, i * 100)
    })

    // 2. GEOMETRIC PARTICLE BLAST — squares, triangles, circles burst from center
    const shapes = ['◆', '◇', '●', '○', '▲', '△', '■', '□', '★', '☆', '✦', '✧']
    const colors = ['#ff7a6b', '#ffb84d', '#ff8f7f', '#7c3aed', '#06b6d4', '#10b981', '#f59e0b']
    const particleCount = 80
    for (let i = 0; i < particleCount; i++) {
      setTimeout(() => {
        const piece = document.createElement('div')
        const shape = shapes[Math.floor(Math.random() * shapes.length)]
        const color = colors[Math.floor(Math.random() * colors.length)]
        const angle = (Math.PI * 2 * i) / particleCount + Math.random() * 0.5
        const distance = 200 + Math.random() * 400
        const tx = Math.cos(angle) * distance
        const ty = Math.sin(angle) * distance + 100 // Gravity bias
        const duration = 1.2 + Math.random() * 1.3
        const rotation = (Math.random() * 720 - 360) + 'deg'
        const size = 14 + Math.random() * 18

        piece.textContent = shape
        piece.style.cssText = `
          position: absolute;
          left: ${centerX}px;
          top: ${centerY}px;
          font-size: ${size}px;
          color: ${color};
          text-shadow: 0 0 8px ${color}, 0 0 16px ${color};
          --tx: ${tx}px;
          --ty: ${ty}px;
          --rot: ${rotation};
          animation: particleBlast ${duration}s cubic-bezier(0.16, 1, 0.3, 1) forwards;
          user-select: none;
          font-weight: bold;
        `
        container.appendChild(piece)
        setTimeout(() => piece.remove(), duration * 1000)
      }, Math.random() * 200)
    }

    // 3. RANDOM SPARKLES around the screen for depth
    const sparkleCount = 25
    for (let i = 0; i < sparkleCount; i++) {
      setTimeout(() => {
        const sparkle = document.createElement('div')
        const x = Math.random() * window.innerWidth
        const y = Math.random() * window.innerHeight
        const color = colors[Math.floor(Math.random() * colors.length)]
        const size = 4 + Math.random() * 8
        sparkle.style.cssText = `
          position: absolute;
          left: ${x}px;
          top: ${y}px;
          width: ${size}px;
          height: ${size}px;
          background: ${color};
          border-radius: 50%;
          box-shadow: 0 0 ${size * 2}px ${color}, 0 0 ${size * 4}px ${color};
          animation: sparkleShine 1.5s ease-out forwards;
        `
        container.appendChild(sparkle)
        setTimeout(() => sparkle.remove(), 1500)
      }, 200 + Math.random() * 1500)
    }

    // 4. GENTLE EMOJI RAIN — slower, premium
    const rainEmojis = ['🎉', '✨', '🚀', '💫', '⭐']
    for (let i = 0; i < 30; i++) {
      setTimeout(() => {
        const rain = document.createElement('div')
        const emoji = rainEmojis[Math.floor(Math.random() * rainEmojis.length)]
        const x = Math.random() * 100
        const duration = 3 + Math.random() * 2
        const size = 16 + Math.random() * 16
        rain.textContent = emoji
        rain.style.cssText = `
          position: absolute;
          left: ${x}%;
          top: -30px;
          font-size: ${size}px;
          animation: trailDrop ${duration}s linear forwards;
          user-select: none;
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.2));
        `
        container.appendChild(rain)
        setTimeout(() => rain.remove(), duration * 1000)
      }, 500 + i * 60)
    }

    setTimeout(() => container.remove(), 6000)
  }

  const enhanceText = async (task: 'improve_writing' | 'fix_formatting' | 'summarize') => {
    if (!description.trim()) return
    
    setAiLoading(task === 'improve_writing' ? 'improve' : task === 'fix_formatting' ? 'fix' : 'summarize')
    setAiError('')
    
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          task,
          text: description,
          tone: 'professional',
          maxLength: 500
        })
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'AI service error')
      }
      
      const data = await res.json()
      if (typeof data.result === 'string') {
        setDescription(data.result)
      }
    } catch (err: any) {
      setAiError(err.message || 'Failed to enhance text')
    } finally {
      setAiLoading(null)
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    setError('')

    const { data: session } = await supabase.auth.getSession()

    let imageUrl = null
    if (imageFile) {
      const fileName = `${Date.now()}-${imageFile.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { data, error: uploadError } = await supabase.storage
        .from('idea-images')
        .upload(fileName, imageFile)

      if (uploadError) {
        setError('Failed to upload image: ' + uploadError.message)
        setLoading(false)
        return
      }
      const { data: { publicUrl } } = supabase.storage.from('idea-images').getPublicUrl(data.path)
      imageUrl = publicUrl
    }

    const { data: idea, error: err } = await supabase
      .from('ideas').insert({
        title: title.trim(),
        description: description.trim() || null,
        created_by_name: name.trim() || 'Anonymous',
        user_id: session.session?.user.id || null,
        votes: 0,
        status: 'new',
        topics: selectedTopics,
        image_url: imageUrl,
        poll_id: attachedPoll,
        survey_id: attachedSurvey,
        is_private: isPrivate,
        company_id: companyId,
      }).select().single()

    if (err || !idea) {
      console.error('Idea insert failed:', err)
      setError('Something went wrong. Please try again.')
      setLoading(false)
      return
    }

    if (session.session?.user.id) {
      await supabase.from('votes').insert({ idea_id: idea.id, user_id: session.session.user.id })
    }

    setSubmitted(true)
    triggerConfetti()
    
    setTimeout(() => {
      onSubmitted()
    }, 1500)
  }

  const toggleTopic = (id: string) => {
    if (selectedTopics.includes(id)) {
      setTopics(selectedTopics.filter(t => t !== id))
    } else if (selectedTopics.length < 3) {
      setTopics([...selectedTopics, id])
    }
  }

  if (submitted) {
    return (
      <>
        <div className="fixed inset-0 z-50 animate-backdrop" style={{ background: 'rgba(0,0,0,0.3)' }}
          onClick={onClose} />
        <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl p-12 text-center shadow-2xl animate-modal">
          <div className="text-6xl mb-4 animate-bounce">✨</div>
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--ink)' }}>
            Thank you!
          </h2>
          <p style={{ color: 'var(--slate)' }}>
            Your idea has been shared. The team will review it soon!
          </p>
        </div>
      </>
    )
  }

  return (
    <>
      <div className="fixed inset-0 z-50 animate-backdrop" style={{ background: 'rgba(0,0,0,0.3)' }}
        onClick={onClose} />

      <div className="fixed bottom-0 right-0 left-0 md:left-auto md:w-1/2 z-50 bg-white md:h-screen h-[80vh] drawer-open flex flex-col"
        style={{ borderLeft: '1px solid var(--border)' }}>

        <div className="sticky top-0 bg-white border-b px-6 py-4 flex items-center justify-between shrink-0" style={{ borderColor: 'var(--border)' }}>
          <h2 className="text-lg font-bold" style={{ color: 'var(--ink)' }}>Tell us your idea!</h2>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-gray-100 transition-smooth text-gray-400 press-effect text-xl">
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 px-6 py-6 space-y-5 overflow-y-auto">

          {authed === false && (
            <div className="text-sm px-4 py-3 rounded-xl animate-fade-in-up" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
              Posting anonymously. <button type="button" className="underline font-semibold"
                onClick={() => { onClose() }}>Sign in</button> to get credit.
            </div>
          )}

          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>
              One sentence that summarizes your idea
            </label>
            <input ref={titleRef} type="text" value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g., Dark mode support"
              maxLength={120}
              className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none transition-smooth"
              style={{ borderColor: title ? 'var(--coral)' : 'var(--border)', fontSize: '16px' }}
              required
            />
            <p className="text-xs mt-2 text-right" style={{ color: title.length > 100 ? 'var(--coral)' : '#d1d5db' }}>
              {title.length}/120
            </p>
          </div>

          <div>
            <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>
              Why your idea is useful, who would benefit and how it should work?
            </label>
            <textarea value={description} onChange={e => setDescription(e.target.value)}
              placeholder="Provide more context…"
              rows={4}
              className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none transition-smooth resize-none"
              style={{ borderColor: 'var(--border)', fontSize: '16px' }}
            />
            
            {/* AI Enhancement Buttons */}
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              <button
                type="button"
                onClick={() => enhanceText('improve_writing')}
                disabled={!description.trim()}
                className="px-3 py-2 rounded-lg border text-xs font-medium transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  borderColor: 'var(--border)',
                  background: aiLoading === 'improve' ? '#f3f4f6' : '#fff',
                  color: 'var(--ink)'
                }}
                title="Improve writing with AI">
                {aiLoading === 'improve' ? '✨ Improving...' : '✨ Improve'}
              </button>
              
              <button
                type="button"
                onClick={() => enhanceText('fix_formatting')}
                disabled={!description.trim()}
                className="px-3 py-2 rounded-lg border text-xs font-medium transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  borderColor: 'var(--border)',
                  background: aiLoading === 'fix' ? '#f3f4f6' : '#fff',
                  color: 'var(--ink)'
                }}
                title="Fix grammar and formatting">
                {aiLoading === 'fix' ? '🔧 Fixing...' : '🔧 Fix'}
              </button>
              
              <button
                type="button"
                onClick={() => enhanceText('summarize')}
                disabled={!description.trim()}
                className="px-3 py-2 rounded-lg border text-xs font-medium transition-smooth disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ 
                  borderColor: 'var(--border)',
                  background: aiLoading === 'summarize' ? '#f3f4f6' : '#fff',
                  color: 'var(--ink)'
                }}
                title="Summarize to be more concise">
                {aiLoading === 'summarize' ? '📝 Summarizing...' : '📝 Summarize'}
              </button>
            </div>
            
            {aiError && (
              <div style={{
                marginTop: 8,
                padding: '8px 12px',
                borderRadius: 8,
                background: '#fee2e2',
                color: '#991b1b',
                fontSize: 12
              }}>
                {aiError}
              </div>
            )}
          </div>

          {imagePreview && (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
              <div style={{ position: 'relative', display: 'inline-block', borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <img
                  src={imagePreview}
                  alt="Preview"
                  title="Click to view full size"
                  onClick={() => setShowImagePreviewViewer(true)}
                  style={{ height: 96, width: 'auto', maxWidth: 220, objectFit: 'cover', display: 'block', cursor: 'zoom-in' }}
                />
                <button
                  type="button"
                  onClick={() => {
                    setImageFile(null)
                    setImagePreview('')
                  }}
                  title="Remove image"
                  style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, background: 'rgba(0,0,0,0.65)', border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1 }}
                >
                  ×
                </button>
              </div>
              <p style={{ fontSize: 11, color: 'var(--slate)', marginTop: 4 }}>Click image to enlarge</p>
            </div>
          )}
          {showImagePreviewViewer && imagePreview && (
            <ImageViewer
              imageSrc={imagePreview}
              onClose={() => setShowImagePreviewViewer(false)}
              allowAnnotate
              onAnnotationSave={(dataUrl) => {
                // Replace both the preview and the file that will be uploaded
                setImagePreview(dataUrl)
                try {
                  const arr = dataUrl.split(',')
                  const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png'
                  const bstr = atob(arr[1])
                  const u8 = new Uint8Array(bstr.length)
                  for (let i = 0; i < bstr.length; i++) u8[i] = bstr.charCodeAt(i)
                  setImageFile(new File([u8], `annotated-${Date.now()}.png`, { type: mime }))
                } catch {}
              }}
            />
          )}

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-bold" style={{ color: 'var(--ink)' }}>
                Choose up to 3 Topics for this Idea
              </label>
            </div>
            <div className="flex flex-wrap gap-2 mb-2">
              {TOPICS.map(topic => (
                <button
                  key={topic.id}
                  type="button"
                  onClick={() => toggleTopic(topic.id)}
                  className="px-3 py-1.5 rounded-full text-sm font-medium border transition-smooth press-effect"
                  style={{
                    background: selectedTopics.includes(topic.id) ? 'var(--peach)' : 'white',
                    borderColor: selectedTopics.includes(topic.id) ? 'var(--coral)' : 'var(--border)',
                    color: selectedTopics.includes(topic.id) ? 'var(--coral)' : 'var(--slate)',
                  }}>
                  {topic.emoji} {topic.label}
                </button>
              ))}
            </div>
          </div>

          {/* Private Toggle */}
          <div className="flex items-center gap-3 p-3 rounded-lg border" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
            <button
              type="button"
              onClick={() => setIsPrivate(!isPrivate)}
              className="relative w-10 h-6 rounded-full transition-all"
              style={{ background: isPrivate ? 'var(--coral)' : '#d1d5db' }}>
              <div className="absolute top-1 transition-transform" style={{ 
                left: isPrivate ? '20px' : '2px',
                width: '20px',
                height: '20px',
                background: 'white',
                borderRadius: '50%'
              }} />
            </button>
            <div>
              <label className="block text-sm font-medium" style={{ color: 'var(--ink)' }}>
                Make this idea private
              </label>
              <p className="text-xs mt-0.5" style={{ color: 'var(--slate)' }}>
                {isPrivate ? 'Only you can see this' : 'Everyone can see this'}
              </p>
            </div>
          </div>

          {/* Admin Poll/Survey/Form Creation */}
          {isCompanyAdmin && (
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>
                Attach Poll or Survey (optional)
              </label>
              <div className="flex gap-2 flex-wrap">
                {/* Poll button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setShowPollPicker(!showPollPicker); setShowSurveyPicker(false) }}
                    className="px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-smooth cursor-pointer hover:bg-gray-50"
                    style={{ 
                      borderColor: attachedPoll ? '#0369a1' : 'var(--border)',
                      background: attachedPoll ? '#e0f2fe' : 'white',
                      color: attachedPoll ? '#0369a1' : 'var(--slate)',
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M7 12h2v5H7z"/><path d="M11 8h2v9h-2z"/></svg>
                    {attachedPoll ? availablePolls.find(p => p.id === attachedPoll)?.question?.slice(0, 25) + '...' : '+ Add Poll'}
                    {attachedPoll && (
                      <span onClick={(e) => { e.stopPropagation(); setAttachedPoll(null) }} className="ml-1 hover:opacity-70">×</span>
                    )}
                  </button>
                  {showPollPicker && (
                    <>
                      <div className="fixed inset-0 z-0" onClick={() => setShowPollPicker(false)} />
                      <div className="absolute top-full mt-1 left-0 z-10 w-72 bg-white border rounded-xl shadow-lg p-2 max-h-64 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
                        {availablePolls.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => { setCreatingPoll(true); setShowPollPicker(false) }}
                            className="w-full text-left p-2 rounded-lg hover:bg-gray-50 text-sm transition-smooth cursor-pointer flex items-center gap-2"
                            style={{ color: 'var(--coral)' }}>
                            <span>+ Create new poll</span>
                          </button>
                        ) : (
                          <>
                            {availablePolls.map(poll => (
                              <button
                                key={poll.id}
                                type="button"
                                onClick={() => { setAttachedPoll(poll.id); setShowPollPicker(false) }}
                                className="w-full text-left p-2 rounded-lg hover:bg-gray-50 text-sm transition-smooth cursor-pointer"
                                style={{ color: 'var(--ink)' }}>
                                {poll.question}
                              </button>
                            ))}
                            <div className="border-t mt-2 pt-2" style={{ borderColor: 'var(--border)' }} />
                            <button
                              type="button"
                              onClick={() => { setCreatingPoll(true); setShowPollPicker(false) }}
                              className="w-full text-left p-2 rounded-lg hover:bg-gray-50 text-sm transition-smooth cursor-pointer flex items-center gap-2"
                              style={{ color: 'var(--coral)' }}>
                              <span>+ Create new poll</span>
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Form button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setShowFormPicker(!showFormPicker); setShowPollPicker(false); setShowSurveyPicker(false) }}
                    className="px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-smooth cursor-pointer hover:bg-gray-50"
                    style={{ 
                      borderColor: attachedForm ? '#059669' : 'var(--border)',
                      background: attachedForm ? '#d1fae5' : 'white',
                      color: attachedForm ? '#059669' : 'var(--slate)',
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16v16H4z"/><line x1="4" y1="9" x2="20" y2="9"/><line x1="9" y1="4" x2="9" y2="20"/></svg>
                    {attachedForm ? availableForms.find(f => f.id === attachedForm)?.title?.slice(0, 20) + '...' : '+ Add Form'}
                    {attachedForm && (
                      <span onClick={(e) => { e.stopPropagation(); setAttachedForm(null) }} className="ml-1 hover:opacity-70">×</span>
                    )}
                  </button>
                  {showFormPicker && (
                    <>
                      <div className="fixed inset-0 z-0" onClick={() => setShowFormPicker(false)} />
                      <div className="absolute top-full mt-1 left-0 z-10 w-72 bg-white border rounded-xl shadow-lg p-2 max-h-64 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
                        {availableForms.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => { setCreatingForm(true); setShowFormPicker(false) }}
                            className="w-full text-left p-2 rounded-lg hover:bg-gray-50 text-sm transition-smooth cursor-pointer flex items-center gap-2"
                            style={{ color: 'var(--coral)' }}>
                            <span>+ Create new form</span>
                          </button>
                        ) : (
                          <>
                            {availableForms.map(form => (
                              <button
                                key={form.id}
                                type="button"
                                onClick={() => { setAttachedForm(form.id); setShowFormPicker(false) }}
                                className="w-full text-left p-2 rounded-lg hover:bg-gray-50 text-sm transition-smooth cursor-pointer"
                                style={{ color: 'var(--ink)' }}>
                                {form.title}
                              </button>
                            ))}
                            <div className="border-t mt-2 pt-2" style={{ borderColor: 'var(--border)' }} />
                            <button
                              type="button"
                              onClick={() => { setCreatingForm(true); setShowFormPicker(false) }}
                              className="w-full text-left p-2 rounded-lg hover:bg-gray-50 text-sm transition-smooth cursor-pointer flex items-center gap-2"
                              style={{ color: 'var(--coral)' }}>
                              <span>+ Create new form</span>
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>

                {/* Survey button */}
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => { setShowSurveyPicker(!showSurveyPicker); setShowPollPicker(false) }}
                    className="px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-smooth cursor-pointer hover:bg-gray-50"
                    style={{ 
                      borderColor: attachedSurvey ? '#7c3aed' : 'var(--border)',
                      background: attachedSurvey ? '#ede9fe' : 'white',
                      color: attachedSurvey ? '#7c3aed' : 'var(--slate)',
                    }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    {attachedSurvey ? availableSurveys.find(s => s.id === attachedSurvey)?.title?.slice(0, 20) + '...' : '+ Add Survey'}
                    {attachedSurvey && (
                      <span onClick={(e) => { e.stopPropagation(); setAttachedSurvey(null) }} className="ml-1 hover:opacity-70">×</span>
                    )}
                  </button>
                  {showSurveyPicker && (
                    <>
                      <div className="fixed inset-0 z-0" onClick={() => setShowSurveyPicker(false)} />
                      <div className="absolute top-full mt-1 left-0 z-10 w-72 bg-white border rounded-xl shadow-lg p-2 max-h-64 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
                        {availableSurveys.length === 0 ? (
                          <button
                            type="button"
                            onClick={() => { setCreatingSurvey(true); setShowSurveyPicker(false) }}
                            className="w-full text-left p-2 rounded-lg hover:bg-gray-50 text-sm transition-smooth cursor-pointer flex items-center gap-2"
                            style={{ color: 'var(--coral)' }}>
                            <span>+ Create new survey</span>
                          </button>
                        ) : (
                          <>
                            {availableSurveys.map(survey => (
                              <button
                                key={survey.id}
                                type="button"
                                onClick={() => { setAttachedSurvey(survey.id); setShowSurveyPicker(false) }}
                                className="w-full text-left p-2 rounded-lg hover:bg-gray-50 text-sm transition-smooth cursor-pointer"
                                style={{ color: 'var(--ink)' }}>
                                {survey.title}
                              </button>
                            ))}
                            <div className="border-t mt-2 pt-2" style={{ borderColor: 'var(--border)' }} />
                            <button
                              type="button"
                              onClick={() => { setCreatingSurvey(true); setShowSurveyPicker(false) }}
                              className="w-full text-left p-2 rounded-lg hover:bg-gray-50 text-sm transition-smooth cursor-pointer flex items-center gap-2"
                              style={{ color: 'var(--coral)' }}>
                              <span>+ Create new survey</span>
                            </button>
                          </>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-bold" style={{ color: 'var(--ink)' }}>
                Your name
              </label>
              {currentUser && name && (
                <button type="button" onClick={() => setShowNameDropdown(!showNameDropdown)}
                  className="text-xs font-medium press-effect"
                  style={{ color: 'var(--coral)' }}>
                  Change
                </button>
              )}
            </div>
            {/* Signed-in users see the name card; guests always keep an editable input.
                (Previously the input only rendered while name was empty, so it
                unmounted after the first typed letter.) */}
            {currentUser && name && !showNameDropdown && (
              <div className="px-4 py-3 rounded-xl bg-gray-50 border mb-3 flex items-center justify-between relative"
                style={{ borderColor: 'var(--border)' }}>
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ background: 'var(--coral)' }}>
                    {name[0]?.toUpperCase()}
                  </span>
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{name}</p>
                  </div>
                </div>
              </div>
            )}
            {showNameDropdown && (
              <div className="absolute left-0 right-0 z-50 bg-white border rounded-xl shadow-lg mb-3 p-2" 
                style={{ borderColor: 'var(--border)' }}>
                <button
                  type="button"
                  onClick={() => { setName(currentUser?.email?.split('@')[0] || 'Anonymous'); setShowNameDropdown(false) }}
                  className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 rounded-lg transition-smooth flex items-center gap-3"
                  style={{ color: 'var(--ink)' }}>
                  <span className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm"
                    style={{ background: 'var(--coral)' }}>
                    {currentUser?.email?.[0]?.toUpperCase() || 'A'}
                  </span>
                  <div>
                    <p className="text-sm font-medium">{currentUser?.email?.split('@')[0] || 'Anonymous'}</p>
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>{currentUser?.email}</p>
                  </div>
                </button>
                <div className="border-t my-2" style={{ borderColor: 'var(--border)' }} />
                <button
                  type="button"
                  onClick={() => { setShowAddUserModal(true); setShowNameDropdown(false) }}
                  className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 rounded-lg transition-smooth flex items-center gap-3"
                  style={{ color: 'var(--coral)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <p className="text-sm font-medium">Add new user</p>
                </button>
              </div>
            )}
            {!currentUser && (
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Leave blank to post anonymously"
                autoComplete="off"
                className="w-full px-4 py-3 border rounded-xl text-sm focus:outline-none transition-smooth"
                style={{ borderColor: 'var(--border)', fontSize: '16px' }}
              />
            )}
          </div>

          {error && (
            <p className="text-sm animate-fade-in-up" style={{ color: '#dc2626' }}>{error}</p>
          )}
        </form>

        <div className="border-t px-6 py-3 flex items-center gap-2" style={{ borderColor: 'var(--border)' }}>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="p-2 rounded-lg hover:bg-gray-100 transition-smooth cursor-pointer press-effect"
            title="Add image">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--coral)" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
            </svg>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleImageSelect}
            />
          </button>
          <div className="flex-1" />
          <button type="button" className="px-4 py-2 rounded-lg text-sm font-medium border transition-smooth press-effect"
            style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}
            onClick={onClose}>
            Cancel
          </button>
          <button type="submit" disabled={loading || !title.trim()} onClick={handleSubmit}
            className="px-6 py-2 rounded-lg text-sm font-semibold text-white transition-smooth press-effect futuristic-submit-btn disabled:opacity-50 relative overflow-hidden"
            style={{ background: 'var(--coral)' }}>
            <span className="relative z-10 flex items-center gap-2">
              {loading ? (
                <>
                  <span className="animate-spin">⚡</span>
                  Posting…
                </>
              ) : (
                <>
                  ✨ Submit
                </>
              )}
            </span>
          </button>
        </div>
      </div>

      {/* Form Creation Panel */}
      {creatingForm && (
        <>
          <div className="fixed inset-0 z-40 animate-backdrop" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setCreatingForm(false)} />
          <div className="fixed right-0 top-0 z-50 w-full sm:w-96 h-screen bg-white shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Create Form</h2>
                <button onClick={() => { setCreatingForm(false); setNewFormTitle(''); setFormFields([]) }} 
                  className="p-1 hover:bg-gray-100 rounded-lg transition-smooth cursor-pointer"
                  title="Close (Esc)">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>Form Title</label>
                <input type="text" value={newFormTitle} onChange={e => setNewFormTitle(e.target.value)}
                  placeholder="Customer Feedback" autoFocus
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none text-sm" style={{ borderColor: 'var(--border)' }} />
              </div>

              {/* Fields Builder */}
              <div>
                <label className="block text-sm font-medium mb-3" style={{ color: 'var(--ink)' }}>Fields</label>
                <FormFieldBuilder 
                  fields={formFields}
                  onFieldsChange={setFormFields}
                />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => { setCreatingForm(false); setNewFormTitle(''); setFormFields([]) }}
                className="flex-1 py-2 rounded-lg border text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-50"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                Cancel
              </button>
              <button onClick={createNewForm} disabled={!newFormTitle.trim() || formFields.length === 0}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-smooth cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                Create Form
              </button>
            </div>
          </div>
        </>
      )}

      {/* Poll Creation Panel */}
      {creatingPoll && (
        <>
          <div className="fixed inset-0 z-40 animate-backdrop" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setCreatingPoll(false)} />
          <div className="fixed right-0 top-0 z-50 w-full sm:w-96 h-screen bg-white shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Create Poll</h2>
                <button onClick={() => { setCreatingPoll(false); setNewPollQuestion(''); setNewPollOptions(['', '']); setNewPollDescription(''); setNewPollType('single_choice') }} 
                  className="p-1 hover:bg-gray-100 rounded-lg transition-smooth cursor-pointer"
                  title="Close (Esc)">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {/* Poll Type Selector */}
              <div>
                <label className="block text-sm font-medium mb-3" style={{ color: 'var(--ink)' }}>Poll Type</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-50">
                    <input 
                      type="radio"
                      name="pollType"
                      value="single_choice"
                      checked={newPollType === 'single_choice'}
                      onChange={(e) => setNewPollType(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm" style={{ color: 'var(--ink)' }}>Single Choice</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-50">
                    <input 
                      type="radio"
                      name="pollType"
                      value="multiple_choice"
                      checked={newPollType === 'multiple_choice'}
                      onChange={(e) => setNewPollType(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm" style={{ color: 'var(--ink)' }}>Multiple Choice</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-50">
                    <input 
                      type="radio"
                      name="pollType"
                      value="rating"
                      checked={newPollType === 'rating'}
                      onChange={(e) => setNewPollType(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm" style={{ color: 'var(--ink)' }}>Rating (1-5)</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer p-2 rounded hover:bg-gray-50">
                    <input 
                      type="radio"
                      name="pollType"
                      value="ranking"
                      checked={newPollType === 'ranking'}
                      onChange={(e) => setNewPollType(e.target.value as any)}
                      className="w-4 h-4"
                    />
                    <span className="text-sm" style={{ color: 'var(--ink)' }}>Ranking</span>
                  </label>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>Question</label>
                <input type="text" value={newPollQuestion} onChange={e => setNewPollQuestion(e.target.value)}
                  placeholder="What do you think?" autoFocus
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none text-sm" style={{ borderColor: 'var(--border)' }} />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>Description (Optional)</label>
                <textarea value={newPollDescription} onChange={e => setNewPollDescription(e.target.value)}
                  placeholder="Add more context..." rows={2}
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none text-sm resize-none" style={{ borderColor: 'var(--border)' }} />
              </div>
              
              {newPollType !== 'rating' && (
                <div>
                  <label className="block text-sm font-medium mb-3" style={{ color: 'var(--ink)' }}>Options</label>
                  {newPollOptions.map((opt, i) => (
                    <div key={i} className="flex gap-2 mb-2">
                      <input type="text" value={opt} onChange={e => {
                        const newOpts = [...newPollOptions]
                        newOpts[i] = e.target.value
                        setNewPollOptions(newOpts)
                      }}
                        placeholder={`Option ${i + 1}`}
                        className="flex-1 px-4 py-2 border rounded-lg focus:outline-none text-sm"
                        style={{ borderColor: 'var(--border)' }} />
                      {newPollOptions.length > 2 && (
                        <button onClick={() => setNewPollOptions(newPollOptions.filter((_, idx) => idx !== i))}
                          className="p-2 hover:bg-red-50 rounded-lg transition-smooth cursor-pointer text-red-600"
                          title="Delete option">
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                          </svg>
                        </button>
                      )}
                    </div>
                  ))}
                  {newPollOptions.length < 5 && (
                    <button onClick={() => setNewPollOptions([...newPollOptions, ''])}
                      className="text-xs font-medium mt-2 py-1 px-2 rounded hover:bg-gray-100" style={{ color: 'var(--coral)' }}>
                      + Add option
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="p-6 border-t flex gap-3" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => { setCreatingPoll(false); setNewPollQuestion(''); setNewPollOptions(['', '']); setNewPollDescription(''); setNewPollType('single_choice') }}
                className="flex-1 py-2 rounded-lg border text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-50"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                Cancel
              </button>
              <button onClick={createNewPoll} disabled={!newPollQuestion.trim() || (newPollType !== 'rating' && newPollOptions.filter(o => o.trim()).length < 2)}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-smooth cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                Create Poll
              </button>
            </div>
          </div>
        </>
      )}

      {/* Survey Creation Panel */}
      {creatingSurvey && (
        <>
          <div className="fixed inset-0 z-40 animate-backdrop" style={{ background: 'rgba(0,0,0,0.3)' }} onClick={() => setCreatingSurvey(false)} />
          <div className="fixed right-0 top-0 z-50 w-full sm:w-96 h-screen bg-white shadow-2xl flex flex-col overflow-hidden animate-slide-in-right">
            <div className="p-6 border-b" style={{ borderColor: 'var(--border)' }}>
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold" style={{ color: 'var(--ink)' }}>Create Survey</h2>
                <button onClick={() => { setCreatingSurvey(false); setNewSurveyTitle(''); setSurveyQuestions([]) }} 
                  className="p-1 hover:bg-gray-100 rounded-lg transition-smooth cursor-pointer"
                  title="Close (Esc)">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>Survey Title</label>
                <input type="text" value={newSurveyTitle} onChange={e => setNewSurveyTitle(e.target.value)}
                  placeholder="Customer Satisfaction" autoFocus
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none text-sm" style={{ borderColor: 'var(--border)' }} />
              </div>

              {/* Questions Builder */}
              <div>
                <label className="block text-sm font-medium mb-3" style={{ color: 'var(--ink)' }}>Questions</label>
                <SurveyQuestionBuilder 
                  questions={surveyQuestions}
                  onQuestionsChange={setSurveyQuestions}
                />
              </div>
            </div>
            <div className="p-6 border-t flex gap-3" style={{ borderColor: 'var(--border)' }}>
              <button onClick={() => { setCreatingSurvey(false); setNewSurveyTitle(''); setSurveyQuestions([]) }}
                className="flex-1 py-2 rounded-lg border text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-50"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                Cancel
              </button>
              <button onClick={createNewSurvey} disabled={!newSurveyTitle.trim() || surveyQuestions.length === 0}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-smooth cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                Create Survey
              </button>
            </div>
          </div>
        </>
      )}

      {/* Add New User Modal */}
      {showAddUserModal && (
        <>
          <div className="fixed inset-0 z-40 bg-black/20" onClick={() => setShowAddUserModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl p-6 sm:p-8 w-full sm:w-96 max-h-screen overflow-y-auto shadow-2xl">
            <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--ink)' }}>Add a new user</h2>
            
            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>Name</label>
                <input type="text" value={newUserName} onChange={e => setNewUserName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none text-sm"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} autoFocus />
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-2" style={{ color: 'var(--ink)' }}>Email</label>
                <input type="email" value={newUserEmail} onChange={e => setNewUserEmail(e.target.value)}
                  placeholder="john@example.com"
                  className="w-full px-4 py-2 border rounded-lg focus:outline-none text-sm"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
              
              <div className="flex items-center gap-2">
                <input type="checkbox" id="permission" checked={newUserPermission} onChange={e => setNewUserPermission(e.target.checked)}
                  className="w-4 h-4 rounded cursor-pointer" />
                <label htmlFor="permission" className="text-sm" style={{ color: 'var(--ink)' }}>
                  I have permission to add this person's details
                </label>
              </div>
            </div>
            
            {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
            
            <div className="flex flex-col sm:flex-row gap-3">
              <button onClick={() => setShowAddUserModal(false)}
                className="flex-1 py-2 rounded-lg border text-sm font-medium transition-smooth cursor-pointer hover:bg-gray-50 order-2 sm:order-1"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                Cancel
              </button>
              <button onClick={addNewUser} disabled={loading || !newUserName.trim() || !newUserEmail.trim() || !newUserPermission}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white transition-smooth cursor-pointer disabled:opacity-50 order-1 sm:order-2"
                style={{ background: 'var(--coral)' }}>
                {loading ? 'Adding...' : 'Add user'}
              </button>
            </div>
          </div>
        </>
      )}

      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); opacity: 0; }
          to { transform: translateX(0); opacity: 1; }
        }
        .animate-slide-in-right { animation: slide-in-right 0.3s ease-out; }
      `}</style>
    </>
  )
}
