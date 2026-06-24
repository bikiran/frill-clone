'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getRandomName } from '@/lib/randomNames'
import Link from 'next/link'

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [userIdeas, setUserIdeas] = useState<any[]>([])
  const [userComments, setUserComments] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'ideas' | 'comments' | 'edit'>('ideas')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [editName, setEditName] = useState('')
  const [editEmail, setEditEmail] = useState('')
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')
  const fileInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    const fetchUserData = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) {
        router.push('/signin')
        return
      }
      setUser(session.user)
      setEditEmail(session.user.email || '')
      const meta = session.user.user_metadata || {}
      setDisplayName(meta.display_name || getRandomName(session.user.id))
      setBio(meta.bio || '')
      setAvatarUrl(meta.avatar_url || '')
      setEditName(meta.display_name || '')

      const { data: ideas } = await supabase.from('ideas').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false })
      setUserIdeas(ideas || [])
      const { data: comments } = await supabase.from('comments').select('*').eq('user_id', session.user.id).order('created_at', { ascending: false })
      setUserComments(comments || [])
      setLoading(false)
    }
    fetchUserData()
  }, [router])

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !user) return
    setSaving(true)
    try {
      // Try storage upload first
      let publicUrl = ''
      const fileName = `avatars/${user.id}-${Date.now()}.${file.name.split('.').pop()}`
      try {
        const { data, error } = await supabase.storage.from('idea-images').upload(fileName, file, { upsert: true })
        if (!error && data) {
          const { data: { publicUrl: url } } = supabase.storage.from('idea-images').getPublicUrl(data.path)
          publicUrl = url
        }
      } catch {}

      // Fallback: use base64 data URL stored in user metadata
      if (!publicUrl) {
        await new Promise<void>((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = async (ev) => {
            publicUrl = ev.target?.result as string
            resolve()
          }
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
      }

      setAvatarUrl(publicUrl)
      await supabase.auth.refreshSession()
      await supabase.auth.updateUser({ data: { avatar_url: publicUrl } })
      setSavedMsg('Photo updated!')
      setTimeout(() => setSavedMsg(''), 2000)
    } catch (err: any) {
      alert('Upload failed: ' + err.message)
    }
    setSaving(false)
  }

  const handleDeleteAvatar = async () => {
    if (!confirm('Remove profile photo?')) return
    setSaving(true)
    setAvatarUrl('')
    await supabase.auth.updateUser({ data: { avatar_url: null } })
    setSavedMsg('Photo removed')
    setTimeout(() => setSavedMsg(''), 2000)
    setSaving(false)
  }

  const handleSaveProfile = async () => {
    setSaving(true)
    try {
      // Refresh session first to prevent "auth session missing" error
      await supabase.auth.refreshSession()
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        alert('Session expired. Please sign in again.')
        window.location.href = '/signin'
        return
      }
      const updates: any = { data: { display_name: editName, bio, avatar_url: avatarUrl } }
      if (editEmail && editEmail !== user.email) updates.email = editEmail
      const { error } = await supabase.auth.updateUser(updates)
      if (error) throw error
      setDisplayName(editName)
      setSavedMsg(editEmail !== user.email ? 'Email change requested — check your inbox!' : 'Profile saved!')
      setTimeout(() => setSavedMsg(''), 3000)
    } catch (err: any) {
      alert('Failed to save: ' + err.message)
    }
    setSaving(false)
  }

  if (loading) return <div className="min-h-screen p-8 flex items-center justify-center" style={{ background: 'var(--canvas)' }}><p style={{ color: 'var(--slate)' }}>Loading your profile...</p></div>
  if (!user) return null

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      <div className="bg-white border-b" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center gap-6 mb-4">
            <div className="relative group">
              {avatarUrl ? (
                <img src={avatarUrl} alt="Avatar" className="w-20 h-20 rounded-full object-cover border-4 border-white shadow-lg" />
              ) : (
                <div className="w-20 h-20 rounded-full flex items-center justify-center text-white text-3xl font-bold border-4 border-white shadow-lg" style={{ background: 'var(--coral)' }}>
                  {(displayName || user.email)?.charAt(0).toUpperCase()}
                </div>
              )}
              <button onClick={() => fileInputRef.current?.click()} disabled={saving}
                className="absolute inset-0 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity cursor-pointer" title="Upload photo">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              {avatarUrl && (
                <button onClick={handleDeleteAvatar}
                  className="absolute -top-1 -right-1 w-7 h-7 rounded-full bg-red-500 text-white text-xs flex items-center justify-center hover:bg-red-600 transition-colors cursor-pointer shadow-md" title="Remove photo">×</button>
              )}
            </div>
            <div className="flex-1">
              <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{displayName}</h1>
              <p className="text-sm" style={{ color: 'var(--slate)' }}>{user.email}</p>
              {bio && <p className="text-sm mt-2" style={{ color: 'var(--ink)' }}>{bio}</p>}
            </div>
            <button onClick={() => setActiveTab('edit')} className="px-4 py-2 rounded-lg border text-sm font-medium hover:bg-gray-50 transition-smooth cursor-pointer" style={{ borderColor: 'var(--border)', color: 'var(--ink)' }}>
              Edit Profile
            </button>
          </div>
          {savedMsg && (<div className="mt-3 p-3 rounded-lg text-sm" style={{ background: '#d1fae5', color: '#059669' }}>✓ {savedMsg}</div>)}
          <div className="flex gap-6 mt-4">
            <div><p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Ideas</p><p className="text-2xl font-bold" style={{ color: 'var(--coral)' }}>{userIdeas.length}</p></div>
            <div><p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--slate)' }}>Comments</p><p className="text-2xl font-bold" style={{ color: 'var(--coral)' }}>{userComments.length}</p></div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-4 border-b flex gap-4 bg-white" style={{ borderColor: 'var(--border)' }}>
        <button onClick={() => setActiveTab('ideas')} className="text-sm font-medium pb-2 border-b-2 transition-colors cursor-pointer" style={{ color: activeTab === 'ideas' ? 'var(--coral)' : 'var(--slate)', borderColor: activeTab === 'ideas' ? 'var(--coral)' : 'transparent' }}>My Ideas ({userIdeas.length})</button>
        <button onClick={() => setActiveTab('comments')} className="text-sm font-medium pb-2 border-b-2 transition-colors cursor-pointer" style={{ color: activeTab === 'comments' ? 'var(--coral)' : 'var(--slate)', borderColor: activeTab === 'comments' ? 'var(--coral)' : 'transparent' }}>My Comments ({userComments.length})</button>
        <button onClick={() => setActiveTab('edit')} className="text-sm font-medium pb-2 border-b-2 transition-colors cursor-pointer ml-auto" style={{ color: activeTab === 'edit' ? 'var(--coral)' : 'var(--slate)', borderColor: activeTab === 'edit' ? 'var(--coral)' : 'transparent' }}>⚙ Edit Profile</button>
      </div>

      <div className="max-w-4xl mx-auto px-6 py-8">
        {activeTab === 'edit' ? (
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--ink)' }}>Profile Information</h2>
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Display name</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} placeholder="Your name" className="w-full px-4 py-2.5 rounded-lg border focus:outline-none" style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>This is the name shown on your comments and ideas.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email address</label>
                <input type="email" value={editEmail} onChange={(e) => setEditEmail(e.target.value)} placeholder="you@example.com" className="w-full px-4 py-2.5 rounded-lg border focus:outline-none" style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Changing your email requires confirmation.</p>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Bio</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell others about yourself..." rows={3} className="w-full px-4 py-2.5 rounded-lg border focus:outline-none resize-none" style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
              <div className="flex justify-end pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <button onClick={handleSaveProfile} disabled={saving} className="px-6 py-2.5 rounded-xl font-semibold text-white text-sm transition-smooth press-effect cursor-pointer disabled:opacity-50" style={{ background: 'var(--coral)' }}>
                  {saving ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === 'ideas' ? (
          <div className="space-y-4">
            {userIdeas.length === 0 ? (
              <div className="text-center py-12"><p style={{ color: 'var(--slate)' }}>No ideas yet. Go create one!</p><Link href="/" className="text-blue-600 hover:text-blue-700 mt-2 inline-block">Submit an idea →</Link></div>
            ) : (
              userIdeas.map(idea => (
                <div key={idea.id} className="p-4 rounded-lg border bg-white hover:border-coral transition-colors cursor-pointer" style={{ borderColor: 'var(--border)' }} onClick={() => router.push(`/?idea=${idea.id}`)}>
                  <h3 className="font-semibold mb-1" style={{ color: 'var(--ink)' }}>{idea.title}</h3>
                  <p className="text-sm line-clamp-2 mb-2" style={{ color: 'var(--slate)' }}>{idea.description}</p>
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--slate)' }}>
                    <span className="px-2 py-1 rounded" style={{ background: 'var(--peach)' }}>{idea.votes} votes</span>
                    <span className="px-2 py-1 rounded" style={{ background: 'var(--canvas)' }}>{idea.status || 'new'}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {userComments.length === 0 ? (
              <div className="text-center py-12"><p style={{ color: 'var(--slate)' }}>No comments yet.</p></div>
            ) : (
              userComments.map(comment => (
                <div key={comment.id} className="p-4 rounded-lg border bg-white" style={{ borderColor: comment.is_private ? '#fbbf24' : 'var(--border)', background: comment.is_private ? '#fef3c7' : 'white' }}>
                  <p className="text-sm mb-2" style={{ color: 'var(--ink)' }}>{comment.content.length > 200 ? comment.content.slice(0, 200) + '...' : comment.content}</p>
                  <p className="text-xs" style={{ color: 'var(--slate)' }}>{new Date(comment.created_at).toLocaleDateString()}</p>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  )
}
