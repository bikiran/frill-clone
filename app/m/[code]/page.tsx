import { createClient } from '@supabase/supabase-js'
import { toPublicUrl } from '@/lib/storage-url'

export const dynamic = 'force-dynamic'

// Ensure the page scales to the device width — without this a media page can
// render zoomed-out on some phones.
export const viewport = {
  width: 'device-width',
  initialScale: 1,
}

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// A friendly viewer for media sent over SMS. Raw storage URLs often download
// instead of displaying on mobile, and look untrustworthy in a text. This shows
// the image/video inline on a branded page.
export default async function MediaView({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const db = admin()

  // Select the base columns first. media_urls and note are newer (V199); if
  // that migration hasn't run, including them makes the WHOLE query fail and
  // every link reports "no longer available". So try the full select, and fall
  // back to the base columns if it errors.
  let link: any = null
  let lookupError: string | null = null
  {
    const full = await db.from('short_links')
      .select('target_url, label, company_id, kind, conversation_id, media_urls, note')
      .eq('code', code).maybeSingle()
    if (full.error) {
      const base = await db.from('short_links')
        .select('target_url, label, company_id, kind, conversation_id')
        .eq('code', code).maybeSingle()
      link = base.data
      lookupError = base.error?.message || full.error.message
    } else {
      link = full.data
    }
  }

  // A gallery link keeps its files in media_urls; target_url may be blank.
  if (link && !link.target_url && Array.isArray(link.media_urls) && link.media_urls[0]?.url) {
    link.target_url = link.media_urls[0].url
  }
  // Even with no target_url, if there are media items we can still show them.
  const hasMedia = link && Array.isArray(link.media_urls) && link.media_urls.length > 0

  if (!link || (!link.target_url && !hasMedia)) {
    if (lookupError) console.error('[media view] lookup error for', code, lookupError)
    else if (!link) console.warn('[media view] no row for code', code)
    else console.warn('[media view] row has no target_url or media for code', code)
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#fafafa' }}>
        <p style={{ color: '#6b7280' }}>This link is no longer available.</p>
      </div>
    )
  }
  // Give downstream code a usable target_url even for media-only links.
  if (!link.target_url && hasMedia) link.target_url = link.media_urls[0].url

  // Review links (and any plain redirect link) send the customer straight to
  // the destination — e.g. the business's Google review page.
  if (link.kind === 'review' || link.kind === 'redirect') {
    // Record the click so the agent's review card shows engagement. Best-effort.
    if (link.kind === 'review' && (link as any).conversation_id) {
      try {
        const { data: msg } = await db.from('messages')
          .select('id, metadata')
          .eq('conversation_id', (link as any).conversation_id)
          .contains('metadata', { review_request: true })
          .order('created_at', { ascending: false }).limit(1).maybeSingle()
        if (msg) {
          const meta = { ...(msg.metadata || {}), review_clicks: ((msg.metadata?.review_clicks || 0) + 1) }
          await db.from('messages').update({ metadata: meta }).eq('id', msg.id)
        }
      } catch { /* non-fatal */ }
    }
    const { redirect } = await import('next/navigation')
    redirect(link.target_url)
  }

  let company: any = null
  if (link.company_id) {
    const { data } = await db.from('companies').select('name, logo_url, accent_color').eq('id', link.company_id).maybeSingle()
    company = data
  }

  // A gallery link carries the whole set in media_urls; older single-file links
  // only have target_url. Normalise both into one list so the same view renders
  // either without special-casing.
  const rawMedia = Array.isArray((link as any).media_urls) ? (link as any).media_urls : []
  const media: { url: string; name: string; type?: string }[] = rawMedia.length
    ? rawMedia.filter((m: any) => m?.url)
    : [{ url: link.target_url, name: link.label || 'Attachment' }]

  const accent = company?.accent_color || '#ff7a6b'
  const note: string = (link as any).note || ''
  const isImg = (u: string, t?: string) =>
    (t || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(u)
  const isVid = (u: string, t?: string) =>
    (t || '').startsWith('video/') || /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)

  const multiple = media.length > 1

  return (
    <div className="mv-root" style={{ minHeight: '100dvh', background: '#fafafa', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', padding: 20, boxSizing: 'border-box' }}>
      <style>{`
        * { box-sizing: border-box; }
        .mv-inner { max-width: 640px; margin: 0 auto; }
        .mv-grid { display: grid; gap: 12px; }
        .mv-grid.multi { grid-template-columns: repeat(2, 1fr); }
        .mv-card { background: #fff; border-radius: 14px; overflow: hidden; box-shadow: 0 4px 18px rgba(0,0,0,0.06); display: flex; flex-direction: column; }
        .mv-thumb { display: block; width: 100%; background: #f3f4f6; line-height: 0; }
        .mv-grid.multi .mv-thumb { aspect-ratio: 1 / 1; }
        .mv-grid.multi .mv-thumb img, .mv-grid.multi .mv-thumb video { width: 100%; height: 100%; object-fit: cover; }
        .mv-grid.single .mv-thumb img, .mv-grid.single .mv-thumb video { width: 100%; max-height: 78vh; object-fit: contain; }
        .mv-dl {
          display: flex; align-items: center; justify-content: center; gap: 7px;
          padding: 12px 0; text-decoration: none;
          font-size: 14px; font-weight: 700; min-height: 46px;
        }
        @media (max-width: 560px) {
          .mv-root { padding: 12px; }
          .mv-grid.single .mv-thumb img, .mv-grid.single .mv-thumb video { max-height: 68vh; }
        }
      `}</style>
      <div className="mv-inner">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          {company?.logo_url
            ? <img src={company.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover' }} />
            : <div style={{ width: 36, height: 36, borderRadius: 9, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}>{(company?.name || 'C')[0]}</div>}
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>{company?.name || 'Colvy'}</span>
        </div>

        {/* The agent's message, above the media */}
        {note && (
          <div style={{ background: '#fff', borderRadius: 14, padding: '14px 16px', marginBottom: 14, boxShadow: '0 2px 10px rgba(0,0,0,0.04)' }}>
            <p style={{ margin: 0, fontSize: 14.5, lineHeight: 1.55, color: '#1a1a1a', whiteSpace: 'pre-wrap' }}>{note}</p>
          </div>
        )}

        {multiple && (
          <p style={{ fontSize: 12.5, color: '#6b7280', margin: '0 0 10px', fontWeight: 600 }}>
            {media.length} attachments
          </p>
        )}

        {/* Gallery — a tidy grid; tap an image to open it full-size, or use the
            download button. Filenames are hidden for images/videos (they're
            often long autogenerated names and add nothing). */}
        <div className={`mv-grid ${multiple ? 'multi' : 'single'}`}>
          {media.map((m, i) => {
            const image = isImg(m.url, m.type)
            const video = isVid(m.url, m.type)
            const full = toPublicUrl(m.url)
            const shortName = m.name ? (m.name.length > 26 ? m.name.slice(0, 23) + '…' : m.name) : 'File'
            return (
              <div key={i} className="mv-card">
                {image ? (
                  <a href={full} target="_blank" rel="noopener" className="mv-thumb">
                    <img src={full} alt={`Attachment ${i + 1}`} loading="lazy" />
                  </a>
                ) : video ? (
                  <div className="mv-thumb"><video src={full} controls playsInline /></div>
                ) : (
                  <div style={{ padding: 22, textAlign: 'center', flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <p style={{ fontSize: 14, fontWeight: 700, color: '#1a1a1a', margin: 0, wordBreak: 'break-word' }}>{shortName}</p>
                  </div>
                )}
                <a href={full} target="_blank" rel="noopener" download={m.name || true} className="mv-dl"
                  style={{ background: accent, color: '#fff' }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                  </svg>
                  {image || video ? 'Download' : 'Open file'}
                </a>
              </div>
            )
          })}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: '#9ca3af', marginTop: 18 }}>Shared securely via Colvy</p>
      </div>
    </div>
  )
}
