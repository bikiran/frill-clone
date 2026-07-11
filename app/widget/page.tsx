'use client'


import React, { useState, useEffect, useRef } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import ImageViewer from '@/components/ImageViewer'
import { getRelativeTime } from '@/lib/time-utils'

function WidgetContent() {
  const params = useSearchParams()
  const slug = params.get('slug') || ''

  const [tab, setTab] = useState<'feedback' | 'roadmap' | 'updates' | 'help' | 'chat'>('feedback')
  const [chatConvId, setChatConvId] = useState<string | null>(null)
  const [chatMessages2, setChatMessages2] = useState<any[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatSending, setChatSending] = useState(false)
  const [chatUploading, setChatUploading] = useState(false)
  const [copiedCoupon, setCopiedCoupon] = useState<string | null>(null)
  const [showSharedMedia, setShowSharedMedia] = useState(false)
  const [widgetReplyTo, setWidgetReplyTo] = useState<any>(null)
  const [widgetReactPicker, setWidgetReactPicker] = useState<number | null>(null)
  const WIDGET_EMOJIS = ['👍', '❤️', '😊', '🎉', '🙏', '😂']
  const chatFileRef = useRef<HTMLInputElement>(null)
  const [chatName, setChatName] = useState('')
  const [chatEmail, setChatEmail] = useState('')
  const [chatMobile, setChatMobile] = useState('')
  const [smsOptIn, setSmsOptIn] = useState(false)
  const [chatStep, setChatStep] = useState<'form' | 'chat'>('form')
  const [chatCreating, setChatCreating] = useState(false)
  const [chatCreateError, setChatCreateError] = useState('')
  const [selectedItem, setSelectedItem] = useState<{ type: 'idea' | 'announcement' | 'help'; id: string } | null>(null)
  const [company, setCompany] = useState<any>(null)
  const [widgetTabs, setWidgetTabs] = useState<any>(null)
  const [ideas, setIdeas] = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [forms, setForms] = useState<any[]>([])
  const [polls, setPolls] = useState<any[]>([])
  const [surveys, setSurveys] = useState<any[]>([])
  const [helpArticles, setHelpArticles] = useState<any[]>([])
  const [helpFeedbackVote, setHelpFeedbackVote] = useState<'up' | 'down' | null>(null)
  const [helpFeedbackNote, setHelpFeedbackNote] = useState('')
  const [helpFeedbackEmail, setHelpFeedbackEmail] = useState('')
  const [helpFeedbackDone, setHelpFeedbackDone] = useState(false)

  // Reset article feedback state whenever a different item opens
  useEffect(() => {
    setHelpFeedbackVote(null)
    setHelpFeedbackNote('')
    setHelpFeedbackEmail('')
    setHelpFeedbackDone(false)

    // Track the view for help-center analytics (previously only the standalone
    // /help page logged views — widget opens were never counted, so "Article
    // views" always showed 0 for widget traffic)
    if (selectedItem?.type === 'help' && company?.id) {
      ;(async () => {
        try {
          await (supabase as any).from('help_article_views').insert({
            article_id: selectedItem.id,
            company_id: company.id,
            source: 'widget',
          })
          // Keep the legacy counter column in sync too
          const article = helpArticles.find(a => a.id === selectedItem.id)
          if (article) {
            await (supabase as any).from('help_articles').update({ views: (article.views || 0) + 1 }).eq('id', selectedItem.id)
          }
        } catch {}
      })()
    }
  }, [selectedItem?.id])

  // Restore a saved chat session on load so a page reload doesn't lose the
  // conversation (previously the visitor had to re-enter name/email every time)
  useEffect(() => {
    if (!slug || typeof window === 'undefined') return
    try {
      const saved = localStorage.getItem(`colvy-chat-${slug}`)
      if (saved) {
        const parsed = JSON.parse(saved)
        if (parsed.convId && parsed.name) {
          setChatConvId(parsed.convId)
          setChatName(parsed.name)
          setChatEmail(parsed.email || '')
          setChatStep('chat')
          // Load existing messages for this conversation
          ;(async () => {
            const { data: msgs } = await (supabase as any)
              .from('messages').select('*')
              .eq('conversation_id', parsed.convId)
              .order('created_at', { ascending: true })
            if (msgs) setChatMessages2(msgs)
          })()
        }
      }
    } catch {}
  }, [slug])

  // Subscribe to agent replies on the active chat conversation
  useEffect(() => {
    if (!chatConvId) return
    // Load latest messages when a conversation becomes active (catches anything
    // sent while the subscription was reconnecting)
    ;(async () => {
      const { data: msgs } = await (supabase as any)
        .from('messages').select('*')
        .eq('conversation_id', chatConvId)
        .order('created_at', { ascending: true })
      if (msgs && msgs.length > 0) setChatMessages2(msgs)
    })()

    const ch = supabase.channel(`widget-chat-${chatConvId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${chatConvId}` }, (payload: any) => {
        const msg = payload.new
        // Dedupe: skip if we already have this message id (optimistic visitor sends)
        setChatMessages2(prev => {
          if (prev.some((m: any) => m.id === msg.id)) return prev
          // Skip visitor messages without an id match only if content+time matches an optimistic one
          if (msg.sender_type === 'visitor') {
            const dupe = prev.some((m: any) => !m.id && m.content === msg.content && m.sender_type === 'visitor')
            if (dupe) return prev.map((m: any) => (!m.id && m.content === msg.content && m.sender_type === 'visitor') ? msg : m)
          }
          return [...prev, msg]
        })
      })
      .subscribe()

    // Polling fallback — refresh messages every 4s in case realtime isn't
    // enabled on the table, so agent replies show without a manual reload
    const poll = setInterval(async () => {
      const { data: msgs } = await (supabase as any)
        .from('messages').select('*')
        .eq('conversation_id', chatConvId)
        .order('created_at', { ascending: true })
      if (msgs) setChatMessages2(prev => msgs.length !== prev.length ? msgs : prev)
    }, 4000)

    return () => { supabase.removeChannel(ch); clearInterval(poll) }
  }, [chatConvId])
  const [feedback, setFeedback] = useState('')
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [attachments, setAttachments] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [chatStarted, setChatStarted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedFeedback, setExpandedFeedback] = useState(false)
  const [captureInProgress, setCaptureInProgress] = useState(false)
  const [showImageViewer, setShowImageViewer] = useState(false)
  const [viewerImage, setViewerImage] = useState('')
  // Annotation is only allowed for images still being composed (not yet posted)
  const [viewerAllowAnnotate, setViewerAllowAnnotate] = useState(false)
  const [viewerAttachmentIdx, setViewerAttachmentIdx] = useState<number | null>(null)
  const [animatingVotes, setAnimatingVotes] = useState<Set<string>>(new Set())
  const [helpSearch, setHelpSearch] = useState('')
  const [helpCategory, setHelpCategory] = useState<string | null>(null)
  const [aiLoading, setAiLoading] = useState<string | null>(null)
  const [aiError, setAiError] = useState('')

  const accentColor = company?.accent_color || '#ff7a6b'

  useEffect(() => {
    if (!slug) { setLoading(false); return }
    ;(async () => {
      console.log('[WIDGET FETCH] Fetching data for slug:', slug)
      const res = await fetch(`/api/widget-data?slug=${slug}`)
      if (res.ok) {
        const data = await res.json()
        console.log('[WIDGET FETCH] Received data:', {
          company: data.company?.id,
          ideas: data.ideas?.length || 0,
          announcements: data.announcements?.length || 0,
          forms: data.forms?.length || 0,
          helpArticles: data.helpArticles?.length || 0,
        })
        console.log('[WIDGET FETCH] Full announcements array:', data.announcements)
        console.log('[WIDGET FETCH] Full help articles array:', data.helpArticles)
        
        setCompany(data.company)
        setWidgetTabs(data.widgetTabs || null)
        // Open on the FIRST tab in the configured order (respects Chat-first, etc).
        if (data.widgetTabs) {
          const wt = data.widgetTabs
          const labelToKey: Record<string, string> = { 'Chat': 'chat', 'Feedback': 'feedback', 'Ideas': 'feedback', 'Roadmap': 'roadmap', 'Updates': 'updates', 'Knowledge Base': 'help', 'Help Centre': 'help', 'Help': 'help' }
          const allKeys = ['feedback', 'roadmap', 'updates', 'help', 'chat']
          let ordered = allKeys
          if (Array.isArray(wt.order)) ordered = Array.from(new Set([...wt.order.map((l: string) => labelToKey[l]).filter(Boolean), ...allKeys]))
          const firstVisible = ordered.find(k => wt[k] !== false)
          if (firstVisible) setTab(firstVisible as any)
        }
        setIdeas(data.ideas || [])
        setAnnouncements(data.announcements || [])
        setForms(data.forms || [])
        setPolls(data.polls || [])
        setSurveys(data.surveys || [])
        setHelpArticles(data.helpArticles || [])
      } else {
        console.error('[WIDGET FETCH] API error:', res.status)
      }
      setLoading(false)
      // Track analytics
      trackWidgetView(slug)
    })()
  }, [slug])

  // Refetch data periodically to ensure ideas, announcements, and help persist
  useEffect(() => {
    if (!slug) return
    
    const interval = setInterval(() => {
      ;(async () => {
        console.log('[WIDGET REFETCH] Periodic refetch for slug:', slug)
        const res = await fetch(`/api/widget-data?slug=${slug}`)
        if (res.ok) {
          const data = await res.json()
          console.log('[WIDGET REFETCH] Got ideas:', data.ideas?.length, 'announcements:', data.announcements?.length, 'help articles:', data.helpArticles?.length)
          setIdeas(data.ideas || [])
          setAnnouncements(data.announcements || [])
          setHelpArticles(data.helpArticles || [])
        }
      })()
    }, 5000) // Refetch every 5 seconds
    
    return () => clearInterval(interval)
  }, [slug])

  // Real-time subscriptions for announcements and help articles
  useEffect(() => {
    if (!company?.id) return

    console.log('[WIDGET] Setting up real-time subscriptions for company:', company.id)

    const annChannel = supabase
      .channel(`announcements-${company.id}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'announcements', 
          filter: `company_id=eq.${company.id}` 
        }, 
        (payload) => {
          console.log('[WIDGET] Announcement changed:', payload)
          if (payload.eventType === 'DELETE') {
            setAnnouncements(prev => prev.filter(a => a.id !== payload.old.id))
          } else {
            setAnnouncements(prev => {
              const exists = prev.find(a => a.id === payload.new.id)
              if (exists) return prev.map(a => a.id === payload.new.id ? payload.new : a)
              return [payload.new, ...prev]
            })
          }
        }
      )
      .subscribe()

    const helpChannel = supabase
      .channel(`help-articles-${company.id}`)
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'help_articles', 
          filter: `company_id=eq.${company.id}` 
        }, 
        (payload) => {
          console.log('[WIDGET] Help article changed:', payload)
          if (payload.eventType === 'DELETE') {
            setHelpArticles(prev => prev.filter(a => a.id !== payload.old.id))
          } else {
            setHelpArticles(prev => {
              const exists = prev.find(a => a.id === payload.new.id)
              if (exists) return prev.map(a => a.id === payload.new.id ? payload.new : a)
              return [payload.new, ...prev]
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(annChannel)
      supabase.removeChannel(helpChannel)
    }
  }, [company?.id])

  const trackWidgetView = async (slug: string) => {
    try {
      await fetch('/api/widget-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, event: 'view', tab }),
      })
    } catch {}
  }

  const captureScreenshot = async () => {
    if (captureInProgress) return
    setCaptureInProgress(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const canvas = await html2canvas(document.body, {
        allowTaint: true,
        useCORS: true,
        backgroundColor: '#ffffff',
      })
      const image = canvas.toDataURL('image/png')
      setAttachments(prev => [...prev, image])
    } catch (error) {
      console.error('Screenshot failed:', error)
    } finally {
      setCaptureInProgress(false)
    }
  }

  const enhanceFeedback = async (task: 'improve_writing' | 'fix_formatting') => {
    if (!feedback.trim()) return
    
    setAiLoading(task === 'improve_writing' ? 'improve' : 'fix')
    setAiError('')
    
    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          task,
          text: feedback,
          tone: 'professional'
        })
      })
      
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error || 'AI service error')
      }
      
      const data = await res.json()
      if (typeof data.result === 'string') {
        setFeedback(data.result)
      }
    } catch (err: any) {
      setAiError(err.message || 'Failed to enhance text')
    } finally {
      setAiLoading(null)
    }
  }

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files
    if (!files) return
    Array.from(files).forEach(file => {
      const reader = new FileReader()
      reader.onload = (evt) => {
        if (evt.target?.result) {
          setAttachments(prev => [...prev, evt.target!.result as string])
        }
      }
      reader.readAsDataURL(file)
    })
  }

  const widgetReact = async (msg: any, emoji: string) => {
    if (!msg.id) return
    const reactions = Array.isArray(msg.reactions) ? msg.reactions : []
    const existing = reactions.findIndex((r: any) => r.emoji === emoji && r.by === 'visitor')
    let updated
    if (existing >= 0) updated = reactions.filter((_: any, i: number) => i !== existing)
    else updated = [...reactions, { emoji, by: 'visitor', at: new Date().toISOString() }]
    setChatMessages2(prev => prev.map((m: any) => m.id === msg.id ? { ...m, reactions: updated } : m))
    setWidgetReactPicker(null)
    try { await (supabase as any).from('messages').update({ reactions: updated }).eq('id', msg.id) } catch {}
  }

  const uploadChatFile = async (file: File | undefined) => {
    if (!file || !chatConvId || !company?.id) return
    setChatUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('companyId', company.id)
      fd.append('conversationId', chatConvId)
      const res = await fetch('/api/inbox/upload', { method: 'POST', body: fd })
      const data = await res.json()
      if (!res.ok) { alert('Attachment failed: ' + (data.error || 'upload error')); setChatUploading(false); return }
      const att = { url: data.url, name: data.name, type: data.type, kind: data.kind }
      const newMsg: any = { sender_type: 'visitor', sender_name: chatName, content: data.kind === 'file' ? `📎 ${data.name}` : '', attachments: [att], created_at: new Date().toISOString() }
      setChatMessages2(prev => [...prev, newMsg])
      await (supabase as any).from('messages').insert({
        conversation_id: chatConvId, company_id: company.id, sender_type: 'visitor',
        sender_name: chatName, sender_email: chatEmail || null,
        content: newMsg.content, attachments: [att],
      })
      await (supabase as any).from('conversations').update({ last_message: '📎 Attachment', last_message_at: new Date().toISOString(), is_unread: true, unread_count: 1, updated_at: new Date().toISOString() }).eq('id', chatConvId)
    } catch (e: any) { alert('Attachment failed: ' + e.message) }
    setChatUploading(false)
  }

  const submitFeedback = async () => {
    if (!feedback.trim() && attachments.length === 0) return
    setSubmitting(true)
    try {
      // Generate anonymous name
      const adjectives = ['Happy', 'Clever', 'Brave', 'Swift', 'Wise', 'Calm', 'Bold', 'Keen', 'Kind', 'Bright']
      const nouns = ['Penguin', 'Phoenix', 'Dragon', 'Tiger', 'Eagle', 'Wolf', 'Fox', 'Panda', 'Otter', 'Hawk']
      const randomAdj = adjectives[Math.floor(Math.random() * adjectives.length)]
      const randomNoun = nouns[Math.floor(Math.random() * nouns.length)]
      const anonymousName = `${randomAdj} ${randomNoun}`

      await fetch('/api/widget-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, title: feedback.trim(), attachments, user_name: anonymousName }),
      })
      
      // Refetch ideas to show the newly submitted idea with correct timestamp
      const res = await fetch(`/api/widget-data?slug=${slug}`)
      if (res.ok) {
        const data = await res.json()
        setIdeas(data.ideas || [])
        console.log('[WIDGET] Refetched ideas after submission:', data.ideas?.length)
      }
      
      // Track analytics
      trackWidgetEvent('submit_feedback')
      setSubmitted(true)
      setFeedback('')
      setAttachments([])
      setTimeout(() => setSubmitted(false), 3000)
    } catch {}
    setSubmitting(false)
  }

  const trackWidgetEvent = async (event: string) => {
    try {
      await fetch('/api/widget-analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, event, tab }),
      })
    } catch {}
  }

  const trending = ideas.filter(i => !i.status || i.status === 'new' || i.status === 'planned').slice(0, 4)
  const inProgress = ideas.filter(i => i.status === 'in_progress').slice(0, 3)
  const allIdeas = ideas.slice(0, 50)  // Show all ideas up to 50

  const boardUrl = `https://${slug}.colvy.com`

  // Computed help article variables
  const allHelpCategories = Array.from(new Set(helpArticles.map(a => a.category).filter(Boolean)))
  const filteredHelpArticles = helpArticles.filter(a => {
    const q = helpSearch.toLowerCase()
    const matchSearch = !helpSearch || a.title?.toLowerCase().includes(q) || a.content?.toLowerCase().includes(q)
    const matchCat = !helpCategory || a.category === helpCategory
    return matchSearch && matchCat
  })

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <div style={{ width: 24, height: 24, border: `2px solid #f0f0f0`, borderTopColor: '#ff7a6b', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  )

  // Detail view rendering
  if (selectedItem) {
    const item = selectedItem.type === 'idea' 
      ? ideas.find(i => i.id === selectedItem.id)
      : selectedItem.type === 'announcement'
      ? announcements.find(a => a.id === selectedItem.id)
      : helpArticles.find(h => h.id === selectedItem.id)

    return (
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', height: '100vh', width: '100vw', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden', boxSizing: 'border-box', position: 'fixed', top: 0, left: 0, margin: 0, padding: 0 }}>
        <div style={{ padding: 'clamp(10px, 3vw, 14px) clamp(12px, 3vw, 16px)', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0, width: '100%', boxSizing: 'border-box' }}>
          <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 0, color: 'var(--slate)', fontWeight: 700 }}>←</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Back</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(8px, 3vw, 16px)', width: '100%', boxSizing: 'border-box' }}>
          {item && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>{item.title}</h2>
              {selectedItem.type === 'idea' && (
                <>
                  {/* Meta info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: 'var(--slate)' }}>
                    <span>{item.created_by_name || 'Anonymous'}</span>
                    <span>•</span>
                    <span>{item.created_at ? getRelativeTime(item.created_at) : 'just now'}</span>
                    {item.is_private && (
                      <>
                        <span>•</span>
                        <span>🔒 Private</span>
                      </>
                    )}
                  </div>

                  {/* Full description with images */}
                  <div style={{ marginBottom: 16 }}>
                    <p style={{ color: 'var(--ink)', lineHeight: 1.6, marginBottom: 12, fontSize: 13, whiteSpace: 'pre-wrap' }}>{item.description}</p>
                    
                    {/* Display attachments (uploaded images) */}
                    {item.attachments && item.attachments.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                        {item.attachments.map((img: string, i: number) => (
                          <div key={i} style={{ position: 'relative' }}>
                            <img
                              src={img}
                              alt={`Attachment ${i + 1}`}
                              onClick={() => {
                                setViewerImage(img)
                                setShowImageViewer(true)
                              }}
                              style={{
                                maxWidth: '100%',
                                maxHeight: 200,
                                borderRadius: 8,
                                cursor: 'pointer',
                                border: '1px solid var(--border)',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                                e.currentTarget.style.transform = 'scale(1.02)'
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.boxShadow = 'none'
                                e.currentTarget.style.transform = 'scale(1)'
                              }}
                            />
                            <span style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Click to expand</span>
                          </div>
                        ))}
                      </div>
                    )}
                    
                    {/* Parse and display images in description */}
                    {item.description && item.description.includes('http') && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
                        {item.description.split(/\s/).map((part, i) => {
                          if (part.startsWith('http') && /\.(jpg|jpeg|png|gif|webp)$/i.test(part)) {
                            return (
                              <div key={i} style={{ position: 'relative' }}>
                                <img
                                  src={part}
                                  alt="Screenshot"
                                  onClick={() => {
                                    setViewerImage(part)
                                    setShowImageViewer(true)
                                  }}
                                  style={{
                                    maxWidth: '100%',
                                    maxHeight: 200,
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    border: '1px solid var(--border)',
                                    transition: 'all 0.2s',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                                    e.currentTarget.style.transform = 'scale(1.02)'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.boxShadow = 'none'
                                    e.currentTarget.style.transform = 'scale(1)'
                                  }}
                                />
                                <span style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Click to expand</span>
                              </div>
                            )
                          }
                          return null
                        })}
                      </div>
                    )}
                  </div>

                  {/* Voting and status */}
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start', marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                    {/* Vote button - matches main page with animation */}
                    <button
                      onClick={() => {
                        console.log('[WIDGET] Upvote clicked:', item.id)
                        setAnimatingVotes(prev => new Set(prev).add(item.id))
                        setIdeas(prev => prev.map(i => 
                          i.id === item.id ? { ...i, votes: (i.votes || 0) + 1 } : i
                        ))
                        setTimeout(() => {
                          setAnimatingVotes(prev => {
                            const newSet = new Set(prev)
                            newSet.delete(item.id)
                            return newSet
                          })
                        }, 500)
                      }}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 4,
                        padding: '12px 16px',
                        borderRadius: 12,
                        background: 'var(--canvas)',
                        color: 'var(--slate)',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        minWidth: 60,
                        transition: 'all 0.2s',
                        fontSize: 12,
                        fontWeight: 600,
                        position: 'relative',
                        animation: animatingVotes.has(item.id) ? 'voteBounce 0.5s cubic-bezier(0.34, 1.56, 0.64, 1)' : 'none',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = '#f0f0f0'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'var(--canvas)'
                      }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="18 15 12 9 6 15" />
                      </svg>
                      <span style={{ fontSize: 13, fontWeight: 700 }}>{item.votes || 0}</span>
                      {animatingVotes.has(item.id) && (
                        <div style={{
                          position: 'absolute',
                          width: '100%',
                          height: '100%',
                          borderRadius: 12,
                          animation: 'voteRipple 0.6s ease-out',
                        }} />
                      )}
                    </button>

                    {/* Status badge */}
                    <span style={{ padding: '12px 16px', background: 'var(--canvas)', color: 'var(--slate)', borderRadius: 12, fontSize: 12, fontWeight: 600, border: '1px solid var(--border)' }}>
                      {item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : 'Submitted'}
                    </span>
                  </div>

                  {/* Reactions, Copy Link, Subscribe */}
                  <div style={{ display: 'flex', gap: 8, marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                    {/* Reactions */}
                    <button
                      onClick={() => alert('Reactions coming soon!')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--canvas)',
                        color: 'var(--slate)',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--canvas)')}>
                      😊 React
                    </button>

                    {/* Copy Link */}
                    <button
                      onClick={() => {
                        const url = `${boardUrl}?idea=${item.id}`
                        navigator.clipboard.writeText(url)
                        alert('Link copied to clipboard!')
                      }}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--canvas)',
                        color: 'var(--slate)',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--canvas)')}>
                      🔗 Copy Link
                    </button>

                    {/* Subscribe */}
                    <button
                      onClick={() => alert('Subscribe to get notifications!')}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '8px 12px',
                        borderRadius: 8,
                        background: 'var(--canvas)',
                        color: 'var(--slate)',
                        border: '1px solid var(--border)',
                        cursor: 'pointer',
                        fontSize: 12,
                        fontWeight: 500,
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => (e.currentTarget.style.background = '#f0f0f0')}
                      onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--canvas)')}>
                      🔔 Subscribe
                    </button>
                  </div>

                  {/* Comments section */}
                  <div style={{ marginTop: 16 }}>
                    <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>💬 Comments</p>
                    <div style={{ padding: 12, background: 'var(--canvas)', borderRadius: 8, textAlign: 'center', color: 'var(--slate)', fontSize: 12 }}>
                      Be the first to comment on this Idea
                    </div>
                  </div>
                </>
              )}
              {selectedItem.type === 'announcement' && (
                <>
                  <p style={{ fontSize: 11, color: 'var(--slate)', marginBottom: 12 }}>{item.created_at ? new Date(item.created_at).toLocaleDateString() : 'Today'}</p>
                  <div style={{ color: 'var(--ink)', lineHeight: 1.6, fontSize: 13 }}>
                    {item.description}
                    {/* Parse and display images in description */}
                    {item.description && item.description.includes('http') && (
                      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {/* Extract image URLs from description */}
                        {item.description.split(/\s/).map((part, i) => {
                          if (part.startsWith('http') && /\.(jpg|jpeg|png|gif|webp)$/i.test(part)) {
                            return (
                              <img
                                key={i}
                                src={part}
                                alt="Screenshot"
                                onClick={() => {
                                  setViewerImage(part)
                                  setShowImageViewer(true)
                                }}
                                style={{
                                  maxWidth: '100%',
                                  maxHeight: 200,
                                  borderRadius: 8,
                                  cursor: 'pointer',
                                  border: '1px solid var(--border)',
                                  transition: 'all 0.2s',
                                }}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                                  e.currentTarget.style.transform = 'scale(1.02)'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.boxShadow = 'none'
                                  e.currentTarget.style.transform = 'scale(1)'
                                }}
                              />
                            )
                          }
                          return null
                        })}
                      </div>
                    )}
                  </div>
                </>
              )}
              {selectedItem.type === 'help' && (
                <>
                  {/* Article Content */}
                  <div style={{ marginBottom: 24 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 12, lineHeight: 1.3 }}>{item.title}</h2>
                    
                    {item.category && (
                      <div style={{ marginBottom: 12 }}>
                        <span style={{ fontSize: 11, fontWeight: 600, padding: '4px 8px', borderRadius: 4, background: accentColor + '15', color: accentColor, textTransform: 'capitalize' }}>
                          {item.category}
                        </span>
                      </div>
                    )}

                    <div style={{ color: 'var(--ink)', lineHeight: 1.7, fontSize: 13, marginBottom: 12 }}>
                      {(() => {
                        // Lightweight markdown rendering: headings, bold, inline code, code blocks, lists
                        const lines = (item.content || '').split('\n')
                        const out: any[] = []
                        let inCode = false
                        let codeBuf: string[] = []
                        const inline = (t: string) => {
                          const parts = t.split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
                          return parts.map((p, pi) => {
                            if (p.startsWith('**') && p.endsWith('**')) return <strong key={pi}>{p.slice(2, -2)}</strong>
                            if (p.startsWith('`') && p.endsWith('`')) return <code key={pi} style={{ background: 'var(--canvas)', padding: '1px 5px', borderRadius: 4, fontSize: 12, fontFamily: 'ui-monospace, monospace' }}>{p.slice(1, -1)}</code>
                            return p
                          })
                        }
                        lines.forEach((line, i) => {
                          if (line.trim().startsWith('```')) {
                            if (inCode) {
                              out.push(<pre key={`c${i}`} style={{ background: '#1c1c1e', color: '#e5e5e5', padding: '12px 14px', borderRadius: 10, fontSize: 12, overflowX: 'auto', margin: '0 0 12px 0', fontFamily: 'ui-monospace, monospace', lineHeight: 1.6 }}>{codeBuf.join('\n')}</pre>)
                              codeBuf = []
                            }
                            inCode = !inCode
                            return
                          }
                          if (inCode) { codeBuf.push(line); return }
                          const t = line.trim()
                          if (!t) return
                          if (t.startsWith('### ')) out.push(<h4 key={i} style={{ fontSize: 13.5, fontWeight: 700, margin: '16px 0 8px 0' }}>{t.slice(4)}</h4>)
                          else if (t.startsWith('## ')) out.push(<h3 key={i} style={{ fontSize: 14.5, fontWeight: 700, margin: '18px 0 8px 0' }}>{t.slice(3)}</h3>)
                          else if (t.startsWith('# ')) out.push(<h2 key={i} style={{ fontSize: 15.5, fontWeight: 800, margin: '18px 0 10px 0' }}>{t.slice(2)}</h2>)
                          else if (/^[-*] /.test(t)) out.push(<div key={i} style={{ display: 'flex', gap: 8, margin: '0 0 6px 0' }}><span style={{ color: accentColor }}>•</span><span style={{ flex: 1 }}>{inline(t.slice(2))}</span></div>)
                          else if (/^\d+\. /.test(t)) out.push(<div key={i} style={{ display: 'flex', gap: 8, margin: '0 0 6px 0' }}><span style={{ color: accentColor, fontWeight: 700 }}>{t.match(/^\d+/)?.[0]}.</span><span style={{ flex: 1 }}>{inline(t.replace(/^\d+\. /, ''))}</span></div>)
                          else if (t === '---') out.push(<div key={i} style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />)
                          else out.push(<p key={i} style={{ margin: '0 0 12px 0', wordBreak: 'break-word' }}>{inline(t)}</p>)
                        })
                        return out
                      })()}
                    </div>
                    
                    {/* Parse and display images in content */}
                    {item.content && item.content.includes('http') && (
                      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {item.content.split(/\s/).map((part, i) => {
                          if (part.startsWith('http') && /\.(jpg|jpeg|png|gif|webp)$/i.test(part)) {
                            return (
                              <div key={i} style={{ position: 'relative' }}>
                                <img
                                  src={part}
                                  alt="Article image"
                                  onClick={() => {
                                    setViewerImage(part)
                                    setShowImageViewer(true)
                                  }}
                                  style={{
                                    maxWidth: '100%',
                                    maxHeight: 200,
                                    borderRadius: 8,
                                    cursor: 'pointer',
                                    border: '1px solid var(--border)',
                                    transition: 'all 0.2s',
                                  }}
                                  onMouseEnter={(e) => {
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
                                    e.currentTarget.style.transform = 'scale(1.02)'
                                  }}
                                  onMouseLeave={(e) => {
                                    e.currentTarget.style.boxShadow = 'none'
                                    e.currentTarget.style.transform = 'scale(1)'
                                  }}
                                />
                                <span style={{ position: 'absolute', top: 4, right: 4, background: 'rgba(0,0,0,0.6)', color: '#fff', padding: '4px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600 }}>Click to expand</span>
                              </div>
                            )
                          }
                          return null
                        })}
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />

                  {/* Helpful Feedback — same design as the help center */}
                  <div style={{ marginBottom: 20 }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                      <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--slate)' }}>Was this helpful?</span>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          type="button"
                          onClick={async () => {
                            if (helpFeedbackVote) return
                            setHelpFeedbackVote('up')
                            trackWidgetEvent('help_feedback_yes')
                            try {
                              if (item.company_id || company?.id) {
                                await (supabase as any).from('help_article_feedback').insert({
                                  article_id: item.id, company_id: item.company_id || company.id, helpful: true,
                                })
                              }
                            } catch {}
                          }}
                          style={{
                            width: 42, height: 38, borderRadius: 10, cursor: helpFeedbackVote ? 'default' : 'pointer',
                            border: helpFeedbackVote === 'up' ? '1.5px solid #86b34d' : '1.5px solid #e5e5e5',
                            background: helpFeedbackVote === 'up' ? 'linear-gradient(135deg, #f2f8e8, #e5f2d3)' : '#fff',
                            boxShadow: helpFeedbackVote === 'up' ? '0 0 0 3px rgba(134,179,77,0.12)' : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            transform: helpFeedbackVote === 'up' ? 'scale(1.06)' : 'scale(1)',
                          }}>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill={helpFeedbackVote === 'up' ? '#6f9c3d' : 'none'} stroke={helpFeedbackVote === 'up' ? '#4d6e28' : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"/>
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (helpFeedbackVote) return
                            setHelpFeedbackVote('down')
                            trackWidgetEvent('help_feedback_no')
                          }}
                          style={{
                            width: 42, height: 38, borderRadius: 10, cursor: helpFeedbackVote ? 'default' : 'pointer',
                            border: helpFeedbackVote === 'down' ? '1.5px solid #d97706' : '1.5px solid #e5e5e5',
                            background: helpFeedbackVote === 'down' ? 'linear-gradient(135deg, #fdf3e7, #fae5cc)' : '#fff',
                            boxShadow: helpFeedbackVote === 'down' ? '0 0 0 3px rgba(217,119,6,0.12)' : 'none',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            transition: 'all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
                            transform: helpFeedbackVote === 'down' ? 'scale(1.06)' : 'scale(1)',
                          }}>
                          <svg width="17" height="17" viewBox="0 0 24 24" fill={helpFeedbackVote === 'down' ? '#c2701e' : 'none'} stroke={helpFeedbackVote === 'down' ? '#8a4f13' : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 15v4a3 3 0 0 0 3 3l4-9V2H5.72a2 2 0 0 0-2 1.7l-1.38 9a2 2 0 0 0 2 2.3zm7 7h2.67A2.31 2.31 0 0 0 22 20v-7a2.31 2.31 0 0 0-2.33-2H17"/>
                          </svg>
                        </button>
                      </div>
                    </div>

                    {helpFeedbackVote === 'up' && (
                      <div style={{ marginTop: 12, padding: '11px 14px', borderRadius: 10, background: 'linear-gradient(135deg, #f2f8e8, #eaf4dc)', display: 'flex', alignItems: 'center', gap: 9 }}>
                        <span style={{ width: 20, height: 20, borderRadius: '50%', border: '1.6px solid #6f9c3d', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#4d6e28" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                        </span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: '#4d6e28' }}>Thank you for your feedback!</span>
                      </div>
                    )}

                    {helpFeedbackVote === 'down' && !helpFeedbackDone && (
                      <div style={{ marginTop: 12 }}>
                        <textarea value={helpFeedbackNote} onChange={e => setHelpFeedbackNote(e.target.value)}
                          placeholder="How can we improve?"
                          rows={3}
                          style={{ width: '100%', padding: '11px 13px', borderRadius: 12, border: 'none', background: '#f5f5f5', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit' }} />
                        <input value={helpFeedbackEmail} onChange={e => setHelpFeedbackEmail(e.target.value)}
                          type="email" placeholder="Your email (optional)"
                          style={{ width: '100%', padding: '11px 13px', borderRadius: 12, border: 'none', background: '#f5f5f5', fontSize: 13, outline: 'none', boxSizing: 'border-box', marginBottom: 10 }} />
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <button type="button"
                            onClick={async () => {
                              try {
                                if (item.company_id || company?.id) {
                                  await (supabase as any).from('help_article_feedback').insert({
                                    article_id: item.id, company_id: item.company_id || company.id, helpful: false,
                                    comment: helpFeedbackNote.trim() ? `${helpFeedbackNote.trim()}${helpFeedbackEmail ? ` — ${helpFeedbackEmail}` : ''}` : null,
                                  })
                                }
                              } catch {}
                              setHelpFeedbackDone(true)
                            }}
                            style={{ padding: '10px 20px', borderRadius: 12, border: '1px solid #e5e5e5', background: '#fff', fontSize: 13, fontWeight: 600, color: 'var(--ink)', cursor: 'pointer' }}>
                            Submit Feedback
                          </button>
                        </div>
                      </div>
                    )}

                    {helpFeedbackVote === 'down' && helpFeedbackDone && (
                      <div style={{ marginTop: 12, padding: '11px 14px', borderRadius: 10, background: accentColor + '15', display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: accentColor }}>Thanks — we'll use this to improve the article.</span>
                      </div>
                    )}
                  </div>

                  {/* Divider */}
                  <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />

                  {/* Still Need Help Section */}
                  <div style={{ marginBottom: 20 }}>
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>Still need help?</h3>
                    <p style={{ fontSize: 12, color: 'var(--slate)', margin: '0 0 12px 0' }}>Submit a support ticket and we'll get back to you.</p>
                    <button
                      onClick={() => trackWidgetEvent('help_open_ticket')}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        borderRadius: 8,
                        border: `1.5px solid ${accentColor}`,
                        background: accentColor,
                        cursor: 'pointer',
                        fontSize: 13,
                        fontWeight: 600,
                        color: '#fff',
                        transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '0.9'
                        e.currentTarget.style.transform = 'translateY(-1px)'
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '1'
                        e.currentTarget.style.transform = 'translateY(0)'
                      }}>
                      Open Ticket
                    </button>
                  </div>

                  {/* Related Articles Section */}
                  {helpArticles.filter(a => a.id !== item.id && a.category === item.category).length > 0 && (
                    <>
                      <div style={{ height: 1, background: 'var(--border)', margin: '20px 0' }} />
                      <div>
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: 'var(--ink)', marginBottom: 12 }}>Related Articles</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                          {helpArticles.filter(a => a.id !== item.id && a.category === item.category).slice(0, 3).map(article => (
                            <div
                              key={article.id}
                              onClick={() => setSelectedItem({ type: 'help', id: article.id })}
                              style={{
                                padding: '10px 12px',
                                borderRadius: 8,
                                border: '1px solid var(--border)',
                                background: '#fff',
                                cursor: 'pointer',
                                transition: 'all 0.2s',
                              }}
                              onMouseEnter={(e) => {
                                e.currentTarget.style.background = 'var(--canvas)'
                                e.currentTarget.style.borderColor = accentColor
                              }}
                              onMouseLeave={(e) => {
                                e.currentTarget.style.background = '#fff'
                                e.currentTarget.style.borderColor = 'var(--border)'
                              }}>
                              <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--ink)', margin: '0 0 4px 0' }}>{article.title}</p>
                              <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--slate)' }}>{article.category}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ 
      fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', 
      height: '100%', 
      maxHeight: '100vh',
      width: '100%',
      maxWidth: '100vw',
      display: 'flex', 
      flexDirection: 'column', 
      background: '#fff', 
      overflow: 'hidden',
      boxSizing: 'border-box',
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      margin: 0,
      padding: 0,
    }}>
      {/* Image Viewer */}
      {showImageViewer && (
        <ImageViewer
          imageSrc={viewerImage}
          onClose={() => { setShowImageViewer(false); setViewerAllowAnnotate(false); setViewerAttachmentIdx(null) }}
          allowAnnotate={viewerAllowAnnotate}
          onAnnotationSave={(dataUrl) => {
            if (viewerAttachmentIdx !== null) {
              setAttachments(prev => prev.map((img, i) => i === viewerAttachmentIdx ? dataUrl : img))
            }
            setViewerAllowAnnotate(false)
            setViewerAttachmentIdx(null)
          }}
        />
      )}

      <style>{`
        html, body { 
          width: 100%; 
          height: 100%;
          max-height: 100%;
          margin: 0; 
          padding: 0; 
          overflow: hidden;
          box-sizing: border-box;
          -webkit-overflow-scrolling: touch;
          overscroll-behavior: none;
          touch-action: pan-y;
        }
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 3px; } ::-webkit-scrollbar-thumb { background: #e5e5e5; border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        @keyframes voteBounce { 0% { transform: scale(1); } 40% { transform: scale(1.3) translateY(-4px); } 70% { transform: scale(0.95); } 100% { transform: scale(1); } }
        @keyframes voteRipple { 0% { box-shadow: 0 0 0 0 rgba(255, 122, 107, 0.4); } 100% { box-shadow: 0 0 0 20px rgba(255, 122, 107, 0); } }
        .item-row { cursor: pointer; border-radius: 10px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; transition: background 0.15s; width: 100%; box-sizing: border-box; }
        .item-row:hover, .item-row:active { background: #f5f5f5; }
        .vote-pill { display: flex; align-items: center; gap: 4px; min-width: 32px; flex-shrink: 0; }
        input[type="text"], input[type="email"], input[type="number"], textarea, select { 
          width: 100%; 
          box-sizing: border-box; 
          max-width: 100%;
          font-size: 16px !important;
        }
        /* Mobile: prevent the widget going off-screen */
        @media (max-width: 480px) {
          html, body { 
            position: fixed; 
            width: 100%;
            height: 100%;
          }
          .item-row { padding: 10px; gap: 8px; }
        }
      `}</style>

      {/* Top Header — company logo + name + board link */}
      <div style={{ padding: '10px 14px 10px', flexShrink: 0, background: '#fff', borderBottom: '1px solid #f0f0f0', width: '100%', boxSizing: 'border-box' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company.name} style={{ width: 28, height: 28, borderRadius: 7, objectFit: 'cover', flexShrink: 0 }} />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 7, background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 13, fontWeight: 800, flexShrink: 0 }}>
              {(company?.name || slug)[0]?.toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0d0d0d', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company?.name || slug}</span>
          <a
            href={`${boardUrl}?utm_source=widget&utm_medium=colvy_widget&utm_campaign=${encodeURIComponent(slug)}`}
            target="_blank" rel="noopener"
            style={{ fontSize: 11, color: '#9ca3af', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0, padding: '4px 8px', borderRadius: 6, border: '1px solid #e5e5e5' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Board
          </a>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'clamp(8px, 3vw, 14px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)', width: '100%', boxSizing: 'border-box', WebkitOverflowScrolling: 'touch' }}>

        {tab === 'feedback' && (
          <div style={{ animation: 'fadeIn 0.2s ease both' }}>
            {submitted ? (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round"><polyline points="20 6 9 17 4 12"/></svg>
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d' }}>Thanks for your feedback!</p>
              </div>
            ) : expandedFeedback ? (
              <>
                <textarea
                  value={feedback}
                  onChange={e => setFeedback(e.target.value)}
                  placeholder="A bug, an idea, or anything we should know."
                  rows={5}
                  autoFocus
                  style={{ width: '100%', padding: '12px', borderRadius: 12, border: `1.5px solid ${accentColor}`, fontSize: 13, lineHeight: 1.5, resize: 'none', outline: 'none', fontFamily: 'inherit', color: '#0d0d0d', marginBottom: 12 }}
                />
                
                {/* AI Enhancement Buttons */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                  <button
                    onClick={() => enhanceFeedback('improve_writing')}
                    disabled={!feedback.trim()}
                    title="Improve writing with AI"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #e5e5e5',
                      background: aiLoading === 'improve' ? '#f3f4f6' : '#fff',
                      cursor: !feedback.trim() ? 'default' : 'pointer',
                      fontSize: 12,
                      fontWeight: 500,
                      color: '#0d0d0d',
                      opacity: !feedback.trim() ? 0.5 : 1,
                      transition: 'all 0.2s'
                    }}>
                    {aiLoading === 'improve' ? '✨ Improving...' : '✨ Improve'}
                  </button>

                  <button
                    onClick={() => enhanceFeedback('fix_formatting')}
                    disabled={!feedback.trim()}
                    title="Fix grammar and formatting"
                    style={{
                      padding: '8px 12px',
                      borderRadius: 8,
                      border: '1px solid #e5e5e5',
                      background: aiLoading === 'fix' ? '#f3f4f6' : '#fff',
                      cursor: !feedback.trim() ? 'default' : 'pointer',
                      fontSize: 12,
                      fontWeight: 500,
                      color: '#0d0d0d',
                      opacity: !feedback.trim() ? 0.5 : 1,
                      transition: 'all 0.2s'
                    }}>
                    {aiLoading === 'fix' ? '🔧 Fixing...' : '🔧 Fix'}
                  </button>
                </div>

                {aiError && (
                  <div style={{
                    marginBottom: 12,
                    padding: '8px 12px',
                    borderRadius: 8,
                    background: '#fee2e2',
                    color: '#991b1b',
                    fontSize: 12
                  }}>
                    {aiError}
                  </div>
                )}
                
                {/* Image attachment preview */}
                {attachments.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 8, marginBottom: 12 }}>
                    {attachments.map((img, idx) => (
                      <div key={idx} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: `1px solid #e5e5e5` }}>
                        <img
                          src={img}
                          alt="attachment"
                          title="Click to view full size & annotate"
                          onClick={() => { setViewerImage(img); setViewerAllowAnnotate(true); setViewerAttachmentIdx(idx); setShowImageViewer(true) }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover', cursor: 'zoom-in' }}
                        />
                        <button onClick={(e) => { e.stopPropagation(); setAttachments(prev => prev.filter((_, i) => i !== idx)) }} style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
                      </div>
                    ))}
                  </div>
                )}
                
                {/* Image upload and screenshot icons */}
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  <button
                    onClick={() => document.getElementById('widget-image-upload')?.click()}
                    title="Upload image"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, border: `1px solid #e5e5e5`, background: '#fff', cursor: 'pointer', color: accentColor, transition: 'all 0.2s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e5e5')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
                  </button>
                  <input id="widget-image-upload" type="file" accept="image/*" multiple onChange={handleImageUpload} style={{ display: 'none' }} />
                  
                  <button
                    onClick={captureScreenshot}
                    disabled={captureInProgress}
                    title="Take screenshot"
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 36, height: 36, borderRadius: 10, border: `1px solid #e5e5e5`, background: captureInProgress ? '#f3f4f6' : '#fff', cursor: captureInProgress ? 'default' : 'pointer', color: accentColor, transition: 'all 0.2s', opacity: captureInProgress ? 0.6 : 1 }}
                    onMouseEnter={e => !captureInProgress && (e.currentTarget.style.borderColor = accentColor)}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e5e5')}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  </button>
                </div>

                {/* Action buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => { setExpandedFeedback(false); setFeedback(''); setAttachments([]) }}
                    style={{ flex: 1, padding: '10px', borderRadius: 10, background: '#f3f4f6', color: '#1a1a1a', fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer' }}>
                    Cancel
                  </button>
                  <button onClick={submitFeedback} disabled={(!feedback.trim() && attachments.length === 0) || submitting}
                    style={{ flex: 1, padding: '10px', borderRadius: 10, background: (feedback.trim() || attachments.length > 0) ? accentColor : '#e5e5e5', color: (feedback.trim() || attachments.length > 0) ? '#fff' : '#9ca3af', fontSize: 13, fontWeight: 700, border: 'none', cursor: (feedback.trim() || attachments.length > 0) ? 'pointer' : 'default' }}>
                    {submitting ? 'Sharing...' : 'Share'}
                  </button>
                </div>
              </>
            ) : (
              <div onClick={() => setExpandedFeedback(true)} style={{ padding: '16px', borderRadius: 12, border: `1.5px solid #e5e5e5`, background: '#fff', cursor: 'pointer', transition: 'all 0.2s', marginBottom: 18 }} onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor, e.currentTarget.style.boxShadow = `0 0 0 3px ${accentColor}20`)} onMouseLeave={e => (e.currentTarget.style.borderColor = '#e5e5e5', e.currentTarget.style.boxShadow = 'none')}>
                <p style={{ fontSize: 15, fontWeight: 700, color: '#0d0d0d', margin: '0 0 6px 0' }}>What's on your mind?</p>
                <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>A bug, an idea, or anything we should know.</p>
              </div>
            )}

            {trending.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Trending now</p>
                  <a href={boardUrl} target="_blank" rel="noopener" style={{ fontSize: 11, color: accentColor, textDecoration: 'none', fontWeight: 600 }}>See all</a>
                </div>
                {trending.map(idea => (
                  <div key={idea.id} onClick={() => setSelectedItem({ type: 'idea', id: idea.id })} className="item-row" style={{ textDecoration: 'none', display: 'flex' }}>
                    <div className="vote-pill">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                      <span style={{ fontSize: 11, fontWeight: 700, color: accentColor }}>{idea.votes || 0}</span>
                    </div>
                    <span style={{ fontSize: 13, color: '#0d0d0d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idea.title}</span>
                  </div>
                ))}
              </>
            )}

            {inProgress.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 6 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>In progress</p>
                  <a href={`${boardUrl}/roadmap`} target="_blank" rel="noopener" style={{ fontSize: 11, color: accentColor, textDecoration: 'none', fontWeight: 600 }}>See roadmap</a>
                </div>
                {inProgress.map(idea => (
                  <div key={idea.id} onClick={() => setSelectedItem({ type: 'idea', id: idea.id })} className="item-row" style={{ textDecoration: 'none', display: 'flex' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f59e0b', flexShrink: 0 }} />
                    <span style={{ fontSize: 13, color: '#0d0d0d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idea.title}</span>
                  </div>
                ))}
              </>
            )}

            {trending.length === 0 && inProgress.length === 0 && allIdeas.length > 0 && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent ideas</p>
                  <a href={boardUrl} target="_blank" rel="noopener" style={{ fontSize: 11, color: accentColor, textDecoration: 'none', fontWeight: 600 }}>See all</a>
                </div>
                {allIdeas.map(idea => (
                  <div key={idea.id} onClick={() => setSelectedItem({ type: 'idea', id: idea.id })} className="item-row" style={{ textDecoration: 'none', display: 'flex' }}>
                    <div className="vote-pill">
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round"><polyline points="18 15 12 9 6 15"/></svg>
                      <span style={{ fontSize: 11, fontWeight: 700, color: accentColor }}>{idea.votes || 0}</span>
                    </div>
                    <span style={{ fontSize: 13, color: '#0d0d0d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idea.title}</span>
                  </div>
                ))}
              </>
            )}
            
            {ideas.length === 0 && (
              <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingTop: 24 }}>No ideas submitted yet. Be the first!</p>
            )}
          </div>
        )}

        {tab === 'roadmap' && (
          <div style={{ animation: 'fadeIn 0.2s ease both' }}>
            {(['planned', 'in_progress', 'new', 'shipped'] as const).map(status => {
              const items = ideas.filter(i => i.status === status)
              if (items.length === 0) return null
              const labels: Record<string, { label: string; color: string; dot: string; icon: React.ReactNode }> = {
                in_progress: { 
                  label: 'In Progress', 
                  color: '#f59e0b', 
                  dot: '#f59e0b',
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                },
                planned: { 
                  label: 'Planned', 
                  color: '#6366f1', 
                  dot: '#6366f1',
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                },
                new: { 
                  label: 'Under Review', 
                  color: '#6b7280', 
                  dot: '#9ca3af',
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>
                },
                shipped: { 
                  label: 'Shipped', 
                  color: '#10b981', 
                  dot: '#10b981',
                  icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                },
              }
              const meta = labels[status]
              return (
                <div key={status} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <div style={{ color: meta.color, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {meta.icon}
                    </div>
                    <p style={{ fontSize: 11, fontWeight: 700, color: meta.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{meta.label}</p>
                  </div>
                  {items.slice(0, 4).map(idea => (
                    <div key={idea.id} onClick={() => setSelectedItem({ type: 'idea', id: idea.id })} className="item-row" style={{ textDecoration: 'none', display: 'flex', marginLeft: 14 }}>
                      <span style={{ fontSize: 13, color: '#0d0d0d', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{idea.title}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', flexShrink: 0 }}>▲ {idea.votes || 0}</span>
                    </div>
                  ))}
                </div>
              )
            })}
            {ideas.length === 0 && <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingTop: 24 }}>No roadmap items yet.</p>}
          </div>
        )}

        {tab === 'updates' && (
          <div style={{ animation: 'fadeIn 0.2s ease both' }}>
            {announcements.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingTop: 24 }}>No updates yet.</p>
            ) : announcements.map(ann => {
              // Tag color mapping matching main page
              const TAG_COLORS: Record<string, { bg: string; color: string }> = {
                'new_feature': { bg: '#dbeafe', color: '#0284c7' },
                'improvement': { bg: '#fef3c7', color: '#ca8a04' },
                'bug_fix': { bg: '#fee2e2', color: '#dc2626' },
                'announcement': { bg: '#f3e8ff', color: '#7c3aed' },
                'feature': { bg: '#dbeafe', color: '#0284c7' },
                'update': { bg: '#fef3c7', color: '#ca8a04' },
              }
              
              const tagKey = (ann.tag || '').toLowerCase().replace(/ /g, '_')
              const tagColor = TAG_COLORS[tagKey] || { bg: accentColor + '15', color: accentColor }
              
              return (
              <div key={ann.id} onClick={() => setSelectedItem({ type: 'announcement', id: ann.id })} className="item-row" style={{ display: 'block', marginBottom: 10, cursor: 'pointer', padding: '10px 12px', borderRadius: 12, background: ann.is_pinned ? 'var(--peach)' : 'transparent' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6, flexWrap: 'wrap' }}>
                  {ann.is_pinned && (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" style={{ color: 'var(--coral)' }}><path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm-5 9.5c0 .83-.67 1.5-1.5 1.5S11 13.33 11 12.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5z"/></svg>
                  )}
                  {ann.tag && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: tagColor.bg, color: tagColor.color, textTransform: 'capitalize' }}>
                      {ann.tag}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{ann.created_at ? getRelativeTime(ann.created_at) : 'just now'}</span>
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d', marginBottom: 2, lineHeight: 1.3 }}>{ann.title}</p>
                {ann.description && <p style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{ann.description}</p>}
              </div>
              )
            })}
          </div>
        )}

        {tab === 'chat' && (
          <div style={{ animation: 'fadeIn 0.2s ease both', display: 'flex', flexDirection: 'column', height: '100%', padding: 0 }}>
            {chatStep === 'form' ? (
              <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div style={{ textAlign: 'center', paddingBottom: 12 }}>
                  <div style={{ width: 48, height: 48, borderRadius: '50%', background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px', fontSize: 20 }}>💬</div>
                  <h3 style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 700, color: '#0d0d0d' }}>Chat with us</h3>
                  <p style={{ margin: 0, fontSize: 13, color: '#9ca3af' }}>We're online and ready to help</p>
                </div>
                {(() => {
                  const ff = company?.widget_config?.chat_form_fields || { name: { show: true, required: true }, email: { show: true, required: false }, mobile: { show: true, required: false } }
                  const inputStyle = { width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid #e5e5e5', fontSize: 15, outline: 'none', boxSizing: 'border-box' as const }
                  const req = (r: boolean) => r ? ' *' : ''
                  return (
                    <>
                      {ff.name?.show && (
                        <input value={chatName} onChange={e => setChatName(e.target.value)} placeholder={`Your name${req(ff.name.required)}`} style={inputStyle} />
                      )}
                      {ff.email?.show && (
                        <input value={chatEmail} onChange={e => setChatEmail(e.target.value)} placeholder={`Your email${ff.email.required ? ' *' : ' (optional)'}`} type="email" style={inputStyle} />
                      )}
                      {ff.mobile?.show && (
                        <input value={chatMobile} onChange={e => setChatMobile(e.target.value)} placeholder={`Mobile number${ff.mobile.required ? ' *' : ' (optional)'}`} type="tel" style={inputStyle} />
                      )}
                    </>
                  )
                })()}
                {chatMobile.trim() && (
                  <label style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: '#6b7280', cursor: 'pointer', lineHeight: 1.4 }}>
                    <input type="checkbox" checked={smsOptIn} onChange={e => setSmsOptIn(e.target.checked)} style={{ marginTop: 2 }} />
                    Continue this conversation by text — get our replies as SMS if you leave the chat.
                  </label>
                )}
                {chatCreateError && (
                  <div style={{ padding: '10px 14px', borderRadius: 10, background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600 }}>
                    {chatCreateError}
                  </div>
                )}
                <button type="button" disabled={chatCreating}
                  onClick={async () => {
                    const ff = company?.widget_config?.chat_form_fields || { name: { show: true, required: true }, email: { show: true, required: false }, mobile: { show: true, required: false } }
                    // Validate required fields per config.
                    if (ff.name?.show && ff.name?.required && !chatName.trim()) { setChatCreateError('Please enter your name.'); return }
                    if (ff.email?.show && ff.email?.required && !chatEmail.trim()) { setChatCreateError('Please enter your email.'); return }
                    if (ff.mobile?.show && ff.mobile?.required && !chatMobile.trim()) { setChatCreateError('Please enter your mobile number.'); return }
                    // Need at least something to identify the visitor.
                    if (!chatName.trim() && !chatEmail.trim() && !chatMobile.trim()) { setChatCreateError('Please fill in at least one field.'); return }
                    setChatCreating(true)
                    setChatCreateError('')
                    // Create a contact or look up existing
                    let contactId: string | null = null
                    const normalizedMobile = chatMobile.trim() ? (chatMobile.trim().startsWith('+') ? chatMobile.replace(/[^\d+]/g, '') : chatMobile.replace(/[^\d]/g, '').replace(/^0/, '+61').replace(/^61/, '+61')) : null
                    try {
                      if (chatEmail) {
                        const { data: existingContact } = await (supabase as any).from('contacts').select('id').eq('company_id', company?.id).eq('email', chatEmail).maybeSingle()
                        if (existingContact) {
                          contactId = existingContact.id
                          if (normalizedMobile) await (supabase as any).from('contacts').update({ phone: normalizedMobile }).eq('id', existingContact.id)
                        } else {
                          const { data: newContact } = await (supabase as any).from('contacts').insert({ company_id: company?.id, name: chatName, email: chatEmail, phone: normalizedMobile, source: 'widget' }).select('id').maybeSingle()
                          if (newContact) contactId = newContact.id
                        }
                      } else if (normalizedMobile) {
                        // No email but a mobile — still create a contact
                        const { data: newContact } = await (supabase as any).from('contacts').insert({ company_id: company?.id, name: chatName, phone: normalizedMobile, source: 'widget' }).select('id').maybeSingle()
                        if (newContact) contactId = newContact.id
                      }
                      // Create conversation
                      const visitorId = `widget-${Date.now()}-${Math.random().toString(36).slice(2)}`
                      const { data: conv } = await (supabase as any).from('conversations').insert({
                        company_id: company?.id,
                        contact_id: contactId,
                        channel: 'widget',
                        status: 'open',
                        subject: chatName,
                        visitor_id: visitorId,
                        sms_number: normalizedMobile,
                        sms_enabled: !!(normalizedMobile && smsOptIn),
                        page_url: typeof window !== 'undefined' ? window.location.href : null,
                        page_title: typeof document !== 'undefined' ? document.title : null,
                        page_history: [{ url: typeof window !== 'undefined' ? window.location.href : null, title: typeof document !== 'undefined' ? document.title : null, ts: new Date().toISOString() }],
                        last_message_at: new Date().toISOString(),
                        updated_at: new Date().toISOString(),
                      }).select('id').maybeSingle()
                      if (conv) {
                        setChatConvId(conv.id)
                        // Persist so a page reload restores this chat
                        try {
                          localStorage.setItem(`colvy-chat-${slug}`, JSON.stringify({ convId: conv.id, name: chatName, email: chatEmail }))
                        } catch {}
                        // Insert a system greeting
                        await (supabase as any).from('messages').insert({
                          conversation_id: conv.id,
                          company_id: company?.id,
                          sender_type: 'system',
                          content: `${chatName} started a chat`,
                        })
                        // NOTE: the auto-reply (thank-you + contact prompt) is
                        // intentionally NOT fired here. It must only send AFTER
                        // the customer's first real message — firing it on
                        // conversation creation greeted people before they'd
                        // said anything. It's now triggered from the send handler.
                        setChatMessages2([])
                        setChatStep('chat')
                      } else {
                        // Insert returned no row — surface this instead of silently
                        // advancing to a chat screen where Send can never work
                        setChatCreateError('Could not start chat. Please try again in a moment.')
                      }
                    } catch (err: any) {
                      console.error('Widget chat start error:', err)
                      setChatCreateError('Could not start chat — please try again.')
                    }
                    setChatCreating(false)
                  }}
                  style={{ width: '100%', padding: '13px 0', borderRadius: 12, background: accentColor, color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: (!chatCreating && (chatName.trim() || chatEmail.trim() || chatMobile.trim())) ? 'pointer' : 'default', opacity: (!chatCreating && (chatName.trim() || chatEmail.trim() || chatMobile.trim())) ? 1 : 0.5 }}>
                  {chatCreating ? 'Starting…' : 'Start Chat'}
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {chatCreateError && (
                  <div style={{ padding: '8px 14px', background: '#fef2f2', color: '#dc2626', fontSize: 12, fontWeight: 600, textAlign: 'center' }}>
                    {chatCreateError}
                  </div>
                )}
                {/* Shared Media bar */}
                {(() => {
                  const media: any[] = []
                  chatMessages2.forEach((m: any) => (Array.isArray(m.attachments) ? m.attachments : []).forEach((a: any) => {
                    const url = typeof a === 'string' ? a : a?.url
                    const kind = typeof a === 'string' ? 'image' : (a?.kind || (String(a?.type).startsWith('video') ? 'video' : 'image'))
                    if (url) media.push({ url, kind })
                  }))
                  if (media.length === 0) return null
                  return (
                    <div style={{ borderBottom: '1px solid #f0f0f0', background: '#fafafa' }}>
                      <button onClick={() => setShowSharedMedia(v => !v)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: '#6b7280' }}>
                        <span>🖼️ Shared Media ({media.length})</span>
                        <span>{showSharedMedia ? '▲' : '▼'}</span>
                      </button>
                      {showSharedMedia && (
                        <div style={{ display: 'flex', gap: 6, padding: '0 14px 10px', overflowX: 'auto' }}>
                          {media.map((a, i) => (
                            <div key={i} onClick={() => { setViewerImage(a.url); setShowImageViewer(true) }}
                              style={{ width: 64, height: 64, borderRadius: 8, overflow: 'hidden', flexShrink: 0, cursor: 'pointer', background: '#eee' }}>
                              {a.kind === 'video'
                                ? <video src={a.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                                : <img src={a.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )
                })()}
                {/* Messages */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af', padding: '8px 0' }}>
                    <span style={{ background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>Chat started • We'll reply as soon as we can</span>
                  </div>
                  {chatMessages2.map((msg: any, i) => {
                    const isAgent = msg.sender_type === 'agent'
                    const isSystem = msg.sender_type === 'system'
                    if (isSystem) return <div key={i} style={{ textAlign: 'center', fontSize: 11, color: '#9ca3af' }}><span style={{ background: '#f3f4f6', padding: '3px 10px', borderRadius: 20 }}>{msg.content}</span></div>
                    const atts = Array.isArray(msg.attachments) ? msg.attachments : []
                    const reactions = Array.isArray(msg.reactions) ? msg.reactions : []
                    const reactionCounts: Record<string, number> = {}
                    reactions.forEach((r: any) => { reactionCounts[r.emoji] = (reactionCounts[r.emoji] || 0) + 1 })
                    const fmtT = (d: string) => {
                      if (!d) return ''
                      const p = new Date(d.endsWith?.('Z') ? d : d + 'Z')
                      return isNaN(p.getTime()) ? '' : p.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
                    }
                    return (
                      <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: isAgent ? 'flex-start' : 'flex-end', position: 'relative' }}
                        onMouseLeave={() => setWidgetReactPicker(null)}>
                        {msg.reply_to && (() => {
                          const rep = chatMessages2.find((m: any) => m.id === msg.reply_to)
                          return rep ? (
                            <div style={{ fontSize: 10, color: '#9ca3af', borderLeft: `2px solid ${accentColor}`, padding: '1px 6px', marginBottom: 2, maxWidth: '75%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              ↩ {rep.content?.slice(0, 40)}
                            </div>
                          ) : null
                        })()}
                        <div style={{
                          maxWidth: '80%', padding: atts.length && atts[0].kind !== 'file' ? 4 : '10px 13px', borderRadius: isAgent ? '14px 14px 14px 4px' : '14px 14px 4px 14px',
                          background: isAgent ? '#f3f4f6' : accentColor,
                          color: isAgent ? '#0d0d0d' : '#fff', fontSize: 13, lineHeight: 1.5, position: 'relative',
                        }}>
                          {isAgent && msg.sender_name && <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: '#6b7280', padding: atts.length ? '6px 9px 0' : 0 }}>{msg.sender_name}</p>}
                          {atts.map((a: any, ai: number) => (
                            <div key={ai} style={{ marginBottom: a.kind !== 'file' && msg.content ? 6 : 0 }}>
                              {a.kind === 'image' ? (
                                <img src={a.url} alt={a.name} style={{ maxWidth: 200, maxHeight: 200, borderRadius: 10, display: 'block', cursor: 'pointer' }} onClick={() => { setViewerImage(a.url); setShowImageViewer(true) }} />
                              ) : a.kind === 'video' ? (
                                <video src={a.url} controls style={{ maxWidth: 200, borderRadius: 10, display: 'block' }} />
                              ) : (
                                <a href={a.url} target="_blank" rel="noopener" style={{ display: 'flex', alignItems: 'center', gap: 6, color: isAgent ? accentColor : '#fff', textDecoration: 'none', fontSize: 12, fontWeight: 600 }}>📎 {a.name}</a>
                              )}
                            </div>
                          ))}
                          {msg.content && <div style={{ padding: atts.length && atts[0].kind !== 'file' ? '0 9px 4px' : 0 }}>{msg.content}</div>}
                          {/* Payment request card */}
                          {msg.message_type === 'payment' && msg.message_payload && (
                            <div style={{ marginTop: 6, padding: 12, borderRadius: 12, background: '#fff', border: '1px solid #e5e5e5', color: '#0d0d0d', minWidth: 210 }}>
                              <p style={{ margin: '0 0 2px', fontSize: 11, color: '#6b7280', fontWeight: 600 }}>PAYMENT REQUEST</p>
                              <p style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800 }}>${(msg.message_payload.amount_cents / 100).toFixed(2)} <span style={{ fontSize: 12, color: '#9ca3af' }}>AUD</span></p>
                              {msg.message_payload.description && <p style={{ margin: '0 0 8px', fontSize: 12.5, color: '#6b7280' }}>{msg.message_payload.description}</p>}
                              {msg.message_payload.status === 'paid' ? (
                                <div style={{ padding: '8px 0', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#059669' }}>✓ Paid — receipt emailed</div>
                              ) : (
                                <a href={msg.message_payload.checkout_url} target="_blank" rel="noopener"
                                  style={{ display: 'block', textAlign: 'center', padding: '10px 0', borderRadius: 8, background: '#635BFF', color: '#fff', textDecoration: 'none', fontSize: 13.5, fontWeight: 700 }}>
                                  Pay securely
                                </a>
                              )}
                              <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 8, fontSize: 10.5, color: '#9ca3af' }}>
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#059669" strokeWidth="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>
                                Encrypted · card details never stored
                              </div>
                            </div>
                          )}
                          {msg.message_type === 'order' && msg.message_payload && (
                            <div style={{ marginTop: 6, padding: 12, borderRadius: 12, background: '#fff', border: '1px solid #e5e5e5', color: '#0d0d0d', minWidth: 210 }}>
                              <p style={{ margin: '0 0 2px', fontSize: 11, color: '#6b7280', fontWeight: 600 }}>{msg.message_payload.is_quote ? '📋 QUOTE' : '🛒 ORDER'} #{msg.message_payload.order_number}</p>
                              <p style={{ margin: '0 0 8px', fontSize: 20, fontWeight: 800 }}>${msg.message_payload.total} <span style={{ fontSize: 12, color: '#9ca3af' }}>{msg.message_payload.currency || 'AUD'}</span></p>
                              {msg.message_payload.is_quote ? (
                                <p style={{ margin: 0, fontSize: 12, color: '#6b7280' }}>This is a quote. We'll confirm shipping and send a payment link.</p>
                              ) : msg.message_payload.pay_link && msg.message_payload.status !== 'completed' && msg.message_payload.status !== 'processing' ? (
                                <a href={msg.message_payload.pay_link} target="_blank" rel="noopener"
                                  style={{ display: 'block', textAlign: 'center', padding: '10px 0', borderRadius: 8, background: accentColor, color: '#fff', textDecoration: 'none', fontSize: 13.5, fontWeight: 700 }}>
                                  Pay for this order
                                </a>
                              ) : (msg.message_payload.status === 'completed' || msg.message_payload.status === 'processing') ? (
                                <div style={{ padding: '8px 0', textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#059669' }}>✓ Paid</div>
                              ) : null}
                            </div>
                          )}
                          {msg.message_type === 'media_request' && msg.message_payload && (
                            <div style={{ marginTop: 6, padding: 14, borderRadius: 14, background: '#fff', border: '1px solid #e5e5e5', minWidth: 210 }}>
                              <p style={{ margin: '0 0 8px', fontSize: 13.5, color: '#0d0d0d' }}>{msg.message_payload.prompt}</p>
                              <a href={msg.message_payload.link} target="_blank" rel="noopener"
                                style={{ display: 'block', textAlign: 'center', padding: '10px 0', borderRadius: 9, background: accentColor, color: '#fff', textDecoration: 'none', fontSize: 13.5, fontWeight: 700 }}>
                                Upload files
                              </a>
                              <p style={{ margin: '6px 0 0', fontSize: 10.5, color: '#9ca3af', textAlign: 'center' }}>Private · full quality</p>
                            </div>
                          )}
                          {msg.message_type === 'coupon' && msg.message_payload && (
                            <div style={{ marginTop: 6, padding: 16, borderRadius: 14, background: 'linear-gradient(135deg, #fff4f1, #ffffff)', border: `1.5px dashed ${accentColor}`, color: '#0d0d0d', minWidth: 220, textAlign: 'center' }}>
                              <p style={{ margin: '0 0 2px', fontSize: 11, fontWeight: 700, color: accentColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>🎟️ You've received a coupon</p>
                              <p style={{ margin: '6px 0 2px', fontSize: 26, fontWeight: 800, letterSpacing: 1.5 }}>{msg.message_payload.code}</p>
                              <p style={{ margin: '0 0 10px', fontSize: 14, fontWeight: 700, color: accentColor }}>{msg.message_payload.display_amount}</p>
                              <button onClick={() => { navigator.clipboard?.writeText(msg.message_payload.code); setCopiedCoupon(msg.id); setTimeout(() => setCopiedCoupon(null), 1600) }}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 9, background: accentColor, color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                                {copiedCoupon === msg.id ? (
                                  <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg> Copied!</>
                                ) : (
                                  <><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg> Copy code</>
                                )}
                              </button>
                              {msg.message_payload.expires && <p style={{ margin: '8px 0 0', fontSize: 11, color: '#9ca3af' }}>Expires {msg.message_payload.expires}</p>}
                            </div>
                          )}
                          {/* Interactive poll/survey/form */}
                          {['poll', 'survey', 'form'].includes(msg.message_type) && msg.message_payload && (
                            <WidgetInteractive msg={msg} companyId={company?.id} conversationId={chatConvId} respondent={chatName} accentColor={accentColor} />
                          )}
                          {/* React + reply actions (only on messages that have an id) */}
                          {msg.id && (
                            <div style={{ position: 'absolute', top: -12, [isAgent ? 'right' : 'left']: 4, display: 'flex', gap: 2 } as any}>
                              <button type="button" onClick={() => setWidgetReactPicker(widgetReactPicker === i ? null : i)}
                                style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>😊</button>
                              <button type="button" onClick={() => setWidgetReplyTo(msg)}
                                style={{ width: 22, height: 22, borderRadius: '50%', border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer', fontSize: 11, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.1)' }}>↩</button>
                            </div>
                          )}
                          {widgetReactPicker === i && (
                            <div style={{ position: 'absolute', top: -40, [isAgent ? 'left' : 'right']: 0, display: 'flex', gap: 1, background: '#fff', borderRadius: 20, boxShadow: '0 4px 14px rgba(0,0,0,0.15)', padding: '4px 6px', zIndex: 10 } as any}>
                              {WIDGET_EMOJIS.map(e => (
                                <button key={e} type="button" onClick={() => widgetReact(msg, e)} style={{ border: 'none', background: 'none', cursor: 'pointer', fontSize: 15, padding: 1 }}>{e}</button>
                              ))}
                            </div>
                          )}
                        </div>
                        {Object.keys(reactionCounts).length > 0 && (
                          <div style={{ display: 'flex', gap: 3, marginTop: 2 }}>
                            {Object.entries(reactionCounts).map(([emoji, count]) => (
                              <span key={emoji} onClick={() => widgetReact(msg, emoji)} style={{ fontSize: 11, background: '#fff', border: '1px solid #e5e5e5', borderRadius: 20, padding: '0 6px', cursor: 'pointer' }}>{emoji} {count > 1 ? count : ''}</span>
                            ))}
                          </div>
                        )}
                        <p style={{ margin: '2px 4px 0', fontSize: 9, color: '#b0b0b0' }}>{fmtT(msg.created_at)}</p>
                      </div>
                    )
                  })}
                </div>
                {widgetReplyTo && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', background: '#f9f9f9', borderTop: '1px solid #f0f0f0', fontSize: 11, color: '#6b7280' }}>
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>↩ Replying: {widgetReplyTo.content?.slice(0, 40)}</span>
                    <button type="button" onClick={() => setWidgetReplyTo(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af' }}>✕</button>
                  </div>
                )}
                {/* Input */}
                <div style={{ padding: '10px 12px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
                  <input ref={chatFileRef} type="file" accept="image/*,video/*,.pdf,.doc,.docx,.txt" style={{ display: 'none' }}
                    onChange={e => { uploadChatFile(e.target.files?.[0]); e.target.value = '' }} />
                  <button type="button" onClick={() => chatFileRef.current?.click()} disabled={chatUploading || !chatConvId}
                    title="Attach file"
                    style={{ width: 36, height: 36, borderRadius: '50%', border: '1px solid #e5e5e5', background: '#fff', cursor: chatConvId ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', flexShrink: 0 }}>
                    {chatUploading ? '⏳' : <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>}
                  </button>
                  <textarea value={chatInput} onChange={e => setChatInput(e.target.value)}
                    onKeyDown={async e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        if (!chatInput.trim() || !chatConvId || chatSending) return
                        setChatSending(true)
                        const content = chatInput.trim()
                        setChatInput('')
                        const newMsg = { sender_type: 'visitor', sender_name: chatName, content, created_at: new Date().toISOString() }
                        setChatMessages2(prev => [...prev, newMsg])
                        try {
                          const { error: msgErr } = await (supabase as any).from('messages').insert({
                            conversation_id: chatConvId,
                            company_id: company?.id,
                            sender_type: 'visitor',
                            sender_name: chatName,
                            sender_email: chatEmail || null,
                            content,
                            reply_to: widgetReplyTo?.id || null,
                          })
                          setWidgetReplyTo(null)
                          try { fetch('/api/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: company?.id, title: `New message from ${chatName || 'a visitor'}`, body: content, conversationId: chatConvId }) }) } catch {}; try { fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: company?.id, type: 'chat', message: `New message from ${chatName || 'a visitor'}: ${content.slice(0, 80)}`, actorName: chatName }) }) } catch {}; try { fetch('/api/inbox/smart-trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: chatConvId, text: content }) }) } catch {}
                          // Auto-reply fires now, on the customer's message (the
                          // route only sends once per conversation via auto_replied).
                          try { fetch('/api/inbox/auto-reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: chatConvId }) }) } catch {}
                          await (supabase as any).from('conversations').update({
                            last_message: content,
                            last_message_at: new Date().toISOString(),
                            is_unread: true,
                            unread_count: 1,
                            updated_at: new Date().toISOString(),
                          }).eq('id', chatConvId)
                        } catch (err) {
                          console.error('Widget message send error:', err)
                          setChatCreateError('Message could not be sent. Please try again.')
                        }
                        setChatSending(false)
                      }
                    }}
                    placeholder="Type a message…" rows={2}
                    style={{ flex: 1, padding: '9px 12px', borderRadius: 10, border: '1px solid #e5e5e5', fontSize: 14, resize: 'none', outline: 'none', fontFamily: 'inherit' }} />
                  <button type="button"
                    onClick={async () => {
                      if (!chatInput.trim() || !chatConvId || chatSending) return
                      setChatSending(true)
                      const content = chatInput.trim()
                      setChatInput('')
                      setChatMessages2(prev => [...prev, { sender_type: 'visitor', sender_name: chatName, content, created_at: new Date().toISOString() }])
                      try {
                        const { error: msgErr } = await (supabase as any).from('messages').insert({ conversation_id: chatConvId, company_id: company?.id, sender_type: 'visitor', sender_name: chatName, sender_email: chatEmail || null, content, reply_to: widgetReplyTo?.id || null }); const _wr = widgetReplyTo; setWidgetReplyTo(null)
                        try { fetch('/api/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: company?.id, title: `New message from ${chatName || 'a visitor'}`, body: content, conversationId: chatConvId }) }) } catch {}; try { fetch('/api/notify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId: company?.id, type: 'chat', message: `New message from ${chatName || 'a visitor'}: ${content.slice(0, 80)}`, actorName: chatName }) }) } catch {}; try { fetch('/api/inbox/smart-trigger', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: chatConvId, text: content }) }) } catch {}; try { fetch('/api/inbox/auto-reply', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ conversationId: chatConvId }) }) } catch {}
                        if (msgErr) throw msgErr
                        await (supabase as any).from('conversations').update({ last_message: content, last_message_at: new Date().toISOString(), is_unread: true, unread_count: 1, updated_at: new Date().toISOString() }).eq('id', chatConvId)
                      } catch (err) {
                        console.error('Widget message send error:', err)
                        setChatCreateError('Message could not be sent. Please try again.')
                      }
                      setChatSending(false)
                    }}
                    style={{ width: 38, height: 38, borderRadius: '50%', background: chatInput.trim() ? accentColor : '#e5e5e5', border: 'none', cursor: chatInput.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.5" strokeLinecap="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {tab === 'help' && (
          <div style={{ animation: 'fadeIn 0.2s ease both', display: 'flex', flexDirection: 'column', height: '100%' }}>
            {/* Search */}
            <div style={{ padding: '12px 0', marginBottom: 12, borderBottom: '1px solid var(--border)' }}>
              <div style={{ position: 'relative' }}>
                <input
                  type="text"
                  placeholder="Search help..."
                  onChange={(e) => setHelpSearch(e.target.value)}
                  value={helpSearch}
                  style={{
                    width: '100%',
                    padding: '8px 12px 8px 28px',
                    borderRadius: 8,
                    border: '1px solid var(--border)',
                    fontSize: 12,
                    fontWeight: 500,
                    color: 'var(--ink)',
                  }}
                />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2" style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}>
                  <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
                </svg>
              </div>
            </div>

            {/* Categories */}
            {allHelpCategories.length > 0 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid var(--border)' }}>
                <button
                  onClick={() => setHelpCategory(null)}
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    fontSize: 11,
                    fontWeight: 600,
                    border: '1px solid var(--border)',
                    background: !helpCategory ? accentColor : 'white',
                    color: !helpCategory ? 'white' : 'var(--slate)',
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}>
                  All
                </button>
                {allHelpCategories.map(cat => (
                  <button
                    key={cat}
                    onClick={() => setHelpCategory(helpCategory === cat ? null : cat)}
                    style={{
                      padding: '4px 10px',
                      borderRadius: 6,
                      fontSize: 11,
                      fontWeight: 600,
                      border: '1px solid var(--border)',
                      background: helpCategory === cat ? accentColor : 'white',
                      color: helpCategory === cat ? 'white' : 'var(--slate)',
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}>
                    {cat}
                  </button>
                ))}
              </div>
            )}

            {/* Articles list */}
            {filteredHelpArticles.length === 0 ? (
              <div style={{ textAlign: 'center', paddingTop: 24, color: '#9ca3af', fontSize: 13 }}>
                {helpSearch ? 'No articles found.' : 'No help articles available yet.'}
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto' }}>
                {filteredHelpArticles.map((article, idx) => (
                  <div
                    key={article.id}
                    onClick={() => setSelectedItem({ type: 'help', id: article.id })}
                    style={{
                      padding: '12px',
                      borderRadius: 10,
                      border: selectedItem && selectedItem.type === 'help' && selectedItem.id === article.id ? `2px solid ${accentColor}` : '1px solid var(--border)',
                      marginBottom: 8,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: selectedItem && selectedItem.type === 'help' && selectedItem.id === article.id ? accentColor + '08' : 'white',
                    }}
                    onMouseEnter={(e) => {
                      if (!selectedItem || selectedItem.type !== 'help' || selectedItem.id !== article.id) {
                        e.currentTarget.style.borderColor = accentColor
                        e.currentTarget.style.background = accentColor + '05'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (!selectedItem || selectedItem.type !== 'help' || selectedItem.id !== article.id) {
                        e.currentTarget.style.borderColor = 'var(--border)'
                        e.currentTarget.style.background = 'white'
                      }
                    }}>
                    <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 12, fontWeight: 700, color: 'var(--ink)', margin: 0, marginBottom: 2 }}>{article.title}</p>
                        {article.category && (
                          <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: accentColor + '15', color: accentColor }}>
                            {article.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div style={{ background: '#fff', display: 'flex', padding: '6px 8px 8px', flexShrink: 0, width: '100%', boxSizing: 'border-box', justifyContent: 'space-around', gap: 2 }}>
        {(() => {
          // Map settings labels → widget tab keys (Chat included, orderable).
          const labelToKey: Record<string, string> = { 'Chat': 'chat', 'Feedback': 'feedback', 'Ideas': 'feedback', 'Roadmap': 'roadmap', 'Updates': 'updates', 'Knowledge Base': 'help', 'Help Centre': 'help', 'Help': 'help' }
          const allKeys = ['feedback', 'roadmap', 'updates', 'help', 'chat'] as const
          // Visibility from settings (default: all shown).
          const visible = (k: string) => !widgetTabs ? true : widgetTabs[k] !== false
          // Order from settings if provided (chat can be anywhere), else default.
          let ordered: string[] = [...allKeys]
          if (widgetTabs?.order && Array.isArray(widgetTabs.order)) {
            const fromOrder = widgetTabs.order.map((l: string) => labelToKey[l]).filter(Boolean)
            ordered = Array.from(new Set([...fromOrder, ...allKeys]))
          }
          const finalTabs = ordered.filter(visible)
          return finalTabs.map(t => {
          const isActive = tab === t
          return (
            <button key={t} onClick={() => { setTab(t as any); trackWidgetEvent(`view_${t}`) }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0', borderRadius: 8, transition: 'background 0.15s', color: isActive ? accentColor : '#9ca3af' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill={isActive ? accentColor + '22' : 'none'} stroke={isActive ? accentColor : '#9ca3af'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {t === 'feedback' && <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>}
                {t === 'roadmap' && <><path d="M22 12H18L15 21 9 3 6 12 2 12"/></>}
                {t === 'updates' && <><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></>}
                {t === 'help' && <><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></>}
                {t === 'chat' && <><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="8" y1="10" x2="16" y2="10"/><line x1="8" y1="14" x2="12" y2="14"/></>}
              </svg>
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, textTransform: 'capitalize', lineHeight: 1 }}>
                {t === 'updates' ? 'Updates' : t === 'help' ? 'Help' : t.charAt(0).toUpperCase() + t.slice(1)}
              </span>
            </button>
          )
        }) })()}
      </div>

      {/* "Powered by Colvy" — at the very bottom, below the menu items */}
      <div style={{ borderTop: '1px solid #f0f0f0', background: '#fff', display: 'flex', justifyContent: 'center', alignItems: 'center', padding: '5px 8px 7px', flexShrink: 0 }}>
        <a
          href={`https://colvy.com/?utm_source=${encodeURIComponent(slug)}&utm_medium=widget&utm_campaign=powered_by&utm_content=${encodeURIComponent(company?.name || slug)}`}
          target="_blank"
          rel="noopener"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none', color: '#9ca3af', fontSize: 10, fontWeight: 600, letterSpacing: 0.2 }}>
          Powered by
          <span style={{ fontWeight: 800, fontSize: 12, color: accentColor }}>Colvy</span>
          <svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke={accentColor} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="7" y1="17" x2="17" y2="7"/><polyline points="7 7 17 7 17 17"/>
          </svg>
        </a>
      </div>
    </div>
  )
}
function WidgetInteractive({ msg, companyId, conversationId, respondent, accentColor }: any) {
  const [done, setDone] = React.useState(false)
  const [item, setItem] = React.useState<any>(null)
  const [answers, setAnswers] = React.useState<any>({})
  const payload = msg.message_payload || {}
  const kind = payload.kind

  React.useEffect(() => {
    ;(async () => {
      if (!payload.ref_id) return
      const table = kind === 'poll' ? 'polls' : kind === 'survey' ? 'surveys' : 'forms'
      const { data } = await (supabase as any).from(table).select('*').eq('id', payload.ref_id).maybeSingle()
      setItem(data)
      // Pre-fill fields when the smart trigger supplied known customer details.
      if (data && payload.prefill && (kind === 'form' || kind === 'survey')) {
        const qs = data.questions || data.options || []
        const pf = payload.prefill
        const init: any = {}
        qs.forEach((q: any, i: number) => {
          const label = (q.title || q.label || q.question || '').toLowerCase()
          const qId = q.id || String(i)
          if (label.includes('first name') && pf.first_name) init[qId] = pf.first_name
          else if (label.includes('last name') && pf.last_name) init[qId] = pf.last_name
          else if ((label.includes('full name') || label === 'name') && (pf.first_name || pf.last_name)) init[qId] = `${pf.first_name || ''} ${pf.last_name || ''}`.trim()
          else if (label.includes('email') && pf.email) init[qId] = pf.email
          else if (label.includes('phone') && pf.phone) init[qId] = pf.phone
        })
        if (Object.keys(init).length) setAnswers((a: any) => ({ ...init, ...a }))
      }
    })()
  }, [payload.ref_id])

  const submit = async (response: any) => {
    try {
      await (supabase as any).from('chat_interactions').insert({
        company_id: companyId, conversation_id: conversationId, message_id: msg.id,
        kind, ref_id: payload.ref_id, respondent, response,
      })
      // Also post the answer as a visitor message so the agent sees it
      // Build a human-readable summary instead of dumping JSON into the chat.
      let summary: string
      if (typeof response === 'string') summary = response
      else if (response.label) summary = response.label
      else if (response.answers && typeof response.answers === 'object') {
        summary = Object.entries(response.answers).map(([k, v]) => `${k}: ${v}`).join(' · ')
      } else summary = JSON.stringify(response)
      await (supabase as any).from('messages').insert({
        conversation_id: conversationId, company_id: companyId, sender_type: 'visitor',
        sender_name: respondent, content: `✅ Responded: ${summary}`,
      })
      setDone(true)
    } catch (e) { console.error(e) }
  }

  if (done) return <div style={{ marginTop: 6, padding: '10px 12px', borderRadius: 10, background: '#dcfce7', color: '#059669', fontSize: 12.5, fontWeight: 600 }}>✓ Thanks for your response!</div>
  if (!item) return <div style={{ marginTop: 6, fontSize: 12, color: '#9ca3af' }}>Loading…</div>

  const options = item.options || payload.options || []
  const questions = item.questions || []

  return (
    <div style={{ marginTop: 6, padding: 12, borderRadius: 12, background: '#fff', border: '1px solid #e5e5e5', minWidth: 220 }}>
      <p style={{ margin: '0 0 8px', fontSize: 13, fontWeight: 700, color: '#0d0d0d' }}>{item.question || item.title || 'Respond'}</p>
      {/* Poll: options as buttons */}
      {kind === 'poll' && options.map((opt: any, i: number) => (
        <button key={i} onClick={() => submit({ option_index: i, label: typeof opt === 'string' ? opt : opt.label || opt.text })}
          style={{ display: 'block', width: '100%', textAlign: 'left', padding: '8px 12px', marginBottom: 6, borderRadius: 8, border: '1px solid #e5e5e5', background: '#fff', cursor: 'pointer', fontSize: 13, color: '#0d0d0d' }}>
          {typeof opt === 'string' ? opt : opt.label || opt.text}
        </button>
      ))}
      {/* Form/survey: render each question with its real title and input type */}
      {(kind === 'form' || kind === 'survey') && (
        <div>
          {(questions.length ? questions : [{ title: item.question || 'Your answer', id: 'a', type: 'text' }]).map((q: any, i: number) => {
            const qLabel = q.title || q.label || q.question || `Question ${i + 1}`
            const qId = q.id || String(i)
            const setA = (v: any) => setAnswers((a: any) => ({ ...a, [qId]: v }))
            const qOpts: any[] = q.options || []
            return (
              <div key={qId} style={{ marginBottom: 12 }}>
                <label style={{ fontSize: 12.5, color: '#0d0d0d', fontWeight: 600, display: 'block', marginBottom: 5 }}>
                  {qLabel}{q.required ? <span style={{ color: '#ef4444' }}> *</span> : null}
                </label>
                {/* Choice types render as tappable pills */}
                {(q.type === 'multiple_choice' || q.type === 'picture_choice') ? (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {qOpts.map((opt: any, oi: number) => {
                      const label = typeof opt === 'string' ? opt : opt.label || opt.text
                      const sel = answers[qId] === label
                      return (
                        <button key={oi} type="button" onClick={() => setA(label)}
                          style={{ padding: '7px 14px', borderRadius: 20, border: sel ? `1.5px solid ${accentColor}` : '1px solid #e5e5e5', background: sel ? accentColor : '#fff', color: sel ? '#fff' : '#0d0d0d', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                          {label}
                        </button>
                      )
                    })}
                  </div>
                ) : q.type === 'yes_no' ? (
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['Yes', 'No'].map(v => {
                      const sel = answers[qId] === v
                      return <button key={v} type="button" onClick={() => setA(v)} style={{ flex: 1, padding: '9px 0', borderRadius: 8, border: sel ? `1.5px solid ${accentColor}` : '1px solid #e5e5e5', background: sel ? accentColor : '#fff', color: sel ? '#fff' : '#0d0d0d', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{v}</button>
                    })}
                  </div>
                ) : q.type === 'dropdown' ? (
                  <select onChange={e => setA(e.target.value)} style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13, background: '#fff' }}>
                    <option value="">Select…</option>
                    {qOpts.map((opt: any, oi: number) => { const l = typeof opt === 'string' ? opt : opt.label || opt.text; return <option key={oi} value={l}>{l}</option> })}
                  </select>
                ) : (q.type === 'rating' || q.type === 'opinion_scale' || q.type === 'nps') ? (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {Array.from({ length: q.type === 'nps' ? 11 : (q.type === 'opinion_scale' ? 10 : 5) }).map((_, ri) => {
                      const val = q.type === 'nps' ? ri : ri + 1
                      const sel = answers[qId] === val
                      return <button key={ri} type="button" onClick={() => setA(val)} style={{ width: 34, height: 34, borderRadius: 8, border: sel ? `1.5px solid ${accentColor}` : '1px solid #e5e5e5', background: sel ? accentColor : '#fff', color: sel ? '#fff' : '#0d0d0d', fontSize: q.type === 'rating' ? 16 : 12, fontWeight: 700, cursor: 'pointer' }}>{q.type === 'rating' ? '★' : val}</button>
                    })}
                  </div>
                ) : (q.type === 'long_text') ? (
                  <textarea onChange={e => setA(e.target.value)} rows={3} placeholder={q.placeholder || 'Type your answer…'}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13, boxSizing: 'border-box', resize: 'vertical' }} />
                ) : (
                  <input
                    onChange={e => setA(e.target.value)}
                    placeholder={q.placeholder || (q.type === 'email' ? 'you@email.com' : q.type === 'phone' ? '04XX XXX XXX' : 'Type your answer…')}
                    style={{ width: '100%', padding: '9px 10px', borderRadius: 8, border: '1px solid #e5e5e5', fontSize: 13, boxSizing: 'border-box' }} />
                )}
              </div>
            )
          })}
          <button onClick={() => {
            // Build a readable answer map keyed by question title
            const readable: Record<string, any> = {}
            ;(questions.length ? questions : [{ title: 'Answer', id: 'a' }]).forEach((q: any, i: number) => {
              const qId = q.id || String(i)
              if (answers[qId] !== undefined) readable[q.title || q.label || `Q${i + 1}`] = answers[qId]
            })
            submit({ answers: readable })
          }} style={{ width: '100%', padding: '10px 0', borderRadius: 8, background: accentColor, color: '#fff', border: 'none', fontSize: 13.5, fontWeight: 700, cursor: 'pointer', marginTop: 4 }}>Submit</button>
        </div>
      )}
    </div>
  )
}

export default function WidgetPage() {
  return (
    <Suspense>
      <WidgetContent />
    </Suspense>
  )
}
