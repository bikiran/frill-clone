import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { processJobById } from '@/lib/transcode'
import { isR2PublicUrl } from '@/lib/r2'

// FFmpeg needs the Node runtime and time to work (the after() hook runs it).
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const MIN_CLIP_SECONDS = 0.5

/**
 * POST /api/media/trim { companyId, itemId, start, end } → { ok, item }
 *
 * Saves a trimmed COPY of a gallery video (the original is kept). The copy is
 * an ordinary video row queued for the transcode pipeline with trim_start /
 * trim_end, so it comes out as the same instant-start MP4 (+ poster, HLS) as
 * any upload. Until it's ready, its `url` is the source with a media fragment
 * (#t=start,end), so anything that plays it early still shows just the clip.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, itemId, start, end } = await req.json().catch(() => ({}))
    if (!companyId || !itemId) return NextResponse.json({ error: 'Missing companyId or itemId' }, { status: 400 })
    const db = admin()
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const s = Number(start), e = Number(end)
    if (!Number.isFinite(s) || !Number.isFinite(e) || s < 0 || e - s < MIN_CLIP_SECONDS) {
      return NextResponse.json({ error: `Choose a part at least ${MIN_CLIP_SECONDS} seconds long.` }, { status: 400 })
    }

    const { data: item } = await db.from('media_items').select('*').eq('id', itemId).eq('company_id', companyId).maybeSingle()
    if (!item) return NextResponse.json({ error: 'Video not found' }, { status: 404 })
    if (item.kind !== 'video') return NextResponse.json({ error: 'Only videos can be trimmed' }, { status: 400 })

    // Trim from the original upload (best quality), never from a foreign host.
    // A copy of a copy trims from the same source, offset by the earlier trim.
    const offset = Number(item.trim_start) > 0 && item.trimmed_from ? Number(item.trim_start) : 0
    const source = [item.source_url, item.url?.split('#')[0]].find((u: any) => isR2PublicUrl(u))
    if (!source) return NextResponse.json({ error: 'This video can’t be trimmed (its original isn’t in Colvy storage).' }, { status: 400 })
    const from = +(offset + s).toFixed(3), to = +(offset + e).toFixed(3)

    const base = String(item.title || 'Video').replace(/\s*\(trimmed\)$/i, '')
    const { data: copy, error } = await db.from('media_items').insert({
      company_id: companyId,
      folder_id: item.folder_id ?? null,
      title: `${base} (trimmed)`,
      kind: 'video',
      sku: item.sku ?? null,
      url: `${source}#t=${from},${to}`,
      source_url: source,
      thumbnail_url: item.thumbnail_url ?? null,
      processing_status: 'pending',
      trim_start: from,
      trim_end: to,
      trimmed_from: item.trimmed_from || item.id,
    }).select().maybeSingle()
    if (error || !copy) return NextResponse.json({ error: error?.message || 'Could not save the trimmed video' }, { status: 500 })

    after(async () => { try { await processJobById(db, copy.id) } catch {} })
    return NextResponse.json({ ok: true, item: copy })
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || 'Failed' }, { status: 500 })
  }
}
