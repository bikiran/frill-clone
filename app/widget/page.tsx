'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'
import { supabase } from '@/lib/supabase'
import ImageViewer from '@/components/ImageViewer'

function WidgetContent() {
  const params = useSearchParams()
  const slug = params.get('slug') || ''

  const [tab, setTab] = useState<'feedback' | 'roadmap' | 'updates' | 'help' | 'chat'>('feedback')
  const [selectedItem, setSelectedItem] = useState<{ type: 'idea' | 'announcement' | 'help'; id: string } | null>(null)
  const [company, setCompany] = useState<any>(null)
  const [ideas, setIdeas] = useState<any[]>([])
  const [announcements, setAnnouncements] = useState<any[]>([])
  const [forms, setForms] = useState<any[]>([])
  const [polls, setPolls] = useState<any[]>([])
  const [surveys, setSurveys] = useState<any[]>([])
  const [helpArticles, setHelpArticles] = useState<any[]>([])
  const [feedback, setFeedback] = useState('')
  const [chatMessages, setChatMessages] = useState<any[]>([])
  const [chatName, setChatName] = useState('')
  const [chatEmail, setChatEmail] = useState('')
  const [chatInput, setChatInput] = useState('')
  const [attachments, setAttachments] = useState<string[]>([])
  const [submitting, setSubmitting] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [chatStarted, setChatStarted] = useState(false)
  const [loading, setLoading] = useState(true)
  const [expandedFeedback, setExpandedFeedback] = useState(false)
  const [captureInProgress, setCaptureInProgress] = useState(false)
  const [showImageViewer, setShowImageViewer] = useState(false)
  const [viewerImage, setViewerImage] = useState('')
  const [animatingVotes, setAnimatingVotes] = useState<Set<string>>(new Set())
  const [helpSearch, setHelpSearch] = useState('')
  const [helpCategory, setHelpCategory] = useState<string | null>(null)

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

  // Refetch data periodically to ensure announcements/help persist
  useEffect(() => {
    if (!slug) return
    
    const interval = setInterval(() => {
      ;(async () => {
        console.log('[WIDGET REFETCH] Periodic refetch for slug:', slug)
        const res = await fetch(`/api/widget-data?slug=${slug}`)
        if (res.ok) {
          const data = await res.json()
          console.log('[WIDGET REFETCH] Got announcements:', data.announcements?.length, 'help articles:', data.helpArticles?.length)
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

  const submitFeedback = async () => {
    if (!feedback.trim() && attachments.length === 0) return
    setSubmitting(true)
    try {
      await fetch('/api/widget-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, title: feedback.trim(), attachments }),
      })
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
      <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
        <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          <button onClick={() => setSelectedItem(null)} style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', padding: 0, color: 'var(--slate)', fontWeight: 700 }}>←</button>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)' }}>Back</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
          {item && (
            <>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: 'var(--ink)', marginBottom: 8 }}>{item.title}</h2>
              {selectedItem.type === 'idea' && (
                <>
                  {/* Meta info */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, fontSize: 12, color: 'var(--slate)' }}>
                    <span>User</span>
                    <span>•</span>
                    <span>{item.created_at ? new Date(item.created_at).toLocaleDateString('en-US', { month: '2-digit', day: '2-digit', year: 'numeric' }) : 'Today'}</span>
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
                  <div style={{ color: 'var(--ink)', lineHeight: 1.6, fontSize: 13, whiteSpace: 'pre-wrap' }}>
                    {item.content}
                    {/* Parse and display images in content */}
                    {item.content && item.content.includes('http') && (
                      <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                        {item.content.split(/\s/).map((part, i) => {
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
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', height: '100vh', display: 'flex', flexDirection: 'column', background: '#fff', overflow: 'hidden' }}>
      {/* Image Viewer */}
      {showImageViewer && (
        <ImageViewer
          imageSrc={viewerImage}
          onClose={() => setShowImageViewer(false)}
        />
      )}

      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #e5e5e5; border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        @keyframes voteBounce { 0% { transform: scale(1); } 40% { transform: scale(1.3) translateY(-4px); } 70% { transform: scale(0.95); } 100% { transform: scale(1); } }
        @keyframes voteRipple { 0% { box-shadow: 0 0 0 0 rgba(255, 122, 107, 0.4); } 100% { box-shadow: 0 0 0 20px rgba(255, 122, 107, 0); } }
        .item-row { cursor: pointer; border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; transition: background 0.15s; }
        .item-row:hover { background: #f9f9f9; }
        .vote-pill { display: flex; align-items: center; gap: 4px; min-width: 32px; flex-shrink: 0; }
        
        @media (max-width: 480px) {
          ::-webkit-scrollbar { width: 3px; }
          .item-row { padding: 8px 10px; gap: 8px; }
        }
      `}</style>

      {/* Top Header with Logo and Name */}
      <div style={{ padding: '14px 16px', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company.name} style={{ width: 32, height: 32, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 32, height: 32, borderRadius: 8, background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 14, fontWeight: 800 }}>
              {(company?.name || slug)[0]?.toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: 15, fontWeight: 700, color: '#0d0d0d' }}>{company?.name || slug}</span>
          <a href={boardUrl} target="_blank" rel="noopener" style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Board
          </a>
        </div>
      </div>

      {/* Scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px 80px' }}>

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
                
                {/* Image attachment preview */}
                {attachments.length > 0 && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(60px, 1fr))', gap: 8, marginBottom: 12 }}>
                    {attachments.map((img, idx) => (
                      <div key={idx} style={{ position: 'relative', aspectRatio: '1', borderRadius: 8, overflow: 'hidden', border: `1px solid #e5e5e5` }}>
                        <img src={img} alt="attachment" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                        <button onClick={() => setAttachments(prev => prev.filter((_, i) => i !== idx))} style={{ position: 'absolute', top: 2, right: 2, width: 20, height: 20, background: 'rgba(0,0,0,0.6)', border: 'none', borderRadius: '50%', color: '#fff', cursor: 'pointer', fontSize: 14, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
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
              <div key={ann.id} onClick={() => setSelectedItem({ type: 'announcement', id: ann.id })} className="item-row" style={{ display: 'block', marginBottom: 10, cursor: 'pointer' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  {ann.tag && (
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: tagColor.bg, color: tagColor.color, textTransform: 'capitalize' }}>
                      {ann.tag}
                    </span>
                  )}
                  <span style={{ fontSize: 11, color: '#9ca3af', fontWeight: 500 }}>{ann.created_at ? new Date(ann.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : 'Today'}</span>
                </div>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d', marginBottom: 2, lineHeight: 1.3 }}>{ann.title}</p>
                {ann.description && <p style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{ann.description}</p>}
              </div>
              )
            })}
          </div>
        )}

        {tab === 'chat' && (
          <div style={{ animation: 'fadeIn 0.2s ease both', padding: '16px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
            💬 Chat support coming soon. Use feedback tab to reach out!
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
                      border: selectedItem.type === 'help' && selectedItem.id === article.id ? `2px solid ${accentColor}` : '1px solid var(--border)',
                      marginBottom: 8,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                      background: selectedItem.type === 'help' && selectedItem.id === article.id ? accentColor + '08' : 'white',
                    }}
                    onMouseEnter={(e) => {
                      if (selectedItem.type !== 'help' || selectedItem.id !== article.id) {
                        e.currentTarget.style.borderColor = accentColor
                        e.currentTarget.style.background = accentColor + '05'
                      }
                    }}
                    onMouseLeave={(e) => {
                      if (selectedItem.type !== 'help' || selectedItem.id !== article.id) {
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
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #f0f0f0', display: 'flex', padding: '10px 16px' }}>
        {(['feedback', 'roadmap', 'updates', 'help', 'chat'] as const).map(t => {
          const icons: Record<string, string> = {
            feedback: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
            roadmap: 'M22 12H18L15 21 9 3 6 12 2 12',
            updates: 'M22 2L11 13 M22 2L15 22 11 13 2 9l20-7z',
            help: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
            chat: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
          }
          return (
            <button key={t} onClick={() => { setTab(t); trackWidgetEvent(`view_${t}`) }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? accentColor : '#9ca3af' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {t === 'feedback' && <path d={icons.feedback}/>}
                {t === 'roadmap' && <polyline points={icons.roadmap.split(' ').map(p => p.replace('L','')).join(' ')}/>}
                {t === 'updates' && <><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></>}
                {t === 'help' && <circle cx="12" cy="12" r="10"/>}
                {t === 'chat' && <path d={icons.chat}/>}
              </svg>
              <span style={{ fontSize: 10, fontWeight: 600, textTransform: 'capitalize' }}>
                {t === 'updates' ? 'Updates' : t === 'help' ? 'Help' : t.charAt(0).toUpperCase() + t.slice(1)}
              </span>
            </button>
          )
        })}
      </div>
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
