'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

type Review = {
  id: string
  review_id: string
  reviewer_name: string
  reviewer_photo: string | null
  star_rating: number
  comment: string | null
  reply_comment: string | null
  review_created_at: string | null
  location_title?: string | null
}

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<Review[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [companyName, setCompanyName] = useState('')
  const [loading, setLoading] = useState(true)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [posting, setPosting] = useState(false)
  const [drafting, setDrafting] = useState<string | null>(null)
  const [ratingFilter, setRatingFilter] = useState(0)
  const [repliesFilter, setRepliesFilter] = useState<'all' | 'replied' | 'unreplied'>('all')
  const [search, setSearch] = useState('')
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    const init = async () => {
      let cid: string | null = null
      if (typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const { data: co } = await (supabase as any).from('companies').select('id, name').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
          if (co) { cid = co.id; setCompanyName(co.name) }
        }
      }
      if (!cid) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: ownCo } = await (supabase as any).from('companies').select('id, name').eq('owner_id', session.user.id).maybeSingle()
          if (ownCo?.id) { cid = ownCo.id; setCompanyName(ownCo.name) }
        }
      }
      setCompanyId(cid)
      if (cid) await load(cid)
      setLoading(false)
    }
    init()
  }, [])

  const load = async (cid: string) => {
    const { data } = await (supabase as any).from('google_reviews')
      .select('*').eq('company_id', cid).order('review_created_at', { ascending: false }).limit(500)
    setReviews(data || [])
  }

  const sync = async () => {
    if (!companyId) return
    setSyncing(true)
    try {
      const res = await fetch('/api/google/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'sync' }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Sync failed')
      await load(companyId)
    } catch (e: any) {
      alert(e.message || 'Could not sync reviews')
    } finally { setSyncing(false) }
  }

  const draftReply = async (review: Review) => {
    if (!companyId) return
    setDrafting(review.id)
    try {
      const res = await fetch('/api/google/reviews/ai-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, reviewId: review.review_id }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not draft a reply')
      setReplyingTo(review.id)
      setReplyText(d.reply || d.draft || '')
    } catch (e: any) {
      alert(e.message)
    } finally { setDrafting(null) }
  }

  const postReply = async (review: Review) => {
    if (!companyId || !replyText.trim()) return
    setPosting(true)
    try {
      const res = await fetch('/api/google/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'reply', reviewId: review.review_id, comment: replyText.trim() }),
      })
      const d = await res.json()
      if (!res.ok) throw new Error(d.error || 'Could not post reply')
      setReviews(rs => rs.map(r => r.id === review.id ? { ...r, reply_comment: replyText.trim() } : r))
      setReplyingTo(null); setReplyText('')
    } catch (e: any) {
      alert(e.message)
    } finally { setPosting(false) }
  }

  const filtered = reviews.filter(r => {
    if (ratingFilter && r.star_rating !== ratingFilter) return false
    if (repliesFilter === 'replied' && !r.reply_comment) return false
    if (repliesFilter === 'unreplied' && r.reply_comment) return false
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!(r.comment || '').toLowerCase().includes(q) && !(r.reviewer_name || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const avg = reviews.length ? (reviews.reduce((a, r) => a + (r.star_rating || 0), 0) / reviews.length) : 0

  const Stars = ({ n, size = 16 }: { n: number; size?: number }) => (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(s => <span key={s} style={{ fontSize: size, color: s <= n ? '#f5b301' : '#e5e7eb' }}>★</span>)}
    </span>
  )

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading reviews…</div>

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: '#2563eb', margin: 0 }}>Review Dashboard</h1>
        <button onClick={sync} disabled={syncing}
          style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid var(--border)', background: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', color: 'var(--ink)' }}>
          {syncing ? 'Syncing…' : 'Sync Google reviews'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 20, alignItems: 'start' }}>
        <div>
          {/* Filters */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
              <span style={{ fontWeight: 700, fontSize: 14 }}>Filters</span>
              <span style={{ fontSize: 12, color: 'var(--slate)', fontStyle: 'italic' }}>Showing {filtered.length} of {reviews.length}</span>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: 10 }}>
              <select value={ratingFilter} onChange={e => setRatingFilter(Number(e.target.value))}
                style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, minWidth: 130 }}>
                <option value={0}>All ratings</option>
                {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>)}
              </select>
              <select value={repliesFilter} onChange={e => setRepliesFilter(e.target.value as any)}
                style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, minWidth: 130 }}>
                <option value="all">All replies</option>
                <option value="replied">Replied</option>
                <option value="unreplied">Not replied</option>
              </select>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reviews…"
                style={{ flex: 1, minWidth: 180, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13 }} />
            </div>
          </div>

          {/* Review list */}
          {filtered.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: 40, textAlign: 'center', color: 'var(--slate)' }}>
              {reviews.length === 0 ? 'No reviews synced yet. Connect Google and hit “Sync Google reviews”.' : 'No reviews match these filters.'}
            </div>
          ) : filtered.map(review => (
            <div key={review.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '18px 20px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {review.reviewer_photo
                    ? <img src={review.reviewer_photo} alt={review.reviewer_name} referrerPolicy="no-referrer" style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />
                    : <span style={{ width: 40, height: 40, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>{(review.reviewer_name || '?').charAt(0).toUpperCase()}</span>}
                  <div>
                    <p style={{ margin: 0, fontWeight: 700, fontSize: 15 }}>{review.reviewer_name || 'Anonymous'}</p>
                    {review.location_title && <p style={{ margin: 0, fontSize: 11.5, color: 'var(--slate)' }}>{review.location_title}</p>}
                  </div>
                </div>
                <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: 18, height: 18 }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, background: 'var(--canvas)', borderRadius: 10, padding: '12px 14px' }}>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.55, color: 'var(--ink)', flex: 1 }}>{review.comment || <span style={{ color: 'var(--slate)', fontStyle: 'italic' }}>No written comment</span>}</p>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <Stars n={review.star_rating} />
                  <p style={{ margin: '4px 0 0', fontSize: 11.5, color: 'var(--slate)', fontStyle: 'italic' }}>{review.review_created_at ? new Date(review.review_created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
                </div>
              </div>

              {review.reply_comment ? (
                <div style={{ marginTop: 12, padding: '10px 14px', background: '#eef4ff', borderRadius: 10, borderLeft: '3px solid #2563eb' }}>
                  <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 700, color: '#2563eb' }}>Your reply</p>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)' }}>{review.reply_comment}</p>
                </div>
              ) : replyingTo === review.id ? (
                <div style={{ marginTop: 12 }}>
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3}
                    placeholder="Write your reply…"
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', boxSizing: 'border-box' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setReplyingTo(null); setReplyText('') }}
                      style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                    <button onClick={() => postReply(review)} disabled={posting || !replyText.trim()}
                      style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: 'var(--coral)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>{posting ? 'Posting…' : 'Post reply'}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
                  <button onClick={() => draftReply(review)} disabled={drafting === review.id}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', color: '#8b5cf6', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                    ✨ {drafting === review.id ? 'Drafting…' : 'Generate AI Reply'}
                  </button>
                  <button onClick={() => { setReplyingTo(review.id); setReplyText('') }}
                    style={{ background: 'none', border: 'none', color: '#2563eb', fontSize: 13, fontWeight: 700, cursor: 'pointer', padding: 0 }}>
                    Compose Reply
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Right rail — Google summary */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 14, padding: '20px', position: 'sticky', top: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: 28, height: 28 }} />
            <span style={{ fontWeight: 800, fontSize: 16 }}>Google Reviews</span>
          </div>
          <Stars n={Math.round(avg)} size={22} />
          <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
            {reviews.length > 0
              ? <>Average <strong>{avg.toFixed(1)}</strong> from <strong>{reviews.length}</strong> reviews.</>
              : 'Connect Google and sync to see your ratings here.'}
          </p>
          <a href="/admin/integrations/google-reviews"
            style={{ display: 'block', textAlign: 'center', marginTop: 16, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink)', fontWeight: 700, fontSize: 13 }}>
            Manage Connected Accounts
          </a>
        </div>
      </div>
    </div>
  )
}
