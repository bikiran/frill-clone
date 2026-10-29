'use client'

// What this customer said in public, drawn the way the platform shows it:
// an Instagram comment (under its post), a Facebook comment bubble, or a
// Google review with its stars and the owner's response. Each card opens the
// matching manager (Social Engagement, Reviews).

import Link from 'next/link'

export type EngagementComment = {
  id: string; platform: string; authorName?: string | null; authorPhoto?: string | null; message?: string | null
  attachment?: string | null; replied?: boolean; reply?: string | null; commentedAt?: string | null
  post?: { permalink?: string | null; caption?: string | null; media?: string | null; type?: string | null } | null
}
export type EngagementReview = {
  id: string; reviewerName?: string | null; reviewerPhoto?: string | null; rating?: number | null; comment?: string | null
  createdAt?: string | null; reply?: string | null; repliedAt?: string | null
}

const ms = (iso?: string | null) => { const t = iso ? Date.parse(iso) : NaN; return Number.isFinite(t) ? Date.now() - t : null }
/** Instagram / Facebook style: 3m, 5h, 2d, 3w, 40w. */
function shortAgo(iso?: string | null) {
  const d = ms(iso); if (d === null) return ''
  const m = Math.max(1, Math.round(d / 60000))
  if (m < 60) return `${m}m`
  const h = Math.round(m / 60); if (h < 24) return `${h}h`
  const days = Math.round(h / 24); if (days < 7) return `${days}d`
  return `${Math.round(days / 7)}w`
}
/** Google style: "2 days ago", "3 weeks ago", "a month ago". */
function longAgo(iso?: string | null) {
  const d = ms(iso); if (d === null) return ''
  const days = Math.floor(d / 86400000)
  if (days < 1) return 'today'
  if (days < 7) return days === 1 ? 'a day ago' : `${days} days ago`
  const w = Math.floor(days / 7); if (days < 30) return w === 1 ? 'a week ago' : `${w} weeks ago`
  const mo = Math.floor(days / 30); if (days < 365) return mo === 1 ? 'a month ago' : `${mo} months ago`
  const y = Math.floor(days / 365); return y === 1 ? 'a year ago' : `${y} years ago`
}
const initial = (s?: string | null) => (s || '?').trim().charAt(0).toUpperCase() || '?'
// Google's letter avatars come in a handful of colours, picked by name.
const G_COLORS = ['#1a73e8', '#e8710a', '#188038', '#d93025', '#9334e6', '#12a4af', '#c5221f', '#5f6368']
const gColor = (s?: string | null) => G_COLORS[[...(s || '?')].reduce((n, c) => n + c.charCodeAt(0), 0) % G_COLORS.length]

function Avatar({ name, photo, size, ring, color }: { name?: string | null; photo?: string | null; size: number; ring?: boolean; color?: string }) {
  const inner = photo
    ? <img src={photo} alt="" referrerPolicy="no-referrer" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%', display: 'block' }} />
    : <span className="egc-av-l" style={{ background: color || '#a1a1aa', fontSize: Math.round(size * 0.42) }}>{initial(name)}</span>
  return <span className={`egc-av${ring ? ' ig' : ''}`} style={{ width: size, height: size }}>{inner}</span>
}

const IgGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><defs><linearGradient id="egc-ig" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stopColor="#feda75" /><stop offset=".35" stopColor="#fa7e1e" /><stop offset=".6" stopColor="#d62976" /><stop offset=".85" stopColor="#962fbf" /><stop offset="1" stopColor="#4f5bd5" /></linearGradient></defs><rect x="2" y="2" width="20" height="20" rx="6" fill="url(#egc-ig)" /><circle cx="12" cy="12" r="4.4" fill="none" stroke="#fff" strokeWidth="1.9" /><circle cx="17.3" cy="6.7" r="1.25" fill="#fff" /></svg>
)
const FbGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden><circle cx="12" cy="12" r="11" fill="#1877f2" /><path d="M13.4 19.5v-6.1h2.1l.3-2.4h-2.4V9.5c0-.7.2-1.2 1.2-1.2h1.3V6.2c-.2 0-1-.1-1.9-.1-1.9 0-3.2 1.2-3.2 3.3V11H8.7v2.4h2.1v6.1h2.6z" fill="#fff" /></svg>
)
const GGlyph = () => (
  <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 13 4 4 13 4 24s9 20 20 20 20-9 20-20c0-1.3-.1-2.4-.4-3.5z" /><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.5 39.6 16.2 44 24 44z" /><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" /></svg>
)

function Head({ glyph, label, more, href }: { glyph: React.ReactNode; label: string; more?: string; href: string }) {
  return (
    <Link href={href} className="egc-head" title="Open in Colvy">
      {glyph}
      <span>{label}</span>
      {more && <small>{more}</small>}
      <svg className="egc-go" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17 17 7M8 7h9v9" /></svg>
    </Link>
  )
}

export function InstagramComment({ c, count, business }: { c: EngagementComment; count: number; business: string }) {
  const href = `/admin/social?comment=${encodeURIComponent(c.id)}`
  return (
    <div className="egc ig">
      <Head glyph={<IgGlyph />} label="Instagram" more={count > 1 ? `${count} comments` : 'Comment'} href={href} />
      {c.post && (c.post.media || c.post.caption) && (
        <a className="egc-post" href={c.post.permalink || href} target={c.post.permalink ? '_blank' : undefined} rel="noopener noreferrer" title="Open the post">
          {c.post.media ? <img src={c.post.media} alt="" referrerPolicy="no-referrer" /> : <span className="egc-post-ph" aria-hidden><IgGlyph /></span>}
          <span><b>{business}</b> {c.post.caption || (c.post.type === 'reel' ? 'Reel' : 'Post')}</span>
        </a>
      )}
      <Link href={href} className="egc-ig-row">
        <Avatar name={c.authorName} photo={c.authorPhoto} size={32} ring />
        <span className="egc-ig-body">
          <span className="egc-ig-text"><b>{c.authorName || 'Instagram user'}</b> {c.message || <i>Sent a photo</i>}</span>
          <span className="egc-ig-meta">{shortAgo(c.commentedAt)}<span>Reply</span></span>
        </span>
        <svg className="egc-heart" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 0 0-7.8 7.8l1 1.1L12 21.2l7.8-7.8 1-1.1a5.5 5.5 0 0 0 0-7.7z" /></svg>
      </Link>
      {c.reply && (
        <div className="egc-ig-row reply">
          <Avatar name={business} size={24} color="var(--coral)" />
          <span className="egc-ig-body"><span className="egc-ig-text"><b>{business}</b> {c.reply}</span></span>
        </div>
      )}
    </div>
  )
}

export function FacebookComment({ c, count, business }: { c: EngagementComment; count: number; business: string }) {
  const href = `/admin/social?comment=${encodeURIComponent(c.id)}`
  return (
    <div className="egc fb">
      <Head glyph={<FbGlyph />} label="Facebook" more={count > 1 ? `${count} comments` : 'Comment'} href={href} />
      {c.post && (c.post.media || c.post.caption) && (
        <a className="egc-post" href={c.post.permalink || href} target={c.post.permalink ? '_blank' : undefined} rel="noopener noreferrer" title="Open the post">
          {c.post.media ? <img src={c.post.media} alt="" referrerPolicy="no-referrer" /> : <span className="egc-post-ph" aria-hidden><FbGlyph /></span>}
          <span>{c.post.caption || 'Your post'}</span>
        </a>
      )}
      <Link href={href} className="egc-fb-row">
        <Avatar name={c.authorName} photo={c.authorPhoto} size={32} color="#1877f2" />
        <span className="egc-fb-col">
          <span className="egc-fb-bubble"><b>{c.authorName || 'Facebook user'}</b><span>{c.message || <i>Sent a photo</i>}</span></span>
          <span className="egc-fb-meta"><span>Like</span><span>Reply</span><span className="t">{shortAgo(c.commentedAt)}</span></span>
        </span>
      </Link>
      {c.reply && (
        <div className="egc-fb-row reply">
          <Avatar name={business} size={24} color="var(--coral)" />
          <span className="egc-fb-col"><span className="egc-fb-bubble"><b>{business}</b><span>{c.reply}</span></span></span>
        </div>
      )}
    </div>
  )
}

export function GoogleReview({ r, count, avg }: { r: EngagementReview; count: number; avg: number | null }) {
  const stars = Math.max(0, Math.min(5, Math.round(r.rating || 0)))
  return (
    <Link href="/admin/reviews" className="egc gg">
      <span className="egc-head as-row">
        <GGlyph />
        <span>Google</span>
        <small>{count > 1 ? `${count} reviews${avg ? ` · ${avg}★` : ''}` : 'Review'}</small>
        <svg className="egc-go" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 17 17 7M8 7h9v9" /></svg>
      </span>
      <span className="egc-g-who">
        <Avatar name={r.reviewerName} photo={r.reviewerPhoto} size={34} color={gColor(r.reviewerName)} />
        <b>{r.reviewerName || 'A Google user'}</b>
      </span>
      <span className="egc-g-stars" aria-label={`${stars} out of 5 stars`}>
        <span className="on">{'★'.repeat(stars)}</span><span className="off">{'★'.repeat(5 - stars)}</span>
        <small>{longAgo(r.createdAt)}</small>
      </span>
      {r.comment && <span className="egc-g-text">{r.comment}</span>}
      {r.reply && (
        <span className="egc-g-reply">
          <b>Response from the owner <small>{longAgo(r.repliedAt)}</small></b>
          <span>{r.reply}</span>
        </span>
      )}
    </Link>
  )
}

export const ENGAGEMENT_CSS = `
.egc{display:flex;flex-direction:column;gap:10px;padding:12px;border-radius:18px;background:var(--card,#fff);box-shadow:0 0 0 1px rgba(0,0,0,.06),0 1px 2px rgba(16,24,40,.04);text-decoration:none;color:var(--ink);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif}
.egc+.egc{margin-top:8px}
.egc a,.egc .egc-ig-row,.egc .egc-fb-row{text-decoration:none;color:inherit}
.egc-head{display:flex;align-items:center;gap:7px;min-width:0;white-space:nowrap;font-size:12.5px;font-weight:650;color:var(--ink);text-decoration:none}
.egc-head svg{flex-shrink:0}
.egc-head small{min-width:0;overflow:hidden;text-overflow:ellipsis;font-size:12px;font-weight:500;color:#8e8e93}
.egc-head small::before{content:'·';margin-right:5px}
.egc-go{margin-left:auto;color:#a1a1aa;transition:transform .15s ease,color .15s ease}
.egc-head:hover .egc-go,.egc.gg:hover .egc-go{color:var(--ink);transform:translate(1px,-1px)}
.egc-av{position:relative;flex-shrink:0;display:inline-flex;border-radius:50%}
.egc-av.ig{padding:2.5px;background:linear-gradient(45deg,#feda75,#fa7e1e 35%,#d62976 60%,#962fbf 85%,#4f5bd5)}
.egc-av.ig>*{box-shadow:0 0 0 1.5px var(--card,#fff)}
.egc-av-l{width:100%;height:100%;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;color:#fff;font-weight:600}
.egc-post{display:flex;align-items:center;gap:9px;padding:6px;border-radius:12px;background:#f7f7f8;font-size:12px;line-height:1.35;color:#52525b}
.egc-post img,.egc-post-ph{width:40px;height:40px;flex-shrink:0;border-radius:8px;object-fit:cover;background:#ececef;display:inline-flex;align-items:center;justify-content:center}
.egc-post>span:last-child{min-width:0;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.egc-post b{color:var(--ink);font-weight:650}
/* Instagram: username in bold inline with the text, then time · Reply, a heart. */
.egc-ig-row{display:flex;align-items:flex-start;gap:10px}
.egc-ig-row.reply{margin-left:42px}
.egc-ig-body{flex:1;min-width:0;display:flex;flex-direction:column;gap:4px}
.egc-ig-text{font-size:13.5px;line-height:1.4;color:var(--ink);overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:6;-webkit-box-orient:vertical;overflow:hidden}
.egc-ig-text b{font-weight:650;margin-right:2px}
.egc-ig-meta{display:flex;gap:12px;font-size:12px;font-weight:500;color:#737373}
.egc-ig-meta span{font-weight:650}
.egc-heart{flex-shrink:0;margin-top:8px;color:#a1a1aa}
/* Facebook: name and text in a grey bubble; Like · Reply · time under it. */
.egc-fb-row{display:flex;align-items:flex-start;gap:8px}
.egc-fb-row.reply{margin-left:40px}
.egc-fb-col{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.egc-fb-bubble{align-self:flex-start;max-width:100%;display:flex;flex-direction:column;gap:1px;padding:8px 12px;border-radius:18px;background:#f0f2f5;font-size:13.5px;line-height:1.35;color:#050505;overflow-wrap:anywhere}
.egc-fb-bubble b{font-size:12.5px;font-weight:650}
.egc-fb-bubble>span{display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
.egc-fb-meta{display:flex;gap:12px;padding-left:12px;font-size:12px;font-weight:650;color:#65676b}
.egc-fb-meta .t{font-weight:500}
/* Google: avatar and name, yellow stars and when, the review, the owner's response. */
.egc.gg{gap:8px}
.egc.gg:hover{box-shadow:0 0 0 1px rgba(0,0,0,.1),0 6px 16px -10px rgba(16,24,40,.3)}
.egc-g-who{display:flex;align-items:center;gap:10px}
.egc-g-who b{font-size:14px;font-weight:600;color:#202124}
.egc-g-stars{display:flex;align-items:center;gap:1px;font-size:14px;letter-spacing:1px;line-height:1}
.egc-g-stars .on{color:#fbbc04}
.egc-g-stars .off{color:#dadce0}
.egc-g-stars small{margin-left:8px;letter-spacing:0;font-size:12px;color:#70757a}
.egc-g-text{font-size:13.5px;line-height:1.45;color:#3c4043;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:5;-webkit-box-orient:vertical;overflow:hidden}
.egc-g-reply{display:flex;flex-direction:column;gap:3px;margin-top:2px;padding:2px 0 2px 12px;box-shadow:inset 2px 0 0 #dadce0}
.egc-g-reply b{display:flex;flex-wrap:wrap;column-gap:6px;font-size:12.5px;font-weight:650;color:#202124}
.egc-g-reply b small{white-space:nowrap;font-size:12px;font-weight:500;color:#70757a}
.egc-g-reply>span{font-size:13px;line-height:1.4;color:#3c4043;display:-webkit-box;-webkit-line-clamp:4;-webkit-box-orient:vertical;overflow:hidden}
[data-theme="dark"] .egc{box-shadow:0 0 0 1px rgba(255,255,255,.08)}
[data-theme="dark"] .egc-post{background:#232326;color:#a1a1aa}
[data-theme="dark"] .egc-fb-bubble{background:#3a3b3c;color:#e4e6eb}
[data-theme="dark"] .egc-fb-meta{color:#b0b3b8}
[data-theme="dark"] .egc-g-who b,[data-theme="dark"] .egc-g-reply b{color:#e8eaed}
[data-theme="dark"] .egc-g-text,[data-theme="dark"] .egc-g-reply>span{color:#bdc1c6}
[data-theme="dark"] .egc-g-stars .off{color:#3c4043}
[data-theme="dark"] .egc-g-reply{box-shadow:inset 2px 0 0 #3c4043}
`
