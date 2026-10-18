import { NextRequest, NextResponse } from 'next/server'
import { requireCompanyAccess, requireCompanyAdmin } from '@/lib/company-access'
import { emailAdminDb, isMissingTable, normEmail } from '@/lib/email-db'
import { addDomain, checkDomain, cleanLocalPart, cleanName, removeDomain, senderFor, sharedCampaignDomain } from '@/lib/email-domains'

export const dynamic = 'force-dynamic'

// Settings → Channels → Email sending domain.
//   GET  ?companyId=  staff: the business's domains, their DNS records and
//                     who campaign email is from right now.
//   POST { companyId, action: 'add' | 'check' | 'update' | 'remove', … }
//                     owner / admin only (requireCompanyAdmin): writes go
//                     through here with the service role; the table has no
//                     browser write rights (V396).

const fail = (error: string, status: number) => NextResponse.json({ error }, { status })

async function state(db: any, companyId: string) {
  const { data: company } = await db.from('companies').select('id, name, slug, business_email').eq('id', companyId).maybeSingle()
  const { data, error } = await db.from('email_sending_domains').select('*').eq('company_id', companyId).order('created_at', { ascending: false })
  const dbReady = !(error && isMissingTable(error))
  const sender = company ? await senderFor(db, { ...company, email: company.business_email }) : null
  return { domains: data || [], dbReady, sender, sharedDomain: sharedCampaignDomain() }
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  const db = emailAdminDb()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return fail(access.unavailable ? 'Couldn’t check your access just now' : 'Not authorized', access.unavailable ? 503 : 403)
  const admin = await requireCompanyAdmin(req, db, companyId)
  return NextResponse.json({ ...(await state(db, companyId!)), canEdit: admin.ok })
}

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {}
  const companyId = String(body.companyId || '')
  const db = emailAdminDb()
  const access = await requireCompanyAdmin(req, db, companyId)
  if (!access.ok) return fail(access.notAdmin ? 'Only the owner or an admin can change the sending domain.' : 'Not authorized', 403)

  if (body.action === 'add') {
    const r = await addDomain(db, companyId, String(body.domain || ''), { userId: access.userId, fromName: body.from_name, replyTo: body.reply_to })
    if (r.ok === false) return fail(r.error, r.status)
  } else if (body.action === 'check') {
    const r = await checkDomain(db, companyId, String(body.id || ''))
    if (r.ok === false) return fail(r.error, r.status)
  } else if (body.action === 'update') {
    const patch: any = { updated_at: new Date().toISOString() }
    if ('from_name' in body) patch.from_name = cleanName(body.from_name) || null
    if ('from_local_part' in body) {
      const lp = cleanLocalPart(body.from_local_part)
      if (!lp) return fail('Use letters, numbers, dots or dashes before the @, for example hello.', 400)
      patch.from_local_part = lp
    }
    if ('reply_to' in body) {
      const rt = String(body.reply_to || '').trim()
      if (rt && !normEmail(rt)) return fail('The reply-to address doesn’t look right.', 400)
      patch.reply_to = normEmail(rt) || null
    }
    const { error } = await db.from('email_sending_domains').update(patch).eq('id', String(body.id || '')).eq('company_id', companyId)
    if (error) return fail('Couldn’t save that.', 500)
  } else if (body.action === 'remove') {
    const r = await removeDomain(db, companyId, String(body.id || ''))
    if (!r.ok) return fail(r.error || 'Couldn’t remove it.', 404)
  } else {
    return fail('Unknown action', 400)
  }
  return NextResponse.json({ ok: true, ...(await state(db, companyId)), canEdit: true })
}
