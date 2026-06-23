'use client'

import { useState, useEffect, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

const CATEGORIES = [
  { id: 'new_feature', label: 'New Feature', color: '#3b82f6', bg: '#dbeafe' },
  { id: 'improvement', label: 'Improvement', color: '#06b6d4', bg: '#cffafe' },
  { id: 'bug_fix', label: 'Fix', color: '#f97316', bg: '#ffedd5' },
  { id: 'announcement', label: 'Announcement', color: '#ef4444', bg: '#fee2e2' },
]

const ADMIN_EMAIL = 'bishalstha76@gmail.com'

export default function NewAnnouncementPage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [selectedCategories, setSelectedCategories] = useState<string[]>([])
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false)
  const [searchCategory, setSearchCategory] = useState('')
  
  // Section toggles
  const [showOverview, setShowOverview] = useState(true)
  const [showBoost, setShowBoost] = useState(true)
  const [showSegmentation, setShowSegmentation] = useState(true)
  
  // Form state
  const [boostEnabled, setBoostEnabled] = useState(false)
  const [displayAs, setDisplayAs] = useState('Snippet')
  const [boostUntil, setBoostUntil] = useState('Next Announcement')
  const [boostDate, setBoostDate] = useState('')
  const [buttonLabel, setButtonLabel] = useState('')
  const [boostTitle, setBoostTitle] = useState('')
  const [blurb, setBlurb] = useState('')
  const [showDisplayDropdown, setShowDisplayDropdown] = useState(false)
  const [showBoostUntilDropdown, setShowBoostUntilDropdown] = useState(false)
  const [notifySubscribers, setNotifySubscribers] = useState(false)
  const [language, setLanguage] = useState('English')
  const [segments, setSegments] = useState('')
  const [publishMenu, setPublishMenu] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState('')
  const [boostImageFile, setBoostImageFile] = useState<File | null>(null)
  const [boostImagePreview, setBoostImagePreview] = useState('')
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)
  const [uploadingImage, setUploadingImage] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const boostFileInputRef = useRef<HTMLInputElement>(null)
  const editorRef = useRef<HTMLDivElement>(null)

  const execFormat = (command: string, value?: string) => {
    editorRef.current?.focus()
    document.execCommand(command, false, value)
    if (editorRef.current) {
      setContent(editorRef.current.innerHTML)
    }
  }

  const handleEditorInput = () => {
    if (editorRef.current) {
      setContent(editorRef.current.innerHTML)
    }
  }

  const insertLink = () => {
    const url = prompt('Enter URL:', 'https://')
    if (url) execFormat('createLink', url)
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user
      if (u?.email !== ADMIN_EMAIL) {
        router.push('/')
        return
      }
      setUser(u)
    })
  }, [router])

  const toggleCategory = (id: string) => {
    if (selectedCategories.includes(id)) {
      setSelectedCategories(selectedCategories.filter(c => c !== id))
    } else {
      setSelectedCategories([...selectedCategories, id])
    }
  }

  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>, isBoost: boolean = false) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploadingImage(true)

    // Show local preview immediately
    const reader = new FileReader()
    reader.onload = (event) => {
      if (isBoost) {
        setBoostImagePreview(event.target?.result as string)
      } else {
        setImagePreview(event.target?.result as string)
      }
    }
    reader.readAsDataURL(file)

    // Upload to Supabase storage
    try {
      const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.]/g, '_')}`
      const { data, error } = await supabase.storage
        .from('idea-images')
        .upload(fileName, file)

      if (error) {
        console.error('Upload error:', error)
        alert('Failed to upload image: ' + error.message + '\n\nMake sure you ran DATABASE_SETUP.sql to create the storage bucket.')
        setUploadingImage(false)
        return
      }

      // Get public URL
      const { data: urlData } = supabase.storage.from('idea-images').getPublicUrl(data.path)
      
      if (isBoost) {
        setBoostImageFile(file)
        setBoostImagePreview(urlData.publicUrl)
      } else {
        setImageFile(file)
        setImagePreview(urlData.publicUrl)
        
        // Insert image into editor at cursor position
        if (editorRef.current) {
          editorRef.current.focus()
          document.execCommand('insertImage', false, urlData.publicUrl)
          setContent(editorRef.current.innerHTML)
        }
      }
    } catch (err: any) {
      console.error('Upload error:', err)
      alert('Upload failed: ' + err.message)
    }

    setUploadingImage(false)
  }

  const handlePublish = async (action: 'publish' | 'draft') => {
    if (!title.trim()) {
      alert('Please add a title before publishing')
      return
    }
    setPublishing(true)

    const primaryTag = selectedCategories[0] || 'announcement'

    const { error } = await supabase.from('announcements').insert({
      title: title.trim(),
      description: content.trim(),
      tag: primaryTag,
      views: 0,
      impressions: 0,
    })

    if (error) {
      alert('Failed to publish: ' + error.message)
      setPublishing(false)
      return
    }

    if (action === 'publish') {
      router.push('/announcements')
    } else {
      router.push('/admin/announcements')
    }
  }

  if (!user) return <div className="p-8" style={{ color: 'var(--slate)' }}>Loading...</div>

  const filteredCategories = CATEGORIES.filter(c =>
    !searchCategory || c.label.toLowerCase().includes(searchCategory.toLowerCase())
  )

  const status = title.trim() ? 'Draft' : 'Empty'

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      {/* Top Bar - Mobile Responsive */}
      <div className="sticky top-0 z-30 bg-white border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="flex items-center justify-between px-3 md:px-6 py-3 gap-2">
          <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
            <Link href="/admin/announcements" className="flex items-center gap-1 shrink-0 transition-smooth hover:opacity-70">
              <span className="text-xl">🌊</span>
              <span className="hidden sm:inline font-semibold text-sm truncate" style={{ color: 'var(--ink)' }}>
                arik
              </span>
            </Link>
            <div className="hidden md:block w-px h-6" style={{ background: 'var(--border)' }} />
            <div className="flex items-center gap-1 overflow-x-auto">
              <Link href="/" className="px-2 md:px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-gray-100 transition-smooth shrink-0" style={{ color: 'var(--slate)' }}>
                🏠 <span className="hidden md:inline">Home</span>
              </Link>
              <Link href="/" className="px-2 md:px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-gray-100 transition-smooth shrink-0" style={{ color: 'var(--slate)' }}>
                💡 <span className="hidden md:inline">Ideas</span>
              </Link>
              <Link href="/roadmap" className="px-2 md:px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 hover:bg-gray-100 transition-smooth shrink-0" style={{ color: 'var(--slate)' }}>
                🗺️ <span className="hidden md:inline">Roadmap</span>
              </Link>
              <button className="px-2 md:px-3 py-1.5 rounded-lg text-sm font-bold flex items-center gap-1 shrink-0" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                📢 <span className="hidden sm:inline">Announcements</span>
              </button>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3 shrink-0">
            <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ background: 'var(--canvas)' }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="m21 21-4.35-4.35" />
              </svg>
              <input type="text" placeholder="Search Ideas..." className="bg-transparent border-none outline-none text-sm w-32" style={{ color: 'var(--ink)' }} />
            </div>
            <button className="hidden md:flex w-8 h-8 rounded-full items-center justify-center transition-smooth hover:opacity-70" style={{ background: 'rgba(255,122,107,0.1)' }}>
              <span style={{ color: 'var(--coral)' }}>⚡</span>
            </button>
            <span className="hidden md:inline text-sm font-semibold" style={{ color: 'var(--slate)' }}>6</span>
            
            <button
              onClick={() => setMobileSidebarOpen(!mobileSidebarOpen)}
              className="lg:hidden px-3 py-1.5 rounded-lg font-semibold text-white text-sm shrink-0"
              style={{ background: 'var(--coral)' }}>
              Options
            </button>
            
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white font-bold text-sm shrink-0" style={{ background: 'var(--coral)' }}>
              A
            </div>
          </div>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-0 min-h-[calc(100vh-65px)]">
        {/* Editor */}
        <div className="flex-1 px-4 md:px-8 py-6 md:py-10">
          <div className="max-w-3xl mx-auto">
            <p className="text-sm mb-4 md:mb-6" style={{ color: 'var(--slate)' }}>Just now</p>

            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Tell your audience what you've shipped..."
              className="w-full text-2xl md:text-3xl lg:text-4xl font-bold border-none outline-none bg-transparent mb-6 placeholder-gray-300"
              style={{ color: 'var(--ink)' }}
            />

            {/* Categories */}
            <div className="relative mb-6">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => setShowCategoryDropdown(!showCategoryDropdown)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg border-2 border-dashed text-sm transition-smooth hover:bg-gray-50"
                  style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}>
                  <span>+ Categories</span>
                </button>

                {selectedCategories.map(catId => {
                  const cat = CATEGORIES.find(c => c.id === catId)
                  if (!cat) return null
                  return (
                    <span key={catId} className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium" style={{ background: cat.bg, color: cat.color }}>
                      ● {cat.label}
                      <button onClick={() => toggleCategory(catId)} className="ml-1 opacity-60 hover:opacity-100">×</button>
                    </span>
                  )
                })}
              </div>

              {showCategoryDropdown && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setShowCategoryDropdown(false)} />
                  <div className="absolute top-full left-0 mt-2 w-72 bg-white rounded-xl shadow-2xl border z-40 overflow-hidden animate-fade-in-up" style={{ borderColor: 'var(--border)' }}>
                    <div className="p-3 border-b" style={{ borderColor: 'var(--border)' }}>
                      <input
                        type="text"
                        autoFocus
                        value={searchCategory}
                        onChange={e => setSearchCategory(e.target.value)}
                        placeholder="Chip..."
                        className="w-full px-3 py-2 rounded-lg border-2 text-sm focus:outline-none"
                        style={{ borderColor: '#3b82f6', fontSize: '16px' }}
                      />
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {filteredCategories.map(cat => (
                        <button
                          key={cat.id}
                          onClick={() => toggleCategory(cat.id)}
                          className="w-full px-4 py-3 flex items-center gap-3 hover:bg-gray-50 transition-smooth text-left">
                          <span className="w-3 h-3 rounded-full border-2" style={{ borderColor: cat.color, background: selectedCategories.includes(cat.id) ? cat.color : 'transparent' }} />
                          <span className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{cat.label}</span>
                          {selectedCategories.includes(cat.id) && (
                            <span className="ml-auto text-xs" style={{ color: cat.color }}>✓</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="border-t" style={{ borderColor: 'var(--border)' }}>
                      <Link href="/admin/topics" className="block px-4 py-3 text-sm hover:bg-gray-50 transition-smooth" style={{ color: 'var(--slate)' }}>
                        <u>Manage categories</u>
                      </Link>
                    </div>
                  </div>
                </>
              )}
            </div>

            <div
              ref={editorRef}
              contentEditable
              onInput={handleEditorInput}
              data-placeholder="Start writing... or paste an image, video, gif..."
              className="rich-editor w-full text-base md:text-lg border-none outline-none bg-transparent min-h-[300px] mb-6"
              style={{ color: 'var(--ink)' }}
              suppressContentEditableWarning
            />

            {imagePreview && (
              <div className="relative mb-6 rounded-xl overflow-hidden border" style={{ borderColor: 'var(--border)' }}>
                <img src={imagePreview} alt="Preview" className="w-full max-h-96 object-cover" />
                <button
                  onClick={() => { setImageFile(null); setImagePreview('') }}
                  className="absolute top-3 right-3 px-3 py-1.5 bg-red-500 text-white text-sm rounded-lg press-effect">
                  Remove
                </button>
              </div>
            )}

            <div className="flex items-center gap-2 mt-8 pt-6 border-t" style={{ borderColor: 'var(--border)' }}>
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingImage}
                className="p-2 rounded-lg hover:bg-gray-100 transition-smooth press-effect disabled:opacity-50"
                title="Add image">
                {uploadingImage ? (
                  <span className="text-sm" style={{ color: 'var(--coral)' }}>...</span>
                ) : (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2">
                    <rect x="3" y="3" width="18" height="18" rx="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <path d="m21 15-5-5L5 21" />
                  </svg>
                )}
                <input ref={fileInputRef} type="file" accept="image/*" onChange={(e) => handleImageSelect(e, false)} className="hidden" />
              </button>
              <button 
                onClick={() => execFormat('bold')}
                className="p-2 rounded-lg hover:bg-gray-100 transition-smooth press-effect" 
                title="Bold (Ctrl+B)">
                <span className="text-sm font-bold" style={{ color: 'var(--slate)' }}>B</span>
              </button>
              <button 
                onClick={() => execFormat('italic')}
                className="p-2 rounded-lg hover:bg-gray-100 transition-smooth press-effect" 
                title="Italic (Ctrl+I)">
                <span className="text-sm italic" style={{ color: 'var(--slate)' }}>I</span>
              </button>
              <button 
                onClick={insertLink}
                className="p-2 rounded-lg hover:bg-gray-100 transition-smooth press-effect" 
                title="Link">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2">
                  <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
                  <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Right Sidebar */}
        {mobileSidebarOpen && (
          <div 
            className="lg:hidden fixed inset-0 bg-black/20 z-40"
            onClick={() => setMobileSidebarOpen(false)}
          />
        )}
        
        <aside 
          className={`${mobileSidebarOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'} fixed lg:relative right-0 top-[65px] lg:top-0 bottom-0 lg:bottom-auto w-80 lg:w-96 z-50 lg:z-auto bg-white lg:border-l transition-transform duration-300 overflow-y-auto`}
          style={{ borderColor: 'var(--border)' }}>
          <div className="p-4 md:p-6 space-y-4">
            {/* Publish button - now has Publish + Save as draft */}
            <div className="flex items-center gap-2 mb-6">
              <div className="flex-1 relative">
                <div className="flex">
                  <button
                    onClick={() => handlePublish('publish')}
                    disabled={publishing}
                    className="flex-1 px-6 py-3 rounded-l-xl font-semibold text-white text-sm transition-smooth press-effect futuristic-publish-btn disabled:opacity-50"
                    style={{ background: 'linear-gradient(135deg, var(--coral) 0%, #ff8f7f 100%)' }}>
                    {publishing ? 'Publishing...' : 'Publish'}
                  </button>
                  <button
                    onClick={() => setPublishMenu(!publishMenu)}
                    className="px-3 py-3 rounded-r-xl text-white border-l border-white/20 transition-smooth press-effect"
                    style={{ background: 'linear-gradient(135deg, var(--coral) 0%, #ff8f7f 100%)' }}>
                    ▼
                  </button>
                </div>
                {publishMenu && (
                  <>
                    <div className="fixed inset-0 z-30" onClick={() => setPublishMenu(false)} />
                    <div className="absolute top-full right-0 mt-2 w-48 bg-white rounded-xl shadow-2xl border z-40 overflow-hidden animate-fade-in-up" style={{ borderColor: 'var(--border)' }}>
                      <button onClick={() => { setPublishMenu(false); handlePublish('draft') }} className="w-full px-4 py-3 text-left text-sm hover:bg-gray-50 transition-smooth flex items-center gap-2">
                        📝 Save as draft
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button className="p-3 rounded-xl border hover:bg-gray-50 transition-smooth press-effect" style={{ borderColor: 'var(--border)' }} title="Preview">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <line x1="9" y1="3" x2="9" y2="21" />
                </svg>
              </button>
            </div>

            {/* Overview Section */}
            <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <button 
                onClick={() => setShowOverview(!showOverview)} 
                className="w-full flex items-center justify-between py-2 transition-smooth">
                <span className="text-base font-bold" style={{ color: 'var(--ink)' }}>Overview</span>
                <span className="text-lg transition-transform" style={{ transform: showOverview ? 'rotate(180deg)' : 'rotate(0)', color: 'var(--slate)' }}>⌄</span>
              </button>
              {showOverview && (
                <div className="pt-3 pb-1 space-y-3 animate-fade-in-up">
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--ink)' }}>Status</span>
                    <span className="text-xs font-medium px-2.5 py-1 rounded" style={{ background: 'var(--peach)', color: 'var(--coral)' }}>
                      {status}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--ink)' }}>Language</span>
                    <select 
                      value={language}
                      onChange={(e) => setLanguage(e.target.value)}
                      className="text-sm border-none bg-transparent cursor-pointer"
                      style={{ color: 'var(--ink)' }}>
                      <option>English</option>
                      <option>Spanish</option>
                      <option>French</option>
                      <option>German</option>
                      <option>Portuguese</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* BOOST ANNOUNCEMENT - Full Version */}
            <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <button 
                onClick={() => setShowBoost(!showBoost)} 
                className="w-full flex items-center justify-between py-2 transition-smooth">
                <span className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                  ⚡ Boost Announcement
                </span>
                <span className="text-lg transition-transform" style={{ transform: showBoost ? 'rotate(180deg)' : 'rotate(0)', color: 'var(--slate)' }}>⌄</span>
              </button>
              {showBoost && (
                <div className="pt-3 space-y-4 animate-fade-in-up">
                  {!boostEnabled && (
                    <p className="text-sm" style={{ color: 'var(--slate)' }}>
                      When enabled, choose how this Announcement will display in Widget
                    </p>
                  )}
                  
                  {/* Enabled toggle */}
                  <div className="flex items-center justify-between">
                    <span className="text-sm" style={{ color: 'var(--ink)' }}>Enabled</span>
                    <button
                      onClick={() => setBoostEnabled(!boostEnabled)}
                      className="relative w-11 h-6 rounded-full transition-smooth"
                      style={{ background: boostEnabled ? '#3b82f6' : '#d1d5db' }}>
                      <div 
                        className="absolute top-0.5 w-5 h-5 bg-white rounded-full shadow-md transition-transform"
                        style={{ transform: boostEnabled ? 'translateX(22px)' : 'translateX(2px)' }}
                      />
                    </button>
                  </div>

                  {/* Boost Settings - shown when enabled */}
                  {boostEnabled && (
                    <div className="space-y-4 animate-fade-in-up">
                      {/* Display as */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm" style={{ color: 'var(--ink)' }}>Display as</span>
                        <div className="flex items-center gap-2">
                          <button className="p-1.5 rounded-lg hover:bg-gray-100 transition-smooth" title="Preview">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--slate)" strokeWidth="2">
                              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                              <circle cx="12" cy="12" r="3" />
                            </svg>
                          </button>
                          <div className="relative">
                            <button 
                              onClick={() => setShowDisplayDropdown(!showDisplayDropdown)}
                              className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-smooth hover:bg-gray-50"
                              style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                              {displayAs} <span className="text-xs">⌄</span>
                            </button>
                            {showDisplayDropdown && (
                              <>
                                <div className="fixed inset-0 z-30" onClick={() => setShowDisplayDropdown(false)} />
                                <div className="absolute top-full right-0 mt-2 w-40 bg-white rounded-lg shadow-2xl border z-40 overflow-hidden" style={{ borderColor: 'var(--border)' }}>
                                  {['Snippet', 'Banner', 'Modal', 'Popover'].map(opt => (
                                    <button 
                                      key={opt}
                                      onClick={() => { setDisplayAs(opt); setShowDisplayDropdown(false) }}
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-smooth"
                                      style={{ color: 'var(--ink)' }}>
                                      {opt}
                                    </button>
                                  ))}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Boost until */}
                      <div className="flex items-center justify-between">
                        <span className="text-sm" style={{ color: 'var(--ink)' }}>Boost until</span>
                        <div className="relative">
                          <button 
                            onClick={() => setShowBoostUntilDropdown(!showBoostUntilDropdown)}
                            className="flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm transition-smooth hover:bg-gray-50"
                            style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                            {boostUntil} <span className="text-xs">⌄</span>
                          </button>
                          {showBoostUntilDropdown && (
                            <>
                              <div className="fixed inset-0 z-30" onClick={() => setShowBoostUntilDropdown(false)} />
                              <div className="absolute top-full right-0 mt-2 w-56 rounded-lg shadow-2xl z-40 overflow-hidden" style={{ background: '#1f2937' }}>
                                {['Next Announcement', 'Next Boosted Announcement', 'Date'].map(opt => (
                                  <button 
                                    key={opt}
                                    onClick={() => { setBoostUntil(opt); setShowBoostUntilDropdown(false) }}
                                    className="w-full px-3 py-2.5 text-left text-sm transition-smooth flex items-center gap-2"
                                    style={{ 
                                      color: 'white',
                                      background: boostUntil === opt ? '#3b82f6' : 'transparent'
                                    }}>
                                    {boostUntil === opt && '✓ '}
                                    {opt}
                                  </button>
                                ))}
                              </div>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Date picker if "Date" selected */}
                      {boostUntil === 'Date' && (
                        <input
                          type="date"
                          value={boostDate}
                          onChange={(e) => setBoostDate(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg border text-sm focus:outline-none"
                          style={{ borderColor: 'var(--border)', color: 'var(--ink)', fontSize: '16px' }}
                        />
                      )}

                      {/* Button label */}
                      <div>
                        <label className="text-sm block mb-2" style={{ color: 'var(--ink)' }}>Button label</label>
                        <input
                          type="text"
                          value={buttonLabel}
                          onChange={(e) => setButtonLabel(e.target.value)}
                          placeholder="View Announcement"
                          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                          style={{ background: '#f3f4f6', color: 'var(--ink)', fontSize: '16px', border: 'none' }}
                        />
                      </div>

                      {/* Title */}
                      <div>
                        <label className="text-sm block mb-2" style={{ color: 'var(--ink)' }}>Title</label>
                        <input
                          type="text"
                          value={boostTitle}
                          onChange={(e) => setBoostTitle(e.target.value)}
                          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none"
                          style={{ background: '#f3f4f6', color: 'var(--ink)', fontSize: '16px', border: 'none' }}
                        />
                      </div>

                      {/* Blurb */}
                      <div>
                        <label className="text-sm block mb-2" style={{ color: 'var(--ink)' }}>Blurb</label>
                        <textarea
                          value={blurb}
                          onChange={(e) => setBlurb(e.target.value)}
                          rows={3}
                          className="w-full px-3 py-2 rounded-lg text-sm focus:outline-none resize-none"
                          style={{ background: '#f3f4f6', color: 'var(--ink)', fontSize: '16px', border: 'none' }}
                        />
                      </div>

                      {/* Image upload */}
                      <div>
                        <label className="text-sm block mb-2" style={{ color: 'var(--ink)' }}>Image</label>
                        {boostImagePreview ? (
                          <div className="relative">
                            <img src={boostImagePreview} alt="Boost preview" className="w-full h-32 object-cover rounded-lg border" style={{ borderColor: 'var(--border)' }} />
                            <button
                              onClick={() => { setBoostImageFile(null); setBoostImagePreview('') }}
                              className="absolute top-2 right-2 px-2 py-1 bg-red-500 text-white text-xs rounded press-effect">
                              Remove
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => boostFileInputRef.current?.click()}
                            className="px-4 py-2 rounded-lg border text-sm transition-smooth hover:bg-gray-50 float-right"
                            style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
                            Upload
                          </button>
                        )}
                        <input ref={boostFileInputRef} type="file" accept="image/*" onChange={(e) => handleImageSelect(e, true)} className="hidden" />
                      </div>

                      <div className="clear-both" />

                      {/* Info box */}
                      <div className="p-3 rounded-lg text-xs leading-relaxed" style={{ background: '#dbeafe', color: '#1e40af' }}>
                        To use Boosted Announcements, you must first install the{' '}
                        <a href="#" className="underline font-semibold">Frill Script</a> and{' '}
                        <a href="#" className="underline font-semibold">create a Widget</a>.
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* SEGMENTATION */}
            <div className="border-t pt-4" style={{ borderColor: 'var(--border)' }}>
              <button 
                onClick={() => setShowSegmentation(!showSegmentation)} 
                className="w-full flex items-center justify-between py-2 transition-smooth">
                <span className="text-base font-bold flex items-center gap-2" style={{ color: 'var(--ink)' }}>
                  👥 Segmentation
                </span>
                <span className="text-lg transition-transform" style={{ transform: showSegmentation ? 'rotate(180deg)' : 'rotate(0)', color: 'var(--slate)' }}>⌄</span>
              </button>
              {showSegmentation && (
                <div className="pt-3 space-y-3 animate-fade-in-up">
                  <p className="text-sm" style={{ color: 'var(--ink)' }}>
                    Who should see this Announcement?
                  </p>
                  
                  <input
                    type="text"
                    value={segments}
                    onChange={(e) => setSegments(e.target.value)}
                    placeholder="Search segments..."
                    className="w-full px-4 py-2.5 rounded-lg border text-sm focus:outline-none transition-smooth"
                    style={{ borderColor: 'var(--border)', background: 'var(--canvas)', fontSize: '16px' }}
                  />
                  
                  <a href="#" className="text-sm font-medium" style={{ color: '#3b82f6' }}>
                    Manage segments
                  </a>
                </div>
              )}
            </div>

            {/* NOTIFY SUBSCRIBERS */}
            <div className="border-t pt-4 pb-2" style={{ borderColor: 'var(--border)' }}>
              <label className="flex items-center gap-3 cursor-pointer transition-smooth py-2">
                <input
                  type="checkbox"
                  checked={notifySubscribers}
                  onChange={e => setNotifySubscribers(e.target.checked)}
                  className="w-4 h-4 rounded"
                  style={{ accentColor: 'var(--coral)' }}
                />
                <span className="text-sm" style={{ color: 'var(--ink)' }}>Notify subscribers</span>
              </label>
            </div>
          </div>
        </aside>
      </div>

      {/* Help button */}
      <button className="fixed bottom-6 right-6 w-12 h-12 rounded-full bg-black text-white shadow-2xl hover:scale-110 transition-smooth z-20 flex items-center justify-center">
        💬
      </button>

      <style jsx>{`
        .futuristic-publish-btn {
          position: relative;
          overflow: hidden;
          box-shadow: 0 0 25px rgba(255, 122, 107, 0.5);
        }
        .futuristic-publish-btn::before {
          content: '';
          position: absolute;
          inset: 0;
          background: linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.3) 50%, transparent 70%);
          animation: publishShimmer 3s infinite;
          pointer-events: none;
        }
        @keyframes publishShimmer {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(100%); }
        }
      `}</style>
    </div>
  )
}
