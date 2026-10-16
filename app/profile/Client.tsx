'use client'

import { useState, useEffect, useRef, type ReactNode } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { authFetch } from '@/lib/auth-fetch'
import Link from 'next/link'
import { confirmDialog } from '@/components/ConfirmDialog'

// The company whose board this is, from the host (momo-hub.colvy.com, or the
// company's own board/help domain). On colvy.com itself there isn't one and the
// profile lists everything the person has posted.
async function boardCompanyId(): Promise<string | null> {
  if (typeof window === 'undefined') return null
  const h = window.location.hostname.toLowerCase()
  if (!h || h.includes('localhost') || h.endsWith('vercel.app') || !h.includes('.')) return null
  if (h === 'colvy.com' || h === 'www.colvy.com' || h === 'admin.colvy.com') return null
  try {
    const q = (supabase as any).from('companies').select('id')
    const { data } = h.endsWith('.colvy.com')
      ? await q.eq('slug', h.replace('.colvy.com', '')).maybeSingle()
      : await q.or(`help_domain.eq.${h},board_domain.eq.${h}`).maybeSingle()
    return data?.id || null
  } catch { return null }
}

type Tab = 'ideas' | 'comments' | 'votes' | 'edit'

const STATUS_STYLE: Record<string, { bg: string; fg: string; label: string }> = {
  new: { bg: '#f1f5f9', fg: '#475569', label: 'New' },
  under_review: { bg: '#fef3c7', fg: '#92400e', label: 'Under review' },
  planned: { bg: '#e0e7ff', fg: '#3730a3', label: 'Planned' },
  in_progress: { bg: '#dbeafe', fg: '#1d4ed8', label: 'In progress' },
  completed: { bg: '#dcfce7', fg: '#15803d', label: 'Done' },
  done: { bg: '#dcfce7', fg: '#15803d', label: 'Done' },
  closed: { bg: '#f1f5f9', fg: '#64748b', label: 'Closed' },
}
const statusStyle = (st?: string) => STATUS_STYLE[String(st || 'new').toLowerCase()] || { bg: '#f1f5f9', fg: '#475569', label: String(st || 'New').replace(/_/g, ' ') }

export default function ProfilePage() {
  const router = useRouter()
  const [user, setUser] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [userIdeas, setUserIdeas] = useState<any[]>([])
  const [userComments, setUserComments] = useState<any[]>([])
  // Ideas they've voted for, and how many they follow (null: couldn't tell).
  const [votedIdeas, setVotedIdeas] = useState<any[]>([])
  const [followingCount, setFollowingCount] = useState<number | null>(null)
  // Titles of the ideas their comments are on, for context.
  const [ideaTitles, setIdeaTitles] = useState<Record<string, string>>({})
  const [activeTab, setActiveTab] = useState<Tab>('ideas')
  const [displayName, setDisplayName] = useState('')
  const [bio, setBio] = useState('')
  const [avatarUrl, setAvatarUrl] = useState('')
  const [editName, setEditName] = useState('')
  const [editPhone, setEditPhone] = useState('')
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
      // Only generate a random name if the user has NO display name at all
      // (never override an existing display name with a random one)
      const stored = meta.display_name || (meta as any).full_name || session.user.email?.split('@')[0] || null
      setDisplayName(stored || '')
      setBio(meta.bio || '')
      setAvatarUrl(meta.avatar_url || '')
      setEditName(meta.display_name || '')
      // Mobile lives on team_members (it's a workspace detail, not an auth one).
      try {
        const { data: tm } = await (supabase as any).from('team_members')
          .select('phone').eq('user_id', session.user.id).limit(1)
        if (tm?.length && tm[0].phone) setEditPhone(tm[0].phone)
      } catch {}

      // On a company's board, only that company's ideas count.
      const companyId = await boardCompanyId()
      const uid = session.user.id
      const scoped = (q: any) => companyId ? q.eq('company_id', companyId) : q
      const ideasIn = async (ids: string[], cols: string) => {
        if (!ids.length) return [] as any[]
        const { data } = await scoped((supabase as any).from('ideas').select(cols).in('id', ids.slice(0, 300)))
        return (data || []) as any[]
      }

      const [ideasRes, commentsRes, votesRes, subsRes] = await Promise.all([
        scoped(supabase.from('ideas').select('*').eq('user_id', uid)).order('created_at', { ascending: false }),
        supabase.from('comments').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        (supabase as any).from('votes').select('idea_id, created_at').eq('user_id', uid).order('created_at', { ascending: false }).limit(300),
        (supabase as any).from('idea_subscriptions').select('idea_id').eq('user_id', uid).limit(300),
      ])
      setUserIdeas(ideasRes.data || [])

      const comments: any[] = commentsRes.data || []
      const commentIdeas = await ideasIn([...new Set(comments.map(c => c.idea_id).filter(Boolean))], 'id, title')
      const titles: Record<string, string> = {}
      for (const i of commentIdeas) titles[i.id] = i.title
      setIdeaTitles(titles)
      // On a company board, keep only comments on that company's ideas.
      setUserComments(companyId ? comments.filter(c => titles[c.idea_id] !== undefined) : comments)

      if (!votesRes.error) {
        const order = (votesRes.data || []).map((v: any) => v.idea_id).filter(Boolean)
        const rows = await ideasIn([...new Set<string>(order)], 'id, title, description, votes, status, created_at')
        const byId = new Map(rows.map(r => [r.id, r]))
        setVotedIdeas([...new Set<string>(order)].map(id => byId.get(id)).filter(Boolean))
      }
      if (!subsRes.error) {
        const ids = [...new Set<string>((subsRes.data || []).map((r: any) => r.idea_id).filter(Boolean))]
        setFollowingCount(companyId ? (await ideasIn(ids, 'id')).length : ids.length)
      }
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
    // Notify layout nav to update avatar immediately
    window.dispatchEvent(new CustomEvent('colvy-avatar-update', { detail: publicUrl }))
      setSavedMsg('Photo updated!')
      setTimeout(() => setSavedMsg(''), 2000)
    } catch (err: any) {
      alert('Upload failed: ' + err.message)
    }
    setSaving(false)
  }

  const handleDeleteAvatar = async () => {
    if (!await confirmDialog('Remove profile photo?')) return
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
      // Save the mobile on the workspace membership so SMS reminders can find it.
      // Through the server: the database no longer takes team_members writes
      // from the browser. It tidies the number into +61 form the same way.
      let phoneErr = ''
      try {
        const r = await authFetch('/api/team/me', {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ phone: editPhone.trim() || null }),
        })
        if (!r.ok) phoneErr = (await r.json().catch(() => ({})))?.error || 'the mobile wasn’t saved'
      } catch {}
      if (error) throw error
      setDisplayName(editName)
      setSavedMsg(editEmail !== user.email ? 'Email change requested — check your inbox!' : phoneErr ? `Profile saved, but not the mobile: ${phoneErr}` : 'Profile saved!')
      setTimeout(() => setSavedMsg(''), 3000)
    } catch (err: any) {
      alert('Failed to save: ' + err.message)
    }
    setSaving(false)
  }

  const name = displayName || user?.email?.split('@')[0] || 'You'
  const initial = (String(displayName || user?.email || '?').trim()[0] || '?').toUpperCase()

  if (loading) return (
    <div className="min-h-screen p-8 flex items-center justify-center" style={{ background: 'var(--canvas)' }}>
      <p style={{ color: 'var(--slate)' }}>Loading your profile…</p>
    </div>
  )
  if (!user) return null

  const stats: { key: Tab; label: string; value: number; icon: ReactNode }[] = [
    { key: 'ideas', label: 'Ideas', value: userIdeas.length, icon: <path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" /> },
    { key: 'comments', label: 'Comments', value: userComments.length, icon: <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /> },
    { key: 'votes', label: 'Votes', value: votedIdeas.length, icon: <polyline points="18 15 12 9 6 15" /> },
  ]
  const tabs: { key: Tab; label: string; count: number }[] = [
    { key: 'ideas', label: 'My ideas', count: userIdeas.length },
    { key: 'comments', label: 'My comments', count: userComments.length },
    { key: 'votes', label: 'Votes', count: votedIdeas.length },
  ]

  const empty = (title: string, text: string, cta = true) => (
    <div className="pf-empty">
      <div className="pf-empty-ic" aria-hidden="true">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2z" /></svg>
      </div>
      <p className="pf-empty-title">{title}</p>
      <p className="pf-empty-text">{text}</p>
      {cta && <Link href="/?view=ideas&new=1" className="pf-btn pf-btn-primary">Submit an idea</Link>}
    </div>
  )

  const ideaCard = (idea: any) => {
    const st = statusStyle(idea.status)
    return (
      <button key={idea.id} type="button" className="pf-card pf-idea" onClick={() => router.push(`/?idea=${idea.id}`)}>
        <div className="pf-votes" aria-label={`${idea.votes || 0} votes`}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="18 15 12 9 6 15" /></svg>
          <span>{idea.votes || 0}</span>
        </div>
        <div style={{ minWidth: 0, flex: 1 }}>
          <p className="pf-idea-title">{idea.title}</p>
          {idea.description && <p className="pf-idea-desc">{idea.description}</p>}
          <div className="pf-meta">
            <span className="pf-pill" style={{ background: st.bg, color: st.fg }}>{st.label}</span>
            {idea.created_at && <span>{new Date(idea.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>}
          </div>
        </div>
      </button>
    )
  }

  return (
    <div className="pf min-h-screen" style={{ background: 'var(--canvas)' }}>
      <style>{`
        .pf-wrap { padding-left: 32px; padding-right: 32px; }
        .pf-head { background: #fff; border-bottom: 1px solid var(--border); }
        .pf-top { display: flex; align-items: center; gap: 20px; padding-top: 28px; padding-bottom: 20px; }
        .pf-who { flex: 1; min-width: 0; }
        .pf-name { margin: 0; font-size: 24px; font-weight: 800; color: var(--ink); line-height: 1.2; overflow-wrap: anywhere; }
        .pf-email { margin: 2px 0 0; font-size: 14px; color: var(--slate); overflow-wrap: anywhere; }
        .pf-bio { margin: 8px 0 0; font-size: 14px; color: var(--ink); }
        .pf-btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: 9px 16px; border-radius: 10px; font-size: 14px; font-weight: 600; cursor: pointer; text-decoration: none; white-space: nowrap; }
        .pf-btn-secondary { background: #fff; border: 1px solid var(--border); color: var(--ink); }
        .pf-btn-secondary:hover { background: #f8fafc; }
        .pf-btn-primary { background: var(--coral); border: 1px solid var(--coral); color: #fff; }
        .pf-btn-primary:hover { filter: brightness(0.96); }
        .pf-stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; padding-bottom: 20px; }
        .pf-stat { display: flex; align-items: center; gap: 10px; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: #fff; text-align: left; cursor: pointer; }
        .pf-stat:hover { border-color: var(--coral); }
        .pf-stat-ic { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; background: var(--peach, #fff1ee); color: var(--coral); flex-shrink: 0; }
        .pf-stat-v { margin: 0; font-size: 19px; font-weight: 800; color: var(--ink); line-height: 1.1; }
        .pf-stat-l { margin: 0; font-size: 12px; color: var(--slate); font-weight: 600; }
        .pf-tabs { display: flex; gap: 22px; overflow-x: auto; scrollbar-width: none; border-top: 1px solid var(--border); }
        .pf-tabs::-webkit-scrollbar { display: none; }
        .pf-tab { flex-shrink: 0; background: none; border: 0; border-bottom: 2px solid transparent; padding: 13px 0 11px; font-size: 14px; font-weight: 600; color: var(--slate); cursor: pointer; white-space: nowrap; }
        .pf-tab[aria-selected="true"] { color: var(--coral); border-bottom-color: var(--coral); }
        .pf-count { margin-left: 6px; font-size: 12px; padding: 1px 7px; border-radius: 999px; background: #f1f5f9; color: var(--slate); }
        .pf-tab[aria-selected="true"] .pf-count { background: var(--peach, #fff1ee); color: var(--coral); }
        .pf-body { padding-top: 24px; padding-bottom: 48px; }
        .pf-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(360px, 1fr)); gap: 12px; }
        .pf-card { background: #fff; border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; text-align: left; }
        .pf-idea { display: flex; gap: 14px; align-items: flex-start; width: 100%; cursor: pointer; transition: border-color .15s ease; }
        .pf-idea:hover { border-color: var(--coral); }
        .pf-votes { display: flex; flex-direction: column; align-items: center; justify-content: center; min-width: 46px; padding: 6px 0; border: 1px solid var(--border); border-radius: 10px; color: var(--coral); font-size: 14px; font-weight: 800; flex-shrink: 0; }
        .pf-idea-title { margin: 0 0 3px; font-size: 15px; font-weight: 700; color: var(--ink); overflow-wrap: anywhere; }
        .pf-idea-desc { margin: 0 0 8px; font-size: 13px; color: var(--slate); display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        .pf-meta { display: flex; align-items: center; gap: 10px; font-size: 12px; color: var(--slate); flex-wrap: wrap; }
        .pf-pill { padding: 2px 8px; border-radius: 999px; font-size: 11.5px; font-weight: 700; }
        .pf-empty { display: flex; flex-direction: column; align-items: center; text-align: center; padding: 48px 20px; background: #fff; border: 1px dashed var(--border); border-radius: 16px; }
        .pf-empty-ic { width: 56px; height: 56px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: var(--peach, #fff1ee); color: var(--coral); margin-bottom: 14px; }
        .pf-empty-title { margin: 0 0 4px; font-size: 16px; font-weight: 700; color: var(--ink); }
        .pf-empty-text { margin: 0 0 18px; font-size: 14px; color: var(--slate); max-width: 340px; }
        @media (max-width: 640px) {
          .pf-wrap { padding-left: 16px; padding-right: 16px; }
          /* Phones: avatar, then name and email, then a full-width Edit profile. */
          .pf-top { flex-wrap: wrap; gap: 14px; padding-top: 20px; padding-bottom: 16px; }
          .pf-top .pf-edit { flex: 1 1 100%; }
          .pf-name { font-size: 20px; }
          .pf-stats { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; padding-bottom: 16px; }
          .pf-stats:has(> :nth-child(4)) { grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
          .pf-stat-l { font-size: 11.5px; }
          .pf-stat { flex-direction: column; align-items: flex-start; gap: 6px; padding: 10px 12px; }
          .pf-stat-ic { width: 28px; height: 28px; border-radius: 8px; }
          .pf-list { grid-template-columns: 1fr; }
          .pf-body { padding-top: 16px; }
        }
      `}</style>

      <div className="pf-head">
        <div className="pf-wrap">
          <div className="pf-top">
            <div style={{ position: 'relative', width: 76, height: 76, flexShrink: 0 }}
              onMouseEnter={(e) => { const o = e.currentTarget.querySelector('[data-avatar-overlay]') as HTMLElement; if (o) o.style.opacity = '1' }}
              onMouseLeave={(e) => { const o = e.currentTarget.querySelector('[data-avatar-overlay]') as HTMLElement; if (o) o.style.opacity = '0' }}>
              {avatarUrl ? (
                <img src={avatarUrl} alt="" style={{ width: 76, height: 76, borderRadius: '50%', objectFit: 'cover', border: '3px solid white', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', display: 'block' }} />
              ) : (
                <div style={{ width: 76, height: 76, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontSize: 28, fontWeight: 800, border: '3px solid white', boxShadow: '0 4px 14px rgba(0,0,0,0.12)', background: 'var(--coral)' }}>
                  {initial}
                </div>
              )}
              {/* Hover overlay: camera — inline styles so positioning can never break */}
              <button onClick={() => fileInputRef.current?.click()} disabled={saving} title="Upload photo" aria-label="Upload photo"
                data-avatar-overlay
                style={{
                  position: 'absolute', inset: 0, borderRadius: '50%',
                  background: 'rgba(0,0,0,0.45)', border: 'none', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  opacity: 0, transition: 'opacity 0.18s ease',
                }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
              </button>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleAvatarUpload} />
              {avatarUrl && (
                <button onClick={handleDeleteAvatar} title="Remove photo" aria-label="Remove photo"
                  style={{
                    position: 'absolute', top: -2, right: -2, width: 24, height: 24,
                    borderRadius: '50%', background: '#ef4444', color: '#fff',
                    border: '2px solid white', cursor: 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 6px rgba(0,0,0,0.2)', padding: 0,
                  }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" aria-hidden="true"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
                </button>
              )}
              {saving && (
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(255,255,255,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ width: 22, height: 22, border: '2px solid var(--border)', borderTopColor: 'var(--coral)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                </div>
              )}
            </div>
            <div className="pf-who">
              <h1 className="pf-name">{name}</h1>
              <p className="pf-email">{user.email}</p>
              {bio && <p className="pf-bio">{bio}</p>}
            </div>
            <button type="button" onClick={() => setActiveTab('edit')} className="pf-btn pf-btn-secondary pf-edit">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
              Edit profile
            </button>
          </div>

          {savedMsg && (
            <div className="mb-4 p-3 rounded-lg text-sm flex items-center gap-2" style={{ background: '#d1fae5', color: '#059669' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="20 6 9 17 4 12" /></svg>
              {savedMsg}
            </div>
          )}

          <div className="pf-stats">
            {stats.map(st => (
              <button key={st.key} type="button" className="pf-stat" onClick={() => setActiveTab(st.key)}>
                <span className="pf-stat-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{st.icon}</svg></span>
                <span><p className="pf-stat-v">{st.value}</p><p className="pf-stat-l">{st.label}</p></span>
              </button>
            ))}
            {followingCount !== null && (
              <div className="pf-stat" style={{ cursor: 'default' }}>
                <span className="pf-stat-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" /></svg></span>
                <span><p className="pf-stat-v">{followingCount}</p><p className="pf-stat-l">Following</p></span>
              </div>
            )}
          </div>

          <div className="pf-tabs" role="tablist">
            {tabs.map(t => (
              <button key={t.key} type="button" role="tab" aria-selected={activeTab === t.key} className="pf-tab" onClick={() => setActiveTab(t.key)}>
                {t.label}<span className="pf-count">{t.count}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="pf-wrap pf-body">
        {activeTab === 'edit' ? (
          <div className="bg-white rounded-2xl border p-6" style={{ borderColor: 'var(--border)' }}>
            <h2 className="text-lg font-bold mb-6" style={{ color: 'var(--ink)' }}>Profile information</h2>
            <div className="grid gap-5 md:grid-cols-2">
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
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Mobile number</label>
                <input type="tel" value={editPhone} onChange={(e) => setEditPhone(e.target.value)} placeholder="+61 400 000 000" className="w-full px-4 py-2.5 rounded-lg border focus:outline-none" style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
                <p className="text-xs mt-1" style={{ color: 'var(--slate)' }}>Used to text you reminders for events you're assigned to.</p>
              </div>
              <div className="md:col-span-2">
                <label className="block text-sm font-medium mb-1.5" style={{ color: 'var(--ink)' }}>Bio</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} placeholder="Tell others about yourself…" rows={3} className="w-full px-4 py-2.5 rounded-lg border focus:outline-none resize-none" style={{ borderColor: 'var(--border)', fontSize: '16px' }} />
              </div>
              <div className="md:col-span-2 flex justify-end gap-2 pt-4 border-t" style={{ borderColor: 'var(--border)' }}>
                <button type="button" onClick={() => setActiveTab('ideas')} className="pf-btn pf-btn-secondary">Cancel</button>
                <button onClick={handleSaveProfile} disabled={saving} className="pf-btn pf-btn-primary disabled:opacity-50">
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </div>
            </div>
          </div>
        ) : activeTab === 'ideas' ? (
          userIdeas.length === 0
            ? empty('No ideas yet', 'Got a suggestion? Share it on the board and others can vote for it.')
            : <div className="pf-list">{userIdeas.map(ideaCard)}</div>
        ) : activeTab === 'votes' ? (
          votedIdeas.length === 0
            ? empty('No votes yet', 'Vote for the ideas you want most and we’ll know what matters to you.')
            : <div className="pf-list">{votedIdeas.map(ideaCard)}</div>
        ) : (
          userComments.length === 0
            ? empty('No comments yet', 'Join the conversation on an idea, or start one of your own.')
            : (
              <div className="pf-list">
                {userComments.map(comment => (
                  <button key={comment.id} type="button" className="pf-card" style={{ cursor: comment.idea_id ? 'pointer' : 'default', borderColor: comment.is_private ? '#fbbf24' : undefined, background: comment.is_private ? '#fef3c7' : undefined }}
                    onClick={() => { if (comment.idea_id) router.push(`/?idea=${comment.idea_id}`) }}>
                    {ideaTitles[comment.idea_id] && <p className="pf-meta" style={{ marginBottom: 4 }}>On <strong style={{ color: 'var(--ink)' }}>{ideaTitles[comment.idea_id]}</strong></p>}
                    <p className="text-sm mb-2" style={{ color: 'var(--ink)', overflowWrap: 'anywhere' }}>{String(comment.content || '').length > 200 ? String(comment.content).slice(0, 200) + '…' : comment.content}</p>
                    <p className="text-xs" style={{ color: 'var(--slate)' }}>{new Date(comment.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  </button>
                ))}
              </div>
            )
        )}
      </div>
    </div>
  )
}
