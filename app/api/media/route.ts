import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// GET: folders + items for a company (optionally filtered by folder or search).
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const folderId = req.nextUrl.searchParams.get('folderId')
    const q = req.nextUrl.searchParams.get('q')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()

    const { data: folders } = await db.from('media_folders').select('*').eq('company_id', companyId).order('sort_order', { ascending: true }).order('name', { ascending: true })

    let itemsQuery = db.from('media_items').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
    if (folderId) itemsQuery = itemsQuery.eq('folder_id', folderId)
    if (q) itemsQuery = itemsQuery.or(`title.ilike.%${q}%,sku.ilike.%${q}%,description.ilike.%${q}%`)
    const { data: items } = await itemsQuery.limit(500)

    return NextResponse.json({ folders: folders || [], items: items || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST: create a folder or an item (by url), or rename/move.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, action } = body
    if (!companyId || !action) return NextResponse.json({ error: 'Missing companyId or action' }, { status: 400 })
    const db = admin()

    if (action === 'create_folder') {
      const { data } = await db.from('media_folders').insert({ company_id: companyId, name: body.name || 'New folder', parent_id: body.parentId || null }).select().maybeSingle()
      return NextResponse.json({ ok: true, folder: data })
    }
    if (action === 'rename_folder') {
      await db.from('media_folders').update({ name: body.name }).eq('id', body.folderId).eq('company_id', companyId)
      return NextResponse.json({ ok: true })
    }
    if (action === 'delete_folder') {
      // Move items to unfiled, then delete the folder.
      await db.from('media_items').update({ folder_id: null }).eq('folder_id', body.folderId).eq('company_id', companyId)
      await db.from('media_folders').delete().eq('id', body.folderId).eq('company_id', companyId)
      return NextResponse.json({ ok: true })
    }
    if (action === 'add_item') {
      const { data } = await db.from('media_items').insert({
        company_id: companyId, folder_id: body.folderId || null, title: body.title || null,
        description: body.description || null, url: body.url, thumbnail_url: body.thumbnailUrl || body.url,
        kind: body.kind || 'image', sku: body.sku || null, tags: body.tags || null,
      }).select().maybeSingle()
      return NextResponse.json({ ok: true, item: data })
    }
    if (action === 'update_item') {
      const patch: any = {}
      for (const f of ['title', 'description', 'sku', 'folder_id']) if (body[f] !== undefined) patch[f === 'folder_id' ? 'folder_id' : f] = body[f]
      await db.from('media_items').update(patch).eq('id', body.itemId).eq('company_id', companyId)
      return NextResponse.json({ ok: true })
    }
    if (action === 'delete_item') {
      await db.from('media_items').delete().eq('id', body.itemId).eq('company_id', companyId)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
