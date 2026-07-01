'use client'

import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import { Suspense } from 'react'

function WidgetContent() {
  const params = useSearchParams()
  const slug = params.get('slug') || ''

  const [tab, setTab] = useState<'feedback' | 'roadmap' | 'updates' | 'help' | 'chat'>('feedback')
  const [selectedItem, setSelectedItem] = useState<{ type: 'idea' | 'announcement'; id: string } | null>(null)
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

  const accentColor = company?.accent_color || '#ff7a6b'

  useEffect(() => {
    if (!slug) { setLoading(false); return }
    ;(async () => {
      const res = await fetch(`/api/widget-data?slug=${slug}`)
      if (res.ok) {
        const data = await res.json()
        setCompany(data.company)
        setIdeas(data.ideas || [])
        setAnnouncements(data.announcements || [])
        setForms(data.forms || [])
        setPolls(data.polls || [])
        setSurveys(data.surveys || [])
        setHelpArticles(data.helpArticles || [])
      }
      setLoading(false)
      // Track analytics
      trackWidgetView(slug)
    })()
  }, [slug])

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

  const trending = ideas.filter(i => i.status === 'new' || i.status === 'planned').slice(0, 4)
  const inProgress = ideas.filter(i => i.status === 'in_progress').slice(0, 3)

  const boardUrl = `https://${slug}.colvy.com`

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
      : announcements.find(a => a.id === selectedItem.id)

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
                  <p style={{ color: 'var(--slate)', lineHeight: 1.6, marginBottom: 16, fontSize: 13 }}>{item.description}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ padding: '4px 10px', background: accentColor, color: 'white', borderRadius: 16, fontSize: 11, fontWeight: 600 }}>👍 {item.votes || 0}</span>
                    <span style={{ padding: '4px 10px', background: 'var(--canvas)', color: 'var(--slate)', borderRadius: 16, fontSize: 11, fontWeight: 600 }}>{item.status || 'Submitted'}</span>
                  </div>
                </>
              )}
              {selectedItem.type === 'announcement' && (
                <>
                  <p style={{ fontSize: 11, color: 'var(--slate)', marginBottom: 12 }}>{new Date(item.created_at).toLocaleDateString()}</p>
                  <div style={{ color: 'var(--ink)', lineHeight: 1.6, fontSize: 13 }}>{item.description}</div>
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
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        ::-webkit-scrollbar { width: 4px; } ::-webkit-scrollbar-thumb { background: #e5e5e5; border-radius: 2px; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(4px); } to { opacity:1; transform:translateY(0); } }
        .item-row { cursor: pointer; border-radius: 12px; padding: 10px 12px; display: flex; align-items: center; gap: 10px; transition: background 0.15s; }
        .item-row:hover { background: #f9f9f9; }
        .vote-pill { display: flex; align-items: center; gap: 4px; min-width: 32px; flex-shrink: 0; }
        
        @media (max-width: 480px) {
          ::-webkit-scrollbar { width: 3px; }
          .item-row { padding: 8px 10px; gap: 8px; }
        }
      `}</style>

      {/* Header */}
      <div style={{ padding: '14px 16px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          {company?.logo_url ? (
            <img src={company.logo_url} alt={company.name} style={{ width: 28, height: 28, borderRadius: 8, objectFit: 'cover' }} />
          ) : (
            <div style={{ width: 28, height: 28, borderRadius: 8, background: accentColor, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 800 }}>
              {(company?.name || slug)[0]?.toUpperCase()}
            </div>
          )}
          <span style={{ fontSize: 14, fontWeight: 700, color: '#0d0d0d' }}>{company?.name || slug}</span>
          <a href={boardUrl} target="_blank" rel="noopener" style={{ marginLeft: 'auto', fontSize: 11, color: '#9ca3af', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 3 }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
            Board
          </a>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 2, background: '#f4f4f5', borderRadius: 10, padding: 3 }}>
          {(['feedback', 'roadmap', 'updates', 'help', 'chat'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)}
              style={{ flex: 1, padding: '6px 0', borderRadius: 8, fontSize: 12, fontWeight: 600, border: 'none', cursor: 'pointer', background: tab === t ? '#fff' : 'transparent', color: tab === t ? '#0d0d0d' : '#6b7280', boxShadow: tab === t ? '0 1px 3px rgba(0,0,0,0.1)' : 'none', textTransform: 'capitalize' }}>
              {t === 'updates' ? 'Updates' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
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
          </div>
        )}

        {tab === 'roadmap' && (
          <div style={{ animation: 'fadeIn 0.2s ease both' }}>
            {(['planned', 'in_progress', 'new', 'shipped'] as const).map(status => {
              const items = ideas.filter(i => i.status === status)
              if (items.length === 0) return null
              const labels: Record<string, { label: string; color: string; dot: string }> = {
                in_progress: { label: 'In Progress', color: '#f59e0b', dot: '#f59e0b' },
                planned: { label: 'Planned', color: '#6366f1', dot: '#6366f1' },
                new: { label: 'Under Review', color: '#6b7280', dot: '#9ca3af' },
                shipped: { label: 'Shipped', color: '#10b981', dot: '#10b981' },
              }
              const meta = labels[status]
              return (
                <div key={status} style={{ marginBottom: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: meta.dot }} />
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
            ) : announcements.map(ann => (
              <a key={ann.id} href={`${boardUrl}/announcements`} target="_blank" rel="noopener" style={{ textDecoration: 'none', display: 'block' }}>
                <div className="item-row" style={{ display: 'block', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    {ann.tag && (
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 6px', borderRadius: 999, background: accentColor + '18', color: accentColor }}>
                        {ann.tag}
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: '#9ca3af' }}>{ann.date ? new Date(ann.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}</span>
                  </div>
                  <p style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d', marginBottom: 2, lineHeight: 1.3 }}>{ann.title}</p>
                  {ann.content && <p style={{ fontSize: 12, color: '#6b7280', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{ann.content}</p>}
                </div>
              </a>
            ))}
          </div>
        )}

        {tab === 'forms' && (
          <div style={{ animation: 'fadeIn 0.2s ease both' }}>
            {forms.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingTop: 24 }}>No forms available yet.</p>
            ) : forms.map(form => (
              <a key={form.id} href={`${boardUrl}/forms/${form.id}`} target="_blank" rel="noopener" style={{ textDecoration: 'none', display: 'block', padding: '12px', borderRadius: 12, border: '1px solid #f0f0f0', marginBottom: 10, transition: 'all 0.2s', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor, e.currentTarget.style.boxShadow = `0 0 0 2px ${accentColor}20`)} onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0', e.currentTarget.style.boxShadow = 'none')}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d', margin: 0, marginBottom: 4 }}>{form.title}</p>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{form.description || 'Take the survey'}</p>
              </a>
            ))}
          </div>
        )}

        {tab === 'polls' && (
          <div style={{ animation: 'fadeIn 0.2s ease both' }}>
            {polls.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingTop: 24 }}>No polls available yet.</p>
            ) : polls.map(poll => (
              <a key={poll.id} href={`${boardUrl}/polls/${poll.id}`} target="_blank" rel="noopener" style={{ textDecoration: 'none', display: 'block', padding: '12px', borderRadius: 12, border: '1px solid #f0f0f0', marginBottom: 10, transition: 'all 0.2s', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor, e.currentTarget.style.boxShadow = `0 0 0 2px ${accentColor}20`)} onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0', e.currentTarget.style.boxShadow = 'none')}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d', margin: 0, marginBottom: 4 }}>{poll.title}</p>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{poll.options?.length || 0} options · Vote now</p>
              </a>
            ))}
          </div>
        )}

        {tab === 'surveys' && (
          <div style={{ animation: 'fadeIn 0.2s ease both' }}>
            {surveys.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingTop: 24 }}>No surveys available yet.</p>
            ) : surveys.map(survey => (
              <a key={survey.id} href={`${boardUrl}/surveys/${survey.id}`} target="_blank" rel="noopener" style={{ textDecoration: 'none', display: 'block', padding: '12px', borderRadius: 12, border: '1px solid #f0f0f0', marginBottom: 10, transition: 'all 0.2s', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor, e.currentTarget.style.boxShadow = `0 0 0 2px ${accentColor}20`)} onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0', e.currentTarget.style.boxShadow = 'none')}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d', margin: 0, marginBottom: 4 }}>{survey.title}</p>
                <p style={{ fontSize: 12, color: '#6b7280', margin: 0 }}>{survey.questions?.length || 0} questions · {survey.responses || 0} responses</p>
              </a>
            ))}
          </div>
        )}

        {tab === 'help' && (
          <div style={{ animation: 'fadeIn 0.2s ease both' }}>
            {helpArticles.length === 0 ? (
              <p style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingTop: 24 }}>No help articles available yet.</p>
            ) : helpArticles.map(article => (
              <a key={article.id} href={`${boardUrl}/help/${article.slug}`} target="_blank" rel="noopener" style={{ textDecoration: 'none', display: 'block', padding: '12px', borderRadius: 12, border: '1px solid #f0f0f0', marginBottom: 10, transition: 'all 0.2s', cursor: 'pointer' }} onMouseEnter={e => (e.currentTarget.style.borderColor = accentColor, e.currentTarget.style.boxShadow = `0 0 0 2px ${accentColor}20`)} onMouseLeave={e => (e.currentTarget.style.borderColor = '#f0f0f0', e.currentTarget.style.boxShadow = 'none')}>
                <p style={{ fontSize: 13, fontWeight: 700, color: '#0d0d0d', margin: 0, marginBottom: 4 }}>{article.title}</p>
                {article.content && <p style={{ fontSize: 12, color: '#6b7280', margin: 0, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{article.content}</p>}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Footer nav */}
      <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '1px solid #f0f0f0', display: 'flex', padding: '10px 16px' }}>
        {(['feedback', 'roadmap', 'updates', 'forms', 'polls', 'surveys', 'help'] as const).map(t => {
          const icons: Record<string, string> = {
            feedback: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z',
            roadmap: 'M22 12H18L15 21 9 3 6 12 2 12',
            updates: 'M22 2L11 13 M22 2L15 22 11 13 2 9l20-7z',
            forms: 'M4 4h16v16H4z',
            polls: 'M18 20V10M12 20V6M6 20V14',
            surveys: 'M9 11l3 3L22 4',
            help: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z',
          }
          return (
            <button key={t} onClick={() => { setTab(t); trackWidgetEvent(`view_${t}`) }}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', color: tab === t ? accentColor : '#9ca3af' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {t === 'feedback' && <path d={icons.feedback}/>}
                {t === 'roadmap' && <polyline points={icons.roadmap.split(' ').map(p => p.replace('L','')).join(' ')}/>}
                {t === 'updates' && <><path d="M22 2L11 13"/><path d="M22 2L15 22 11 13 2 9l20-7z"/></>}
                {t === 'forms' && <rect x="3" y="3" width="18" height="18" rx="2"/>}
                {t === 'polls' && <><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="6"/><line x1="6" y1="20" x2="6" y2="14"/></>}
                {t === 'surveys' && <><path d="M9 11l3 3L22 4"/></>}
                {t === 'help' && <circle cx="12" cy="12" r="10"/>}
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
