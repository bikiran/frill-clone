'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export default function ReviewsPage() {
  const [reviews, setReviews] = useState<any[]>([])
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [replyingTo, setReplyingTo] = useState<string | null>(null)
  const [replyText, setReplyText] = useState('')
  const [platformFilter, setPlatformFilter] = useState('all')
  const [ratingFilter, setRatingFilter] = useState(0)

  useEffect(() => {
    const init = async () => {
      let cid: string | null = null
      if (typeof window !== 'undefined') {
        const h = window.location.hostname
        if (h.endsWith('.colvy.com') && h !== 'colvy.com') {
          const { data: co } = await (supabase as any).from('companies').select('id').eq('slug', h.replace('.colvy.com', '')).maybeSingle()
          if (co) cid = co.id
        }
      }
      if (!cid) {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          const { data: ownCo } = await (supabase as any).from('companies').select('id').eq('owner_id', session.user.id).maybeSingle()
          if (ownCo?.id) cid = ownCo.id
        }
      }
      setCompanyId(cid)
      if (cid) {
        const { data } = await (supabase as any).from('reviews').select('*').eq('company_id', cid).order('review_date', { ascending: false }).limit(100)
        setReviews(data || [])
      }
      setLoading(false)
    }
    init()
  }, [])

  const submitReply = async (id: string) => {
    if (!replyText.trim()) return
    await (supabase as any).from('reviews').update({ reply: replyText.trim(), replied_at: new Date().toISOString() }).eq('id', id)
    setReviews(rs => rs.map(r => r.id === id ? { ...r, reply: replyText.trim(), replied_at: new Date().toISOString() } : r))
    setReplyingTo(null); setReplyText('')
  }

  const Stars = ({ n }: { n: number }) => (
    <span>{Array.from({ length: 5 }, (_, i) => <span key={i} style={{ color: i < n ? '#f59e0b' : '#d1d5db', fontSize: 16 }}>★</span>)}</span>
  )

  const filtered = reviews.filter(r => (platformFilter === 'all' || r.platform === platformFilter) && (!ratingFilter || r.rating === ratingFilter))
  const avg = reviews.length ? (reviews.reduce((s, r) => s + (r.rating || 0), 0) / reviews.length).toFixed(1) : '—'
  const replied = reviews.filter(r => r.reply).length

  return (
    <div style={{ maxWidth: 1100, margin: '0 auto', padding: '28px 28px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24, flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: '0 0 4px 0', color: 'var(--ink)' }}>Review Dashboard</h1>
          <p style={{ margin: 0, fontSize: 14, color: 'var(--slate)' }}>Manage and respond to customer reviews</p>
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
          <select value={platformFilter} onChange={e => setPlatformFilter(e.target.value)}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}>
            <option value="all">All Platforms</option>
            <option value="google">Google</option>
            <option value="facebook">Facebook</option>
          </select>
          <select value={ratingFilter} onChange={e => setRatingFilter(Number(e.target.value))}
            style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid var(--border)', fontSize: 13, outline: 'none' }}>
            <option value={0}>All Ratings</option>
            {[5, 4, 3, 2, 1].map(r => <option key={r} value={r}>{r} stars</option>)}
          </select>
        </div>
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total Reviews', value: reviews.length.toLocaleString() },
          { label: 'Average Rating', value: `${avg} ★` },
          { label: 'Replied', value: replied },
          { label: 'Yet to Reply', value: reviews.length - replied, accent: true },
        ].map(s => (
          <div key={s.label} style={{ borderRadius: 12, border: '1px solid var(--border)', background: '#fff', padding: '16px 20px' }}>
            <p style={{ margin: '0 0 6px', fontSize: 12, color: '#9ca3af', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>{s.label}</p>
            <p style={{ margin: 0, fontSize: 26, fontWeight: 800, color: s.accent && Number(s.value) > 0 ? 'var(--coral)' : 'var(--ink)', fontFamily: 'Georgia, serif' }}>{s.value}</p>
          </div>
        ))}
      </div>

      {loading && <p style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>Loading reviews…</p>}

      {!loading && filtered.length === 0 && (
        <div style={{ textAlign: 'center', padding: 60, color: '#9ca3af', border: '1px dashed var(--border)', borderRadius: 14 }}>
          <p style={{ fontSize: 16, fontWeight: 600 }}>No reviews yet</p>
          <p style={{ fontSize: 13 }}>Connect your Google or Facebook account to import reviews, or sync them via the integrations page.</p>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {filtered.map(review => (
          <div key={review.id} style={{ borderRadius: 14, border: '1px solid var(--border)', background: '#fff', padding: '20px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--peach)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: 'var(--coral)', flexShrink: 0 }}>
                  {(review.reviewer_name || '?')[0].toUpperCase()}
                </div>
                <div>
                  <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--ink)' }}>{review.reviewer_name || 'Anonymous'}</p>
                  <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>{review.review_date ? new Date(review.review_date).toLocaleDateString() : 'Date unknown'}</p>
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                {review.rating && <Stars n={review.rating} />}
                <span style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, background: '#f3f4f6', color: '#6b7280', fontWeight: 600, textTransform: 'capitalize' }}>{review.platform || 'Manual'}</span>
              </div>
            </div>
            {review.review_text && <p style={{ margin: '0 0 14px', fontSize: 14, color: 'var(--ink)', lineHeight: 1.6 }}>{review.review_text}</p>}
            {review.reply && (
              <div style={{ background: 'var(--canvas)', borderRadius: 10, padding: '12px 14px', marginBottom: 12, borderLeft: '3px solid var(--coral)' }}>
                <p style={{ margin: '0 0 4px', fontSize: 11, fontWeight: 700, color: 'var(--coral)', textTransform: 'uppercase' }}>Your Reply</p>
                <p style={{ margin: 0, fontSize: 13, color: 'var(--ink)' }}>{review.reply}</p>
              </div>
            )}
            {replyingTo === review.id ? (
              <div>
                <textarea value={replyText} onChange={e => setReplyText(e.target.value)} placeholder="Write your reply…" rows={3}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', fontSize: 13, outline: 'none', resize: 'vertical', boxSizing: 'border-box', marginBottom: 8, fontFamily: 'inherit' }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" onClick={() => submitReply(review.id)}
                    style={{ padding: '8px 18px', borderRadius: 8, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                    Submit Reply
                  </button>
                  <button type="button" onClick={() => { setReplyingTo(null); setReplyText('') }}
                    style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--canvas)', border: '1px solid var(--border)', fontSize: 13, cursor: 'pointer', color: 'var(--slate)' }}>
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button type="button" onClick={() => { setReplyingTo(review.id); setReplyText(review.reply || '') }}
                style={{ fontSize: 13, color: 'var(--coral)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                {review.reply ? 'Edit Reply' : 'Write a Reply →'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
