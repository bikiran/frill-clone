import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

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

  const { data: link } = await db.from('short_links')
    .select('target_url, label, company_id, kind, conversation_id, media_urls, note').eq('code', code).maybeSingle()

  if (!link?.target_url) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#fafafa' }}>
        <p style={{ color: '#6b7280' }}>This link is no longer available.</p>
      </div>
    )
  }

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
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', padding: 20, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
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

        {/* Gallery — each item shown full width with its own download */}
        <div style={{ display: 'grid', gap: 14 }}>
          {media.map((m, i) => {
            const image = isImg(m.url, m.type)
            const video = isVid(m.url, m.type)
            return (
              <div key={i} style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
                {image ? (
                  <img src={m.url} alt={m.name || `Attachment ${i + 1}`} style={{ width: '100%', display: 'block' }} />
                ) : video ? (
                  <video src={m.url} controls playsInline style={{ width: '100%', display: 'block', background: '#000' }} />
                ) : (
                  <div style={{ padding: 30, textAlign: 'center' }}>
                    <p style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', margin: '0 0 6px' }}>{m.name || 'File'}</p>
                    <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Tap below to open this file.</p>
                  </div>
                )}
                <div style={{ padding: 14 }}>
                  {multiple && m.name && (
                    <p style={{ margin: '0 0 9px', fontSize: 12.5, color: '#6b7280', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {m.name}
                    </p>
                  )}
                  <a href={m.url} target="_blank" rel="noopener" download={m.name || true}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '13px 0', borderRadius: 10, background: accent, color: '#fff', textDecoration: 'none', fontSize: 14.5, fontWeight: 700 }}>
                    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    {image || video ? 'Download' : 'Open file'}
                  </a>
                </div>
              </div>
            )
          })}
        </div>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: '#9ca3af', marginTop: 18 }}>Shared securely via Colvy</p>
      </div>
    </div>
  )
}
