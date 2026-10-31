import { NextRequest, NextResponse } from 'next/server'
import { callerUser, requireCompanyAccess } from '@/lib/company-access'
import { emailAdminDb } from '@/lib/email-db'
import { smsCampaignReport } from '@/lib/sms-campaign-report'
import { smsFollowUpAudience } from '@/lib/sms-people-shared'

export const dynamic = 'force-dynamic'

// POST /api/campaigns/follow-up { companyId, campaignId, kind }
// A draft SMS campaign from a sent one's report, with its message, link and
// offer copied:
//   not_clicked       everyone it went to who hasn't clicked or replied
//   clicked_no_order  everyone who clicked but hasn't ordered
// Never anyone whose text failed or who replied STOP; the send checks consent
// again. Opens in the campaign wizard to edit and send.

const KINDS = { not_clicked: 'send again to people who didn’t click', clicked_no_order: 'clicked, no order' } as const

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
  const { data: source } = await db.from('campaigns').select('*').eq('id', campaignId).eq('company_id', companyId).maybeSingle()
  if (!source) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 })
  if (source.channel === 'email') return NextResponse.json({ error: 'Use the email follow-up' }, { status: 400 })

  const { people } = await smsCampaignReport(companyId, source, db)
  const contactIds = smsFollowUpAudience(people, kind)
  if (!contactIds.length) return NextResponse.json({ error: kind === 'not_clicked' ? 'Everyone clicked or replied, or the rest can’t be texted.' : 'Nobody clicked without ordering.' }, { status: 400 })

  const user = await callerUser(req, db).catch(() => null)
  const row: Record<string, any> = {
    company_id: companyId,
    name: `${source.name || 'SMS'} · ${KINDS[kind]}`.slice(0, 200),
    channel: source.channel || 'sms', status: 'draft',
    audience_type: 'manual',
    audience_filter: { type: 'manual', contactIds },
    audience_count: contactIds.length,
    created_by: user?.email ? String(user.email).split('@')[0] : null,
    created_by_id: access.userId || null,
  }
  // The same message, link and offer, ready to edit.
  for (const k of ['message', 'attachments', 'segments', 'price_per_part', 'quiet_hours', 'send_local_time', 'rate_per_minute', 'location_id']) {
    if (source[k] !== undefined && source[k] !== null) row[k] = source[k]
  }
  let { data: created, error } = await db.from('campaigns').insert(row).select('id').maybeSingle()
  if (error && /column/i.test(error.message || '')) {
    // An older campaigns table without some of those columns: the essentials.
    const { message, attachments } = row
    const base: Record<string, any> = { company_id: row.company_id, name: row.name, channel: row.channel, status: 'draft', audience_type: 'manual', audience_filter: row.audience_filter, audience_count: row.audience_count, created_by: row.created_by, created_by_id: row.created_by_id, message, attachments }
    ;({ data: created, error } = await db.from('campaigns').insert(base).select('id').maybeSingle())
  }
  if (error || !created) return NextResponse.json({ error: `Couldn’t create the campaign${error?.message ? `: ${error.message}` : ''}` }, { status: 500 })
  return NextResponse.json({ ok: true, id: created.id, count: contactIds.length })
}
