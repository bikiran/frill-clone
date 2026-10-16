// "Also send as SMS": turns an announcement into a DRAFT SMS campaign.
//
// Nothing is texted from here. The campaign builder shows the cost, who is
// left out for consent (unsubscribed, no consent, replied STOP, blocked,
// landlines) and sends inside quiet hours through lib/campaign-sender.ts,
// which checks every number with lib/sms-consent.ts before each text.
// Server-only.

import { audienceFilterOf, categoryOf, smsFrom } from '@/lib/announcements'
import { postUrl } from '@/lib/announcement-notify'

export const SMS_OPT_OUT = 'Reply STOP to unsubscribe.'

/** The SMS a post starts as: short, the link, and the opt-out line. */
export function defaultSmsText(company: any, a: any): string {
  const name = String(company?.name || '').trim()
  const lead = name ? `${name}: ` : ''
  const body = smsFrom(`${lead}${a.title || ''}`, a.description || '', postUrl(company, a.id), 300 - SMS_OPT_OUT.length - 1)
  return `${body} ${SMS_OPT_OUT}`
}

/** Make sure an SMS mentions how to stop; add the line if it doesn't. */
export function withOptOut(text: string): string {
  const t = String(text || '').trim().slice(0, 640)
  return /\bstop\b/i.test(t) ? t : `${t} ${SMS_OPT_OUT}`.trim()
}

export async function createSmsDraft(db: any, a: any, opts: { userId: string | null; userName: string | null; text?: string | null }): Promise<{ id: string } | { error: string }> {
  const { data: company } = await db.from('companies').select('id, name, slug').eq('id', a.company_id).maybeSingle()
  if (!company) return { error: 'Company not found' }
  const filter = audienceFilterOf(a)
  const outlets: string[] = Array.isArray(a.location_ids) ? a.location_ids.filter(Boolean) : []
  const message = withOptOut(opts.text?.trim() ? opts.text : defaultSmsText(company, a))
  const cat = categoryOf(a.tag).key
  const { data, error } = await db.from('campaigns').insert({
    company_id: company.id,
    name: `Announcement: ${String(a.title || '').slice(0, 80)}`,
    channel: 'sms',
    campaign_type: cat === 'sale' ? 'promotion' : cat === 'event' ? 'event' : cat === 'new' ? 'new_arrivals' : 'general_update',
    status: 'draft',
    message,
    audience_type: filter.type,
    audience_filter: filter,
    location_id: outlets.length === 1 ? outlets[0] : null,
    created_by: opts.userName,
    created_by_id: opts.userId,
  }).select('id').maybeSingle()
  if (error || !data?.id) return { error: 'Couldn’t create the SMS campaign' }
  try { await db.from('announcements').update({ sms_campaign_id: data.id }).eq('id', a.id) } catch {}
  return { id: data.id }
}
