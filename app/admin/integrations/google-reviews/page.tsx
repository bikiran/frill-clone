'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function GoogleReviewsPage() {
  const [companyId, setCompanyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [connected, setConnected] = useState(false)
  const [location, setLocation] = useState<any>(null)
  const [locations, setLocations] = useState<any[]>([])
  const [reviews, setReviews] = useState<any[]>([])
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState('')
  const [replyDraft, setReplyDraft] = useState<Record<string, string>>({})

  // Review dashboard: search, rating + reply filters, AI drafting.
  const [reviewSearch, setReviewSearch] = useState('')
  const [ratingFilter, setRatingFilter] = useState('')
  const [replyFilter, setReplyFilter] = useState('all')  // all | replied | not_replied
  const [aiBusy, setAiBusy] = useState('')

  const generateAiReply = async (reviewId: string) => {
    if (!companyId) return
    setAiBusy(reviewId)
    try {
      const res = await fetch('/api/google/reviews/ai-reply', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, reviewId }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setReplyDraft(p => ({ ...p, [reviewId]: d.reply }))
    } catch (e: any) { setMsg('AI reply failed: ' + e.message) }
    finally { setAiBusy('') }
  }

  const filteredReviews = reviews.filter(r => {
    if (ratingFilter && String(r.star_rating) !== ratingFilter) return false
    if (replyFilter === 'replied' && !r.reply_comment) return false
    if (replyFilter === 'not_replied' && r.reply_comment) return false
    const q = reviewSearch.trim().toLowerCase()
    if (q && !((r.comment || '').toLowerCase().includes(q) || (r.reviewer_name || '').toLowerCase().includes(q))) return false
    return true
  })

  const stats = {
    total: reviews.length,
    replied: reviews.filter(r => r.reply_comment).length,
    pending: reviews.filter(r => !r.reply_comment).length,
    average: reviews.length
      ? (reviews.reduce((s, r) => s + (r.star_rating || 0), 0) / reviews.filter(r => r.star_rating).length).toFixed(1)
      : '—',
  }

  // Auto review-request settings
  const [rr, setRr] = useState<any>({
    enabled: false, delay_hours: 24,
    channels: { chat: true, sms: false, email: false },
    message: "Hi {name}, thanks for shopping with {business}! If you have a moment, we'd really appreciate a quick Google review: {link}",
    review_link: '',
  })

  useEffect(() => {
    ;(async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }
      let cid: string | null = null
      const { data: owned } = await (supabase as any).from('companies').select('id, review_request_settings').eq('owner_id', user.id).order('created_at', { ascending: true }).limit(1)
      cid = owned?.[0]?.id || null
      if (owned?.[0]?.review_request_settings) setRr((p: any) => ({ ...p, ...owned[0].review_request_settings }))
      if (!cid) {
        const { data: tm } = await (supabase as any).from('team_members').select('company_id').eq('user_id', user.id).limit(1)
        cid = tm?.[0]?.company_id || null
        if (cid) {
          const { data: co } = await (supabase as any).from('companies').select('review_request_settings').eq('id', cid).maybeSingle()
          if (co?.review_request_settings) setRr((p: any) => ({ ...p, ...co.review_request_settings }))
        }
      }
      setCompanyId(cid)
      if (cid) await load(cid)
      setLoading(false)

      // Surface the OAuth result.
      const p = new URLSearchParams(window.location.search)
      if (p.get('google') === 'connected') setMsg('Google connected. Now choose your business location below.')
      if (p.get('google') === 'error') setMsg('Google connection failed: ' + (p.get('reason') || 'unknown'))
    })()
  }, [])

  const load = async (cid: string) => {
    try {
      const res = await fetch(`/api/google/reviews?companyId=${cid}`)
      const d = await res.json()
      setConnected(!!d.connected)
      setLocation(d.location || null)
      setReviews(d.reviews || [])
      if (d.location?.reviewLink) setRr((p: any) => ({ ...p, review_link: p.review_link || d.location.reviewLink }))
    } catch {}
  }

  const connect = () => {
    if (!companyId) return
    const returnTo = window.location.href.split('?')[0]
    window.location.href = `https://colvy.com/api/google/reviews/start?companyId=${companyId}&returnTo=${encodeURIComponent(returnTo)}`
  }

  const loadLocations = async () => {
    if (!companyId) return
    setBusy('locations'); setMsg('')
    try {
      const res = await fetch(`/api/google/reviews?companyId=${companyId}&locations=1`)
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setLocations(d.locations || [])
      if (!d.locations?.length) setMsg('No Google business locations found on this account.')
    } catch (e: any) { setMsg('Could not load locations: ' + e.message) }
    finally { setBusy('') }
  }

  const selectLocation = async (loc: any) => {
    if (!companyId) return
    setBusy('select')
    try {
      await fetch('/api/google/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'select_location', accountName: loc.accountName, locationName: loc.locationName, title: loc.title }),
      })
      setLocations([])
      await load(companyId)
      setMsg('Location selected. Click "Sync reviews" to pull them in.')
    } finally { setBusy('') }
  }

  const sync = async () => {
    if (!companyId) return
    setBusy('sync'); setMsg('')
    try {
      const res = await fetch('/api/google/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'sync' }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setMsg(`Synced ${d.total} review(s)${d.averageRating ? ` · average ${d.averageRating}★` : ''}.`)
      await load(companyId)
    } catch (e: any) { setMsg('Sync failed: ' + e.message) }
    finally { setBusy('') }
  }

  const sendReply = async (reviewId: string) => {
    if (!companyId) return
    const comment = (replyDraft[reviewId] || '').trim()
    if (!comment) return
    setBusy('reply-' + reviewId)
    try {
      const res = await fetch('/api/google/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyId, action: 'reply', reviewId, comment }),
      })
      const d = await res.json()
      if (d.error) throw new Error(d.error)
      setReplyDraft(p => ({ ...p, [reviewId]: '' }))
      await load(companyId)
    } catch (e: any) { setMsg('Reply failed: ' + e.message) }
    finally { setBusy('') }
  }

  const saveSettings = async () => {
    if (!companyId) return
    setBusy('settings')
    try {
      await (supabase as any).from('companies').update({ review_request_settings: rr }).eq('id', companyId)
      if (rr.review_link) {
        await fetch('/api/google/reviews', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId, action: 'save_review_link', reviewLink: rr.review_link }),
        })
      }
      setMsg('Review request settings saved.')
    } catch (e: any) { setMsg('Could not save: ' + e.message) }
    finally { setBusy('') }
  }

  const Stars = ({ n }: { n: number }) => (
    <span style={{ color: '#f5a623', fontSize: 13 }}>{'★'.repeat(n || 0)}<span style={{ color: '#e5e5e5' }}>{'★'.repeat(5 - (n || 0))}</span></span>
  )

  const L: any = { display: 'block', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)', marginBottom: 6 }
  const I: any = { width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 14, boxSizing: 'border-box', marginBottom: 16 }

  if (loading) return <div style={{ padding: 28 }}>Loading…</div>

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '28px 24px', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif' }}>
      <h1 style={{ fontSize: 24, fontWeight: 800, color: 'var(--ink)', margin: '0 0 4px' }}>Google Reviews</h1>
      <p style={{ fontSize: 14, color: 'var(--slate)', margin: '0 0 20px' }}>See and reply to your Google reviews, and automatically ask customers for one after their order completes.</p>

      {msg && <div style={{ padding: '10px 14px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', fontSize: 13, marginBottom: 16 }}>{msg}</div>}

      {/* Connection */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: '#fff', marginBottom: 20 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 10px' }}>Connection</p>
        {!connected ? (
          <>
            <p style={{ fontSize: 13, color: 'var(--slate)', margin: '0 0 14px' }}>Connect your Google Business Profile to pull in reviews and reply from Colvy.</p>
            <button onClick={connect} style={{ padding: '10px 18px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>Connect Google</button>
          </>
        ) : (
          <>
            <p style={{ fontSize: 13.5, color: 'var(--ink)', margin: '0 0 12px' }}>
              Connected{location?.title ? <> · <strong>{location.title}</strong></> : ' — no location selected yet'}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button onClick={loadLocations} disabled={busy === 'locations'}
                style={{ padding: '8px 14px', borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', border: '1px solid var(--coral)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                {busy === 'locations' ? 'Loading…' : (location?.title ? 'Change location' : 'Choose location')}
              </button>
              {location?.title && (
                <button onClick={sync} disabled={busy === 'sync'}
                  style={{ padding: '8px 14px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {busy === 'sync' ? 'Syncing…' : 'Sync reviews'}
                </button>
              )}
              <button onClick={connect} style={{ padding: '8px 14px', borderRadius: 9, background: 'none', color: 'var(--slate)', border: '1px solid var(--border)', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>Reconnect</button>
            </div>

            {locations.length > 0 && (
              <div style={{ marginTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {locations.map((l: any) => (
                  <button key={l.locationName} onClick={() => selectLocation(l)} disabled={busy === 'select'}
                    style={{ textAlign: 'left', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: '#fff', cursor: 'pointer' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)' }}>{l.title}</span>
                    {l.address && <span style={{ display: 'block', fontSize: 12, color: 'var(--slate)' }}>{l.address}</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {/* Auto review requests */}
      <div style={{ border: '1px solid var(--border)', borderRadius: 14, padding: 20, background: '#fff', marginBottom: 20 }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--ink)', margin: '0 0 4px' }}>Ask for a review after an order</p>
        <p style={{ fontSize: 13, color: 'var(--slate)', margin: '0 0 16px' }}>When an order is marked completed, Colvy can automatically ask the customer for a Google review.</p>

        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <input type="checkbox" checked={!!rr.enabled} onChange={e => setRr({ ...rr, enabled: e.target.checked })}
            style={{ width: 18, height: 18, accentColor: 'var(--coral)' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--ink)' }}>Automatically request a review after order completion</span>
        </label>

        {rr.enabled && (
          <>
            <label style={L}>Google review link</label>
            <input style={I} value={rr.review_link || ''} placeholder="https://g.page/r/…/review"
              onChange={e => setRr({ ...rr, review_link: e.target.value })} />

            <label style={L}>Wait before asking</label>
            <select style={I} value={rr.delay_hours} onChange={e => setRr({ ...rr, delay_hours: Number(e.target.value) })}>
              <option value={0}>Immediately</option>
              <option value={2}>2 hours</option>
              <option value={24}>1 day</option>
              <option value={72}>3 days</option>
              <option value={168}>7 days</option>
            </select>

            <label style={L}>Send via</label>
            <div style={{ display: 'flex', gap: 16, marginBottom: 16 }}>
              {(['chat', 'sms', 'email'] as const).map(ch => (
                <label key={ch} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <input type="checkbox" checked={!!rr.channels?.[ch]}
                    onChange={e => setRr({ ...rr, channels: { ...rr.channels, [ch]: e.target.checked } })}
                    style={{ width: 16, height: 16, accentColor: 'var(--coral)' }} />
                  <span style={{ fontSize: 13.5, color: 'var(--ink)', textTransform: 'capitalize' }}>{ch}</span>
                </label>
              ))}
            </div>

            <label style={L}>Message <span style={{ fontWeight: 400, color: 'var(--slate)' }}>— {'{name}'}, {'{business}'}, {'{link}'}</span></label>
            <textarea style={{ ...I, minHeight: 80, resize: 'vertical' }} value={rr.message || ''}
              onChange={e => setRr({ ...rr, message: e.target.value })} />
          </>
        )}

        <button onClick={saveSettings} disabled={busy === 'settings'}
          style={{ padding: '10px 20px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
          {busy === 'settings' ? 'Saving…' : 'Save settings'}
        </button>
      </div>

      {/* Reviews dashboard */}
      {reviews.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 280px', gap: 18, alignItems: 'start' }}>
          <div>
            {/* Filters */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
              <input value={reviewSearch} onChange={e => setReviewSearch(e.target.value)} placeholder="Search reviews…"
                style={{ flex: 1, minWidth: 180, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5 }} />
              <select value={ratingFilter} onChange={e => setRatingFilter(e.target.value)}
                style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, background: '#fff' }}>
                <option value="">All ratings</option>
                {[5, 4, 3, 2, 1].map(n => <option key={n} value={n}>{n} star{n > 1 ? 's' : ''}</option>)}
              </select>
              <select value={replyFilter} onChange={e => setReplyFilter(e.target.value)}
                style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13.5, background: '#fff' }}>
                <option value="all">All</option>
                <option value="not_replied">Yet to reply</option>
                <option value="replied">Replied</option>
              </select>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {filteredReviews.map(r => (
                <div key={r.review_id} style={{ padding: 16, borderRadius: 14, border: '1px solid var(--border)', background: '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    {r.reviewer_photo
                      ? <img src={r.reviewer_photo} alt="" style={{ width: 32, height: 32, borderRadius: 9, objectFit: 'cover' }} />
                      : <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--peach)', color: 'var(--coral)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: 13 }}>{(r.reviewer_name || '?')[0]}</div>}
                    <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>{r.reviewer_name}</span>
                    <Stars n={r.star_rating} />
                    <span style={{ fontSize: 11.5, color: 'var(--slate)', marginLeft: 'auto' }}>
                      {r.review_created_at ? new Date(r.review_created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}
                    </span>
                  </div>

                  {r.comment && (
                    <p style={{ fontSize: 13.5, color: 'var(--ink)', margin: '0 0 12px', lineHeight: 1.55, padding: 12, background: 'var(--canvas)', borderRadius: 10 }}>{r.comment}</p>
                  )}

                  {r.reply_comment ? (
                    <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--peach)', borderLeft: '3px solid var(--coral)' }}>
                      <p style={{ fontSize: 11, fontWeight: 800, color: 'var(--coral)', margin: '0 0 3px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Your reply</p>
                      <p style={{ fontSize: 13, color: 'var(--ink)', margin: 0, lineHeight: 1.5 }}>{r.reply_comment}</p>
                    </div>
                  ) : (
                    <>
                      <button type="button" onClick={() => generateAiReply(r.review_id)} disabled={aiBusy === r.review_id}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: '#8b5cf6', fontSize: 12.5, fontWeight: 700, padding: 0, marginBottom: 8 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l1.6 5.3L19 9l-5.4 1.7L12 16l-1.6-5.3L5 9l5.4-1.7z"/></svg>
                        {aiBusy === r.review_id ? 'Generating…' : 'Generate AI reply'}
                      </button>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <textarea value={replyDraft[r.review_id] || ''} placeholder="Compose reply…"
                          onChange={e => setReplyDraft(p => ({ ...p, [r.review_id]: e.target.value }))}
                          rows={2}
                          style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', fontSize: 13, resize: 'vertical', fontFamily: 'inherit' }} />
                        <button type="button" onClick={() => sendReply(r.review_id)} disabled={busy === 'reply-' + r.review_id || !(replyDraft[r.review_id] || '').trim()}
                          style={{ padding: '9px 18px', borderRadius: 9, background: 'var(--coral)', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', alignSelf: 'flex-start' }}>
                          {busy === 'reply-' + r.review_id ? '…' : 'Reply'}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              ))}
              {filteredReviews.length === 0 && (
                <p style={{ fontSize: 13.5, color: 'var(--slate)', textAlign: 'center', padding: 24 }}>No reviews match these filters.</p>
              )}
            </div>
          </div>

          {/* Stats sidebar */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 16, padding: 20, background: '#fff', position: 'sticky', top: 20 }}>
            <p style={{ margin: '0 0 6px', fontSize: 15, fontWeight: 800, color: 'var(--ink)' }}>Google Reviews</p>
            <div style={{ marginBottom: 6 }}><Stars n={Math.round(Number(stats.average) || 0)} /></div>
            <p style={{ margin: '0 0 14px', fontSize: 15, fontWeight: 700, color: 'var(--ink)' }}>{location?.title || 'Your business'}</p>

            <p style={{ margin: '0 0 14px', fontSize: 13.5, color: '#15803d', fontWeight: 700 }}>
              {stats.average} Star &nbsp;|&nbsp; {stats.total} Reviews
            </p>
            <p style={{ margin: '0 0 16px', fontSize: 12.5, color: 'var(--slate)', lineHeight: 1.6 }}>
              Your business has received <strong>{stats.total}</strong> reviews and on average a <strong>{stats.average} star</strong> rating.
            </p>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Replied</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: 'var(--ink)' }}>{stats.replied}</span>
            </div>
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>Yet to reply</span>
              <span style={{ fontSize: 13.5, fontWeight: 800, color: stats.pending > 0 ? '#dc2626' : 'var(--ink)' }}>{stats.pending}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
