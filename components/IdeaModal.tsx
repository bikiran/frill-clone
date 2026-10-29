'use client'

import { authFetch } from '@/lib/auth-fetch'
import { useState, useEffect, useRef } from 'react'
import ImageViewer from './ImageViewer'
import { supabase } from '@/lib/supabase'
import { track } from '@/lib/analytics'
import { useToast } from '@/components/ToastProvider'
import { notifyIntegrations } from '@/lib/integrations-notify'
import IdeaAttachSheet from '@/components/IdeaAttachSheet'

const TOPICS = [
  { id: 'welcome', label: 'Welcome', emoji: '👋' },
  { id: 'improvement', label: 'Improvement', emoji: '⬆️' },
  { id: 'integrations', label: 'Integrations', emoji: '🔗' },
  { id: 'styling', label: 'Styling', emoji: '🎨' },
  { id: 'misc', label: 'Misc', emoji: '✨' },
  { id: 'bug', label: 'Bug Report', emoji: '🐛' },
]

export default function IdeaModal({ onClose, onSubmitted, resolveCompany }: {
  onClose: () => void
  onSubmitted: () => void
  /** The board's own way to find its workspace (the admin passes the signed-in
      team member's workspace; without it, owners only were found). */
  resolveCompany?: () => Promise<string | null>
}) {
  const { addToast } = useToast()
  const [companyId, setCompanyId] = useState<string | null>(null)
  
  const [title, setTitle]               = useState('')
  const [description, setDescription]   = useState('')
  const [name, setName]                 = useState('')
  const [myName, setMyName]             = useState('')
  const [editingName, setEditingName]   = useState(false)
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
  const [sheet, setSheet]               = useState<null | 'poll' | 'survey'>(null)
  const [isPrivate, setIsPrivate]       = useState(false)
  const [currentUser, setCurrentUser]   = useState<any>(null)
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [aiError, setAiError] = useState('')
  // The text before the last AI change, so it can be undone.
  const [aiPrev, setAiPrev] = useState<string | null>(null)
  
  const titleRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const layers = useRef({ viewer: false })
  layers.current.viewer = showImagePreviewViewer

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 100)

    // Resolve the current board's company_id, then fetch ONLY that company's polls/surveys.
    // Fetching unscoped here leaked every company's polls, surveys and forms into the idea panel.
    const resolveCompanyAndFetch = async () => {
      let cid: string | null = null
      try { cid = (await resolveCompany?.()) || null } catch {}
      if (!cid && typeof window !== 'undefined') {
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
        setMyName(displayName)

        // Check if user administers THIS board (owner / elevated team member / super admin)
        try {
          const { isCompanyAdminUser } = await import('@/lib/board')
          setIsCompanyAdmin(await isCompanyAdminUser(user))
        } catch {}
      }
    })
    // The poll/survey sheet and the image viewer close themselves on Esc
    // (the sheet stops the key before it gets here).
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !layers.current.viewer) onClose()
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
    e.target.value = ''   // picking the same file again still fires
    if (file && !file.type.startsWith('image/')) { setError('That file isn’t an image.'); return }
    if (file && file.size > 10 * 1024 * 1024) { setError('That image is over 10 MB. Try a smaller one.'); return }
    if (file) {
      setError('')
      setImageFile(file)
      const reader = new FileReader()
      reader.onload = (event) => {
        setImagePreview(event.target?.result as string)
      }
      reader.readAsDataURL(file)
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
    if (!description.trim() || aiLoading) return
    
    setAiLoading(task === 'improve_writing' ? 'improve' : task === 'fix_formatting' ? 'fix' : 'summarize')
    setAiError('')
    
    try {
      const res = await authFetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, 
          task,
          text: description,
          tone: 'professional',
          maxLength: 500
        })
      })
      
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || 'AI isn’t available right now. Try again in a moment.')
      }
      
      const data = await res.json()
      if (typeof data.result === 'string' && data.result.trim()) {
        setAiPrev(description)
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
    if (!title.trim() || loading) return
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
    notifyIntegrations('idea.created', { id: idea.id })

    if (session.session?.user.id) {
      await supabase.from('votes').insert({ idea_id: idea.id, user_id: session.session.user.id })
    }

    try { track('idea_submitted', { topics: selectedTopics?.length || 0 }) } catch {}
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

  const pollTitle = availablePolls.find(p => p.id === attachedPoll)?.question || 'Poll'
  const surveyTitle = availableSurveys.find(sv => sv.id === attachedSurvey)?.title || 'Survey'

  if (submitted) {
    return (
      <>
        <div className="idn-scrim" onClick={onClose} />
        <div className="idn-done" role="status">
          <span className="idn-done-ic" aria-hidden>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5 10 17 19 7" /></svg>
          </span>
          <h2>Thank you!</h2>
          <p>Your idea is on the board. The team will take a look soon.</p>
        </div>
        <style>{IDN_CSS}</style>
      </>
    )
  }

  return (
    <>
      <div className="idn-scrim" onClick={onClose} />

      <div className="idn" role="dialog" aria-modal="true" aria-labelledby="idn-h">
        <header className="idn-head">
          <h2 id="idn-h">Tell us your idea!</h2>
          <button type="button" className="idn-x" onClick={onClose} aria-label="Close" title="Close (Esc)">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </header>

        <form id="idn-form" onSubmit={handleSubmit} className="idn-body">

          {authed === false && (
            <div className="idn-note">
              Posting as a guest. <button type="button" onClick={onClose}>Sign in</button> to get credit for it.
            </div>
          )}

          <div className="idn-f">
            <label className="idn-label" htmlFor="idn-title">One sentence that sums up your idea</label>
            <input id="idn-title" ref={titleRef} type="text" value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Dark mode support"
              maxLength={120}
              className="idn-field"
              required
            />
            <span className={`idn-count${title.length > 100 ? ' warn' : ''}`}>{title.length}/120</span>
          </div>

          <div className="idn-f">
            <label className="idn-label" htmlFor="idn-desc">Why is it useful, who would it help, and how should it work?</label>
            <textarea id="idn-desc" value={description} onChange={e => { setDescription(e.target.value); setAiPrev(null) }}
              placeholder="Add a little more context…"
              rows={5}
              className="idn-field"
            />
            <div className="idn-ai">
              {AI_ACTIONS.map(a => (
                <button key={a.key} type="button" className="idn-pill" onClick={() => enhanceText(a.task)}
                  disabled={!description.trim() || !!aiLoading} title={a.title}>
                  {aiLoading === a.key ? <span className="idn-spin" aria-hidden /> : a.icon}
                  {aiLoading === a.key ? a.busy : a.label}
                </button>
              ))}
              {aiPrev !== null && !aiLoading && (
                <button type="button" className="idn-pill ghost" onClick={() => { setDescription(aiPrev); setAiPrev(null) }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></svg>
                  Undo
                </button>
              )}
              {!description.trim() && <span className="idn-ai-hint">Write a few words and AI can polish them.</span>}
            </div>
            {aiError && <p className="idn-err">{aiError}</p>}
          </div>

          {imagePreview && (
            <div className="idn-img">
              <img src={imagePreview} alt="Attached" title="Open full size" onClick={() => setShowImagePreviewViewer(true)} />
              <button type="button" onClick={() => { setImageFile(null); setImagePreview('') }} aria-label="Remove image" title="Remove image">×</button>
              <span>Click to open, draw on it, or crop.</span>
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

          <div className="idn-f">
            <div className="idn-lrow">
              <span className="idn-label">Choose up to 3 topics</span>
              <span className="idn-sub">{selectedTopics.length} of 3</span>
            </div>
            <div className="idn-chips">
              {TOPICS.map(topic => {
                const on = selectedTopics.includes(topic.id)
                return (
                  <button key={topic.id} type="button" aria-pressed={on} onClick={() => toggleTopic(topic.id)}
                    disabled={!on && selectedTopics.length >= 3}
                    className={`idn-chip${on ? ' on' : ''}`}>
                    <span aria-hidden>{topic.emoji}</span>{topic.label}
                  </button>
                )
              })}
            </div>
          </div>

          <button type="button" className={`idn-switchrow${isPrivate ? ' on' : ''}`} aria-pressed={isPrivate} onClick={() => setIsPrivate(!isPrivate)}>
            <span className="idn-switchrow-ic" aria-hidden>
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="11" width="16" height="10" rx="2.5" /><path d="M8 11V7a4 4 0 0 1 8 0v4" /></svg>
            </span>
            <span className="idn-switchrow-t">
              <b>Make this idea private</b>
              <small>{isPrivate ? 'Only you and the team can see it' : 'Everyone on the board can see it'}</small>
            </span>
            <span className="idn-sw" aria-hidden><i /></span>
          </button>

          {isCompanyAdmin && (
            <div className="idn-f">
              <span className="idn-label">Attach a poll or survey <small>optional</small></span>
              <div className="idn-attach">
                {attachedPoll ? (
                  <span className="idn-att blue">
                    <button type="button" className="t" onClick={() => setSheet('poll')} title={`${pollTitle} (click to change)`}>{POLL_ICON}<span>{pollTitle}</span></button>
                    <button type="button" className="rm" onClick={() => setAttachedPoll(null)} aria-label="Remove poll" title="Remove">×</button>
                  </span>
                ) : (
                  <button type="button" className="idn-pill" onClick={() => setSheet('poll')}>{POLL_ICON} Add poll</button>
                )}
                {attachedSurvey ? (
                  <span className="idn-att green">
                    <button type="button" className="t" onClick={() => setSheet('survey')} title={`${surveyTitle} (click to change)`}>{SURVEY_ICON}<span>{surveyTitle}</span></button>
                    <button type="button" className="rm" onClick={() => setAttachedSurvey(null)} aria-label="Remove survey" title="Remove">×</button>
                  </span>
                ) : (
                  <button type="button" className="idn-pill" onClick={() => setSheet('survey')}>{SURVEY_ICON} Add survey</button>
                )}
              </div>
            </div>
          )}

          <div className="idn-f">
            <label className="idn-label" htmlFor="idn-name">Your name</label>
            {currentUser && !editingName ? (
              <div className="idn-who">
                <span className="idn-av">{(name || 'A')[0]?.toUpperCase()}</span>
                <span className="idn-who-t">
                  <b>{name || 'Anonymous'}</b>
                  <small>{name === myName ? 'Shown on the idea' : 'Shown on the idea instead of your name'}</small>
                </span>
                <button type="button" className="idn-pill sm" onClick={() => setEditingName(true)}>Change</button>
              </div>
            ) : currentUser ? (
              <div className="idn-namebox">
                <input id="idn-name" type="text" value={name} onChange={e => setName(e.target.value)} maxLength={80} autoFocus
                  placeholder="The name shown on the idea" autoComplete="off" className="idn-field"
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); setEditingName(false) } }} />
                <div className="idn-namechips">
                  {myName && name !== myName && <button type="button" className="idn-pill sm" onClick={() => { setName(myName); setEditingName(false) }}>Use my name</button>}
                  {name !== 'Anonymous' && <button type="button" className="idn-pill sm" onClick={() => { setName('Anonymous'); setEditingName(false) }}>Post anonymously</button>}
                  <button type="button" className="idn-pill sm dark" onClick={() => setEditingName(false)}>Done</button>
                </div>
              </div>
            ) : (
              <input id="idn-name" type="text" value={name} onChange={e => setName(e.target.value)} maxLength={80}
                placeholder="Leave blank to post anonymously" autoComplete="off" className="idn-field" />
            )}
          </div>

          {error && <p className="idn-err">{error}</p>}
        </form>

        <footer className="idn-foot">
          <button type="button" className="idn-icon" onClick={() => fileInputRef.current?.click()} title="Add an image" aria-label="Add an image">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="3" width="18" height="18" rx="3" /><circle cx="8.5" cy="8.5" r="1.5" /><path d="m21 15-5-5L5 21" />
            </svg>
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageSelect} />
          <span className="idn-foot-hint">{imageFile ? '1 image attached' : 'Add a screenshot'}</span>
          <span style={{ flex: 1 }} />
          <button type="button" className="idn-btn" onClick={onClose}>Cancel</button>
          <button type="submit" form="idn-form" disabled={loading || !title.trim()} className="idn-btn go">
            {loading ? <><span className="idn-spin light" aria-hidden />Posting…</> : 'Post idea'}
          </button>
        </footer>
      </div>

      {sheet && (
        <IdeaAttachSheet
          kind={sheet}
          companyId={companyId}
          items={sheet === 'poll' ? availablePolls : availableSurveys}
          selectedId={sheet === 'poll' ? attachedPoll : attachedSurvey}
          onPick={id => { if (sheet === 'poll') setAttachedPoll(id); else setAttachedSurvey(id); setSheet(null) }}
          onCreated={row => {
            if (sheet === 'poll') { setAvailablePolls(list => [...list, row]); setAttachedPoll(row.id) }
            else { setAvailableSurveys(list => [...list, row]); setAttachedSurvey(row.id) }
            setSheet(null)
            addToast(sheet === 'poll' ? 'Poll created and attached' : 'Survey created and attached', 'success')
          }}
          onClose={() => setSheet(null)}
        />
      )}

      <style>{IDN_CSS}</style>
    </>
  )
}

const AI_ACTIONS: { key: string; task: 'improve_writing' | 'fix_formatting' | 'summarize'; label: string; busy: string; title: string; icon: React.ReactNode }[] = [
  { key: 'improve', task: 'improve_writing', label: 'Improve', busy: 'Improving…', title: 'Improve the writing with AI',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden><path d="M12 2.5l1.9 5.6 5.6 1.9-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.9z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" opacity=".7" /></svg> },
  { key: 'fix', task: 'fix_formatting', label: 'Fix', busy: 'Fixing…', title: 'Fix spelling, grammar and formatting',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M4 7V5h16v2" /><path d="M12 5v14" /><path d="M9 19h6" /></svg> },
  { key: 'summarize', task: 'summarize', label: 'Summarize', busy: 'Summarizing…', title: 'Make it shorter',
    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden><path d="M4 6h16M4 12h10M4 18h6" /></svg> },
]

const POLL_ICON = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><rect x="3" y="3" width="18" height="18" rx="3" /><path d="M8 16v-4M12 16V8M16 16v-6" /></svg>
const SURVEY_ICON = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" /></svg>

const IDN_CSS = `
.idn-scrim{position:fixed;inset:0;z-index:50;background:rgba(15,15,20,.3);animation:idn-fade .2s ease-out}
.idn{position:fixed;top:10px;right:10px;bottom:10px;z-index:51;width:min(640px,calc(100vw - 20px));display:flex;flex-direction:column;overflow:hidden;border-radius:26px;background:var(--card,#fff);box-shadow:0 24px 60px -12px rgba(16,24,40,.3),0 0 0 1px rgba(0,0,0,.04);animation:idn-in .32s cubic-bezier(.2,.9,.3,1)}
@media (max-width:640px){.idn{top:auto;left:0;right:0;bottom:0;width:100%;height:92dvh;border-radius:26px 26px 0 0}}
@keyframes idn-in{from{transform:translateX(28px);opacity:0}to{transform:none;opacity:1}}
@keyframes idn-fade{from{opacity:0}}
.idn button::before,.idn-done button::before{display:none!important}
.idn-head{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:20px 22px 8px 26px}
.idn-head h2{margin:0;font-family:var(--font-display),-apple-system,"SF Pro Display",sans-serif;font-size:26px;font-weight:700;letter-spacing:-.035em;color:var(--ink)}
.idn-x{width:38px;height:38px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:#f4f4f5;color:var(--ink);cursor:pointer;transition:background .15s}
.idn-x:hover{background:#e9e9ec}
.idn-body{flex:1;min-height:0;overflow-y:auto;padding:12px 26px 26px;display:flex;flex-direction:column;gap:22px}
.idn-f{position:relative;display:flex;flex-direction:column}
.idn-label{display:block;margin:0 0 9px;font-size:14.5px;font-weight:650;letter-spacing:-.01em;color:var(--ink)}
.idn-label small{margin-left:5px;font-size:12.5px;font-weight:500;color:#a1a1aa}
.idn-lrow{display:flex;align-items:baseline;justify-content:space-between;gap:10px}
.idn-sub{font-size:12.5px;font-weight:600;color:#a1a1aa}
.idn-field{display:block;width:100%;min-height:48px;padding:13px 16px;border:none!important;border-radius:16px;background:#f4f4f5;font:inherit;font-size:16px;line-height:1.45;color:var(--ink);outline:none;resize:vertical;transition:background .15s,box-shadow .15s}
textarea.idn-field{min-height:120px}
.idn-field::placeholder{color:#a1a1aa}
.idn-field:focus,.idn-field:focus-visible{background:#fff;box-shadow:0 0 0 1.5px var(--ink)!important;outline:none!important}
.idn-count{align-self:flex-end;margin-top:6px;font-size:12px;font-weight:600;color:#c4c4cc}
.idn-count.warn{color:#d97706}
.idn-ai{display:flex;align-items:center;flex-wrap:wrap;gap:6px;margin-top:10px}
.idn-ai-hint{margin-left:4px;font-size:12.5px;color:#a1a1aa}
.idn-pill{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border:none;border-radius:999px;background:#f4f4f5;font:inherit;font-size:13.5px;font-weight:600;color:var(--ink);cursor:pointer;white-space:nowrap;transition:background .15s,opacity .15s,transform .1s}
.idn-pill:hover:not(:disabled){background:#ececef}
.idn-pill:active:not(:disabled){transform:scale(.97)}
.idn-pill:disabled{opacity:.45;cursor:not-allowed}
.idn-pill.ghost{background:none;box-shadow:inset 0 0 0 1px rgba(0,0,0,.1)}
.idn-pill.sm{height:30px;padding:0 12px;font-size:12.5px}
.idn-pill.dark{background:var(--ink);color:#fff}
.idn-pill.dark:hover{background:var(--ink);opacity:.9}
.idn-spin{width:13px;height:13px;flex-shrink:0;border-radius:50%;border:2px solid rgba(0,0,0,.15);border-top-color:var(--ink);animation:idn-rot .7s linear infinite}
.idn-spin.light{border-color:rgba(255,255,255,.35);border-top-color:#fff}
@keyframes idn-rot{to{transform:rotate(360deg)}}
.idn-err{margin:8px 0 0;padding:9px 12px;border-radius:12px;background:#fef2f2;font-size:13px;color:#b91c1c}
.idn-note{padding:11px 14px;border-radius:14px;background:var(--peach);font-size:13.5px;color:var(--ink)}
.idn-note button{padding:0;border:none;background:none;font:inherit;font-weight:700;color:var(--coral);text-decoration:underline;cursor:pointer}
.idn-img{position:relative;display:flex;align-items:flex-end;gap:10px}
.idn-img img{height:96px;max-width:220px;object-fit:cover;border-radius:16px;box-shadow:0 0 0 1px rgba(0,0,0,.06);cursor:zoom-in}
.idn-img button{position:absolute;top:6px;left:calc(min(220px,100%) - 30px);width:24px;height:24px;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:rgba(0,0,0,.6);color:#fff;font-size:16px;line-height:1;cursor:pointer}
.idn-img span{font-size:12px;color:#a1a1aa}
.idn-chips{display:flex;flex-wrap:wrap;gap:8px}
.idn-chip{display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 15px;border:none;border-radius:999px;background:#f4f4f5;font:inherit;font-size:14px;font-weight:600;color:#3f3f46;cursor:pointer;transition:background .15s,color .15s,box-shadow .15s,opacity .15s,transform .1s}
.idn-chip:hover:not(:disabled){background:#ececef}
.idn-chip:active:not(:disabled){transform:scale(.97)}
.idn-chip.on{background:#fff;color:var(--ink);box-shadow:0 0 0 1.5px var(--ink)}
.idn-chip:disabled{opacity:.4;cursor:not-allowed}
.idn-switchrow{display:flex;align-items:center;gap:12px;width:100%;padding:12px 14px;border:none;border-radius:18px;background:#f7f7f8;font:inherit;text-align:left;cursor:pointer;transition:background .15s}
.idn-switchrow:hover{background:#f1f1f3}
.idn-switchrow-ic{width:36px;height:36px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:12px;background:#fff;color:#71717a;box-shadow:0 0 0 1px rgba(0,0,0,.05)}
.idn-switchrow.on .idn-switchrow-ic{color:var(--coral)}
.idn-switchrow-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.idn-switchrow-t b{font-size:14.5px;font-weight:650;color:var(--ink)}
.idn-switchrow-t small{font-size:12.5px;color:#8e8e93}
.idn-sw{position:relative;width:44px;height:26px;flex-shrink:0;border-radius:999px;background:#d4d4d8;transition:background .2s}
.idn-sw i{position:absolute;top:3px;left:3px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.22);transition:transform .22s cubic-bezier(.3,.9,.4,1.2)}
.idn-switchrow.on .idn-sw{background:var(--coral)}
.idn-switchrow.on .idn-sw i{transform:translateX(18px)}
.idn-switchrow:focus-visible{outline:none;box-shadow:0 0 0 2px var(--ink)}
.idn-attach{display:flex;flex-wrap:wrap;gap:8px}
.idn-att{display:inline-flex;align-items:center;max-width:100%;height:34px;padding:0 4px 0 0;border-radius:999px;font-size:13.5px;font-weight:600}
.idn-att .t{display:inline-flex;align-items:center;gap:6px;min-width:0;height:100%;padding:0 6px 0 13px;border:none;background:none;font:inherit;color:inherit;cursor:pointer}
.idn-att .t span{min-width:0;max-width:260px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.idn-att .rm{width:24px;height:24px;flex-shrink:0;border:none;border-radius:50%;background:rgba(255,255,255,.75);color:inherit;font-size:15px;line-height:1;cursor:pointer}
.idn-att .rm:hover{background:#fff}
.idn-att.blue{background:#e0f2fe;color:#0369a1}
.idn-att.green{background:#dcfce7;color:#15803d}
.idn-who{display:flex;align-items:center;gap:12px;padding:10px 10px 10px 12px;border-radius:18px;background:#f7f7f8}
.idn-av{width:38px;height:38px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;background:var(--coral);font-size:15px;font-weight:700;color:#fff}
.idn-who-t{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.idn-who-t b{font-size:15px;font-weight:650;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.idn-who-t small{font-size:12.5px;color:#8e8e93}
.idn-who .idn-pill{background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.07)}
.idn-namebox{display:flex;flex-direction:column;gap:8px}
.idn-namechips{display:flex;flex-wrap:wrap;gap:6px}
.idn-foot{display:flex;align-items:center;gap:8px;padding:12px 16px 14px 18px;box-shadow:0 -1px 0 rgba(0,0,0,.06)}
.idn-icon{width:40px;height:40px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;border:none;border-radius:50%;background:#f4f4f5;color:var(--ink);cursor:pointer;transition:background .15s}
.idn-icon:hover{background:#ececef}
.idn-foot-hint{font-size:12.5px;color:#a1a1aa;white-space:nowrap}
@media (max-width:420px){.idn-foot-hint{display:none}}
.idn-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 20px;border:none;border-radius:999px;background:#f4f4f5;font:inherit;font-size:14.5px;font-weight:650;color:var(--ink);cursor:pointer;transition:background .15s,opacity .15s,transform .1s}
.idn-btn:hover{background:#ececef}
.idn-btn:active:not(:disabled){transform:scale(.97)}
.idn-btn.go{padding:0 24px;background:var(--coral);color:#fff}
.idn-btn.go:hover{background:var(--coral);filter:brightness(1.05)}
.idn-btn:disabled{opacity:.45;cursor:not-allowed}
.idn-done{position:fixed;top:50%;left:50%;z-index:51;width:min(380px,calc(100vw - 32px));transform:translate(-50%,-50%);padding:34px 28px 30px;border-radius:28px;background:var(--card,#fff);text-align:center;box-shadow:0 24px 60px -12px rgba(16,24,40,.3);animation:idn-pop .35s cubic-bezier(.2,.9,.3,1.2)}
@keyframes idn-pop{from{transform:translate(-50%,-46%) scale(.94);opacity:0}}
.idn-done-ic{width:64px;height:64px;margin:0 auto 14px;display:flex;align-items:center;justify-content:center;border-radius:50%;background:#dcfce7;color:#16a34a}
.idn-done h2{margin:0 0 6px;font-family:var(--font-display),-apple-system,"SF Pro Display",sans-serif;font-size:26px;font-weight:700;letter-spacing:-.035em;color:var(--ink)}
.idn-done p{margin:0;font-size:14.5px;color:#71717a}
[data-theme="dark"] .idn,[data-theme="dark"] .idn-done{background:#18181b}
[data-theme="dark"] .idn-field,[data-theme="dark"] .idn-pill:not(.dark),[data-theme="dark"] .idn-chip,[data-theme="dark"] .idn-x,[data-theme="dark"] .idn-icon,[data-theme="dark"] .idn-btn:not(.go){background:#27272a}
[data-theme="dark"] .idn-switchrow,[data-theme="dark"] .idn-who{background:#222225}
[data-theme="dark"] .idn-switchrow-ic{background:#2e2e33}
[data-theme="dark"] .idn-field:focus,[data-theme="dark"] .idn-chip.on{background:#3f3f46}
`
