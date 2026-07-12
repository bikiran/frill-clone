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
    .select('target_url, label, company_id, kind').eq('code', code).maybeSingle()

  if (!link?.target_url) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#fafafa' }}>
        <p style={{ color: '#6b7280' }}>This link is no longer available.</p>
      </div>
    )
  }

  let company: any = null
  if (link.company_id) {
    const { data } = await db.from('companies').select('name, logo_url, accent_color').eq('id', link.company_id).maybeSingle()
    company = data
  }

  const url: string = link.target_url
  const name: string = link.label || 'Attachment'
  const isImage = /\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url)
  const isVideo = /\.(mp4|mov|webm|m4v)(\?|$)/i.test(url)
  const accent = company?.accent_color || '#ff7a6b'

  return (
    <div style={{ minHeight: '100vh', background: '#fafafa', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', padding: 20, boxSizing: 'border-box' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          {company?.logo_url
            ? <img src={company.logo_url} alt="" style={{ width: 36, height: 36, borderRadius: 9, objectFit: 'cover' }} />
            : <div style={{ width: 36, height: 36, borderRadius: 9, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}>{(company?.name || 'C')[0]}</div>}
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>{company?.name || 'Colvy'}</span>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 4px 20px rgba(0,0,0,0.06)' }}>
          {isImage ? (
            <img src={url} alt={name} style={{ width: '100%', display: 'block' }} />
          ) : isVideo ? (
            <video src={url} controls playsInline style={{ width: '100%', display: 'block', background: '#000' }} />
          ) : (
            <div style={{ padding: 32, textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a', margin: '0 0 6px' }}>{name}</p>
              <p style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>Tap below to open this file.</p>
            </div>
          )}
          <div style={{ padding: 14 }}>
            <a href={url} target="_blank" rel="noopener" download={name}
              style={{ display: 'block', textAlign: 'center', padding: '12px 0', borderRadius: 10, background: accent, color: '#fff', textDecoration: 'none', fontSize: 14, fontWeight: 700 }}>
              {isImage || isVideo ? 'Download' : 'Open file'}
            </a>
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: '#9ca3af', marginTop: 16 }}>Shared securely via Colvy</p>
      </div>
    </div>
  )
}
