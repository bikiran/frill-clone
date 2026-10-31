import { NextRequest, NextResponse } from 'next/server'
import { callerUser, requireCompanyAccess } from '@/lib/company-access'
import { emailAdminDb } from '@/lib/email-db'
import { emailCampaignPeople, followUpAudience } from '@/lib/email-campaign-people'

export const dynamic = 'force-dynamic'

// POST /api/email-campaigns/follow-up { companyId, campaignId, kind }
// A draft email campaign from a sent one's report, with its email copied:
//   not_opened        everyone it was delivered to who hasn't opened it
//                     (send it again, ideally with a new subject line);
//   clicked_no_order  everyone who clicked but hasn't ordered.
// Never anyone who unsubscribed, complained or bounced, and the send itself
// checks consent again. Opens in the campaign wizard to review and send.

const KINDS = { not_opened: 'resend to people who didn’t open', clicked_no_order: 'clicked, no order' } as const

export async function POST(req: NextRequest) {
  let body: any = {}
  try { body = await req.json() } catch {}
  const companyId = String(body.companyId || '')
  const campaignId = String(body.campaignId || '')
  const kind = String(body.kind || '') as keyof typeof KINDS
  if (!companyId || !campaignId || !(kind in KINDS)) return NextResponse.json({ error: 'Missing companyId, campaignId or kind' }, { status: 400 })
  const db = emailAdminDb()
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const { data: source } = await db.from('campaigns').select('id, name, channel, status').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  if (!source) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (source.channel !== 'email') return NextResponse.json({ error: 'Not an email campaign' }, { status: 400 })

  const { people } = await emailCampaignPeople(companyId, campaignId, db)
  const contactIds = followUpAudience(people, kind)
  if (!contactIds.length) return NextResponse.json({ error: kind === 'not_opened' ? 'Everyone has opened it, or the rest can’t be emailed.' : 'Nobody clicked without ordering.' }, { status: 400 })

  const user = await callerUser(req, db).catch(() => null)
  const { data: created, error } = await db.from('campaigns').insert({
    company_id: companyId,
    name: `${source.name || 'Email'} · ${KINDS[kind]}`.slice(0, 200),
    channel: 'email', status: 'draft',
    audience_type: 'manual',
    audience_filter: { type: 'manual', contactIds },
    audience_count: contactIds.length,
    created_by: user?.email ? String(user.email).split('@')[0] : null,
    created_by_id: access.userId || null,
  }).select('id').maybeSingle()
  if (error || !created) return NextResponse.json({ error: `Couldn’t create the campaign${error?.message ? `: ${error.message}` : ''}` }, { status: 500 })

  // The same email, ready to edit (a new subject line for people who didn't open).
  const { data: design } = await db.from('email_designs').select('name, subject, preview_text, design').eq('campaign_id', campaignId).eq('company_id', companyId).maybeSingle()
  if (design) {
    await db.from('email_designs').insert({
      company_id: companyId, campaign_id: created.id, name: design.name, subject: design.subject,
      preview_text: design.preview_text, design: design.design, created_by: access.userId || null,
    }).then(() => null, () => null)
  }
  return NextResponse.json({ ok: true, id: created.id, count: contactIds.length, designCopied: !!design })
}
