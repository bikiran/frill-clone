import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET ?companyId= → categories, plus which items are in each.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    const { data: categories } = await db.from('media_categories')
      .select('*').eq('company_id', companyId).order('name', { ascending: true })

    const { data: links } = await db.from('media_item_categories')
      .select('media_item_id, category_id').eq('company_id', companyId)

    // Map item → its category ids, so the gallery can show chips.
    const byItem: Record<string, string[]> = {}
    for (const l of links || []) {
      ;(byItem[l.media_item_id] ||= []).push(l.category_id)
    }

    return NextResponse.json({ categories: categories || [], byItem })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST → create/rename/delete a category, or set an item's categories.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, action } = body
    if (!companyId || !action) return NextResponse.json({ error: 'companyId and action required' }, { status: 400 })
    const db = admin()

    if (action === 'create') {
      const name = String(body.name || '').trim()
      if (!name) return NextResponse.json({ error: 'Name required' }, { status: 400 })
      const { data, error } = await db.from('media_categories')
        .insert({ company_id: companyId, name, colour: body.colour || null })
        .select().maybeSingle()
      if (error) {
        const dupe = /duplicate|unique/i.test(error.message)
        return NextResponse.json({ error: dupe ? 'That category already exists.' : error.message }, { status: 400 })
      }
      return NextResponse.json({ ok: true, category: data })
    }

    if (action === 'rename') {
      const { id, name } = body
      if (!id || !name?.trim()) return NextResponse.json({ error: 'id and name required' }, { status: 400 })
      await db.from('media_categories').update({ name: name.trim() }).eq('id', id)
      return NextResponse.json({ ok: true })
    }

    if (action === 'delete') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      // Removing a category doesn't touch the photos — just the labelling.
      await db.from('media_item_categories').delete().eq('category_id', id)
      await db.from('media_categories').delete().eq('id', id)
      return NextResponse.json({ ok: true })
    }

    // Replace an item's categories wholesale.
    if (action === 'set_item') {
      const { itemId, categoryIds } = body
      if (!itemId) return NextResponse.json({ error: 'itemId required' }, { status: 400 })
      const ids: string[] = Array.isArray(categoryIds) ? categoryIds : []

      await db.from('media_item_categories').delete().eq('media_item_id', itemId)
      if (ids.length) {
        await db.from('media_item_categories').insert(
          ids.map(cid => ({ media_item_id: itemId, category_id: cid, company_id: companyId }))
        )
      }
      return NextResponse.json({ ok: true })
    }

    // Add a category to many items at once (bulk action in the gallery).
    if (action === 'bulk_add') {
      const { itemIds, categoryId } = body
      if (!categoryId || !Array.isArray(itemIds) || !itemIds.length) {
        return NextResponse.json({ error: 'itemIds and categoryId required' }, { status: 400 })
      }
      // Skip pairs that already exist rather than erroring on the primary key.
      const { data: existing } = await db.from('media_item_categories')
        .select('media_item_id').eq('category_id', categoryId).in('media_item_id', itemIds)
      const have = new Set((existing || []).map((e: any) => e.media_item_id))
      const rows = itemIds.filter((id: string) => !have.has(id))
        .map((id: string) => ({ media_item_id: id, category_id: categoryId, company_id: companyId }))
      if (rows.length) await db.from('media_item_categories').insert(rows)
      return NextResponse.json({ ok: true, added: rows.length })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
