// Colvy AI automatic replies, visible live in the inbox (server only).
//
//   thinking → the conversation shows "Colvy AI is writing…"
//   pending  → the draft sits on the conversation with a countdown; anyone
//              watching can send it now, take it to edit, or cancel it
//   (cleared) → sent, or a person took over
//
// A draft is sent exactly once: whoever clears it from the conversation first
// (the countdown, or a person pressing Send now) is the one that sends it. If
// the V328 columns aren't there yet, replies simply go out straight away.

import { deliverAutomatedMessage } from '@/lib/channel-fallback'

export const DEFAULT_SEND_DELAY_S = 3

const CLEARED = { ai_status: null, ai_draft: null, ai_draft_id: null, ai_draft_send_at: null }

// While writing, ai_draft_send_at is a deadline: if a reply was cut off
// mid-way (a timed-out server), the state expires instead of sticking forever.
export const THINKING_TTL_MS = 90_000
export const STALE_GRACE_MS = 30_000

export async function markThinking(db: any, conversationId: string) {
  try { await db.from('conversations').update({ ai_status: 'thinking', ai_draft_send_at: new Date(Date.now() + THINKING_TTL_MS).toISOString() }).eq('id', conversationId) } catch {}
}

/** Is a reply genuinely in flight here (not a leftover from a cut-off run)? */
export function replyInFlight(conv: any): boolean {
  if (conv?.ai_status !== 'thinking' && conv?.ai_status !== 'pending') return false
  const until = conv.ai_draft_send_at ? Date.parse(conv.ai_draft_send_at) : 0
  return until > Date.now() - STALE_GRACE_MS
}

/** Clear "writing…" if we stopped without queueing a draft. */
export async function clearThinking(db: any, conversationId: string) {
  try { await db.from('conversations').update(CLEARED).eq('id', conversationId).eq('ai_status', 'thinking') } catch {}
}

/** Put a draft on the conversation with a send time. Returns its id, or null if live drafts aren't available. */
export async function queueDraft(db: any, conversationId: string, text: string, delayMs: number): Promise<string | null> {
  const id = crypto.randomUUID()
  const { error } = await db.from('conversations').update({
    ai_status: 'pending', ai_draft: text, ai_draft_id: id,
    ai_draft_send_at: new Date(Date.now() + delayMs).toISOString(),
  }).eq('id', conversationId)
  return error ? null : id
}

/** Take the draft off the conversation. True only for the one caller that got it. */
export async function claimDraft(db: any, conversationId: string, draftId: string): Promise<boolean> {
  const { data, error } = await db.from('conversations').update(CLEARED)
    .eq('id', conversationId).eq('ai_draft_id', draftId).select('id')
  return !error && Array.isArray(data) && data.length === 1
}

/** Has anyone (a person, a keyword rule) answered since the customer's message? */
export async function answeredSince(db: any, conversationId: string, sinceIso: string): Promise<boolean> {
  const { data } = await db.from('messages').select('id').eq('conversation_id', conversationId)
    .eq('sender_type', 'agent').gt('created_at', sinceIso).limit(1)
  return !!data?.length
}

export const sleep = (ms: number) => new Promise(r => setTimeout(r, ms))

/**
 * Post Colvy AI's reply in the thread and, for an SMS conversation, text it to
 * the customer. Website chat customers see the thread message live.
 */
export async function sendAiReply(db: any, opts: {
  conv: any
  companyId: string
  businessName: string
  text: string
  handoff?: boolean
  meta?: Record<string, any>
}): Promise<{ ok: boolean; error?: string; channel: string }> {
  const { conv, companyId, businessName, text } = opts
  const isSms = String(conv.channel || '') === 'sms'
  let channel = 'chat'

  if (isSms) {
    let phone = conv.sms_number || null
    if (!phone && conv.contact_id) {
      const { data: c } = await db.from('contacts').select('phone').eq('id', conv.contact_id).maybeSingle()
      phone = c?.phone || null
    }
    if (!phone) return { ok: false, error: 'No phone number to text the reply to', channel: 'sms' }
    const origin = (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
    const sent = await deliverAutomatedMessage({ companyId, conversationId: conv.id, text, phone, senderName: businessName, origin, force: true, db })
    if (!sent.sent) return { ok: false, error: sent.error || 'The SMS could not be sent', channel: 'sms' }
    channel = 'sms'
  }

  await db.from('messages').insert({
    conversation_id: conv.id, company_id: companyId,
    sender_type: 'agent', sender_name: businessName,
    content: text, message_type: 'text', is_ai: true,
    delivery_channel: channel,
    metadata: { ai: true, handoff: !!opts.handoff, ...(opts.meta || {}) },
  })
  await db.from('conversations').update({
    last_message: text.slice(0, 200), last_message_at: new Date().toISOString(),
    ...(opts.handoff ? { is_unread: true } : {}),
  }).eq('id', conv.id)
  return { ok: true, channel }
}
