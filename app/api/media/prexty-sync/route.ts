import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * PREXTY MEDIA SYNC — STUB (not yet wired to the real Prexty API).
 *
 * Prexty is the customer's POS. We don't yet have its API docs, so this route
 * is a documented integration point rather than a working sync. When the Prexty
 * API details are known, implement `fetchPrextyMedia()` below to:
 *   1. Authenticate to Prexty (API key / OAuth — TBD).
 *   2. List media (and their categories/locations) from Prexty.
 *   3. Upsert into media_folders / media_items using external_source='prexty'
 *      and external_id=<prexty id>. The unique index media_items_ext_uniq makes
 *      re-syncs idempotent.
 *
 * The schema already carries external_source/external_id on both tables, and
 * media_folders has parent_id so Prexty's multi-location structure can map to
 * nested folders (one parent folder per location).
 */

async function fetchPrextyMedia(_config: any): Promise<{ folders: any[]; items: any[] }> {
  // TODO: implement once Prexty API docs are available.
  throw new Error('Prexty sync is not configured yet. Provide the Prexty API details to enable it.')
}

export async function POST(req: NextRequest) {
  try {
    const { companyId } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })

    // Not yet implemented — return a clear, honest status the UI can display.
    return NextResponse.json({
      ok: false,
      status: 'not_configured',
      message: 'Prexty sync isn\'t connected yet. Once we have the Prexty API details, this will pull your Prexty media and categories in automatically.',
    }, { status: 501 })

    // When ready, the real flow will look like:
    // const db = admin()
    // const { folders, items } = await fetchPrextyMedia(config)
    // for (const f of folders) { await db.from('media_folders').upsert({ company_id: companyId, name: f.name, external_source: 'prexty', external_id: f.id }, { onConflict: '...' }) }
    // for (const it of items) { await db.from('media_items').upsert({ company_id: companyId, url: it.url, external_source: 'prexty', external_id: it.id }, { onConflict: 'company_id,external_source,external_id' }) }
    // return NextResponse.json({ ok: true, synced: items.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
