import { createClient } from '@supabase/supabase-js'
import { toPublicUrl } from '@/lib/storage-url'
import NoteView from './NoteView'
import NoteAttachments from './NoteAttachments'
import AudioDock from '@/components/AudioDock'

export const dynamic = 'force-dynamic'
export const viewport = { width: 'device-width', initialScale: 1 }

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const isVid = (u: string) => /\.(mp4|mov|webm|m4v)(\?|$)/i.test(u)

// Public, branded view of a shared note (like /m/[code] for media). Read-only
// unless the owner allowed contributions, in which case body + checklist edits
// autosave back.
export default async function NotePublic({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const db = admin()

  let note: any = null
  try {
    const { data } = await db.from('notes')
      .select('id, company_id, title, body, checklist, attachments, cover_image, allow_public_edit, is_public, updated_at')
      .eq('public_code', code).maybeSingle()
    note = data
  } catch { /* table may not be migrated yet */ }

  if (!note || !note.is_public) {
    return (
      <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', background: '#fafafa' }}>
        <p style={{ color: '#6b7280' }}>This note is no longer available.</p>
      </div>
    )
  }

  let company: any = null
  if (note.company_id) {
    const { data } = await db.from('companies').select('name, logo_url, accent_color').eq('id', note.company_id).maybeSingle()
    company = data
  }
  const accent = company?.accent_color || '#ff7a6b'
  const cover: string | null = note.cover_image || null
  const allAtt: any[] = Array.isArray(note.attachments) ? note.attachments.filter((a: any) => a?.url) : []
  const isAudioA = (a: any) => a?.kind === 'audio' || (a?.type || '').startsWith('audio/')
  const attachments = allAtt.filter(a => !isAudioA(a))
  const audios = allAtt.filter(isAudioA)
  const checklist = Array.isArray(note.checklist) ? note.checklist : []

  return (
    <div style={{ minHeight: '100dvh', background: '#fafafa', fontFamily: '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif', padding: 20, boxSizing: 'border-box' }}>
      <style>{`
        * { box-sizing: border-box; }
        .note-body { font-size: 16px; line-height: 1.65; color: #1a1a1a; }
        .note-body h2 { font-size: 22px; font-weight: 800; margin: 18px 0 8px; }
        .note-body h3 { font-size: 18px; font-weight: 800; margin: 16px 0 6px; }
        .note-body p { margin: 0 0 10px; }
        .note-body ul, .note-body ol { margin: 0 0 10px; padding-left: 22px; }
        .note-body a { color: ${accent}; }
        .note-body img { max-width: 100%; border-radius: 10px; }
        .note-body table { border-collapse: collapse; width: 100%; margin: 10px 0; }
        .note-body td, .note-body th { border: 1px solid #e5e7eb; padding: 6px 9px; }
        .note-body blockquote { border-left: 3px solid ${accent}; margin: 10px 0; padding: 2px 14px; color: #4b5563; }
        .note-body .rte-mention { color: ${accent}; font-weight: 700; }
        .note-body .rte-voice { display: flex; align-items: center; gap: 12px; padding: 10px 14px; margin: 12px 0; border: 1px solid #e5e7eb; border-radius: 12px; background: #fbfbfd; }
        .note-body .rte-voice-lbl { display: inline-flex; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: ${accent}; white-space: nowrap; }
        .note-body .rte-voice audio { height: 36px; flex: 1; min-width: 160px; }
      `}</style>

      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        {/* Brand header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 18 }}>
          {company?.logo_url
            ? <img src={company.logo_url} alt="" style={{ width: 34, height: 34, borderRadius: 9, objectFit: 'cover' }} />
            : <div style={{ width: 34, height: 34, borderRadius: 9, background: accent, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontWeight: 800 }}>{(company?.name || 'C')[0]}</div>}
          <span style={{ fontSize: 15, fontWeight: 700, color: '#1a1a1a' }}>{company?.name || 'Colvy'}</span>
        </div>

        <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,0.06)', overflow: 'hidden' }}>
          {cover && (
            <div style={{ background: '#000', lineHeight: 0 }}>
              {isVid(cover)
                ? <video src={toPublicUrl(cover)} controls playsInline style={{ width: '100%', maxHeight: 340, objectFit: 'cover' }} />
                : <img src={toPublicUrl(cover)} alt="" style={{ width: '100%', maxHeight: 340, objectFit: 'cover', display: 'block' }} />}
            </div>
          )}
          <div style={{ padding: '26px 28px 32px' }}>
            <h1 style={{ margin: '0 0 18px', fontSize: 30, fontWeight: 800, color: '#111', lineHeight: 1.2 }}>{note.title?.trim() || 'Untitled'}</h1>

            <NoteView code={code} accent={accent} allowEdit={!!note.allow_public_edit}
              initialBody={note.body || ''} initialChecklist={checklist} />

            {audios.length > 0 && (
              <div style={{ marginTop: 26 }}>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>Voice notes</p>
                {audios.map((a: any, i: number) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', border: '1px solid #e5e7eb', borderRadius: 10, marginBottom: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a', minWidth: 100 }}>{a.name || 'Voice note'}</span>
                    <audio controls src={toPublicUrl(a.url)} data-name={a.name || 'Voice note'} style={{ height: 34, flex: 1, minWidth: 180 }} />
                    <a href={toPublicUrl(a.url)} target="_blank" rel="noopener" download={a.name || 'voice-note'} style={{ color: accent, display: 'flex', padding: 3 }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </a>
                  </div>
                ))}
              </div>
            )}

            {attachments.length > 0 && (
              <div style={{ marginTop: 26 }}>
                <p style={{ margin: '0 0 10px', fontSize: 12.5, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#6b7280' }}>Attachments</p>
                <NoteAttachments accent={accent} items={attachments.map((a: any) => ({ url: toPublicUrl(a.url), name: a.name, type: a.type, kind: a.kind }))} />
              </div>
            )}
          </div>
        </div>

        <p style={{ textAlign: 'center', fontSize: 11.5, color: '#9ca3af', marginTop: 18 }}>Shared securely via Colvy</p>
      </div>
      <AudioDock />
    </div>
  )
}
