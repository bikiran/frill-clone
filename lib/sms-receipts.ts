// Carrier delivery receipts for ordinary texts: an inbox reply, an upload
// link, an automatic text (Twilio status callbacks, Telnyx message.sent /
// message.finalized events).
//
// Campaign texts have their own receipts (lib/campaign-receipts). Every other
// text keeps the provider's id on its thread row (messages.telnyx_message_id,
// for both providers), and its receipt used to be logged and dropped: a text
// the carrier accepted and then failed to deliver read as sent for ever. The
// receipt is now kept on the row, the way WhatsApp keeps its own
// (metadata.whatsapp, lib/whatsapp):
//
//   messages.metadata.sms = { status: 'sent' | 'delivered' | 'failed', error?, at }
//
//   status  'sent'       the carrier took it; no word yet on the handset
//           'delivered'  the carrier says it reached the phone
//           'failed'     it was accepted and then not delivered
//   error   only with 'failed': what the provider said (up to 300 characters)
//   at      when Colvy recorded that receipt (ISO time)
//
// A row with no metadata.sms has had no receipt (yet). Nothing is sent, re-sent
// or retried from here: this only records what the carrier reported.

import type { SupabaseClient } from '@supabase/supabase-js'
import { companyForInboundNumber } from '@/lib/inbound-company'

export type SmsReceiptStatus = 'sent' | 'delivered' | 'failed'

// How far back a receipt looks for its text. Receipts arrive within seconds,
// and carriers stop reporting after about three days. messages has no index
// on telnyx_message_id, so the lookup is kept to this company's rows from
// these days, which idx_messages_company_created (company_id, created_at)
// serves: it can't scan the table.
export const SMS_RECEIPT_WINDOW_DAYS = 3

const isStatus = (s: unknown): s is SmsReceiptStatus => s === 'sent' || s === 'delivered' || s === 'failed'

/**
 * Should a receipt replace the status already on the row? Receipts can arrive
 * out of order, so 'delivered' and 'failed' are final: a late 'sent' doesn't
 * undo them, and the first final answer stands.
 */
export function smsStatusAdvances(current: unknown, incoming: unknown): boolean {
  if (!isStatus(incoming)) return false
  if (!isStatus(current)) return true
  return current === 'sent' && incoming !== 'sent'
}

/**
 * Record a carrier receipt on the thread row of the text it's about. Returns
 * what changed, or null when nothing did: not a text with a thread row (a
 * campaign text, a sign-up code), another business's, an older row than the
 * window, a repeat, or a status that would move it backwards. Never throws.
 *
 * The business is the one that owns `ourNumber` (the number the text went out
 * from), and only that business's rows are looked at, so a receipt can't reach
 * another business's message. `allowed` lets the webhook refuse a receipt that
 * wasn't signed for that business.
 */
export async function applySmsThreadReceipt(db: SupabaseClient, p: {
  providerId: string | null | undefined
  status: SmsReceiptStatus
  error?: string | null
  ourNumber: string | null | undefined
  provider: 'twilio' | 'telnyx'
  allowed?: (companyId: string) => Promise<boolean>
}): Promise<{ messageId: string; status: SmsReceiptStatus } | null> {
  try {
    const providerId = String(p.providerId || '')
    const ourNumber = String(p.ourNumber || '')
    if (!providerId || !isStatus(p.status)) return null
    // A sender that isn't a phone number (a name, a WhatsApp address) has no owner to look up.
    if (/^whatsapp:/i.test(ourNumber) || ourNumber.replace(/\D/g, '').length < 8) return null

    // 'sent' arrives for every campaign text too, and those have no thread
    // row: one indexed read here saves them the lookups below.
    if (p.status === 'sent') {
      const { data: campaign } = await db.from('campaign_recipients').select('id').eq('provider_id', providerId).limit(1)
      if (campaign?.length) return null
    }

    const companyId = await companyForInboundNumber(db, ourNumber, p.provider)
    if (!companyId) return null
    if (p.allowed && !(await p.allowed(companyId))) return null

    const since = new Date(Date.now() - SMS_RECEIPT_WINDOW_DAYS * 86_400_000).toISOString()
    // Twice at most: if another receipt for the same text landed between the
    // read and the write, read again and decide again.
    for (let attempt = 0; attempt < 2; attempt++) {
      const { data: rows } = await db.from('messages')
        .select('id, metadata')
        .eq('company_id', companyId).gte('created_at', since)
        .eq('telnyx_message_id', providerId)
        .eq('delivery_channel', 'sms').neq('sender_type', 'visitor')
        .order('created_at', { ascending: false }).limit(1)
      const row = rows?.[0]
      if (!row?.id) return null
      // metadata is shared (tracked links, automatic-text flags): keep the rest.
      const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata) ? row.metadata : {}
      const cur = meta.sms && typeof meta.sms === 'object' ? meta.sms.status : null
      if (!smsStatusAdvances(cur, p.status)) return null
      const sms = {
        status: p.status,
        ...(p.status === 'failed' ? { error: String(p.error || 'failed').slice(0, 300) } : {}),
        at: new Date().toISOString(),
      }
      // Conditional on the status we read, so two receipts racing can't leave
      // the earlier one on top.
      let q = db.from('messages').update({ metadata: { ...meta, sms } }).eq('id', row.id).eq('company_id', companyId)
      q = isStatus(cur) ? q.eq('metadata->sms->>status', cur) : q.is('metadata->sms->>status', null)
      const { data: changed } = await q.select('id')
      if (changed?.length) return { messageId: row.id, status: p.status }
    }
    return null
  } catch (e) {
    console.error('[sms receipt] not recorded', e instanceof Error ? e.message : e)
    return null
  }
}
