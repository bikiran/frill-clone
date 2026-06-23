'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'

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
  const [title, setTitle]               = useState('')
  const [description, setDescription]   = useState('')
  const [name, setName]                 = useState('')
  const [selectedTopics, setTopics]     = useState<string[]>([])
  const [loading, setLoading]           = useState(false)
  const [error, setError]               = useState('')
  const [authed, setAuthed]             = useState<boolean | null>(null)
  const [imageFile, setImageFile]       = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string>('')
  const [submitted, setSubmitted]       = useState(false)
  const [attachedPoll, setAttachedPoll] = useState<string | null>(null)
  const [attachedSurvey, setAttachedSurvey] = useState<string | null>(null)
  const [availablePolls, setAvailablePolls] = useState<any[]>([])
  const [availableSurveys, setAvailableSurveys] = useState<any[]>([])
  const [showPollPicker, setShowPollPicker] = useState(false)
  const [showSurveyPicker, setShowSurveyPicker] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setTimeout(() => titleRef.current?.focus(), 100)
    supabase.auth.getSession().then(({ data }) => {
      setAuthed(!!data.session)
      if (data.session?.user.email) setName(data.session.user.email.split('@')[0])
    })
    // Fetch available polls and surveys
    supabase.from('polls').select('*').then(({ data }) => {
      if (data) setAvailablePolls(data)
    })
    supabase.from('surveys').select('*').then(({ data }) => {
      if (data) setAvailableSurveys(data)
    })
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
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
      }).select().single()

    if (err || !idea) {
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
          </div>

          {imagePreview && (
            <div className="relative rounded-xl overflow-hidden">
              <img src={imagePreview} alt="Preview" className="w-full h-48 object-cover rounded-xl" />
              <button
                type="button"
                onClick={() => {
                  setImageFile(null)
                  setImagePreview('')
                }}
                className="absolute top-2 right-2 px-2 py-1 bg-red-500 text-white text-xs rounded-lg press-effect"
              >
                Remove
              </button>
            </div>
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

          {/* Attach Poll or Survey */}
          {(availablePolls.length > 0 || availableSurveys.length > 0) && (
            <div>
              <label className="block text-sm font-bold mb-2" style={{ color: 'var(--ink)' }}>
                Attach Poll or Survey (optional)
              </label>
              <div className="flex gap-2 flex-wrap">
                {/* Poll button */}
                {availablePolls.length > 0 && (
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
                      <div className="absolute top-full mt-1 left-0 z-10 w-72 bg-white border rounded-xl shadow-lg p-2 max-h-64 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
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
                      </div>
                    )}
                  </div>
                )}
                
                {/* Survey button */}
                {availableSurveys.length > 0 && (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => { setShowSurveyPicker(!showSurveyPicker); setShowPollPicker(false) }}
                      className="px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-1.5 transition-smooth cursor-pointer hover:bg-gray-50"
                      style={{ 
                        borderColor: attachedSurvey ? '#16a34a' : 'var(--border)',
                        background: attachedSurvey ? '#f0fdf4' : 'white',
                        color: attachedSurvey ? '#16a34a' : 'var(--slate)',
                      }}>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                      {attachedSurvey ? availableSurveys.find(s => s.id === attachedSurvey)?.title?.slice(0, 25) + '...' : '+ Add Survey'}
                      {attachedSurvey && (
                        <span onClick={(e) => { e.stopPropagation(); setAttachedSurvey(null) }} className="ml-1 hover:opacity-70">×</span>
                      )}
                    </button>
                    {showSurveyPicker && (
                      <div className="absolute top-full mt-1 left-0 z-10 w-72 bg-white border rounded-xl shadow-lg p-2 max-h-64 overflow-y-auto" style={{ borderColor: 'var(--border)' }}>
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
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-bold" style={{ color: 'var(--ink)' }}>
                Your name
              </label>
              {name && (
                <button type="button" onClick={() => setName('')}
                  className="text-xs font-medium press-effect"
                  style={{ color: 'var(--coral)' }}>
                  Change
                </button>
              )}
            </div>
            {name && (
              <div className="px-4 py-3 rounded-xl bg-gray-50 border mb-3 flex items-center justify-between"
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
            {!name && (
              <input type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Leave blank to post anonymously"
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
    </>
  )
}
