'use client'

import { useState, useEffect } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getCompanyBySlug } from '@/lib/board'
import Link from 'next/link'

export default function BoardAccountPage() {
  const params = useParams()
  const slug = params?.slug as string
  const [company, setCompany] = useState<any>(null)
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedMsg, setSavedMsg] = useState('')

  // Profile fields
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [activeTab, setActiveTab] = useState<'profile'|'activity'|'notifications'>('profile')
  const [myIdeas, setMyIdeas] = useState<any[]>([])
  const [myVotes, setMyVotes] = useState<any[]>([])

  useEffect(() => {
    const load = async () => {
      const co = await getCompanyBySlug(slug)
      setCompany(co)
      const { data: { session } } = await supabase.auth.getSession()
      if (!session?.user) { window.location.href = `/signin?board=${slug}`; return }
      const u = session.user
      setUser(u)
      setDisplayName(u.user_metadata?.display_name || '')
      setEmail(u.email || '')
      setAvatarUrl(u.user_metadata?.avatar_url || '')

      if (co) {
        // Load user's ideas and votes on this board
        const { data: ideas } = await (supabase as any).from('ideas').select('*')
          .eq('company_id', co.id).eq('created_by', u.id).order('created_at', { ascending: false })
        setMyIdeas(ideas || [])

        const { data: votes } = await (supabase as any).from('votes').select('idea_id, ideas(title, votes)')
          .eq('user_id', u.id).eq('company_id', co.id)
        setMyVotes(votes || [])
      }
      setLoading(false)
    }
    load()
  }, [slug])

  const handleSave = async () => {
    setSaving(true)
    try {
      await supabase.auth.refreshSession()
      const updates: any = { data: { display_name: displayName, avatar_url: avatarUrl } }
      if (newPassword) updates.password = newPassword
      const { error } = await supabase.auth.updateUser(updates)
      if (error) throw error
      setSavedMsg('Saved!')
      setNewPassword('')
      setTimeout(() => setSavedMsg(''), 3000)
    } catch (err: any) { alert(err.message) }
    setSaving(false)
  }

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async ev => {
      const url = ev.target?.result as string
      setAvatarUrl(url)
    }
    reader.readAsDataURL(file)
  }

  const accentColor = company?.accent_color || 'var(--coral)'
  const initials = displayName?.[0]?.toUpperCase() || email?.[0]?.toUpperCase() || '?'

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <div className="w-8 h-8 rounded-full border-2 animate-spin" style={{ borderColor: accentColor, borderTopColor: 'transparent' }} />
    </div>
  )

  return (
    <div className="min-h-screen" style={{ background: 'var(--canvas)' }}>
      {/* Header */}
      <header className="sticky top-0 z-40 border-b bg-white" style={{ borderColor: 'var(--border)' }}>
        <div className="max-w-3xl mx-auto px-6 h-14 flex items-center justify-between">
          <Link href={`/board/${slug}`} className="flex items-center gap-2 font-bold" style={{ color: 'var(--ink)' }}>
            ← {company?.name}
          </Link>
          <span className="text-sm font-semibold" style={{ color: 'var(--slate)' }}>My Account</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-6 py-8">
        {/* Avatar + name */}
        <div className="flex items-center gap-5 mb-8">
          <label className="cursor-pointer group relative">
            <div className="w-20 h-20 rounded-full flex items-center justify-center text-2xl font-bold text-white overflow-hidden"
              style={{ background: accentColor }}>
              {avatarUrl ? <img src={avatarUrl} className="w-full h-full object-cover" /> : initials}
            </div>
            <div className="absolute inset-0 rounded-full bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all">
              <span className="text-white text-xs">Change</span>
            </div>
            <input type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
          </label>
          <div>
            <h1 className="text-2xl font-bold" style={{ color: 'var(--ink)' }}>{displayName || 'Your Account'}</h1>
            <p style={{ color: 'var(--slate)' }}>{email}</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex border-b mb-6" style={{ borderColor: 'var(--border)' }}>
          {[
            { key: 'profile', label: '👤 Profile' },
            { key: 'activity', label: '💡 My Ideas' },
            { key: 'notifications', label: '🔔 Notifications' },
          ].map(tab => (
            <button key={tab.key} onClick={() => setActiveTab(tab.key as any)}
              className="px-4 py-3 text-sm font-medium border-b-2 cursor-pointer transition-all"
              style={{ borderColor: activeTab === tab.key ? accentColor : 'transparent', color: activeTab === tab.key ? accentColor : 'var(--slate)' }}>
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'profile' && (
          <div className="space-y-5">
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Profile</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Display name</label>
                  <input value={displayName} onChange={e => setDisplayName(e.target.value)}
                    placeholder="Your name" className="w-full px-4 py-2.5 rounded-xl border focus:outline-none"
                    style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Email</label>
                  <input value={email} type="email" disabled
                    className="w-full px-4 py-2.5 rounded-xl border text-sm"
                    style={{ borderColor: 'var(--border)', background: 'var(--canvas)', color: 'var(--slate)' }} />
                  <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Contact support to change your email</p>
                </div>
              </div>
            </div>

            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
              <h2 className="font-bold mb-4" style={{ color: 'var(--ink)' }}>Change Password</h2>
              <div>
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>New password</label>
                <input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)}
                  placeholder="Leave blank to keep current"
                  className="w-full px-4 py-2.5 rounded-xl border focus:outline-none"
                  style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              {savedMsg && <span className="text-sm font-medium" style={{ color: '#10b981' }}>✓ {savedMsg}</span>}
              <button onClick={handleSave} disabled={saving}
                className="ml-auto px-8 py-3 rounded-xl font-semibold text-white cursor-pointer disabled:opacity-50"
                style={{ background: accentColor }}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>

            {/* Danger zone */}
            <div className="bg-white rounded-2xl border p-6" style={{ borderColor: '#fca5a5' }}>
              <h2 className="font-bold mb-2" style={{ color: '#dc2626' }}>Danger Zone</h2>
              <p className="text-sm mb-4" style={{ color: 'var(--slate)' }}>Permanently delete your account and all your data.</p>
              <button onClick={() => { if (confirm('Delete your account? This cannot be undone.')) supabase.auth.signOut() }}
                className="px-4 py-2 rounded-lg border text-sm font-medium cursor-pointer"
                style={{ borderColor: '#fca5a5', color: '#dc2626' }}>
                Delete Account
              </button>
            </div>
          </div>
        )}

        {activeTab === 'activity' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>Ideas I submitted ({myIdeas.length})</p>
              </div>
              {myIdeas.length === 0 ? (
                <p className="p-6 text-sm text-center" style={{ color: 'var(--slate)' }}>You haven't submitted any ideas yet</p>
              ) : myIdeas.map(idea => (
                <div key={idea.id} className="flex items-center justify-between px-5 py-3.5 border-b last:border-b-0 hover:bg-gray-50" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm font-medium" style={{ color: 'var(--ink)' }}>{idea.title}</p>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs px-2 py-0.5 rounded-full capitalize" style={{ background: 'var(--canvas)', color: 'var(--slate)' }}>{idea.status?.replace('_', ' ') || 'Under Review'}</span>
                    <span className="text-xs font-bold" style={{ color: accentColor }}>▲ {idea.votes || 0}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-2xl border overflow-hidden" style={{ borderColor: 'var(--border)' }}>
              <div className="px-5 py-3 border-b" style={{ borderColor: 'var(--border)' }}>
                <p className="font-bold text-sm" style={{ color: 'var(--ink)' }}>Ideas I voted on ({myVotes.length})</p>
              </div>
              {myVotes.length === 0 ? (
                <p className="p-6 text-sm text-center" style={{ color: 'var(--slate)' }}>You haven't voted on any ideas yet</p>
              ) : myVotes.map((v: any, i) => (
                <div key={i} className="flex items-center justify-between px-5 py-3.5 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm" style={{ color: 'var(--ink)' }}>{v.ideas?.title || 'Unknown idea'}</p>
                  <span className="text-xs font-bold" style={{ color: accentColor }}>▲ Voted</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'notifications' && (
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
            <h2 className="font-bold mb-5" style={{ color: 'var(--ink)' }}>Notification Preferences</h2>
            <div className="space-y-4">
              {[
                { label: 'Email me when my idea status changes', key: 'status' },
                { label: 'Email me when someone comments on my idea', key: 'comments' },
                { label: 'Email me about new announcements', key: 'announcements' },
              ].map(pref => (
                <div key={pref.key} className="flex items-center justify-between py-3 border-b last:border-b-0" style={{ borderColor: 'var(--border)' }}>
                  <span className="text-sm" style={{ color: 'var(--ink)' }}>{pref.label}</span>
                  <button className="relative inline-flex h-6 w-11 items-center rounded-full cursor-pointer" style={{ background: accentColor }}>
                    <span className="inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform" style={{ transform: 'translateX(24px)' }} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-6 text-center">
          <button onClick={async () => { await supabase.auth.signOut(); window.location.href = '/' }}
            className="text-sm cursor-pointer hover:underline" style={{ color: '#ef4444' }}>
            Sign out
          </button>
        </div>
      </div>
    </div>
  )
}
