'use client'
import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useCompanyUser } from '../crm-settings/_shared'
import PageHeader from '@/components/PageHeader'
import { SuggestionCard, type Suggestion } from '@/components/AgentSuggestion'
import Pagination, { usePagination } from '@/components/Pagination'

type Comment = {
  id: string
  platform?: string | null
  post_id?: string | null
  contact_id?: string | null
  contact_name?: string | null
  external_comment_id: string
  author_name: string | null
  author_photo: string | null
  message: string | null
  attachment_url: string | null
  risk_level: string | null
  category: string | null
  sentiment: string | null
  is_replied: boolean
  replied_by_ai: boolean
  reply_text: string | null
  is_hidden: boolean
  is_archived: boolean
  commented_at: string | null
}

type Post = { id: string; platform: string | null; permalink: string | null; message: string | null; media_url: string | null; post_type: string | null; thumb?: string | null; mtype?: string | null }

const PLATFORM: Record<string, { label: string; color: string; bg: string }> = {
  instagram: { label: 'Instagram', color: '#C13584', bg: 'linear-gradient(45deg,#F58529 0%,#DD2A7B 50%,#8134AF 80%,#515BD4 100%)' },
  facebook: { label: 'Facebook', color: '#1877F2', bg: '#1877F2' },
}
const platformOf = (c: { platform?: string | null }) => (c.platform === 'instagram' ? 'instagram' : 'facebook')

/** The Instagram / Facebook mark, white on the brand colour. */
function PlatformMark({ platform, size = 16 }: { platform: string; size?: number }) {
  const p = PLATFORM[platform] || PLATFORM.facebook
  const g = Math.round(size * 0.62)
  return (
    <span aria-label={p.label} title={p.label} style={{ width: size, height: size, borderRadius: platform === 'instagram' ? Math.round(size * 0.3) : '50%', background: p.bg, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      {platform === 'instagram'
        ? <svg width={g} height={g} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.4" aria-hidden="true"><rect x="3" y="3" width="18" height="18" rx="5" /><circle cx="12" cy="12" r="4.2" /><circle cx="17.4" cy="6.6" r="1.1" fill="#fff" stroke="none" /></svg>
        : <svg width={g} height={g} viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M14 8.5V6.8c0-.8.2-1.3 1.4-1.3H17V2.3C16.7 2.2 15.7 2 14.6 2 12.2 2 10.6 3.5 10.6 6.1v2.4H8V12h2.6v10H14V12h2.7l.4-3.5H14z" /></svg>}
    </span>
  )
}

const PLACEHOLDER_AUTHOR = /^(instagram|facebook) user$/i

/** A round avatar; falls back to the initial when there's no photo or it has expired. */
function Avatar({ src, name }: { src?: string | null; name: string }) {
  const [broken, setBroken] = useState(false)
  if (src && !broken) return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
  return <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{(name || '?').charAt(0).toUpperCase()}</span>
}

/**
 * The post a comment is on: a thumbnail and the caption, and for a reel or
 * video a play button that plays it right here. Instagram videos play from
 * the file itself and fall back to Instagram's own embed when that link has
 * expired; Facebook videos use Facebook's embedded player. A photo opens
 * bigger. The arrow still opens the post on Instagram / Facebook.
 */
function PostPreview({ post, platform }: { post: Post; platform: string }) {
  const [open, setOpen] = useState(false)
  const [embed, setEmbed] = useState(false)
  const [thumbBroken, setThumbBroken] = useState(false)
  const label = PLATFORM[platform]?.label || 'Facebook'
  const isVideo = post.post_type === 'reel' || /video|reel/i.test(post.mtype || '')
  const igVideoFile = platform === 'instagram' && isVideo && /^VIDEO$/i.test(post.mtype || '') ? post.media_url : null
  const thumb = platform === 'instagram' && isVideo ? (post.thumb || null) : (post.media_url || post.thumb || null)
  const text = (post.message || '').replace(/\s+/g, ' ').trim()
  const kind = post.post_type && post.post_type !== 'post' ? `a ${post.post_type.toLowerCase().replace(/_/g, ' ')}` : 'a post'
  const canOpen = isVideo ? !!(igVideoFile || post.permalink) : !!thumb
  const igEmbed = post.permalink ? post.permalink.replace(/\?.*$/, '').replace(/\/?$/, '/') + 'embed' : null
  const fbEmbed = post.permalink ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(post.permalink)}&show_text=false&width=320` : null
  return (
    <div style={{ margin: '0 0 10px' }}>
      <div className="se-post">
        <button type="button" onClick={() => canOpen && setOpen(o => !o)} disabled={!canOpen} title={canOpen ? (open ? 'Close' : isVideo ? `Play the ${post.post_type || 'video'}` : 'View the photo') : undefined}
          style={{ position: 'relative', width: 44, height: 44, borderRadius: 8, overflow: 'hidden', flexShrink: 0, border: 'none', padding: 0, background: '#e7e5e4', cursor: canOpen ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {thumb && !thumbBroken
            ? <img src={thumb} alt="" referrerPolicy="no-referrer" onError={() => setThumbBroken(true)} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            : <PlatformMark platform={platform} size={20} />}
          {isVideo && canOpen && (
            <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.28)' }}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">{open ? <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></> : <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />}</svg>
            </span>
          )}
        </button>
        <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          On {kind}{text ? `: “${text.slice(0, 90)}${text.length > 90 ? '…' : ''}”` : ''}
        </span>
        {post.permalink && (
          <a href={post.permalink} target="_blank" rel="noopener noreferrer" title={`Open on ${label}`} className="se-post-open">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6" /><path d="M10 14L20 4" /><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" /></svg>
          </a>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 8, width: '100%', maxWidth: isVideo ? 300 : 360, borderRadius: 12, overflow: 'hidden', background: '#000', aspectRatio: isVideo ? '9 / 16' : undefined }}>
          {!isVideo
            ? <img src={thumb || ''} alt="" referrerPolicy="no-referrer" style={{ width: '100%', display: 'block' }} />
            : igVideoFile && !embed
              ? <video src={igVideoFile} poster={thumb || undefined} controls autoPlay playsInline onError={() => setEmbed(true)} style={{ width: '100%', height: '100%', display: 'block', objectFit: 'contain' }} />
              : platform === 'instagram' && igEmbed
                ? <iframe src={igEmbed} title="Instagram post" allow="autoplay; encrypted-media; picture-in-picture" style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
                : fbEmbed
                  ? <iframe src={fbEmbed} title="Facebook video" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen style={{ width: '100%', height: '100%', border: 0 }} />
                  : null}
        </div>
      )}
    </div>
  )
}

export default function SocialEngagementPage() {
  const { companyId, loading } = useCompanyUser()
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [connected, setConnected] = useState<{ page_name?: string } | null>(null)
  const [checked, setChecked] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [postCount, setPostCount] = useState(0)
  const [posts, setPosts] = useState<Record<string, Post>>({})
  const [contactInfo, setContactInfo] = useState<Record<string, { name?: string | null; avatar?: string | null }>>({})
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [risk, setRisk] = useState<'all' | 'safe' | 'critical'>('all')
  const [type, setType] = useState<'all' | 'unreplied' | 'replied'>('all')
  const [cat, setCat] = useState('')
  const [platform, setPlatform] = useState<'all' | 'instagram' | 'facebook'>('all')
  const [showArchived, setShowArchived] = useState(false)
  // Deep-link from the inbox: ?comment=<id> → jump to and highlight that comment.
  const [highlightCommentId, setHighlightCommentId] = useState<string | null>(null)
  useEffect(() => { try { const id = new URLSearchParams(window.location.search).get('comment'); if (id) setHighlightCommentId(id) } catch {} }, [])
  useEffect(() => {
    if (!highlightCommentId || comments.length === 0) return
    // Clear filters so the target is never hidden, then scroll to it. "Show
    // archived" lists only archived comments, so it follows the target: it
    // used to be switched on always, which hid every comment that wasn't.
    const target = comments.find(c => c.id === highlightCommentId)
    setSearch(''); setRisk('all'); setType('all'); setCat(''); setPlatform('all'); setShowArchived(!!target?.is_archived)
    const t = setTimeout(() => { try { document.getElementById(`comment-${highlightCommentId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' }) } catch {} }, 300)
    const clear = setTimeout(() => setHighlightCommentId(null), 6000)
    return () => { clearTimeout(t); clearTimeout(clear) }
  }, [highlightCommentId, comments.length])

  // Replies the Reputation Agent drafted, waiting for a person (by comment id).
  const [drafts, setDrafts] = useState<Record<string, Suggestion>>({})
  const loadDrafts = useCallback(async () => {
    if (!companyId) return
    try {
      const r = await authFetch(`/api/agent/approvals?companyId=${companyId}`)
      if (!r.ok) return
      const d = await r.json()
      const map: Record<string, Suggestion> = {}
      for (const a of d.approvals || []) if (a.action_key === 'reply_to_comment' && a.run?.input?.commentId) map[a.run.input.commentId] = a
      setDrafts(map)
    } catch {}
  }, [companyId])
  useEffect(() => { loadDrafts() }, [loadDrafts])

  // Per-comment reply / DM composer
  const [composer, setComposer] = useState<{ id: string; mode: 'reply' | 'dm'; text: string; busy?: boolean } | null>(null)
  const [drafting, setDrafting] = useState<string | null>(null)

  // ── Link a comment to a CRM contact (manual match) ──────────────────────────
  const [linkFor, setLinkFor] = useState<any>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<any[]>([])
  const [contactLoading, setContactLoading] = useState(false)
  const openLink = (c: any) => { setLinkFor(c); setContactSearch(c.author_name && !/^(facebook|instagram) user$/i.test(c.author_name) ? c.author_name : '') }
  useEffect(() => {
    if (!linkFor || !companyId) return
    let cancelled = false
    setContactLoading(true)
    const q = contactSearch.trim()
    const t = setTimeout(async () => {
      let query = (supabase as any).from('contacts').select('id, name, email').eq('company_id', companyId)
      const safeQ = q.replace(/[,()]/g, ' ').trim()
      if (safeQ) query = query.or(`name.ilike.%${safeQ}%,email.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`)
      const { data } = await query.order('name', { ascending: true }).limit(40)
      if (cancelled) return
      const ql = q.toLowerCase()
      const rank = (c: any) => {
        const n = (c.name || '').toLowerCase()
        if (ql && n.startsWith(ql)) return 0
        if (ql && n.includes(ql)) return 1
        if (ql && (c.email || '').toLowerCase().includes(ql)) return 2
        return 3
      }
      setContactResults([...(data || [])].sort((a: any, b: any) => rank(a) - rank(b)).slice(0, 25))
      setContactLoading(false)
    }, 220)
    return () => { cancelled = true; clearTimeout(t) }
  }, [contactSearch, linkFor, companyId])
  const setLink = async (c: any, contact: any | null) => {
    if (!companyId) return
    setComments(cs => cs.map(x => x.id === c.id ? { ...x, contact_id: contact?.id || null, contact_name: contact?.name || null } : x))
    setLinkFor(null)
    try {
      await authFetch('/api/social/comments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'link_contact', commentId: c.id, contactId: contact?.id || null }),
      })
    } catch {}
  }

  const load = useCallback(async () => {
    if (!companyId) return
    const [{ data: chans }, cmts, postRes] = await Promise.all([
      (supabase as any).from('meta_channels').select('page_name').eq('company_id', companyId).in('platform', ['facebook', 'instagram']).eq('is_active', true).limit(1),
      (supabase as any).from('social_comments').select('*').eq('company_id', companyId).order('commented_at', { ascending: false }).limit(2000),
      (supabase as any).from('social_posts').select('id, platform, permalink, message, media_url, post_type, thumb:raw->>thumbnail_url, mtype:raw->>media_type', { count: 'exact' }).eq('company_id', companyId).order('posted_at', { ascending: false }).limit(1000),
    ])
    setConnected(chans?.[0] || null)
    setComments(cmts.data || [])
    // Linked customers' names and photos: Instagram doesn't share a commenter's
    // profile picture with comments, but people who've messaged the business
    // have one on their contact.
    const ids = Array.from(new Set((cmts.data || []).map((c: Comment) => c.contact_id).filter(Boolean))) as string[]
    if (ids.length) {
      const { data: cts } = await (supabase as any).from('contacts').select('id, name, avatar_url').in('id', ids.slice(0, 500))
      setContactInfo(Object.fromEntries((cts || []).map((x: any) => [x.id, { name: x.name, avatar: x.avatar_url }])))
    }
    setPostCount(postRes.count || 0)
    setPosts(Object.fromEntries((postRes.data || []).map((p: Post) => [p.id, p])))
    setChecked(true)
  }, [companyId])

  useEffect(() => { load() }, [load])

  // Live: comments arrive by webhook, then get classified and maybe answered by
  // the AI. Merge those changes in as they happen instead of needing a reload.
  useEffect(() => {
    if (!companyId) return
    // The Reputation Agent's draft lands just after the comment does.
    let draftsTimer: ReturnType<typeof setTimeout> | undefined
    const ch = (supabase as any).channel(`social-comments-${companyId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'social_comments', filter: `company_id=eq.${companyId}` }, (p: any) => {
        if (p.eventType === 'DELETE') { setComments(cs => cs.filter(c => c.id !== p.old?.id)); return }
        const row = p.new; if (!row?.id) return
        setComments(cs => {
          const i = cs.findIndex(c => c.id === row.id)
          if (i >= 0) { const nx = cs.slice(); nx[i] = { ...nx[i], ...row }; return nx }
          return [row, ...cs].sort((a, b) => String(b.commented_at || '').localeCompare(String(a.commented_at || '')))
        })
        clearTimeout(draftsTimer); draftsTimer = setTimeout(loadDrafts, 2500)
      })
      .subscribe()
    return () => { clearTimeout(draftsTimer); try { (supabase as any).removeChannel(ch) } catch {} }
  }, [companyId, loadDrafts])

  // Coming back to the tab (or if realtime isn't available) catches up quietly.
  useEffect(() => {
    if (!companyId) return
    let last = Date.now()
    const catchUp = () => {
      if (document.visibilityState !== 'visible' || Date.now() - last < 15_000) return
      last = Date.now(); load(); loadDrafts()
    }
    document.addEventListener('visibilitychange', catchUp)
    window.addEventListener('focus', catchUp)
    const t = setInterval(catchUp, 60_000)
    return () => { document.removeEventListener('visibilitychange', catchUp); window.removeEventListener('focus', catchUp); clearInterval(t) }
  }, [companyId, load, loadDrafts])

  const sync = async () => {
    if (!companyId || syncing) return
    setSyncing(true); setSyncMsg('')
    try {
      const res = await authFetch('/api/social/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Sync failed')
      setSyncMsg(`Synced ${d.posts} post(s), ${d.comments} new comment(s), ${d.classified} classified.`)
      await load()
    } catch (e: any) { setSyncMsg('Sync failed: ' + e.message) } finally { setSyncing(false) }
  }

  const patch = (id: string, ch: Partial<Comment>) => setComments(cs => cs.map(c => c.id === id ? { ...c, ...ch } : c))

  const act = async (c: Comment, action: string, extra: any = {}) => {
    if (!companyId) return
    try {
      const res = await authFetch('/api/social/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action, commentId: c.id, ...extra }) })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Action failed')
      return d
    } catch (e: any) { alert(e.message); throw e }
  }

  const doReply = async () => {
    if (!composer || !composer.text.trim()) return
    const c = comments.find(x => x.id === composer.id); if (!c) return
    setComposer({ ...composer, busy: true })
    try {
      if (composer.mode === 'reply') {
        await act(c, 'reply', { message: composer.text.trim() })
        patch(c.id, { is_replied: true, reply_text: composer.text.trim() })
      } else {
        await act(c, 'dm', { message: composer.text.trim() })
      }
      setComposer(null)
    } catch { setComposer(composer ? { ...composer, busy: false } : null) }
  }

  const aiDraft = async (c: Comment) => {
    setDrafting(c.id)
    try {
      const d = await act(c, 'ai_reply')
      setComposer({ id: c.id, mode: 'reply', text: d?.reply || '' })
    } catch {} finally { setDrafting(null) }
  }

  const shown = comments.filter(c => showArchived ? c.is_archived : !c.is_archived)
  const platformCounts = { instagram: 0, facebook: 0 }
  for (const c of shown) platformCounts[platformOf(c)]++
  const active = platform === 'all' ? shown : shown.filter(c => platformOf(c) === platform)
  const stats = {
    posts: postCount,
    comments: comments.filter(c => !c.is_archived).length,
    replied: comments.filter(c => !c.is_archived && c.is_replied).length,
    unreplied: comments.filter(c => !c.is_archived && !c.is_replied).length,
  }
  const catCounts: Record<string, number> = {}
  for (const c of active) if (c.category) catCounts[c.category] = (catCounts[c.category] || 0) + 1

  const filtered = active.filter(c => {
    if (risk !== 'all' && (c.risk_level || 'safe') !== risk) return false
    if (type === 'unreplied' && c.is_replied) return false
    if (type === 'replied' && !c.is_replied) return false
    if (cat && c.category !== cat) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!(c.message || '').toLowerCase().includes(q) && !(c.author_name || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  // 2,000 comments in one scroll was unworkable — page them like Reviews.
  const pg = usePagination(filtered, { key: 'social', defaultSize: 25, resetOn: [risk, type, cat, search, showArchived, platform] })
  // A deep link to one comment opens the page it's on.
  const highlightIndex = highlightCommentId ? filtered.findIndex(c => c.id === highlightCommentId) : -1
  useEffect(() => {
    if (highlightIndex >= 0) pg.goTo(Math.floor(highlightIndex / pg.pageSize) + 1, false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIndex, pg.pageSize])

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>

  const Chip = ({ label, value, tone }: { label: string; value: number; tone: string }) => (
    <button onClick={() => { if (label === 'Replied') setType('replied'); else if (label === 'Unreplied') setType('unreplied'); else setType('all') }}
      style={{ border: '1px solid var(--border)', borderRadius: 12, padding: '9px 15px', background: '#fff', display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer' }}>
      <span style={{ fontSize: 12.5, color: 'var(--slate)', fontWeight: 600 }}>{label}</span>
      <span style={{ fontSize: 15, fontWeight: 800, color: tone }}>{value}</span>
    </button>
  )

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1500, margin: '0 auto' }}>
      <style>{`
        .se-act { background:none; border:none; color:var(--slate); font-size:12.5px; font-weight:700; cursor:pointer; padding:0; }
        .se-act:hover { color:var(--coral); }
        .se-btn { display:inline-flex; align-items:center; gap:7px; border-radius:11px; font-weight:700; font-size:13px; padding:9px 15px; cursor:pointer; border:1px solid transparent; transition:all .15s; }
        .se-btn-primary { background:var(--coral); color:#fff; } .se-btn-primary:hover:not(:disabled){ background:var(--coral-hover); }
        .se-btn-ghost { background:#fff; color:var(--ink); border-color:var(--border); } .se-btn-ghost:hover{ background:var(--canvas); }
        .se-btn:disabled { opacity:.6; cursor:default; }
        .se-fchip { padding:6px 11px; border-radius:999px; border:1px solid var(--border); background:#fff; color:var(--slate); font-size:12px; font-weight:700; cursor:pointer; }
        .se-fchip.on { background:var(--peach); border-color:var(--coral); color:var(--coral); }
        .se-post { display:inline-flex; align-items:center; gap:10px; max-width:100%; box-sizing:border-box; margin:0; padding:4px 4px 4px 4px; border-radius:10px; border:1px solid var(--border); background:var(--canvas); color:var(--slate); font-size:11.5px; font-weight:600; text-decoration:none; }
        .se-post-open { flex-shrink:0; display:inline-flex; align-items:center; justify-content:center; width:26px; height:26px; border-radius:7px; color:var(--slate); }
        .se-post-open:hover { color:var(--ink); background:#fff; }
      `}</style>

      <PageHeader
        title="Social Engagement Manager"
        subtitle="Reply to Instagram and Facebook comments from one place."
        bleed={32}
        bleedTop={28}
        action={
          <>
            {syncMsg && <span style={{ fontSize: 12, color: 'var(--slate)' }}>{syncMsg}</span>}
            <Link href="/admin/social/categories" className="se-btn se-btn-ghost" style={{ textDecoration: 'none' }}>Categories</Link>
            {connected && <button onClick={sync} disabled={syncing} className="se-btn se-btn-primary">{syncing ? 'Syncing…' : 'Sync comments'}</button>}
          </>
        }
      />

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <Chip label="Total Posts" value={stats.posts} tone="var(--ink)" />
        <Chip label="Total Comments" value={stats.comments} tone="var(--ink)" />
        <Chip label="Replied" value={stats.replied} tone="#16a34a" />
        <Chip label="Unreplied" value={stats.unreplied} tone={stats.unreplied ? '#dc2626' : 'var(--ink)'} />
      </div>

      {checked && !connected ? (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 18, padding: '40px 28px', textAlign: 'center' }}>
          <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>Connect Facebook or Instagram to access this feature</p>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '0 0 20px', lineHeight: 1.55, maxWidth: 560, marginInline: 'auto' }}>
            Colvy unifies comments from Facebook and Instagram into one dashboard so you can reply to everything in one place.
          </p>
          <Link href="/admin/crm-settings/channels/meta" style={{ display: 'inline-block', padding: '11px 22px', borderRadius: 12, background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>Connect Facebook &amp; Instagram</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 260px', gap: 18, alignItems: 'start' }}>
          {/* Feed */}
          <div>
            {filtered.length === 0 ? (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 40, textAlign: 'center', color: 'var(--slate)' }}>
                {comments.length === 0 ? 'No comments yet — hit “Sync comments” to pull them from your page.' : 'No comments match these filters.'}
              </div>
            ) : pg.items.map(c => {
              const critical = (c.risk_level || 'safe') === 'critical'
              const hot = c.id === highlightCommentId
              const plat = platformOf(c)
              const post = c.post_id ? posts[c.post_id] : undefined
              const linked = c.contact_id ? contactInfo[c.contact_id] : undefined
              const authorName = (c.author_name && !PLACEHOLDER_AUTHOR.test(c.author_name) ? c.author_name : linked?.name) || c.author_name || `${PLATFORM[plat].label} user`
              return (
              <div key={c.id} id={`comment-${c.id}`} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px', marginBottom: 14, opacity: c.is_hidden ? 0.6 : 1, boxShadow: hot ? '0 0 0 3px var(--coral)' : undefined, transition: 'box-shadow 0.4s' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    <span style={{ position: 'relative', flexShrink: 0 }}>
                      <Avatar key={c.author_photo || linked?.avatar || c.id} src={c.author_photo || linked?.avatar} name={authorName} />
                      <span style={{ position: 'absolute', right: -3, bottom: -3, borderRadius: plat === 'instagram' ? 6 : '50%', boxShadow: '0 0 0 2px #fff', display: 'flex' }}><PlatformMark platform={plat} size={16} /></span>
                    </span>
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 14 }}>{authorName}</p>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--slate)' }}><span style={{ color: PLATFORM[plat].color, fontWeight: 700 }}>{PLATFORM[plat].label}</span> · {c.commented_at ? new Date(c.commented_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}{c.is_hidden ? ' · hidden' : ''}{c.is_replied ? ' · replied' : ''}</p>
                      <button onClick={() => openLink(c)} title="Match this commenter to a customer"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, marginTop: 3, padding: '2px 8px', borderRadius: 999, border: '1px solid var(--border)', background: c.contact_id ? 'var(--peach)' : '#fff', color: c.contact_id ? 'var(--coral)' : 'var(--slate)', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                        {c.contact_id ? `Linked${c.contact_name ? `: ${c.contact_name}` : ''}` : 'Link to customer'}
                      </button>
                    </div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 11px', borderRadius: 999, background: critical ? '#fee2e2' : '#dcfce7', color: critical ? '#dc2626' : '#16a34a', whiteSpace: 'nowrap' }}>
                    {critical
                      ? <><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: 4 }}><path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>Critical / Harmful</>
                      : <><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: '-1px', marginRight: 4 }}><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.3 3.1 4.5 6.8 4.5c2.1 0 3.6 1.1 5.2 3 1.6-1.9 3.1-3 5.2-3 3.7 0 5.9 3.8 4.4 7.3C19.5 16.4 12 21 12 21z" /></svg>Safe / Positive</>}
                  </span>
                </div>

                <p style={{ margin: '0 0 8px', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55 }}>{c.message || <span style={{ color: 'var(--slate)', fontStyle: 'italic' }}>(no text)</span>}</p>
                {c.attachment_url && <img src={c.attachment_url} alt="" referrerPolicy="no-referrer" style={{ maxWidth: 200, borderRadius: 10, marginBottom: 8 }} />}
                {post && <PostPreview key={post.id} post={post} platform={plat} />}

                {c.category && <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'var(--canvas)', color: 'var(--slate)' }}>{c.category}</span>}

                {c.is_replied && c.reply_text && (
                  <div style={{ marginTop: 10, padding: '10px 13px', background: 'var(--peach)', borderRadius: 10, borderLeft: '3px solid var(--coral)' }}>
                    <p style={{ margin: '0 0 2px', fontSize: 10.5, fontWeight: 800, color: 'var(--coral)' }}>Your reply{c.replied_by_ai ? ' (AI)' : ''}</p>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)' }}>{c.reply_text}</p>
                  </div>
                )}

                {composer?.id !== c.id && !c.is_replied && drafts[c.id] && companyId ? (
                  <div className="se-agsg" style={{ marginTop: 12 }}>
                    <style>{'.se-agsg .agsg{max-width:none;margin-left:0}'}</style>
                    <SuggestionCard s={drafts[c.id]} companyId={companyId} compact onDone={(_id, status) => {
                      setDrafts(d => { const n = { ...d }; delete n[c.id]; return n })
                      setTimeout(() => { load(); loadDrafts() }, 600)
                    }} />
                  </div>
                ) : composer?.id === c.id ? (
                  <div style={{ marginTop: 10 }}>
                    <textarea value={composer.text} onChange={e => setComposer({ ...composer, text: e.target.value })} rows={2}
                      placeholder={composer.mode === 'dm' ? 'Private message to the commenter…' : 'Reply publicly…'}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', outline: 'none' }} />
                    <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                      <button onClick={() => setComposer(null)} className="se-btn se-btn-ghost">Cancel</button>
                      <button onClick={doReply} disabled={composer.busy || !composer.text.trim()} className="se-btn se-btn-primary">{composer.busy ? 'Sending…' : composer.mode === 'dm' ? 'Send DM' : 'Post reply'}</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 12, flexWrap: 'wrap' }}>
                    {!c.is_replied && <button className="se-act" style={{ color: '#7c3aed' }} onClick={() => aiDraft(c)} disabled={drafting === c.id}><svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" style={{ display: 'inline-block', verticalAlign: '-2px', marginRight: 4 }}><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z" /></svg>{drafting === c.id ? 'Drafting…' : 'Generate AI Reply'}</button>}
                    <button className="se-act" onClick={() => setComposer({ id: c.id, mode: 'reply', text: '' })}>Reply</button>
                    <button className="se-act" onClick={() => setComposer({ id: c.id, mode: 'dm', text: '' })}>Message</button>
                    <button className="se-act" onClick={async () => { await act(c, c.is_hidden ? 'unhide' : 'hide'); patch(c.id, { is_hidden: !c.is_hidden }) }}>{c.is_hidden ? 'Unhide' : 'Hide'}</button>
                    <button className="se-act" onClick={async () => { await act(c, showArchived ? 'unarchive' : 'archive'); patch(c.id, { is_archived: !showArchived }) }}>{showArchived ? 'Unarchive' : 'Archive'}</button>
                  </div>
                )}
              </div>
            )})}
            <Pagination {...pg} noun="comments" />
          </div>

          {/* Filters */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 16, position: 'sticky', top: 16 }}>
            <p style={{ margin: '0 0 10px', fontWeight: 800, fontSize: 14 }}>Filter</p>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, outline: 'none', marginBottom: 14 }} />

            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--slate)' }}>Platform</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              <button className={'se-fchip' + (platform === 'all' ? ' on' : '')} onClick={() => setPlatform('all')}>All</button>
              {(['instagram', 'facebook'] as const).map(v => (
                <button key={v} className={'se-fchip' + (platform === v ? ' on' : '')} onClick={() => setPlatform(platform === v ? 'all' : v)} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                  <PlatformMark platform={v} size={14} />{PLATFORM[v].label}<span style={{ opacity: 0.7 }}>{platformCounts[v]}</span>
                </button>
              ))}
            </div>

            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--slate)' }}>Risk level</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {(['all', 'safe', 'critical'] as const).map(v => <button key={v} className={'se-fchip' + (risk === v ? ' on' : '')} onClick={() => setRisk(v)}>{v === 'all' ? 'All' : v === 'safe' ? 'Safe' : 'Critical'}</button>)}
            </div>

            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--slate)' }}>Reply status</p>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
              {(['all', 'unreplied', 'replied'] as const).map(v => <button key={v} className={'se-fchip' + (type === v ? ' on' : '')} onClick={() => setType(v)}>{v[0].toUpperCase() + v.slice(1)}</button>)}
            </div>

            <p style={{ margin: '0 0 6px', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', color: 'var(--slate)' }}>Category</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2, marginBottom: 14, maxHeight: 260, overflowY: 'auto' }}>
              <button className={'se-fchip' + (cat === '' ? ' on' : '')} style={{ textAlign: 'left' }} onClick={() => setCat('')}>All categories</button>
              {Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([name, n]) => (
                <button key={name} className={'se-fchip' + (cat === name ? ' on' : '')} style={{ textAlign: 'left', display: 'flex', justifyContent: 'space-between' }} onClick={() => setCat(cat === name ? '' : name)}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span><span>{n}</span>
                </button>
              ))}
            </div>

            <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}>
              <input type="checkbox" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} style={{ accentColor: 'var(--coral)' }} />
              Show archived
            </label>
          </div>
        </div>
      )}

      {/* Link-to-customer modal */}
      {linkFor && (
        <div onClick={() => setLinkFor(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
          <div onClick={e => e.stopPropagation()} style={{ width: '100%', maxWidth: 420, background: '#fff', borderRadius: 16, border: '1px solid var(--border)', padding: 20, maxHeight: '85vh', display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 4 }}>
              <p style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Link to customer</p>
              <span style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: linkFor.contact_id ? 'var(--peach)' : '#f3f4f6', color: linkFor.contact_id ? 'var(--coral)' : 'var(--slate)' }}>
                {linkFor.contact_id ? 'Matched' : 'Not matched'}
              </span>
            </div>
            <p style={{ margin: '0 0 12px', fontSize: 12.5, color: 'var(--slate)' }}>Comment by <strong>{linkFor.author_name || 'Unknown'}</strong></p>
            <input autoFocus value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Search customers…"
              style={{ width: '100%', boxSizing: 'border-box', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 14 }} />
            {linkFor.contact_id && (
              <button onClick={() => setLink(linkFor, null)} style={{ alignSelf: 'flex-start', margin: '10px 0 0', fontSize: 12, color: '#dc2626', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>Unlink current customer</button>
            )}
            <div style={{ marginTop: 12, overflowY: 'auto', flex: 1 }}>
              {contactLoading && contactResults.length === 0 ? (
                <p style={{ padding: 16, color: 'var(--slate)', fontSize: 13 }}>Searching…</p>
              ) : contactResults.length === 0 ? (
                <p style={{ padding: 16, color: 'var(--slate)', fontSize: 13 }}>No customers found{contactSearch.trim() ? ` for “${contactSearch.trim()}”` : ''}.</p>
              ) : contactResults.map((c: any) => (
                <button key={c.id} onClick={() => setLink(linkFor, c)}
                  style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: 'none', background: linkFor.contact_id === c.id ? 'var(--peach)' : 'transparent', cursor: 'pointer' }}
                  onMouseEnter={e => { if (linkFor.contact_id !== c.id) (e.currentTarget.style.background = 'var(--canvas)') }}
                  onMouseLeave={e => { if (linkFor.contact_id !== c.id) (e.currentTarget.style.background = 'transparent') }}>
                  <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{(c.name || '?').charAt(0).toUpperCase()}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Unnamed'}</span>
                    {c.email && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
