import { NextRequest } from 'next/server'
import { audit } from '@/lib/activity-logging'
import { cleanProduct } from '@/lib/passes/rules'
import { passDb, passAccess, passError, json } from '@/lib/passes/api'

export const dynamic = 'force-dynamic'

// One pass product (owners and admins).
//   PATCH  { companyId, ...product }   change it. Passes already sold keep
//          what they were bought with (classes, price, what they cover).
//   DELETE ?companyId   remove it; one that's been sold is taken off sale instead
type Ctx = { params: Promise<{ id: string }> }

export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = passDb()
    const body = await req.json().catch(() => ({}))
    const a = await passAccess(req, db, body.companyId, 'admin')
    if (!a.ok) return a.res
    const { data: cur } = await db.from('pass_products').select('*').eq('company_id', a.companyId).eq('id', id).maybeSingle()
    if (!cur) return json({ error: 'That pass wasn’t found.' }, 404)
    let row
    try { row = cleanProduct({ ...cur, ...body, kind: cur.kind }) } catch (e: any) { return json({ error: e.message }, 400) }
    const { data, error } = await db.from('pass_products').update({ ...row, updated_at: new Date().toISOString() }).eq('company_id', a.companyId).eq('id', id).select('*').maybeSingle()
    if (error) throw error
    await audit(req, db, a.companyId, 'pass_product_updated', `Changed ${row.name}${cur.active && !row.active ? ' (taken off sale)' : !cur.active && row.active ? ' (back on sale)' : ''}`, { product_id: id })
    return json({ product: data })
  } catch (e: any) {
    return passError(e, 'Could not save it.')
  }
}

export async function DELETE(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params
    const db = passDb()
    const a = await passAccess(req, db, req.nextUrl.searchParams.get('companyId'), 'admin')
    if (!a.ok) return a.res
    const { data: cur } = await db.from('pass_products').select('id, name').eq('company_id', a.companyId).eq('id', id).maybeSingle()
    if (!cur) return json({ error: 'That pass wasn’t found.' }, 404)
    const { count } = await db.from('customer_passes').select('id', { count: 'exact', head: true }).eq('company_id', a.companyId).eq('product_id', id)
    if (count) {
      await db.from('pass_products').update({ active: false, updated_at: new Date().toISOString() }).eq('id', id)
      await audit(req, db, a.companyId, 'pass_product_updated', `Took ${cur.name} off sale`, { product_id: id })
      return json({ ok: true, archived: true })
    }
    const { error } = await db.from('pass_products').delete().eq('company_id', a.companyId).eq('id', id)
    if (error) throw error
    await audit(req, db, a.companyId, 'pass_product_updated', `Removed ${cur.name}`, { product_id: id })
    return json({ ok: true, deleted: true })
  } catch (e: any) {
    return passError(e, 'Could not remove it.')
  }
}
