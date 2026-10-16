import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { toWebMp4 } from '@/lib/transcode'
import { isR2PublicUrl, r2Configured, uploadToR2 } from '@/lib/r2'
import { isOldPhoneVideo } from '@/lib/web-video'

// ffmpeg needs the Node runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MAX_BYTES = 30 * 1024 * 1024
const BUCKET = 'chat-attachments'

/** Our copy of a stored attachment: R2 by its public URL, Supabase via the storage API (never an arbitrary host). */
async function readStored(db: any, url: string): Promise<Uint8Array | null> {
  const clean = url.split('#')[0]
  if (isR2PublicUrl(clean)) {
    const res = await fetch(clean)
    if (!res.ok) return null
    return new Uint8Array(await res.arrayBuffer())
  }
  let path = ''
  try { path = new URL(clean).pathname } catch { return null }
  const m = path.match(/^\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/)
  if (!m || m[1] !== BUCKET) return null
  const { data, error } = await db.storage.from(BUCKET).download(decodeURIComponent(m[2]))
  if (error || !data) return null
  return new Uint8Array(await data.arrayBuffer())
}

async function storeMp4(db: any, key: string, bytes: Buffer): Promise<string | null> {
  if (r2Configured()) {
    try { return await uploadToR2(`${BUCKET}/${key}`, bytes, 'video/mp4') } catch (e: any) { console.warn('[web-mp4] R2 failed, using Supabase', e?.message) }
  }
  const { error } = await db.storage.from(BUCKET).upload(key, bytes, { contentType: 'video/mp4', upsert: true })
  if (error) return null
  return db.storage.from(BUCKET).getPublicUrl(key).data.publicUrl
}

/**
 * POST /api/media/web-mp4 { messageId } → { attachments }
 *
 * Turns a message's 3GP videos (old picture messages — phones play them, web
 * browsers don't) into MP4s, saves them on the message in place of the 3GP, and
 * returns the message's updated attachments. The inbox calls this when it shows
 * one, so videos that arrived before MMS were converted on arrival get fixed
 * the first time anyone opens them.
 */
export async function POST(req: NextRequest) {
  try {
    const { messageId } = await req.json().catch(() => ({}))
    if (!messageId) return NextResponse.json({ error: 'Missing messageId' }, { status: 400 })
    const db = admin()
    const { data: msg } = await db.from('messages').select('id, conversation_id, attachments').eq('id', messageId).maybeSingle()
    if (!msg) return NextResponse.json({ error: 'Message not found' }, { status: 404 })
    const { data: conv } = await db.from('conversations').select('company_id').eq('id', msg.conversation_id).maybeSingle()
    const companyId = conv?.company_id
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const atts: any[] = Array.isArray(msg.attachments) ? msg.attachments : []
    // Converted copies, keyed by the original URL.
    const converted = new Map<string, { url: string; type: string; original_url: string }>()
    for (const a of atts) {
      if (!isOldPhoneVideo({ ...a, kind: a?.kind || 'video' }) || !a?.url || converted.has(String(a.url))) continue
      const src = await readStored(db, String(a.url))
      if (!src || src.length > MAX_BYTES) continue
      const mp4 = await toWebMp4(src, 40_000)
      if (!mp4) continue
      const base = (String(a.url).split(/[?#]/)[0].split('/').pop() || messageId).replace(/\.[^.]+$/, '')
      const url = await storeMp4(db, `${companyId}/mms/${base}.mp4`, mp4)
      if (!url) continue
      converted.set(String(a.url), { url, type: 'video/mp4', original_url: String(a.url) })
    }
    if (!converted.size) return NextResponse.json({ attachments: atts, converted: false })
    // Conversion takes a while: re-read the row and merge into what's there now,
    // so anything written meanwhile (a photo's thumbUrl, another edit) is kept.
    const { data: fresh } = await db.from('messages').select('attachments').eq('id', messageId).maybeSingle()
    const cur: any[] = Array.isArray(fresh?.attachments) ? fresh.attachments : atts
    const next = cur.map(a => {
      const c = a?.url ? converted.get(String(a.url)) : undefined
      return c ? { ...a, ...c } : a
    })
    await db.from('messages').update({ attachments: next }).eq('id', messageId)
    return NextResponse.json({ attachments: next, converted: true })
  } catch (e: any) {
    console.error('[web-mp4]', e)
    return NextResponse.json({ error: e?.message || 'Could not convert the video' }, { status: 500 })
  }
}
