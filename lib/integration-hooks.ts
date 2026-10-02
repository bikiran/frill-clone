// Builders that turn Colvy records into integration events (server only).
// Each one is best effort and never throws, so a hook can never break the
// action it's attached to.

import { emitIntegrationEvent, type EventPayload } from '@/lib/integration-events'

const clip = (s: any, n = 400) => { const t = String(s || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t }
const pretty = (s: any) => String(s || '').replace(/[_-]+/g, ' ').replace(/^./, c => c.toUpperCase())

async function contactOf(db: any, contactId?: string | null) {
  if (!contactId) return null
  try {
    const { data } = await db.from('contacts').select('name, email, phone').eq('id', contactId).maybeSingle()
    return data || null
  } catch { return null }
}

/** support_tickets row → ticket.created / ticket.status_changed */
export async function emitTicketEvent(db: any, event: 'ticket.created' | 'ticket.status_changed', t: any, extra: { oldStatus?: string | null; assignee?: string | null } = {}) {
  try {
    if (!t?.company_id) return
    let full = t
    if (!t.subject || !('ticket_number' in t)) {
      const { data } = await db.from('support_tickets').select('*').eq('id', t.id).maybeSingle()
      if (data) full = data
    }
    const c = await contactOf(db, full.contact_id)
    const num = full.ticket_number || ''
    const title = event === 'ticket.created'
      ? `New ticket ${num}: ${clip(full.subject, 180)}`
      : `Ticket ${num} is now ${pretty(full.status)}`
    const p: EventPayload = {
      title,
      summary: event === 'ticket.created' ? clip(full.description || full.message, 600) || null : clip(full.subject, 200),
      path: `/admin/tickets/${full.id}`,
      customer: { name: c?.name || full.name || null, email: c?.email || full.email || null, phone: c?.phone || null },
      fields: {
        Priority: full.priority && full.priority !== 'normal' ? pretty(full.priority) : null,
        Status: event === 'ticket.status_changed' ? pretty(full.status) : null,
        'Old status': extra.oldStatus ? pretty(extra.oldStatus) : null,
        'Assigned to': extra.assignee || null,
      },
      data: { ticket: { id: full.id, number: num, subject: full.subject, status: full.status, priority: full.priority, conversation_id: full.conversation_id || null } },
      dedupeKey: `${event}:${full.id}:${full.status}`,
    }
    emitIntegrationEvent(full.company_id, event, p, { db })
  } catch {}
}

const CHANNEL: Record<string, string> = { chat: 'Website chat', widget: 'Website chat', sms: 'SMS', email: 'Email', facebook: 'Facebook', instagram: 'Instagram', messenger: 'Facebook', whatsapp: 'WhatsApp', form: 'Contact form' }

/**
 * A customer sent a message. Their first message in the conversation is
 * conversation.created (so it carries what they wrote); later ones are
 * message.received. Call it right after the message is saved.
 */
export async function emitInboundEvent(db: any, opts: {
  companyId: string
  conversationId: string
  isNew?: boolean
  text?: string | null
  channel?: string | null
  contactId?: string | null
  name?: string | null
  email?: string | null
  phone?: string | null
  messageId?: string | null
}) {
  try {
    if (!opts.companyId || !opts.conversationId) return
    let isNew = opts.isNew
    if (isNew === undefined) {
      const { data: prior } = await db.from('messages').select('id').eq('conversation_id', opts.conversationId).eq('sender_type', 'visitor').limit(2)
      isNew = (prior?.length || 0) <= 1
    }
    if (!opts.contactId) {
      const { data: conv } = await db.from('conversations').select('contact_id').eq('id', opts.conversationId).maybeSingle()
      opts.contactId = conv?.contact_id || null
    }
    const c = await contactOf(db, opts.contactId)
    const name = c?.name || opts.name || opts.email || opts.phone || 'a customer'
    const channel = CHANNEL[String(opts.channel || '').toLowerCase()] || pretty(opts.channel) || null
    const text = clip(opts.text, 600)
    const event = isNew ? 'conversation.created' : 'message.received'
    emitIntegrationEvent(opts.companyId, event, {
      title: isNew ? `New conversation from ${name}` : `New message from ${name}`,
      summary: text ? `“${text}”` : null,
      path: `/admin/inbox?conversation=${opts.conversationId}`,
      customer: { name: c?.name || opts.name || null, email: c?.email || opts.email || null, phone: c?.phone || opts.phone || null },
      fields: { Channel: channel },
      data: { conversation: { id: opts.conversationId, channel: opts.channel || null }, message: { id: opts.messageId || null, text: opts.text || null } },
      dedupeKey: opts.messageId ? `${event}:${opts.messageId}` : isNew ? `conversation.created:${opts.conversationId}` : null,
    }, { db })
  } catch {}
}

/** calls row → call.missed / voicemail.received */
export async function emitCallEvent(db: any, event: 'call.missed' | 'voicemail.received', callId: string | null | undefined) {
  try {
    if (!callId) return
    const { data: c } = await db.from('calls').select('*').eq('id', callId).maybeSingle()
    if (!c?.company_id) return
    const ct = await contactOf(db, c.contact_id)
    const who = ct?.name || c.caller_name || c.from_number || 'Unknown number'
    emitIntegrationEvent(c.company_id, event, {
      title: event === 'call.missed' ? `Missed call from ${who}` : `New voicemail from ${who}`,
      summary: event === 'voicemail.received' && c.recording_duration ? `A ${c.recording_duration} second voicemail is waiting.` : null,
      path: c.conversation_id ? `/admin/inbox?conversation=${c.conversation_id}` : '/admin/calls',
      customer: { name: ct?.name || c.caller_name || null, email: ct?.email || null, phone: c.from_number || ct?.phone || null },
      fields: { Number: c.from_number, To: c.to_number || null },
      data: { call: { id: c.id, from: c.from_number, to: c.to_number || null, status: c.status, recording_url: event === 'voicemail.received' ? c.recording_url || null : null } },
      dedupeKey: `${event}:${c.id}`,
    }, { db })
  } catch {}
}
