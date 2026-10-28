'use client'
import { authFetch } from '@/lib/auth-fetch'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useCompanyUser } from '../crm-settings/_shared'
import { SuggestionCard, type Suggestion } from '@/components/AgentSuggestion'
import Pagination, { usePagination } from '@/components/Pagination'
import VideoPlayer from '@/components/VideoPlayer'
import MediaGallery from '@/components/MediaGallery'
import EmptyScroll from '@/components/EmptyScroll'

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

type Post = { id: string; platform: string | null; permalink: string | null; message: string | null; media_url: string | null; post_type: string | null; thumb?: string | null; mtype?: string | null; children?: any; attachments?: any }

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
  if (src && !broken) return <img src={src} alt="" referrerPolicy="no-referrer" onError={() => setBroken(true)} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover', display: 'block' }} />
  return <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 15 }}>{(name || '?').charAt(0).toUpperCase()}</span>
}

type PostMedia = { kind: 'image' | 'video'; url: string; poster?: string | null }

/** A post's photos and videos, from what the sync saved (carousel children, Facebook attachments). */
function postMedia(post: Post, platform: string, isVideo: boolean): PostMedia[] {
  if (platform === 'instagram') {
    const kids = post.children?.data
    if (Array.isArray(kids) && kids.length) {
      return kids.map((k: any): PostMedia | null => !k?.media_url ? null
        : /VIDEO/i.test(k.media_type || '') ? { kind: 'video', url: k.media_url, poster: k.thumbnail_url || null }
        : { kind: 'image', url: k.media_url }).filter(Boolean) as PostMedia[]
    }
    if (!post.media_url) return []
    return /VIDEO/i.test(post.mtype || '') ? [{ kind: 'video', url: post.media_url, poster: post.thumb || null }]
      : isVideo ? [] : [{ kind: 'image', url: post.media_url }]
  }
  const fromAtt = (a: any): PostMedia | null => a?.media?.source ? { kind: 'video', url: a.media.source, poster: a.media.image?.src || null }
    : a?.media?.image?.src ? { kind: 'image', url: a.media.image.src } : null
  const att = post.attachments?.data?.[0]
  const subs = att?.subattachments?.data
  if (Array.isArray(subs) && subs.length) return subs.map(fromAtt).filter(Boolean) as PostMedia[]
  const one = att ? fromAtt(att) : null
  if (one && (one.kind === 'video' || !isVideo)) return [one]
  return post.media_url && !isVideo ? [{ kind: 'image', url: post.media_url }] : []
}

/**
 * The post a comment is on: its thumbnails and caption. A reel or video
 * plays right here in Colvy's own player (falling back to Instagram's or
 * Facebook's embed when there's no playable file, or its link has expired);
 * photos and carousels open in Colvy's gallery. The arrow opens the post on
 * Instagram / Facebook.
 */
function PostPreview({ post, platform }: { post: Post; platform: string }) {
  const [playing, setPlaying] = useState(false)
  const [embed, setEmbed] = useState(false)
  const [galleryAt, setGalleryAt] = useState<number | null>(null)
  const [broken, setBroken] = useState<Record<number, boolean>>({})
  const label = PLATFORM[platform]?.label || 'Facebook'
  const isVideo = post.post_type === 'reel' || /video|reel/i.test(post.mtype || '')
  const media = postMedia(post, platform, isVideo)
  const single = media.length <= 1
  // One video (or a reel we can only embed): play inline. Otherwise a gallery.
  const inlineVideo = single && (media[0]?.kind === 'video' || (isVideo && !media.length))
  const thumbOf = (m?: PostMedia) => m ? (m.kind === 'video' ? (m.poster || null) : m.url) : (post.thumb || post.media_url || null)
  const thumbs = single ? [thumbOf(media[0]) || (platform === 'facebook' ? post.media_url : post.thumb) || null] : media.slice(0, 3).map(thumbOf)
  const text = (post.message || '').replace(/\s+/g, ' ').trim()
  const kind = media.length > 1 ? (media.some(m => m.kind === 'video') ? `a post with ${media.length} photos and videos` : `a post with ${media.length} photos`)
    : post.post_type && post.post_type !== 'post' ? `a ${post.post_type.toLowerCase().replace(/_/g, ' ')}` : 'a post'
  const igEmbed = post.permalink ? post.permalink.replace(/\?.*$/, '').replace(/\/?$/, '/') + 'embed' : null
  const fbEmbed = post.permalink ? `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(post.permalink)}&show_text=false&width=320` : null
  const canEmbed = platform === 'instagram' ? !!igEmbed : !!fbEmbed
  const clickable = inlineVideo ? (media[0]?.kind === 'video' || canEmbed) : media.length > 0
  const tap = (i: number) => { if (!clickable) return; if (inlineVideo) setPlaying(p => !p); else setGalleryAt(i) }
  return (
    <div style={{ margin: '0 0 10px' }}>
      <div className="se-post">
        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
          {thumbs.map((t, i) => (
            <button key={i} type="button" onClick={() => tap(i)} disabled={!clickable}
              title={!clickable ? undefined : inlineVideo ? (playing ? 'Close' : `Play the ${post.post_type || 'video'}`) : 'Open the photos'}
              style={{ position: 'relative', width: 44, height: 44, borderRadius: 10, overflow: 'hidden', border: 'none', padding: 0, background: '#e4e4e7', cursor: clickable ? 'pointer' : 'default', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {t && !broken[i]
                ? <img src={t} alt="" referrerPolicy="no-referrer" onError={() => setBroken(b => ({ ...b, [i]: true }))} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                : <PlatformMark platform={platform} size={20} />}
              {(inlineVideo || media[i]?.kind === 'video') && clickable && (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.28)' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="#fff" aria-hidden="true">{inlineVideo && playing ? <><rect x="6" y="5" width="4" height="14" rx="1" /><rect x="14" y="5" width="4" height="14" rx="1" /></> : <path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5z" />}</svg>
                </span>
              )}
              {i === 2 && media.length > 3 && (
                <span style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.5)', color: '#fff', fontSize: 13, fontWeight: 800 }}>+{media.length - 3}</span>
              )}
            </button>
          ))}
        </div>
        <span style={{ minWidth: 0, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          On {kind}{text ? `: “${text.slice(0, 90)}${text.length > 90 ? '…' : ''}”` : ''}
        </span>
        {post.permalink && (
          <a href={post.permalink} target="_blank" rel="noopener noreferrer" title={`Open on ${label}`} className="se-post-open">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M14 4h6v6" /><path d="M10 14L20 4" /><path d="M19 13v6a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h6" /></svg>
          </a>
        )}
      </div>
      {inlineVideo && playing && (
        <div style={{ marginTop: 8, width: '100%', maxWidth: 360, aspectRatio: '9 / 16', borderRadius: 16, overflow: 'hidden', background: '#000', display: 'flex' }}>
          {media[0]?.kind === 'video' && !embed
            ? <VideoPlayer src={media[0].url} poster={media[0].poster || undefined} ambient onError={() => setEmbed(true)} style={{ width: '100%', height: '100%', borderRadius: 12 }} />
            : platform === 'instagram' && igEmbed
              ? <iframe src={igEmbed} title="Instagram post" allow="autoplay; encrypted-media; picture-in-picture" style={{ width: '100%', height: '100%', border: 0, background: '#fff' }} />
              : fbEmbed
                ? <iframe src={fbEmbed} title="Facebook video" allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen style={{ width: '100%', height: '100%', border: 0 }} />
                : null}
        </div>
      )}
      {galleryAt !== null && (
        <MediaGallery items={media.map((m, i) => ({ url: m.url, kind: m.kind, poster: m.poster || undefined, name: media.length > 1 ? `${i + 1} of ${media.length}` : label }))}
          index={galleryAt} onIndex={setGalleryAt} onClose={() => setGalleryAt(null)} />
      )}
    </div>
  )
}

export default function SocialEngagementPage() {
  const { companyId, loading } = useCompanyUser()
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

  // Phones and tablets fold the filters away under search.
  const [filtersOpen, setFiltersOpen] = useState(false)

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
      (supabase as any).from('social_posts').select('id, platform, permalink, message, media_url, post_type, thumb:raw->>thumbnail_url, mtype:raw->>media_type, children:raw->children, attachments:raw->attachments', { count: 'exact' }).eq('company_id', companyId).order('posted_at', { ascending: false }).limit(1000),
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

  if (loading) return <div style={{ padding: 40, color: '#8e8e93' }}>Loading…</div>

  const I = (d: React.ReactNode, size = 15) => <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{d}</svg>
  const tiles: { key: string; label: string; value: number; sub: string; color: string; icon: React.ReactNode; on?: boolean; onClick?: () => void }[] = [
    { key: 'posts', label: 'Posts', value: stats.posts, sub: 'Synced from your pages', color: '#52525b', icon: I(<><rect x="3" y="3" width="18" height="18" rx="4" /><circle cx="9" cy="9" r="2" /><path d="m21 15-3.1-3.1a2 2 0 0 0-2.8 0L6 21" /></>) },
    { key: 'comments', label: 'Comments', value: stats.comments, sub: 'Not archived', color: '#2563eb', icon: I(<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />), on: type === 'all', onClick: () => setType('all') },
    { key: 'unreplied', label: 'Needs a reply', value: stats.unreplied, sub: stats.unreplied ? 'Waiting for you' : 'All answered', color: '#ea580c', icon: I(<><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></>), on: type === 'unreplied', onClick: () => setType(type === 'unreplied' ? 'all' : 'unreplied') },
    { key: 'replied', label: 'Replied', value: stats.replied, sub: stats.comments ? `${Math.round(stats.replied / stats.comments * 100)}% answered` : '—', color: '#16a34a', icon: I(<polyline points="20 6 9 17 4 12" />), on: type === 'replied', onClick: () => setType(type === 'replied' ? 'all' : 'replied') },
  ]
  const filtersOn = risk !== 'all' || type !== 'all' || !!cat || platform !== 'all' || !!search.trim()
  // How many filters besides search are on (shown on the phones' Filters toggle).
  const filterCount = (risk !== 'all' ? 1 : 0) + (type !== 'all' ? 1 : 0) + (cat ? 1 : 0) + (platform !== 'all' ? 1 : 0)
  const clearAll = () => { setSearch(''); setRisk('all'); setType('all'); setCat(''); setPlatform('all') }

  return (
    <div className="se">
      <style>{SE_CSS}</style>

      <div className="se-head">
        <div>
          <h1>Social engagement</h1>
          <p>Reply to Instagram and Facebook comments from one place.</p>
        </div>
        <div className="se-head-acts">
          {syncMsg && <span className="se-note" role="status">{syncMsg}</span>}
          <Link href="/admin/social/categories" className="se-pill">Categories</Link>
          {connected && (
            <button onClick={sync} disabled={syncing} className="cv-btn cv-btn-primary">
              {I(<><path d="M21 12a9 9 0 0 1-15.36 6.36L3 16" /><path d="M3 12a9 9 0 0 1 15.36-6.36L21 8" /><polyline points="21 3 21 8 16 8" /><polyline points="3 21 3 16 8 16" /></>, 15)}
              {syncing ? 'Syncing…' : 'Sync comments'}
            </button>
          )}
        </div>
      </div>

      <div className="se-tiles">
        {tiles.map(t => {
          const body = (
            <>
              <span className="se-tile-top"><span className="se-tile-l">{t.label}</span><span className="se-tile-ic">{t.icon}</span></span>
              <span className="se-tile-v" style={t.key === 'unreplied' && t.value ? { color: '#ea580c' } : undefined}>{t.value.toLocaleString()}</span>
              <span className="se-tile-s">{t.sub}</span>
            </>
          )
          return t.onClick
            ? <button key={t.key} type="button" className={'se-tile' + (t.on && t.key !== 'comments' ? ' on' : '')} style={{ ['--t' as any]: t.color }} aria-pressed={!!t.on} onClick={t.onClick}>{body}</button>
            : <div key={t.key} className="se-tile static" style={{ ['--t' as any]: t.color }}>{body}</div>
        })}
      </div>

      {checked && !connected ? (
        <div className="se-card se-connect">
          <EmptyScroll kinds={['chat', 'photo']} title="Connect Facebook or Instagram"
            line="Colvy brings comments from your Facebook and Instagram posts into one place, so you can reply to everything here."
            action={<Link href="/admin/crm-settings/channels/meta" className="cv-btn cv-btn-primary" style={{ textDecoration: 'none' }}>Connect Facebook &amp; Instagram</Link>} />
        </div>
      ) : (
        <div className="se-grid">
          {/* Feed */}
          <div style={{ minWidth: 0 }}>
            {filtered.length === 0 ? (
              <div className="se-card" style={{ padding: '24px 12px' }}>
                {comments.length === 0
                  ? <EmptyScroll kinds={['chat', 'photo']} title="No comments yet" line="Sync to pull in comments from your Facebook and Instagram posts."
                      action={connected ? <button type="button" className="cv-btn" onClick={sync} disabled={syncing}>{syncing ? 'Syncing…' : 'Sync comments'}</button> : undefined} />
                  : <EmptyScroll kinds={['chat', 'photo']} title={search.trim() ? 'No matches' : 'No comments match these filters'}
                      line={search.trim() ? `Nothing matches “${search.trim()}”.` : 'Try clearing a filter to see more.'}
                      action={<button type="button" className="cv-btn" onClick={clearAll}>Clear filters</button>} />}
              </div>
            ) : pg.items.map(c => {
              const critical = (c.risk_level || 'safe') === 'critical'
              const hot = c.id === highlightCommentId
              const plat = platformOf(c)
              const post = c.post_id ? posts[c.post_id] : undefined
              const linked = c.contact_id ? contactInfo[c.contact_id] : undefined
              const authorName = (c.author_name && !PLACEHOLDER_AUTHOR.test(c.author_name) ? c.author_name : linked?.name) || c.author_name || `${PLATFORM[plat].label} user`
              return (
              <article key={c.id} id={`comment-${c.id}`} className={'se-card se-c' + (hot ? ' hot' : '') + (c.is_hidden ? ' hidden' : '')}>
                <div className="se-c-head">
                  <span style={{ position: 'relative', flexShrink: 0 }}>
                    <Avatar key={c.author_photo || linked?.avatar || c.id} src={c.author_photo || linked?.avatar} name={authorName} />
                    <span style={{ position: 'absolute', right: -3, bottom: -3, borderRadius: plat === 'instagram' ? 6 : '50%', boxShadow: '0 0 0 2px #fff', display: 'flex' }}><PlatformMark platform={plat} size={17} /></span>
                  </span>
                  <div className="se-c-who">
                    <b>{authorName}</b>
                    <span className="se-c-meta">
                      <span>{PLATFORM[plat].label}</span>
                      {c.commented_at && <><span className="se-dot" /><span>{new Date(c.commented_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' })}</span></>}
                      {c.is_hidden && <><span className="se-dot" /><span>Hidden</span></>}
                    </span>
                  </div>
                  <span className="se-tags">
                    <span className="se-tag dot" style={{ ['--t' as any]: c.is_replied ? '#22c55e' : '#f97316' }}>{c.is_replied ? 'Replied' : 'Needs reply'}</span>
                    <span className="se-tag dot" style={{ ['--t' as any]: critical ? '#ef4444' : '#14b8a6' }}>{critical ? 'Critical' : 'Safe'}</span>
                  </span>
                </div>

                <p className="se-c-msg">{c.message || <span style={{ color: '#a1a1aa', fontStyle: 'italic' }}>(no text)</span>}</p>
                {c.attachment_url && <img src={c.attachment_url} alt="" referrerPolicy="no-referrer" style={{ maxWidth: 220, borderRadius: 14, marginBottom: 10, display: 'block' }} />}
                {post && <PostPreview key={post.id} post={post} platform={plat} />}

                <div className="se-c-labels">
                  {c.category && <span className="se-tag">{c.category}</span>}
                  <button type="button" onClick={() => openLink(c)} title="Match this commenter to a customer" className={'se-link' + (c.contact_id ? ' on' : '')}>
                    {I(<><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" /><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" /></>, 13)}
                    <span>{c.contact_id ? `Linked${c.contact_name ? `: ${c.contact_name}` : ''}` : 'Link to customer'}</span>
                  </button>
                </div>

                {c.is_replied && c.reply_text && (
                  <div className="se-reply">
                    <p className="se-reply-h">{I(<><polyline points="9 17 4 12 9 7" /><path d="M20 18v-2a4 4 0 0 0-4-4H4" /></>, 13)} Your reply{c.replied_by_ai ? ' (AI)' : ''}</p>
                    <p className="se-reply-t">{c.reply_text}</p>
                  </div>
                )}

                {composer?.id !== c.id && !c.is_replied && drafts[c.id] && companyId ? (
                  <div className="se-agsg" style={{ marginTop: 12 }}>
                    <SuggestionCard s={drafts[c.id]} companyId={companyId} compact onDone={(_id, status) => {
                      setDrafts(d => { const n = { ...d }; delete n[c.id]; return n })
                      setTimeout(() => { load(); loadDrafts() }, 600)
                    }} />
                  </div>
                ) : composer?.id === c.id ? (
                  <div className="se-composer">
                    <textarea value={composer.text} onChange={e => setComposer({ ...composer, text: e.target.value })} rows={2}
                      placeholder={composer.mode === 'dm' ? 'Private message to the commenter…' : 'Reply publicly…'}
                      aria-label={composer.mode === 'dm' ? 'Private message' : 'Public reply'} />
                    <div className="se-composer-acts">
                      <button onClick={() => setComposer(null)} className="se-btn">Cancel</button>
                      <button onClick={doReply} disabled={composer.busy || !composer.text.trim()} className="se-btn primary">{composer.busy ? 'Sending…' : composer.mode === 'dm' ? 'Send message' : 'Post reply'}</button>
                    </div>
                  </div>
                ) : (
                  <div className="se-acts">
                    {!c.is_replied && (
                      <button className="se-btn ai" onClick={() => aiDraft(c)} disabled={drafting === c.id}>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z" /></svg>
                        {drafting === c.id ? 'Drafting…' : 'AI reply'}
                      </button>
                    )}
                    <button className="se-btn" onClick={() => setComposer({ id: c.id, mode: 'reply', text: '' })}>Reply</button>
                    <button className="se-btn" onClick={() => setComposer({ id: c.id, mode: 'dm', text: '' })}>Message</button>
                    <span style={{ flex: 1 }} />
                    <button className="se-btn quiet" onClick={async () => { await act(c, c.is_hidden ? 'unhide' : 'hide'); patch(c.id, { is_hidden: !c.is_hidden }) }}>{c.is_hidden ? 'Unhide' : 'Hide'}</button>
                    <button className="se-btn quiet" onClick={async () => { await act(c, showArchived ? 'unarchive' : 'archive'); patch(c.id, { is_archived: !showArchived }) }}>{showArchived ? 'Unarchive' : 'Archive'}</button>
                  </div>
                )}
              </article>
            )})}
            <Pagination {...pg} noun="comments" />
          </div>

          {/* Filters */}
          <aside className={'se-card se-filters' + (filtersOpen ? ' open' : '')} aria-label="Filters">
            <div className="se-f-head">
              <b>Filters</b>
              {filtersOn && <button type="button" className="se-clear" onClick={clearAll}>Clear</button>}
              <button type="button" className="se-f-toggle" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(o => !o)}>
                {filtersOpen ? 'Hide' : 'More filters'}{!filtersOpen && filterCount > 0 && <span className="se-badge">{filterCount}</span>}
              </button>
            </div>
            <label className="se-search">
              {I(<><circle cx="11" cy="11" r="7" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></>, 15)}
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search comments" aria-label="Search comments" />
              {search && <button type="button" className="se-x" onClick={() => setSearch('')} aria-label="Clear search">{I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 12)}</button>}
            </label>

            <div className="se-f-body">
            <p className="se-f-label">Platform</p>
            <div className="se-chips">
              <button className={'se-fchip' + (platform === 'all' ? ' on' : '')} onClick={() => setPlatform('all')}>All</button>
              {(['instagram', 'facebook'] as const).map(v => (
                <button key={v} className={'se-fchip' + (platform === v ? ' on' : '')} onClick={() => setPlatform(platform === v ? 'all' : v)}>
                  <PlatformMark platform={v} size={15} />{PLATFORM[v].label}<span className="n">{platformCounts[v]}</span>
                </button>
              ))}
            </div>

            <p className="se-f-label">Risk</p>
            <div className="se-seg">
              {(['all', 'safe', 'critical'] as const).map(v => <button key={v} className={risk === v ? 'on' : ''} onClick={() => setRisk(v)}>{v === 'all' ? 'All' : v === 'safe' ? 'Safe' : 'Critical'}</button>)}
            </div>

            <p className="se-f-label">Reply status</p>
            <div className="se-seg">
              {(['all', 'unreplied', 'replied'] as const).map(v => <button key={v} className={type === v ? 'on' : ''} onClick={() => setType(v)}>{v === 'all' ? 'All' : v === 'unreplied' ? 'Needs reply' : 'Replied'}</button>)}
            </div>

            <p className="se-f-label">Category</p>
            <div className="se-cats">
              <button className={'se-cat' + (cat === '' ? ' on' : '')} onClick={() => setCat('')}><span>All categories</span><span className="n">{active.length}</span></button>
              {Object.entries(catCounts).sort((a, b) => b[1] - a[1]).map(([name, n]) => (
                <button key={name} className={'se-cat' + (cat === name ? ' on' : '')} onClick={() => setCat(cat === name ? '' : name)}>
                  <span>{name}</span><span className="n">{n}</span>
                </button>
              ))}
            </div>

            <label className="se-arch">
              <span>Show archived</span>
              <input type="checkbox" role="switch" className="se-switch" checked={showArchived} onChange={e => setShowArchived(e.target.checked)} />
            </label>
            </div>
          </aside>
        </div>
      )}

      {/* Link-to-customer dialog */}
      {linkFor && (
        <div className="se-overlay" onClick={() => setLinkFor(null)}>
          <div className="se-modal" role="dialog" aria-modal="true" aria-label="Link to customer" onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
              <p style={{ margin: 0, fontSize: 21, fontWeight: 800, letterSpacing: '-0.02em' }}>Link to customer</p>
              <button type="button" className="se-round" onClick={() => setLinkFor(null)} aria-label="Close">{I(<><path d="M18 6 6 18" /><path d="m6 6 12 12" /></>, 15)}</button>
            </div>
            <p style={{ margin: '6px 0 14px', fontSize: 13.5, color: '#71717a', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span className="se-tag dot" style={{ ['--t' as any]: linkFor.contact_id ? '#22c55e' : '#a1a1aa' }}>{linkFor.contact_id ? 'Matched' : 'Not matched'}</span>
              Comment by <strong style={{ color: 'var(--ink)' }}>{linkFor.author_name || 'Unknown'}</strong>
            </p>
            <input autoFocus value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Search customers…" className="se-field" aria-label="Search customers" />
            {linkFor.contact_id && (
              <button onClick={() => setLink(linkFor, null)} className="se-contact" style={{ color: '#e11d48', fontWeight: 600, fontSize: 13.5, marginTop: 8 }}>Unlink the current customer</button>
            )}
            <div style={{ marginTop: 8, overflowY: 'auto', flex: 1 }}>
              {contactLoading && contactResults.length === 0 ? (
                <p style={{ padding: 16, color: '#8e8e93', fontSize: 13.5 }}>Searching…</p>
              ) : contactResults.length === 0 ? (
                <p style={{ padding: 16, color: '#8e8e93', fontSize: 13.5 }}>No customers found{contactSearch.trim() ? ` for “${contactSearch.trim()}”` : ''}.</p>
              ) : contactResults.map((c: any) => (
                <button key={c.id} onClick={() => setLink(linkFor, c)} className={'se-contact' + (linkFor.contact_id === c.id ? ' on' : '')}>
                  <span style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: 13.5, flexShrink: 0 }}>{(c.name || '?').charAt(0).toUpperCase()}</span>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: 'block', fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.name || 'Unnamed'}</span>
                    {c.email && <span style={{ display: 'block', fontSize: 12.5, color: '#8e8e93', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.email}</span>}
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

// The Social look: a big bold header, tiles that filter, comment cards with
// pill actions and a soft filter rail.
const SE_CSS = `
.se{padding:24px 28px 48px;max-width:1500px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.se button::before,.se-modal button::before{display:none}
.se-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap;margin-bottom:20px}
.se-head h1{margin:0;font-size:30px;font-weight:800;letter-spacing:-.025em;line-height:1.1}
.se-head p{margin:6px 0 0;font-size:14px;color:#71717a}
.se-head-acts{display:flex;align-items:center;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.se-note{font-size:13px;color:#71717a;max-width:360px}
.se-pill{display:inline-flex;align-items:center;height:38px;padding:0 15px;border-radius:999px;background:#f4f4f5;color:#18181b;font-size:13.5px;font-weight:600;text-decoration:none;transition:background-color .15s}
.se-pill:hover{background-color:#ececef}
.se-tiles{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;margin-bottom:18px}
.se-tile{display:flex;flex-direction:column;align-items:flex-start;gap:3px;padding:14px 16px;border:none;border-radius:18px;background:#fff;box-shadow:0 0 0 1px rgba(0,0,0,.07),0 1px 2px rgba(16,24,40,.04);font:inherit;color:inherit;text-align:left;min-width:0;cursor:pointer;transition:box-shadow .15s,transform .2s cubic-bezier(.22,1,.36,1)}
.se-tile.static{cursor:default}
button.se-tile:hover{transform:translateY(-1px)}
.se-tile.on{box-shadow:0 0 0 2px var(--t)}
.se-tile-top{display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%}
.se-tile-l{font-size:13.5px;font-weight:600;color:#71717a;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.se-tile-ic{width:30px;height:30px;border-radius:10px;flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;background:color-mix(in srgb,var(--t) 11%,#fff);color:var(--t)}
.se-tile-v{margin-top:2px;font-size:26px;font-weight:800;letter-spacing:-.02em;line-height:1.1;font-variant-numeric:tabular-nums}
.se-tile-s{font-size:12.5px;color:#8e8e93;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.se-card{background:#fff;border-radius:20px;box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);min-width:0}
.se-connect{padding:24px 12px}
.se-grid{display:grid;grid-template-columns:minmax(0,1fr) 290px;gap:18px;align-items:start}
.se-c{padding:18px 20px;margin-bottom:12px;transition:box-shadow .4s}
.se-c.hot{box-shadow:0 0 0 3px var(--coral)}
.se-c.hidden{opacity:.6}
.se-c-head{display:flex;align-items:center;gap:12px;margin-bottom:12px;min-width:0}
.se-c-who{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.se-c-who b{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.se-c-meta{display:flex;align-items:center;gap:7px;flex-wrap:wrap;font-size:12.5px;color:#8e8e93}
.se-dot{width:3px;height:3px;border-radius:50%;background:#c4c4c8;flex-shrink:0}
.se-tags{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.se-tag{display:inline-flex;align-items:center;gap:5px;height:24px;padding:0 9px;border-radius:999px;font-size:12.5px;font-weight:600;white-space:nowrap;background:#f4f4f5;color:#52525b}
.se-tag.dot{background:color-mix(in srgb,var(--t) 12%,#fff);color:color-mix(in srgb,var(--t) 78%,#000)}
.se-tag.dot::before{content:'';width:6px;height:6px;border-radius:50%;background:var(--t)}
.se-c-msg{margin:0 0 10px;font-size:14.5px;color:var(--ink);line-height:1.55;overflow-wrap:anywhere}
.se-post{display:flex;align-items:center;gap:10px;max-width:100%;box-sizing:border-box;margin:0;padding:6px 6px 6px 6px;border-radius:14px;background:#f4f4f5;color:#52525b;font-size:12.5px;font-weight:500;text-decoration:none}
.se-post-open{flex-shrink:0;display:inline-flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:999px;color:#71717a;background:#fff}
.se-post-open:hover{color:#18181b}
.se-c-labels{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.se-link{display:inline-flex;align-items:center;gap:5px;height:28px;max-width:100%;padding:0 11px;border:none;border-radius:999px;background:#f4f4f5;color:#52525b;font:inherit;font-size:12.5px;font-weight:600;cursor:pointer}
.se-link span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.se-link:hover{background:#ececef}
.se-link.on{background:color-mix(in srgb,var(--coral) 10%,#fff);color:color-mix(in srgb,var(--coral) 85%,#000)}
.se-reply{margin-top:12px;padding:12px 14px;border-radius:16px;background:color-mix(in srgb,var(--coral) 7%,#fff)}
.se-reply-h{margin:0 0 3px;display:flex;align-items:center;gap:6px;font-size:12.5px;font-weight:700;color:color-mix(in srgb,var(--coral) 85%,#000)}
.se-reply-t{margin:0;font-size:14px;line-height:1.55;color:#27272a;overflow-wrap:anywhere}
.se-agsg .agsg{max-width:none;margin-left:0}
.se-composer{margin-top:12px}
.se-composer textarea{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:14px;border:1.5px solid transparent;background-color:#f4f4f5;font:inherit;font-size:14px;resize:vertical;outline:none;color:var(--ink);transition:background-color .15s,border-color .15s,box-shadow .15s}
.se-composer textarea:focus{background-color:#fff;border-color:#d4d4d8!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.se-composer-acts{display:flex;gap:8px;margin-top:10px;justify-content:flex-end}
.se-acts{display:flex;align-items:center;gap:6px;margin-top:14px;flex-wrap:wrap}
.se-btn{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 14px;border:none;border-radius:999px;background:#f4f4f5;color:#18181b;font:inherit;font-size:13px;font-weight:600;cursor:pointer;white-space:nowrap;transition:background-color .15s,filter .15s}
.se-btn:hover:not(:disabled){background-color:#ececef}
.se-btn:disabled{opacity:.55;cursor:default}
.se-btn.primary{background:var(--coral);color:#fff}
.se-btn.primary:hover:not(:disabled){background:var(--coral);filter:brightness(.95)}
.se-btn.ai{background:color-mix(in srgb,#7c3aed 10%,#fff);color:#6d28d9}
.se-btn.ai:hover:not(:disabled){background-color:color-mix(in srgb,#7c3aed 16%,#fff)}
.se-btn.quiet{background:none;color:#71717a;padding:0 10px}
.se-btn.quiet:hover{background:#f4f4f5;color:#18181b}
.se-filters{padding:18px;position:sticky;top:16px}
.se-f-head{display:flex;align-items:center;justify-content:space-between;gap:6px;margin-bottom:12px}
.se-f-head b{margin-right:auto}
.se-f-toggle{display:none;align-items:center;gap:6px;height:30px;padding:0 12px;border:none;border-radius:999px;background:#f4f4f5;font:inherit;font-size:13px;font-weight:600;color:#18181b;cursor:pointer}
.se-badge{min-width:18px;height:18px;padding:0 5px;box-sizing:border-box;border-radius:999px;background:var(--coral);color:#fff;font-size:11px;font-weight:700;display:inline-flex;align-items:center;justify-content:center}
.se-f-head b{font-size:16px;font-weight:700}
.se-clear{height:28px;padding:0 10px;border:none;border-radius:999px;background:none;font:inherit;font-size:13px;font-weight:600;color:var(--coral);cursor:pointer}
.se-clear:hover{background:#f4f4f5}
.se-search{display:flex;align-items:center;gap:8px;height:38px;padding:0 10px 0 14px;border-radius:999px;border:1.5px solid transparent;background:#f4f4f5;color:#a1a1aa;box-sizing:border-box;margin-bottom:4px;transition:background-color .15s,border-color .15s,box-shadow .15s}
.se-search:focus-within{background:#fff;border-color:#d4d4d8;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.se-search input{flex:1;min-width:0;border:none;outline:none;background:transparent;font:inherit;font-size:14px;color:var(--ink)}
.se-search input:focus{box-shadow:none}
.se-x{width:24px;height:24px;padding:0;border:none;border-radius:999px;background:#e4e4e7;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer}
.se-f-label{margin:16px 0 8px;font-size:13.5px;font-weight:600;color:#71717a}
.se-chips{display:flex;gap:6px;flex-wrap:wrap}
.se-fchip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:none;border-radius:999px;background:#f4f4f5;color:#3f3f46;font:inherit;font-size:13px;font-weight:600;cursor:pointer;transition:background-color .15s,color .15s}
.se-fchip:hover{background-color:#ececef}
.se-fchip.on{background:#18181b;color:#fff}
.se-fchip .n,.se-cat .n{font-size:12px;opacity:.65;font-variant-numeric:tabular-nums}
.se-seg{display:flex;gap:2px;padding:3px;border-radius:999px;background:#f4f4f5}
.se-seg button{flex:1;height:30px;padding:0 8px;border:none;border-radius:999px;background:transparent;font:inherit;font-size:13px;font-weight:600;color:#52525b;cursor:pointer;white-space:nowrap;transition:background .15s,color .15s,box-shadow .15s}
.se-seg button:hover{color:#18181b}
.se-seg button.on{background:#fff;color:#18181b;box-shadow:0 1px 3px rgba(0,0,0,.1),0 0 0 .5px rgba(0,0,0,.04)}
.se-cats{display:flex;flex-direction:column;gap:2px;max-height:260px;overflow-y:auto;margin:0 -6px}
.se-cat{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 10px;border:none;border-radius:12px;background:none;font:inherit;font-size:13.5px;font-weight:500;color:#27272a;text-align:left;cursor:pointer}
.se-cat span:first-child{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.se-cat:hover{background:#f4f4f5}
.se-cat.on{background:color-mix(in srgb,var(--coral) 10%,#fff);color:color-mix(in srgb,var(--coral) 85%,#000);font-weight:600}
.se-arch{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:16px;padding-top:14px;border-top:1px solid #f0f0f2;font-size:14px;font-weight:600;cursor:pointer}
.se-switch{appearance:none;-webkit-appearance:none;flex-shrink:0;width:40px;height:24px;margin:0;border-radius:999px;background:#d4d4d8;position:relative;cursor:pointer;transition:background-color .2s}
.se-switch::after{content:'';position:absolute;top:2px;left:2px;width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,.25);transition:transform .2s cubic-bezier(.22,1,.36,1)}
.se-switch:checked{background:#34c759}
.se-switch:checked::after{transform:translateX(16px)}
.se-switch:focus{box-shadow:none}
@keyframes seFade{from{opacity:0}to{opacity:1}}
@keyframes seRise{from{transform:translateY(12px) scale(.98);opacity:0}to{transform:none;opacity:1}}
.se-overlay{position:fixed;inset:0;z-index:5700;background:rgba(15,15,20,.35);display:flex;align-items:center;justify-content:center;padding:16px;animation:seFade .18s ease}
.se-modal{width:100%;max-width:440px;max-height:85vh;display:flex;flex-direction:column;background:#fff;border-radius:24px;padding:22px;box-sizing:border-box;box-shadow:0 24px 64px rgba(0,0,0,.22);animation:seRise .24s cubic-bezier(.22,1,.36,1);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--ink)}
.se-round{width:34px;height:34px;padding:0;border:none;border-radius:999px;background:#f4f4f5;color:#52525b;display:inline-flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0}
.se-round:hover{background:#ececef;color:#18181b}
.se-field{display:block;width:100%;box-sizing:border-box;height:42px;padding:0 14px;border:1.5px solid transparent;border-radius:12px;background:#f4f4f5;font:inherit;font-size:14.5px;color:var(--ink);outline:none}
.se-field:focus{background:#fff;border-color:#d4d4d8!important;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 16%,transparent)}
.se-contact{width:100%;text-align:left;display:flex;align-items:center;gap:10px;padding:9px 12px;border-radius:14px;border:none;background:transparent;cursor:pointer;font:inherit;color:var(--ink);transition:background-color .12s}
.se-contact:hover{background-color:#f4f4f5}
.se-contact.on{background:color-mix(in srgb,var(--coral) 9%,#fff)}
.se-tile:focus-visible,.se-btn:focus-visible,.se-fchip:focus-visible,.se-seg button:focus-visible,.se-cat:focus-visible,.se-link:focus-visible,.se-switch:focus-visible{outline:none;box-shadow:0 0 0 3px color-mix(in srgb,var(--coral) 28%,transparent)}
@media(max-width:1023px){.se-grid{grid-template-columns:1fr}.se-filters{position:static;order:-1;padding:14px 16px}.se-f-toggle{display:inline-flex}.se-filters:not(.open) .se-f-body{display:none}.se-f-head{margin-bottom:10px}}
@media(max-width:700px){
  .se{padding:16px 14px 40px}
  .se-head{flex-direction:column;align-items:stretch}
  .se-head h1{font-size:26px}
  .se-head-acts{justify-content:stretch}
  .se-head-acts > *{flex:1;justify-content:center}
  .se-note{flex-basis:100%;text-align:center}
  .se-tiles{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .se-tile{padding:12px 14px}
  .se-tile-v{font-size:21px}
  .se-c{padding:14px;border-radius:18px;margin-bottom:8px}
  .se-c-head{align-items:flex-start;flex-wrap:wrap}
  .se-tags{flex-basis:100%;justify-content:flex-start;padding-left:52px;margin-top:-4px}
  .se-acts .se-btn.quiet{padding:0 8px}
  .se-overlay{padding:0;align-items:flex-end}
  .se-modal{max-width:none;border-radius:24px 24px 0 0;max-height:88dvh}
  .se-field{font-size:16px}
}
@media (prefers-reduced-motion: reduce){.se-overlay,.se-modal{animation:none}button.se-tile:hover{transform:none}}
`
