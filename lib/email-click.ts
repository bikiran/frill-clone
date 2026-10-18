// A click on a tracked link in a campaign email (server only). The link
// (/l/<code>?r=<ref>) carries the recipient's signed ref (lib/email-tokens),
// so the click is credited to that customer in Link Reports and recorded in
// email_events for the campaign report. Best-effort: never delays the
// redirect by more than a couple of small queries, never throws.

import { readRecipientRef } from '@/lib/email-tokens'

export async function emailClick(db: any, link: { id: string; company_id: string; campaign_id?: string | null; target_url: string }, ref: string | null): Promise<{ contactId: string | null }> {
  const id = readRecipientRef(ref)
  if (!id || !link.campaign_id) return { contactId: null }
  try {
    const { data: rec } = await db.from('email_campaign_recipients').select('id, campaign_id, company_id, contact_id, email, clicked_at').eq('id', id).maybeSingle()
    // The ref must belong to this link's campaign and business.
    if (!rec || rec.campaign_id !== link.campaign_id || rec.company_id !== link.company_id) return { contactId: null }
    const now = new Date().toISOString()
    await db.from('email_events').insert({ company_id: rec.company_id, campaign_id: rec.campaign_id, recipient_id: rec.id, contact_id: rec.contact_id, email: rec.email, type: 'clicked', link: String(link.target_url || '').slice(0, 2000), detail: { via: 'tracked_link', link_id: link.id }, occurred_at: now })
    if (!rec.clicked_at) await db.from('email_campaign_recipients').update({ clicked_at: now }).eq('id', rec.id)
    return { contactId: rec.contact_id || null }
  } catch { return { contactId: null } }
}
