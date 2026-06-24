'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'

const ADMIN_EMAIL = 'bishalstha76@gmail.com'
const CATEGORIES = ['Getting Started', 'Features', 'Billing', 'Integrations', 'Troubleshooting', 'API', 'Other']

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)}
      className="relative inline-flex h-6 w-11 items-center rounded-full transition-colors cursor-pointer"
      style={{ background: checked ? 'var(--coral)' : '#d1d5db' }}>
      <span className="inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow"
        style={{ transform: checked ? 'translateX(24px)' : 'translateX(4px)' }} />
    </button>
  )
}

type MediaItem = { type: 'image' | 'video' | 'youtube' | 'gif'; src: string; caption?: string }

export default function NewHelpArticlePage() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const editId = searchParams?.get('edit')
  const fileInputRef = useRef<HTMLInputElement>(null)
  const contentRef = useRef<HTMLTextAreaElement>(null)

  const [user, setUser] = useState<any>(null)
  const [saving, setSaving] = useState(false)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [category, setCategory] = useState('Getting Started')
  const [status, setStatus] = useState('draft')
  const [featured, setFeatured] = useState(false)
  const [mediaItems, setMediaItems] = useState<MediaItem[]>([])
  const [showYoutubeModal, setShowYoutubeModal] = useState(false)
  const [youtubeUrl, setYoutubeUrl] = useState('')
  const [showMediaGallery, setShowMediaGallery] = useState(false)
  const [uploadingMedia, setUploadingMedia] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }: any) => {
      const u = data?.session?.user
      if (u?.email !== ADMIN_EMAIL) { router.push('/'); return }
      setUser(u)
      if (editId) loadArticle(editId)
    })
  }, [editId, router])

  const loadArticle = async (id: string) => {
    if (id.startsWith('demo-')) {
      const DEMO: Record<string, any> = {
        'demo-1': { title: 'Getting started with Frill', content: 'Welcome to Frill! This guide will help you set up your feedback board in minutes.\n\n## Step 1: Create your board\n\nAfter signing up, your feedback board is automatically created. You can customize it from the Admin panel.\n\n## Step 2: Invite your team\n\nGo to Admin → Team Members to invite colleagues.\n\n## Step 3: Collect feedback\n\nShare your board URL with customers and start collecting ideas.', category: 'Getting Started', status: 'published', featured: true },
        'demo-2': { title: 'How to create and manage ideas', content: 'Ideas are the core of Frill. Here\'s how to manage them effectively.\n\n## Creating ideas\n\nClick "Share an Idea" on your board to submit new ideas.\n\n## Voting\n\nUsers can upvote ideas they care about.\n\n## Status management\n\nUpdate idea status to keep users informed.', category: 'Features', status: 'published', featured: true },
        'demo-5': { title: 'Embedding the Frill widget', content: 'Add Frill to your app with a simple JavaScript snippet.\n\n## Installation\n\nPaste this code before the closing </body> tag:\n\n```html\n<script src="https://yourapp.frill.co/embed.js"></script>\n```', category: 'Integrations', status: 'published', featured: true },
      }
      const demo = DEMO[id]
      if (demo) { setTitle(demo.title); setContent(demo.content); setCategory(demo.category); setStatus(demo.status); setFeatured(demo.featured) }
      return
    }
    try {
      const { data } = await (supabase as any).from('help_articles').select('*').eq('id', id).single()
      if (data) {
        setTitle(data.title || '')
        setContent(data.content || '')
        setCategory(data.category || 'Getting Started')
        setStatus(data.status || 'draft')
        setFeatured(data.featured || false)
        setMediaItems(data.media || [])
      }
    } catch (err) { console.error(err) }
  }

  const handlePublish = async () => {
    if (!title.trim()) { alert('Title is required'); return }
    setSaving(true)
    try {
      const payload = { title: title.trim(), content: content.trim(), category, status, featured, media: mediaItems }
      if (editId && !editId.startsWith('demo-')) {
        await (supabase as any).from('help_articles').update(payload).eq('id', editId)
      } else {
        await (supabase as any).from('help_articles').insert({ ...payload, views: 0, likes: 0 })
      }
      router.push('/admin/help')
    } catch (err: any) { alert('Error: ' + err.message) }
    setSaving(false)
  }

  const insertAtCursor = (text: string) => {
    const el = contentRef.current
    if (!el) { setContent(prev => prev + '\n' + text); return }
    const start = el.selectionStart
    const end = el.selectionEnd
    const newContent = content.slice(0, start) + text + content.slice(end)
    setContent(newContent)
    setTimeout(() => { el.focus(); el.setSelectionRange(start + text.length, start + text.length) }, 0)
  }

  const handleFileUpload = async (files: FileList | null) => {
    if (!files) return
    setUploadingMedia(true)
    for (const file of Array.from(files)) {
      const isImage = file.type.startsWith('image/')
      const isVideo = file.type.startsWith('video/')
      const isGif = file.type === 'image/gif'
      if (!isImage && !isVideo) { alert(`${file.name} is not a supported format`); continue }
      const reader = new FileReader()
      reader.onload = (ev) => {
        const src = ev.target?.result as string
        const type: MediaItem['type'] = isVideo ? 'video' : isGif ? 'gif' : 'image'
        const newItem: MediaItem = { type, src, caption: file.name.replace(/\.[^/.]+$/, '') }
        setMediaItems(prev => [...prev, newItem])
        // Also insert markdown into content
        if (type === 'video') {
          insertAtCursor(`\n[video:${mediaItems.length}]\n`)
        } else {
          insertAtCursor(`\n![${newItem.caption}](${src.slice(0, 50)}...)\n`)
        }
      }
      reader.readAsDataURL(file)
    }
    setUploadingMedia(false)
  }

  const addYoutubeEmbed = () => {
    if (!youtubeUrl.trim()) return
    // Extract video ID
    const match = youtubeUrl.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
    const videoId = match?.[1] || youtubeUrl
    const newItem: MediaItem = { type: 'youtube', src: videoId, caption: 'YouTube Video' }
    setMediaItems(prev => [...prev, newItem])
    insertAtCursor(`\n[youtube:${videoId}]\n`)
    setYoutubeUrl('')
    setShowYoutubeModal(false)
  }

  const applyFormat = (before: string, after: string = '') => {
    const el = contentRef.current
    if (!el) return
    const start = el.selectionStart
    const end = el.selectionEnd
    const selected = content.slice(start, end) || 'text'
    const newContent = content.slice(0, start) + before + selected + after + content.slice(end)
    setContent(newContent)
    setTimeout(() => { el.focus(); el.setSelectionRange(start + before.length, start + before.length + selected.length) }, 0)
  }

  if (!user) return <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>Loading...</div>

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      {/* Top bar */}
      <div className="sticky top-0 z-40 bg-white border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-7xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Link href="/admin/help" className="p-1.5 rounded-lg hover:bg-gray-100 cursor-pointer" style={{ color: 'var(--slate)' }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
            </Link>
            <h1 className="text-base font-semibold" style={{ color: 'var(--ink)' }}>{editId ? 'Edit Article' : 'New Help Article'}</h1>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowMediaGallery(!showMediaGallery)}
              className="px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer hover:bg-gray-50"
              style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
              🖼️ Media ({mediaItems.length})
            </button>
            <button onClick={handlePublish} disabled={saving || !title.trim()}
              className="px-5 py-2 rounded-lg text-sm font-semibold text-white disabled:opacity-50 cursor-pointer"
              style={{ background: 'var(--coral)' }}>
              {saving ? 'Saving...' : 'Publish'}
            </button>
          </div>
        </div>
      </div>

      {/* Media Gallery Panel */}
      {showMediaGallery && (
        <div className="border-b bg-white" style={{ borderColor: 'var(--border)' }}>
          <div className="max-w-7xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between mb-3">
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Media Gallery</p>
              <div className="flex gap-2">
                <label className="px-3 py-1.5 rounded-lg border text-sm font-medium cursor-pointer hover:bg-gray-50 flex items-center gap-1.5"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  <input ref={fileInputRef} type="file" accept="image/*,video/*,.gif" multiple className="hidden"
                    onChange={e => handleFileUpload(e.target.files)} />
                  {uploadingMedia ? '⏳ Uploading...' : '📁 Upload Files'}
                </label>
                <button onClick={() => setShowYoutubeModal(true)}
                  className="px-3 py-1.5 rounded-lg border text-sm font-medium cursor-pointer hover:bg-gray-50 flex items-center gap-1.5"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  ▶️ YouTube Link
                </button>
              </div>
            </div>
            {mediaItems.length === 0 ? (
              <div className="border-2 border-dashed rounded-xl py-8 text-center cursor-pointer hover:bg-gray-50 transition-all"
                style={{ borderColor: 'var(--border)' }}
                onClick={() => fileInputRef.current?.click()}>
                <p className="text-2xl mb-2">🖼️</p>
                <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Upload images, GIFs, or videos</p>
                <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Click to browse or drag and drop</p>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                {mediaItems.map((item, i) => (
                  <div key={i} className="relative group rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                    {item.type === 'youtube' ? (
                      <div className="w-32 h-24 flex flex-col items-center justify-center" style={{ background: '#fee2e2' }}>
                        <span className="text-2xl">▶️</span>
                        <span className="text-xs mt-1" style={{ color: 'var(--ink)' }}>YouTube</span>
                      </div>
                    ) : item.type === 'video' ? (
                      <video src={item.src} className="w-32 h-24 object-cover" muted />
                    ) : (
                      <img src={item.src} alt={item.caption} className="w-32 h-24 object-cover" />
                    )}
                    <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-40 transition-all flex items-center justify-center gap-1 opacity-0 group-hover:opacity-100">
                      <button onClick={() => { if (item.type === 'youtube') insertAtCursor(`\n[youtube:${item.src}]\n`); else insertAtCursor(`\n![${item.caption}](media:${i})\n`) }}
                        className="px-2 py-1 rounded text-xs font-bold text-white cursor-pointer" style={{ background: 'var(--coral)' }}>
                        Insert
                      </button>
                      <button onClick={() => setMediaItems(prev => prev.filter((_, j) => j !== i))}
                        className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white cursor-pointer" style={{ background: '#ef4444' }}>
                        ✕
                      </button>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 bg-black bg-opacity-50 px-2 py-0.5">
                      <p className="text-xs text-white truncate">{item.caption || item.type}</p>
                    </div>
                  </div>
                ))}
                <label className="w-32 h-24 rounded-xl border-2 border-dashed flex items-center justify-center cursor-pointer hover:bg-gray-50 transition-all"
                  style={{ borderColor: 'var(--border)' }}>
                  <input type="file" accept="image/*,video/*,.gif" multiple className="hidden" onChange={e => handleFileUpload(e.target.files)} />
                  <div className="text-center">
                    <p className="text-xl">+</p>
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>Add more</p>
                  </div>
                </label>
              </div>
            )}
          </div>
        </div>
      )}

      {/* YouTube Modal */}
      {showYoutubeModal && (
        <>
          <div className="fixed inset-0 bg-black bg-opacity-40 z-50" onClick={() => setShowYoutubeModal(false)} />
          <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 bg-white rounded-2xl border p-6 w-96" style={{ borderColor: 'var(--border)' }}>
            <h3 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Embed YouTube Video</h3>
            <input value={youtubeUrl} onChange={e => setYoutubeUrl(e.target.value)}
              placeholder="https://www.youtube.com/watch?v=..."
              className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none mb-4"
              style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
            <div className="flex gap-2">
              <button onClick={addYoutubeEmbed} disabled={!youtubeUrl.trim()}
                className="flex-1 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: 'var(--coral)' }}>
                Embed Video
              </button>
              <button onClick={() => setShowYoutubeModal(false)}
                className="flex-1 py-2 rounded-lg text-sm font-medium border cursor-pointer"
                style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                Cancel
              </button>
            </div>
          </div>
        </>
      )}

      {/* Main content */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="flex gap-8">
          {/* Editor */}
          <div className="flex-1 min-w-0 space-y-4">
            <input type="text" value={title} onChange={e => setTitle(e.target.value)}
              placeholder="Article title"
              className="w-full text-3xl font-bold bg-transparent focus:outline-none placeholder:font-bold placeholder:opacity-30"
              style={{ color: 'var(--ink)', caretColor: 'var(--coral)' }} />

            {/* Toolbar */}
            <div className="flex items-center gap-1 border-b pb-3 flex-wrap" style={{ borderColor: 'var(--border)' }}>
              {[
                { label: 'B', action: () => applyFormat('**', '**'), title: 'Bold' },
                { label: 'I', style: 'italic', action: () => applyFormat('*', '*'), title: 'Italic' },
                { label: 'U', style: 'underline', action: () => applyFormat('__', '__'), title: 'Underline' },
              ].map(btn => (
                <button key={btn.label} onClick={btn.action} title={btn.title}
                  className={`w-8 h-8 rounded flex items-center justify-center text-sm font-bold hover:bg-gray-100 cursor-pointer ${btn.style || 'font-bold'}`}
                  style={{ color: 'var(--slate)' }}>{btn.label}</button>
              ))}
              <div className="w-px h-5 mx-1" style={{ background: 'var(--border)' }} />
              {['## ', '### ', '#### '].map((h, i) => (
                <button key={h} onClick={() => insertAtCursor('\n' + h)} title={`Heading ${i + 2}`}
                  className="px-2 h-8 rounded text-xs font-bold hover:bg-gray-100 cursor-pointer" style={{ color: 'var(--slate)' }}>
                  H{i + 2}
                </button>
              ))}
              <div className="w-px h-5 mx-1" style={{ background: 'var(--border)' }} />
              <button onClick={() => insertAtCursor('\n- item\n- item\n')} title="Bullet list"
                className="w-8 h-8 rounded flex items-center justify-center hover:bg-gray-100 cursor-pointer" style={{ color: 'var(--slate)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1" fill="currentColor"/><circle cx="4" cy="12" r="1" fill="currentColor"/><circle cx="4" cy="18" r="1" fill="currentColor"/></svg>
              </button>
              <button onClick={() => insertAtCursor('\n1. item\n2. item\n')} title="Numbered list"
                className="w-8 h-8 rounded flex items-center justify-center hover:bg-gray-100 cursor-pointer" style={{ color: 'var(--slate)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="10" y1="6" x2="21" y2="6"/><line x1="10" y1="12" x2="21" y2="12"/><line x1="10" y1="18" x2="21" y2="18"/><path d="M4 6h1v4"/><path d="M4 10H6"/><path d="M6 18H4l2-2a1.5 1.5 0 0 0-3 0"/></svg>
              </button>
              <button onClick={() => insertAtCursor('\n```\ncode here\n```\n')} title="Code block"
                className="w-8 h-8 rounded flex items-center justify-center hover:bg-gray-100 cursor-pointer" style={{ color: 'var(--slate)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>
              </button>
              <button onClick={() => insertAtCursor('\n> Quote text\n')} title="Quote"
                className="w-8 h-8 rounded flex items-center justify-center hover:bg-gray-100 cursor-pointer" style={{ color: 'var(--slate)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z"/></svg>
              </button>
              <button onClick={() => insertAtCursor('\n---\n')} title="Divider"
                className="w-8 h-8 rounded flex items-center justify-center hover:bg-gray-100 cursor-pointer" style={{ color: 'var(--slate)' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
              <div className="w-px h-5 mx-1" style={{ background: 'var(--border)' }} />
              {/* Media buttons */}
              <label title="Upload image/gif/video" className="w-8 h-8 rounded flex items-center justify-center hover:bg-gray-100 cursor-pointer" style={{ color: 'var(--coral)' }}>
                <input type="file" accept="image/*,video/*,.gif" multiple className="hidden" onChange={e => { handleFileUpload(e.target.files); setShowMediaGallery(true) }} />
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              </label>
              <button onClick={() => setShowYoutubeModal(true)} title="Embed YouTube" className="w-8 h-8 rounded flex items-center justify-center hover:bg-gray-100 cursor-pointer" style={{ color: '#ef4444' }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M23.5 6.2a3 3 0 0 0-2.1-2.1C19.5 3.5 12 3.5 12 3.5s-7.5 0-9.4.6A3 3 0 0 0 .5 6.2C0 8.1 0 12 0 12s0 3.9.5 5.8a3 3 0 0 0 2.1 2.1C4.5 20.5 12 20.5 12 20.5s7.5 0 9.4-.6a3 3 0 0 0 2.1-2.1C24 15.9 24 12 24 12s0-3.9-.5-5.8zM9.75 15.5v-7l6.5 3.5-6.5 3.5z"/></svg>
              </button>
            </div>

            <textarea ref={contentRef} value={content} onChange={e => setContent(e.target.value)}
              placeholder="Write your help article here...

Use ## for headings, **bold**, *italic*, `code`
Bullets with - item
YouTube: paste a link using the ▶️ button above
Images: upload using the 🖼️ button above"
              rows={22}
              className="w-full bg-transparent focus:outline-none resize-none text-base leading-relaxed font-mono"
              style={{ color: 'var(--ink)', caretColor: 'var(--coral)', fontSize: '15px' }} />

            {/* Media preview in content */}
            {mediaItems.length > 0 && (
              <div className="rounded-xl border p-4" style={{ borderColor: 'var(--border)', background: 'var(--canvas)' }}>
                <p className="text-xs font-semibold mb-3" style={{ color: 'var(--slate)' }}>ATTACHED MEDIA ({mediaItems.length})</p>
                <div className="grid grid-cols-4 gap-2">
                  {mediaItems.map((item, i) => (
                    <div key={i} className="relative rounded-lg overflow-hidden border group" style={{ borderColor: 'var(--border)' }}>
                      {item.type === 'youtube' ? (
                        <div className="aspect-video flex items-center justify-center" style={{ background: '#fef2f2' }}>
                          <img src={`https://img.youtube.com/vi/${item.src}/mqdefault.jpg`} alt="" className="w-full h-full object-cover" onError={(e: any) => { e.target.style.display='none' }} />
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }}>
                              <span className="text-white text-sm">▶</span>
                            </div>
                          </div>
                        </div>
                      ) : item.type === 'video' ? (
                        <video src={item.src} className="w-full aspect-video object-cover" muted />
                      ) : (
                        <img src={item.src} alt={item.caption} className="w-full aspect-video object-cover" />
                      )}
                      <button onClick={() => setMediaItems(prev => prev.filter((_, j) => j !== i))}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs text-white opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                        style={{ background: '#ef4444' }}>✕</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="w-72 shrink-0 space-y-4">
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Overview</p>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--slate)' }}>Status</label>
                  <div className="flex gap-2">
                    {['draft', 'published'].map(s => (
                      <button key={s} onClick={() => setStatus(s)}
                        className="flex-1 py-1.5 rounded-lg text-xs font-semibold border capitalize cursor-pointer transition-all"
                        style={{ background: status === s ? 'var(--peach)' : 'white', borderColor: status === s ? 'var(--coral)' : 'var(--border)', color: status === s ? 'var(--coral)' : 'var(--slate)' }}>
                        {s === 'draft' ? '● Draft' : '◉ Published'}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="text-xs font-medium block mb-1.5" style={{ color: 'var(--slate)' }}>Category</label>
                  <select value={category} onChange={e => setCategory(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                    style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                    {CATEGORIES.map(c => <option key={c}>{c}</option>)}
                  </select>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>Featured</p>
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>Show on help home</p>
                  </div>
                  <Toggle checked={featured} onChange={setFeatured} />
                </div>
              </div>
            </div>

            {/* Media upload card */}
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-4 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Media</p>
              </div>
              <div className="p-4 space-y-2">
                <label className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-sm cursor-pointer hover:bg-gray-50 transition-all"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  <input type="file" accept="image/*,.gif" multiple className="hidden" onChange={e => { handleFileUpload(e.target.files); setShowMediaGallery(true) }} />
                  🖼️ Upload images / GIFs
                </label>
                <label className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-sm cursor-pointer hover:bg-gray-50 transition-all"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  <input type="file" accept="video/*" multiple className="hidden" onChange={e => { handleFileUpload(e.target.files); setShowMediaGallery(true) }} />
                  🎬 Upload video
                </label>
                <button onClick={() => setShowYoutubeModal(true)}
                  className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-sm cursor-pointer hover:bg-gray-50 transition-all text-left"
                  style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                  ▶️ Embed YouTube
                </button>
                {mediaItems.length > 0 && (
                  <button onClick={() => setShowMediaGallery(!showMediaGallery)}
                    className="flex items-center gap-2 w-full px-3 py-2 rounded-lg border text-sm cursor-pointer hover:bg-gray-50 transition-all text-left"
                    style={{ borderColor: 'var(--coral)', color: 'var(--coral)', background: 'var(--peach)' }}>
                    📁 View gallery ({mediaItems.length})
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-2xl border p-4" style={{ borderColor: 'var(--border)' }}>
              <p className="text-xs font-semibold mb-2" style={{ color: 'var(--slate)' }}>MARKDOWN TIPS</p>
              <div className="space-y-1 text-xs" style={{ color: 'var(--slate)', fontFamily: 'monospace' }}>
                <p>**bold** → <strong>bold</strong></p>
                <p>*italic* → <em>italic</em></p>
                <p>## Heading</p>
                <p>`inline code`</p>
                <p>- bullet list</p>
                <p>1. numbered list</p>
                <p>[youtube:videoId]</p>
                <p>[video:0] (uploaded)</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
