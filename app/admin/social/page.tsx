'use client'
import { useEffect, useState, useCallback } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { useCompanyUser } from '../crm-settings/_shared'

type Comment = {
  id: string
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
  const [syncing, setSyncing] = useState(false)
  const [syncMsg, setSyncMsg] = useState('')

  // Filters
  const [search, setSearch] = useState('')
  const [risk, setRisk] = useState<'all' | 'safe' | 'critical'>('all')
  const [type, setType] = useState<'all' | 'unreplied' | 'replied'>('all')
  const [cat, setCat] = useState('')
  const [showArchived, setShowArchived] = useState(false)

  // Per-comment reply / DM composer
  const [composer, setComposer] = useState<{ id: string; mode: 'reply' | 'dm'; text: string; busy?: boolean } | null>(null)
  const [drafting, setDrafting] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!companyId) return
    const [{ data: chans }, cmts, posts] = await Promise.all([
      (supabase as any).from('meta_channels').select('page_name').eq('company_id', companyId).eq('platform', 'facebook').eq('is_active', true).limit(1),
      (supabase as any).from('social_comments').select('*').eq('company_id', companyId).order('commented_at', { ascending: false }).limit(2000),
      (supabase as any).from('social_posts').select('*', { count: 'exact', head: true }).eq('company_id', companyId),
    ])
    setConnected(chans?.[0] || null)
    setComments(cmts.data || [])
    setPostCount(posts.count || 0)
    setChecked(true)
  }, [companyId])

  useEffect(() => { load() }, [load])

  const sync = async () => {
    if (!companyId || syncing) return
    setSyncing(true); setSyncMsg('')
    try {
      const res = await fetch('/api/social/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId }) })
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
      const res = await fetch('/api/social/comments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ companyId, action, commentId: c.id, ...extra }) })
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

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading…</div>

  const active = comments.filter(c => showArchived ? c.is_archived : !c.is_archived)
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
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Social Engagement Manager</h1>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          {syncMsg && <span style={{ fontSize: 12, color: 'var(--slate)' }}>{syncMsg}</span>}
          <Link href="/admin/social/categories" className="se-btn se-btn-ghost" style={{ textDecoration: 'none' }}>Categories</Link>
          {connected && <button onClick={sync} disabled={syncing} className="se-btn se-btn-primary">{syncing ? 'Syncing…' : 'Sync comments'}</button>}
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 18 }}>
        <Chip label="Total Posts" value={stats.posts} tone="var(--ink)" />
        <Chip label="Total Comments" value={stats.comments} tone="var(--ink)" />
        <Chip label="Replied" value={stats.replied} tone="#16a34a" />
        <Chip label="Unreplied" value={stats.unreplied} tone={stats.unreplied ? '#dc2626' : 'var(--ink)'} />
      </div>

      {checked && !connected ? (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 18, padding: '40px 28px', textAlign: 'center' }}>
          <p style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', margin: '0 0 6px' }}>Connect your Facebook page to access this feature</p>
          <p style={{ fontSize: 13.5, color: 'var(--slate)', margin: '0 0 20px', lineHeight: 1.55, maxWidth: 560, marginInline: 'auto' }}>
            Colvy unifies comments from Facebook and Instagram into one dashboard so you can reply to everything in one place.
          </p>
          <Link href="/admin/integrations" style={{ display: 'inline-block', padding: '11px 22px', borderRadius: 12, background: 'var(--coral)', color: '#fff', fontSize: 13.5, fontWeight: 700, textDecoration: 'none' }}>Connect Facebook</Link>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : 'minmax(0,1fr) 260px', gap: 18, alignItems: 'start' }}>
          {/* Feed */}
          <div>
            {filtered.length === 0 ? (
              <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 40, textAlign: 'center', color: 'var(--slate)' }}>
                {comments.length === 0 ? 'No comments yet — hit “Sync comments” to pull them from your page.' : 'No comments match these filters.'}
              </div>
            ) : filtered.map(c => {
              const critical = (c.risk_level || 'safe') === 'critical'
              return (
              <div key={c.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px', marginBottom: 14, opacity: c.is_hidden ? 0.6 : 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                    {c.author_photo
                      ? <img src={c.author_photo} alt="" referrerPolicy="no-referrer" style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover' }} />
                      : <span style={{ width: 34, height: 34, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{(c.author_name || '?').charAt(0).toUpperCase()}</span>}
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 800, fontSize: 14 }}>{c.author_name || 'Facebook user'}</p>
                      <p style={{ margin: 0, fontSize: 11, color: 'var(--slate)' }}>{c.commented_at ? new Date(c.commented_at).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}{c.is_hidden ? ' · hidden' : ''}{c.is_replied ? ' · replied' : ''}</p>
                    </div>
                  </div>
                  <span style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 11px', borderRadius: 999, background: critical ? '#fee2e2' : '#dcfce7', color: critical ? '#dc2626' : '#16a34a', whiteSpace: 'nowrap' }}>
                    {critical ? '⚠ Critical / Harmful' : '♥ Safe / Positive'}
                  </span>
                </div>

                <p style={{ margin: '0 0 8px', fontSize: 13.5, color: 'var(--ink)', lineHeight: 1.55 }}>{c.message || <span style={{ color: 'var(--slate)', fontStyle: 'italic' }}>(no text)</span>}</p>
                {c.attachment_url && <img src={c.attachment_url} alt="" referrerPolicy="no-referrer" style={{ maxWidth: 200, borderRadius: 10, marginBottom: 8 }} />}

                {c.category && <span style={{ display: 'inline-block', fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 8, background: 'var(--canvas)', color: 'var(--slate)' }}>{c.category}</span>}

                {c.is_replied && c.reply_text && (
                  <div style={{ marginTop: 10, padding: '10px 13px', background: 'var(--peach)', borderRadius: 10, borderLeft: '3px solid var(--coral)' }}>
                    <p style={{ margin: '0 0 2px', fontSize: 10.5, fontWeight: 800, color: 'var(--coral)' }}>Your reply{c.replied_by_ai ? ' (AI)' : ''}</p>
                    <p style={{ margin: 0, fontSize: 12.5, color: 'var(--ink)' }}>{c.reply_text}</p>
                  </div>
                )}

                {composer?.id === c.id ? (
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
                    {!c.is_replied && <button className="se-act" style={{ color: '#7c3aed' }} onClick={() => aiDraft(c)} disabled={drafting === c.id}>✨ {drafting === c.id ? 'Drafting…' : 'Generate AI Reply'}</button>}
                    <button className="se-act" onClick={() => setComposer({ id: c.id, mode: 'reply', text: '' })}>Reply</button>
                    <button className="se-act" onClick={() => setComposer({ id: c.id, mode: 'dm', text: '' })}>Message</button>
                    <button className="se-act" onClick={async () => { await act(c, c.is_hidden ? 'unhide' : 'hide'); patch(c.id, { is_hidden: !c.is_hidden }) }}>{c.is_hidden ? 'Unhide' : 'Hide'}</button>
                    <button className="se-act" onClick={async () => { await act(c, showArchived ? 'unarchive' : 'archive'); patch(c.id, { is_archived: !showArchived }) }}>{showArchived ? 'Unarchive' : 'Archive'}</button>
                  </div>
                )}
              </div>
            )})}
          </div>

          {/* Filters */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 16, position: 'sticky', top: 16 }}>
            <p style={{ margin: '0 0 10px', fontWeight: 800, fontSize: 14 }}>Filter</p>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search…" style={{ width: '100%', boxSizing: 'border-box', padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, outline: 'none', marginBottom: 14 }} />

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
    </div>
  )
}
