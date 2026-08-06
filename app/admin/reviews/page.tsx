'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { peekCompanyUser, readCache, writeCache } from '@/lib/client-cache'

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
  contact_id?: string | null
  contact_name?: string | null
  match_checked_at?: string | null
}

type Contact = { id: string; name: string | null; email?: string | null }

export default function ReviewsPage() {
  const seededCid = peekCompanyUser()?.companyId ?? null
  const seededReviews = seededCid ? readCache<Review[]>(`reviews:${seededCid}`) : undefined
  const [reviews, setReviews] = useState<Review[]>(seededReviews ?? [])
  const [companyId, setCompanyId] = useState<string | null>(seededCid)
  const [companyName, setCompanyName] = useState('')
  const [reviewLink, setReviewLink] = useState<string>('')
  const [savingLink, setSavingLink] = useState(false)
  const [linkSaved, setLinkSaved] = useState(false)
  const [loading, setLoading] = useState(!seededReviews)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [posting, setPosting] = useState(false)
  const [drafting, setDrafting] = useState<string | null>(null)
  const [ratingFilter, setRatingFilter] = useState(0)
  const [repliesFilter, setRepliesFilter] = useState<'all' | 'replied' | 'unreplied'>('all')
  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const check = () => setIsMobile(window.innerWidth < 768)
    check(); window.addEventListener('resize', check)
    return () => window.removeEventListener('resize', check)
  }, [])
  const [search, setSearch] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [preset, setPreset] = useState<'all' | '7' | '30' | '90' | 'custom'>('all')
  const [syncing, setSyncing] = useState(false)

  // Pagination
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(10)

  // Customer matching
  const [linkFor, setLinkFor] = useState<Review | null>(null)
  const [contactSearch, setContactSearch] = useState('')
  const [contactResults, setContactResults] = useState<Contact[]>([])
  const [contactLoading, setContactLoading] = useState(false)

  useEffect(() => {
    const init = async () => {
      let cid: string | null = seededCid
      let nameResolved = false
      if (!cid && typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const { data: co } = await (supabase as any).from('companies').select('id, name').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
          if (co) { cid = co.id; setCompanyName(co.name); nameResolved = true }
        }
      }
      if (!cid) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: ownCo } = await (supabase as any).from('companies').select('id, name').eq('owner_id', session.user.id).maybeSingle()
          if (ownCo?.id) { cid = ownCo.id; setCompanyName(ownCo.name); nameResolved = true }
        }
      }
      setCompanyId(cid)
      if (cid) {
        if (!nameResolved) {
          ;(supabase as any).from('companies').select('name').eq('id', cid).maybeSingle()
            .then(({ data }: any) => { if (data?.name) setCompanyName(data.name) })
        }
        // The business's Google "leave a review" link — opens the listing on Google.
        ;(supabase as any).from('google_business_accounts').select('review_link').eq('company_id', cid).maybeSingle()
          .then(({ data }: any) => { if (data?.review_link) setReviewLink(data.review_link) })
        await load(cid)
      }
      setLoading(false)
    }
    init()
  }, [])

  const load = async (cid: string) => {
    const { data } = await (supabase as any).from('google_reviews')
      .select('*').eq('company_id', cid).order('review_created_at', { ascending: false }).limit(5000)
    setReviews(data || [])
    writeCache(`reviews:${cid}`, data || [])
  }

  const sync = async () => {
    if (!companyId) return
    setSyncing(true)
    try {
      const res = await fetch('/api/google/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'sync' }),
      })
      // The sync can be slow; if it times out the body may not be JSON, so read
      // text and parse defensively rather than crashing with "not valid JSON".
      const text = await res.text()
      let d: any = {}
      try { d = text ? JSON.parse(text) : {} } catch { d = { error: res.ok ? 'The sync took too long — it may still be running. Give it a minute and refresh.' : (text.slice(0, 160) || 'Sync failed') } }
      if (!res.ok || d.error) throw new Error(d.error || 'Sync failed')
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

  const saveReviewLink = async () => {
    if (!companyId) return
    setSavingLink(true); setLinkSaved(false)
    try {
      await fetch('/api/google/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'save_review_link', reviewLink: reviewLink.trim() }),
      })
      setLinkSaved(true)
      setTimeout(() => setLinkSaved(false), 2500)
    } catch { /* keep the typed value */ } finally { setSavingLink(false) }
  }

  // ── Customer matching ──────────────────────────────────────────────────────
  const openLink = (review: Review) => {
    // Prime the search with the reviewer's name so the likely match is one tap away.
    setLinkFor(review)
    setContactSearch(review.reviewer_name && review.reviewer_name !== 'Anonymous' ? review.reviewer_name : '')
  }

  // Server-side contact search (debounced) — queries the whole contact list,
  // not a capped in-memory slice, so any customer is findable. Ranks real
  // prefix matches (name starts with the query) above mere substring hits.
  useEffect(() => {
    if (!linkFor || !companyId) return
    let cancelled = false
    setContactLoading(true)
    const q = contactSearch.trim()
    const t = setTimeout(async () => {
      let query = (supabase as any).from('contacts').select('id, name, email').eq('company_id', companyId)
      // Commas/parens are PostgREST or() delimiters — strip them from the term.
      const safeQ = q.replace(/[,()]/g, ' ').trim()
      if (safeQ) query = query.or(`name.ilike.%${safeQ}%,email.ilike.%${safeQ}%,phone.ilike.%${safeQ}%`)
      const { data } = await query.order('name', { ascending: true }).limit(40)
      if (cancelled) return
      const ql = q.toLowerCase()
      const rank = (c: Contact) => {
        const n = (c.name || '').toLowerCase()
        if (ql && n.startsWith(ql)) return 0
        if (ql && n.includes(ql)) return 1
        if (ql && (c.email || '').toLowerCase().includes(ql)) return 2
        return 3
      }
      setContactResults([...(data || [])].sort((a, b) => rank(a) - rank(b)).slice(0, 25))
      setContactLoading(false)
    }, 220)
    return () => { cancelled = true; clearTimeout(t) }
  }, [contactSearch, linkFor, companyId])

  const setLink = async (review: Review, contact: Contact | null) => {
    if (!companyId) return
    const patch = { contact_id: contact?.id || null, contact_name: contact?.name || null, match_checked_at: new Date().toISOString() }
    setReviews(rs => rs.map(r => r.id === review.id ? { ...r, ...patch } : r))
    setLinkFor(null)
    try {
      await fetch('/api/google/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'link_contact', reviewId: review.review_id, contactId: contact?.id || null, contactName: contact?.name || null }),
      })
    } catch { /* optimistic; a resync would re-derive */ }
  }

  // Reset to the first page whenever the result set changes.
  useEffect(() => { setPage(1) }, [ratingFilter, repliesFilter, dateFrom, dateTo, search, pageSize])

  const applyPreset = (p: 'all' | '7' | '30' | '90') => {
    setPreset(p)
    if (p === 'all') { setDateFrom(''); setDateTo(''); return }
    const days = Number(p)
    const now = new Date()
    const from = new Date(now.getTime() - days * 86_400_000)
    setDateFrom(from.toISOString().slice(0, 10))
    setDateTo(now.toISOString().slice(0, 10))
  }

  const filtered = reviews.filter(r => {
    if (ratingFilter && r.star_rating !== ratingFilter) return false
    if (repliesFilter === 'replied' && !r.reply_comment) return false
    if (repliesFilter === 'unreplied' && r.reply_comment) return false
    if (dateFrom || dateTo) {
      const t = r.review_created_at ? new Date(r.review_created_at).getTime() : NaN
      if (dateFrom && (isNaN(t) || t < new Date(dateFrom).getTime())) return false
      if (dateTo && (isNaN(t) || t > new Date(dateTo).getTime() + 86_400_000)) return false
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      if (!(r.comment || '').toLowerCase().includes(q) && !(r.reviewer_name || '').toLowerCase().includes(q)) return false
    }
    return true
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const pageClamped = Math.min(page, totalPages)
  const pageItems = filtered.slice((pageClamped - 1) * pageSize, pageClamped * pageSize)

  const avg = reviews.length ? (reviews.reduce((a, r) => a + (r.star_rating || 0), 0) / reviews.length) : 0
  const repliedCount = reviews.filter(r => r.reply_comment).length
  const pendingCount = reviews.length - repliedCount

  const Stars = ({ n, size = 16 }: { n: number; size?: number }) => (
    <span style={{ display: 'inline-flex', gap: 2 }}>
      {[1, 2, 3, 4, 5].map(s => <span key={s} style={{ fontSize: size, color: s <= n ? '#f5b301' : '#e5e7eb' }}>★</span>)}
    </span>
  )

  // Page-number list with ellipses, e.g. 1 … 4 5 [6] 7 8 … 52
  const pageList: (number | '…')[] = (() => {
    const out: (number | '…')[] = []
    const add = (n: number) => out.push(n)
    const near = (n: number) => Math.abs(n - pageClamped) <= 1
    for (let n = 1; n <= totalPages; n++) {
      if (n === 1 || n === totalPages || near(n)) add(n)
      else if (out[out.length - 1] !== '…') out.push('…')
    }
    return out
  })()

  if (loading) return <div style={{ padding: 40, color: 'var(--slate)' }}>Loading reviews…</div>

  return (
    <div style={{ padding: '28px 32px', maxWidth: 1400, margin: '0 auto' }}>
      <style>{`
        .rv-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; border-radius:12px; font-weight:700; font-size:13.5px; padding:10px 18px; cursor:pointer; border:1px solid transparent; transition: background .15s ease, border-color .15s ease, transform .06s ease, box-shadow .15s ease; line-height:1; }
        .rv-btn:active { transform: translateY(1px); }
        .rv-btn:disabled { opacity:.6; cursor:default; }
        .rv-btn-primary { background: var(--coral); color:#fff; box-shadow: 0 1px 2px rgba(255,122,107,0.35); }
        .rv-btn-primary:hover:not(:disabled) { background: var(--coral-hover); box-shadow: 0 4px 12px rgba(255,122,107,0.32); }
        .rv-btn-ghost { background:#fff; color: var(--ink); border-color: var(--border); }
        .rv-btn-ghost:hover:not(:disabled) { background: var(--canvas); border-color:#e2e2e2; }
        .rv-btn-ai { background: linear-gradient(135deg,#f6f0ff,#fff1f5); color:#7c3aed; border-color:#efe6ff; }
        .rv-btn-ai:hover:not(:disabled) { box-shadow: 0 4px 12px rgba(124,58,237,0.16); }
        .rv-chip { display:inline-flex; align-items:center; gap:6px; border-radius:999px; font-size:12px; font-weight:700; padding:5px 12px; cursor:pointer; border:1px solid var(--border); background:#fff; color:var(--slate); transition: all .15s; }
        .rv-chip:hover { border-color: var(--coral); color: var(--coral); background: var(--peach); }
        .rv-chip.on { border-color: var(--coral); color: var(--coral); background: var(--peach); }
        .rv-preset { padding:8px 14px; border-radius:999px; border:1px solid var(--border); background:#fff; color:var(--slate); font-size:12.5px; font-weight:700; cursor:pointer; transition: all .15s; }
        .rv-preset:hover { border-color: var(--coral); color: var(--coral); }
        .rv-preset.on { background: var(--peach); border-color: var(--coral); color: var(--coral); }
        .rv-page { min-width:38px; height:38px; padding:0 10px; border-radius:11px; border:1px solid var(--border); background:#fff; color:var(--ink); font-size:13.5px; font-weight:700; cursor:pointer; transition: all .15s; }
        .rv-page:hover:not(:disabled):not(.on) { border-color: var(--coral); color: var(--coral); }
        .rv-page.on { background: var(--coral); border-color: var(--coral); color:#fff; }
        .rv-page:disabled { opacity:.4; cursor:default; }
        .rv-input { padding:10px 13px; border-radius:11px; border:1px solid var(--border); font-size:13.5px; outline:none; background:#fff; color:var(--ink); transition: border-color .15s; }
        .rv-input:focus { border-color: var(--coral); }
      `}</style>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, gap: 12, flexWrap: 'wrap' }}>
        <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: 0 }}>Review Dashboard</h1>
        <button onClick={sync} disabled={syncing} className="rv-btn rv-btn-primary">
          {syncing ? 'Syncing…' : 'Sync Google reviews'}
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 320px', gap: 20, alignItems: 'start' }}>
        <div>
          {/* Filters */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '16px 18px', marginBottom: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <span style={{ fontWeight: 800, fontSize: 14 }}>Filters</span>
              <span style={{ fontSize: 12, color: 'var(--slate)', fontStyle: 'italic' }}>Showing {filtered.length} of {reviews.length}</span>
            </div>

            {/* Quick date presets */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
              {([['all', 'All time'], ['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']] as const).map(([v, label]) => (
                <button key={v} className={'rv-preset' + (preset === v ? ' on' : '')} onClick={() => applyPreset(v)}>{label}</button>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
              <select value={ratingFilter} onChange={e => setRatingFilter(Number(e.target.value))} className="rv-input" style={{ minWidth: 130 }}>
                <option value={0}>All ratings</option>
                {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} star{n === 1 ? '' : 's'}</option>)}
              </select>
              <select value={repliesFilter} onChange={e => setRepliesFilter(e.target.value as any)} className="rv-input" style={{ minWidth: 130 }}>
                <option value="all">All replies</option>
                <option value="replied">Replied</option>
                <option value="unreplied">Not replied</option>
              </select>
              <input type="date" value={dateFrom} onChange={e => { setDateFrom(e.target.value); setPreset('custom') }} title="From date" aria-label="From date" className="rv-input" />
              <span style={{ color: 'var(--slate)' }}>→</span>
              <input type="date" value={dateTo} onChange={e => { setDateTo(e.target.value); setPreset('custom') }} title="To date" aria-label="To date" className="rv-input" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search reviews…" className="rv-input" style={{ flex: 1, minWidth: 180 }} />
            </div>
          </div>

          {/* Review list */}
          {pageItems.length === 0 ? (
            <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: 40, textAlign: 'center', color: 'var(--slate)' }}>
              {reviews.length === 0 ? 'No reviews synced yet. Connect Google and hit “Sync Google reviews”.' : 'No reviews match these filters.'}
            </div>
          ) : pageItems.map(review => {
            const linked = !!review.contact_id
            return (
            <div key={review.id} style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '18px 20px', marginBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  {review.reviewer_photo
                    ? <img src={review.reviewer_photo} alt={review.reviewer_name} referrerPolicy="no-referrer" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover' }} />
                    : <span style={{ width: 42, height: 42, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 17 }}>{(review.reviewer_name || '?').charAt(0).toUpperCase()}</span>}
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 800, fontSize: 15 }}>{review.reviewer_name || 'Anonymous'}</p>
                    {linked
                      ? <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--coral)', fontStyle: 'italic' }}>Linked with {review.contact_name}</p>
                      : <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--slate)' }}>Not matched to a customer</p>}
                  </div>
                  <button className="rv-chip" onClick={() => openLink(review)} title="Match this review to a customer">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
                    {linked ? 'Update link' : 'Link'}
                  </button>
                </div>
                {reviewLink
                  ? <a href={reviewLink} target="_blank" rel="noopener noreferrer" title="Open on Google" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, textDecoration: 'none', color: 'var(--slate)', fontSize: 12, fontWeight: 700 }}>
                      <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: 18, height: 18 }} />
                    </a>
                  : <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: 18, height: 18 }} />}
              </div>

              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16, background: 'var(--canvas)', borderRadius: 12, padding: '14px 16px' }}>
                <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.6, color: 'var(--ink)', flex: 1 }}>{review.comment || <span style={{ color: 'var(--slate)', fontStyle: 'italic' }}>No written comment</span>}</p>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <Stars n={review.star_rating} />
                  <p style={{ margin: '6px 0 0', fontSize: 11.5, color: 'var(--slate)', fontStyle: 'italic' }}>{review.review_created_at ? new Date(review.review_created_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</p>
                </div>
              </div>

              {review.reply_comment ? (
                <div style={{ marginTop: 12, padding: '12px 15px', background: 'var(--peach)', borderRadius: 12, borderLeft: '3px solid var(--coral)' }}>
                  <p style={{ margin: '0 0 3px', fontSize: 11, fontWeight: 800, color: 'var(--coral)' }}>Your reply</p>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)' }}>{review.reply_comment}</p>
                </div>
              ) : replyingTo === review.id ? (
                <div style={{ marginTop: 12 }}>
                  <textarea value={replyText} onChange={e => setReplyText(e.target.value)} rows={3}
                    placeholder="Write your reply…"
                    style={{ width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--border)', fontSize: 13.5, resize: 'vertical', boxSizing: 'border-box', outline: 'none' }} />
                  <div style={{ display: 'flex', gap: 8, marginTop: 10, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setReplyingTo(null); setReplyText('') }} className="rv-btn rv-btn-ghost">Cancel</button>
                    <button onClick={() => postReply(review)} disabled={posting || !replyText.trim()} className="rv-btn rv-btn-primary">{posting ? 'Posting…' : 'Post reply'}</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 12, flexWrap: 'wrap' }}>
                  <button onClick={() => draftReply(review)} disabled={drafting === review.id} className="rv-btn rv-btn-ai">
                    <span>✨</span> {drafting === review.id ? 'Drafting…' : 'Generate AI Reply'}
                  </button>
                  <button onClick={() => { setReplyingTo(review.id); setReplyText('') }} className="rv-btn rv-btn-ghost">
                    Compose Reply
                  </button>
                </div>
              )}
            </div>
          )})}

          {/* Pagination */}
          {filtered.length > pageSize && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', marginTop: 18 }}>
              <button className="rv-page" disabled={pageClamped <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>‹</button>
              {pageList.map((n, i) => n === '…'
                ? <span key={`e${i}`} style={{ color: 'var(--slate)', padding: '0 4px' }}>…</span>
                : <button key={n} className={'rv-page' + (n === pageClamped ? ' on' : '')} onClick={() => setPage(n)}>{n}</button>)}
              <button className="rv-page" disabled={pageClamped >= totalPages} onClick={() => setPage(p => Math.min(totalPages, p + 1))}>›</button>
              <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))} className="rv-input" style={{ marginLeft: 6 }}>
                {[10, 25, 50, 100].map(s => <option key={s} value={s}>{s} / page</option>)}
              </select>
            </div>
          )}
        </div>

        {/* Right rail — Google summary */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: 16, padding: '20px', position: 'sticky', top: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
            <img src="https://www.google.com/favicon.ico" alt="Google" style={{ width: 28, height: 28 }} />
            <span style={{ fontWeight: 800, fontSize: 16 }}>Google Reviews</span>
          </div>
          <Stars n={Math.round(avg)} size={22} />
          {reviews.length > 0 ? (
            <>
              {companyName && <p style={{ margin: '12px 0 4px', fontWeight: 800, fontSize: 15 }}>{companyName}</p>}
              <p style={{ margin: '0 0 8px', fontSize: 13.5, fontWeight: 800, color: '#16a34a' }}>
                {avg.toFixed(1)} Star &nbsp;|&nbsp; {reviews.length} Reviews
              </p>
              <p style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
                Your business has received <strong>{reviews.length}</strong> reviews and on average a <strong>{avg.toFixed(1)} star</strong> rating for the services.
              </p>
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 13, color: 'var(--slate)' }}>Replied</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#16a34a' }}>{repliedCount}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '6px 0' }}>
                  <span style={{ fontSize: 13, color: 'var(--slate)' }}>Yet to reply</span>
                  <span style={{ fontSize: 15, fontWeight: 800, color: pendingCount ? '#dc2626' : 'var(--ink)' }}>{pendingCount}</span>
                </div>
              </div>
            </>
          ) : (
            <p style={{ margin: '10px 0 0', fontSize: 13, color: 'var(--slate)', lineHeight: 1.5 }}>
              Connect Google and sync to see your ratings here.
            </p>
          )}
          <a href="/admin/integrations/google-reviews"
            style={{ display: 'block', textAlign: 'center', marginTop: 16, padding: '11px', borderRadius: 12, border: '1px solid var(--border)', textDecoration: 'none', color: 'var(--ink)', fontWeight: 700, fontSize: 13 }}>
            Manage Connected Accounts
          </a>

          {/* Google review link — powers the Google mark on each review card and
              is the link customers tap in a review request. */}
          <div style={{ marginTop: 16, borderTop: '1px solid var(--border)', paddingTop: 14 }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, fontWeight: 800, color: 'var(--slate)', textTransform: 'uppercase', letterSpacing: '0.03em' }}>Google review link</p>
            <input value={reviewLink} onChange={e => { setReviewLink(e.target.value); setLinkSaved(false) }}
              placeholder="https://g.page/r/…" className="rv-input" style={{ width: '100%', boxSizing: 'border-box' }} />
            <button onClick={saveReviewLink} disabled={savingLink} className="rv-btn rv-btn-ghost" style={{ width: '100%', marginTop: 8 }}>
              {savingLink ? 'Saving…' : linkSaved ? 'Saved ✓' : 'Save link'}
            </button>
            <p style={{ margin: '8px 0 0', fontSize: 11.5, color: 'var(--slate)', lineHeight: 1.45 }}>
              Opens your listing from each review's Google mark. Find it in your Business Profile → “Ask for reviews”.
            </p>
          </div>
        </div>
      </div>

      {/* Link-to-customer modal */}
      {linkFor && (
        <div onClick={() => setLinkFor(null)}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100, padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 18, width: 420, maxWidth: '100%', maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.25)', overflow: 'hidden' }}>
            <div style={{ padding: '18px 20px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Match to a customer</h3>
                <span style={{ fontSize: 11.5, fontWeight: 800, padding: '4px 10px', borderRadius: 999, background: linkFor.contact_id ? 'var(--peach)' : '#f3f4f6', color: linkFor.contact_id ? 'var(--coral)' : 'var(--slate)' }}>
                  {linkFor.contact_id ? 'Matched' : 'Not matched'}
                </span>
              </div>
              <p style={{ margin: '6px 0 0', fontSize: 12.5, color: 'var(--slate)' }}>
                Review by <strong>{linkFor.reviewer_name}</strong>
                {linkFor.match_checked_at ? ` · last checked ${new Date(linkFor.match_checked_at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : ''}
              </p>
            </div>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border)' }}>
              <input autoFocus value={contactSearch} onChange={e => setContactSearch(e.target.value)} placeholder="Search customers…" className="rv-input" style={{ width: '100%', boxSizing: 'border-box' }} />
            </div>
            <div style={{ overflowY: 'auto', padding: 8, flex: 1 }}>
              {linkFor.contact_id && (
                <button onClick={() => setLink(linkFor, null)}
                  style={{ width: '100%', textAlign: 'left', padding: '10px 12px', borderRadius: 10, border: 'none', background: 'transparent', color: '#dc2626', fontWeight: 700, fontSize: 13, cursor: 'pointer' }}>
                  ✕ Remove current link
                </button>
              )}
              {contactLoading && contactResults.length === 0 ? (
                <p style={{ padding: 16, color: 'var(--slate)', fontSize: 13 }}>Searching customers…</p>
              ) : (() => {
                const list = contactResults
                if (list.length === 0) return <p style={{ padding: 16, color: 'var(--slate)', fontSize: 13 }}>No customers found{contactSearch.trim() ? ` for “${contactSearch.trim()}”` : ''}.</p>
                return list.map(c => (
                  <button key={c.id} onClick={() => setLink(linkFor, c)}
                    style={{ width: '100%', textAlign: 'left', display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: 'none', background: linkFor.contact_id === c.id ? 'var(--peach)' : 'transparent', cursor: 'pointer' }}
                    onMouseEnter={e => { if (linkFor.contact_id !== c.id) (e.currentTarget.style.background = 'var(--canvas)') }}
                    onMouseLeave={e => { if (linkFor.contact_id !== c.id) (e.currentTarget.style.background = 'transparent') }}>
                    <span style={{ width: 30, height: 30, borderRadius: '50%', background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13, flexShrink: 0 }}>{(c.name || '?').charAt(0).toUpperCase()}</span>
                    <span style={{ minWidth: 0 }}>
                      <span style={{ display: 'block', fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name || 'Unnamed'}</span>
                      {c.email && <span style={{ display: 'block', fontSize: 11.5, color: 'var(--slate)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.email}</span>}
                    </span>
                  </button>
                ))
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
