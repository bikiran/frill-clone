import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess } from '@/lib/company-access'
import { emailAdminDb, isMissingTable } from '@/lib/email-db'
import { loadEmailBrand } from '@/lib/email-brand'
import { saveDesign } from '@/lib/email-design-store'
import { senderFor } from '@/lib/email-domains'

export const dynamic = 'force-dynamic'

// The email designer's saves (staff of the workspace; the service role
// writes, the table has no browser write rights).
//   GET    ?companyId=[&id=|&campaignId=]  the business's brand and sender,
//                             plus its saved designs (or one design: by id, or
//                             the one belonging to a campaign — null if none yet)
//   POST   { companyId, id?, campaignId?, name, subject, previewText, design }
//   DELETE { companyId, id }

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

async function gate(req: NextRequest, db: any, companyId: string | null) {
  const a = await requireCompanyAccess(req, db, companyId)
  return a.ok ? a : null
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const id = req.nextUrl.searchParams.get('id')
  const campaignId = req.nextUrl.searchParams.get('campaignId')
  const db = emailAdminDb()
  if (!(await gate(req, db, companyId))) return fail('Not authorized', 403)
  const loaded = await loadEmailBrand(db, companyId!)
  if (!loaded) return fail('Company not found', 404)
  const sender = await senderFor(db, { ...loaded.company, email: loaded.company.business_email })
  if (campaignId && !id) {
    const { data, error } = await db.from('email_designs').select('*').eq('campaign_id', campaignId).eq('company_id', companyId).order('updated_at', { ascending: false }).limit(1)
    if (error && isMissingTable(error)) return NextResponse.json({ brand: loaded.brand, sender, design: null, dbReady: false })
    return NextResponse.json({ brand: loaded.brand, sender, design: data?.[0] || null, dbReady: true })
  }
  if (id) {
    const { data, error } = await db.from('email_designs').select('*').eq('id', id).eq('company_id', companyId).maybeSingle()
    if (error) return fail(isMissingTable(error) ? 'Waiting on a database update (V396)' : 'Couldn’t load it', isMissingTable(error) ? 503 : 500)
    if (!data) return fail('Not found', 404)
    return NextResponse.json({ brand: loaded.brand, sender, design: data })
  }
  const { data, error } = await db.from('email_designs').select('id, name, subject, campaign_id, updated_at').eq('company_id', companyId).order('updated_at', { ascending: false }).limit(100)
  return NextResponse.json({ brand: loaded.brand, sender, designs: data || [], dbReady: !(error && isMissingTable(error)) })
}

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {}
  const companyId = String(body.companyId || '')
  const db = emailAdminDb()
  const access = await gate(req, db, companyId)
  if (!access) return fail('Not authorized', 403)
  const r = await saveDesign(db, companyId, { id: body.id || null, campaignId: body.campaignId || null, name: body.name, subject: body.subject, previewText: body.previewText, design: body.design, userId: access.userId })
  if (r.ok === false) return fail(r.error, r.status)
  return NextResponse.json({ ok: true, design: r.row })
}

export async function DELETE(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {}
  const companyId = String(body.companyId || '')
  const db = emailAdminDb()
  if (!(await gate(req, db, companyId))) return fail('Not authorized', 403)
  const { data: row } = await db.from('email_designs').select('id, frozen').eq('id', String(body.id || '')).eq('company_id', companyId).maybeSingle()
  if (!row) return fail('Not found', 404)
  if (row.frozen) return fail('This email belongs to a campaign that was sent, so it’s kept for the report.', 409)
  await db.from('email_designs').delete().eq('id', row.id).eq('company_id', companyId)
  return NextResponse.json({ ok: true })
}
