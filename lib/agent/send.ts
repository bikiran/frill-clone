// Sending an agent's message to the customer — the one path, whether a person
// approved the suggestion or the agent acted within its limits.
//
//   SMS and website chat → Colvy AI's delivery (lib/ai-live-reply.sendAiReply):
//                          a text, or the message in the widget.
//   Email                → the conversation's mailbox (Gmail or the business's
//                          domain), threaded onto the customer's email, the same
//                          way the inbox replies (/api/email/reply).
//   Facebook / Instagram → the Page or Instagram account (/api/meta/send).
//
// Either way the message is saved on the thread, marked as the agent's.

import { sendAiReply } from '@/lib/ai-live-reply'
import { internalHeaders } from '@/lib/internal-call'

const origin = () => (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')

export async function sendAgentMessage(db: any, opts: {
  companyId: string
  conversationId: string
  text: string
  runId: string
  approvedBy?: { id: string | null; name: string | null } | null
  edited?: boolean
  agentName?: string | null
}): Promise<{ ok: boolean; error?: string; channel?: string }> {
  const raw = String(opts.text || '').trim()
  if (!raw) return { ok: false, error: 'Nothing to send.' }
  const [{ data: conv }, { data: co }] = await Promise.all([
    db.from('conversations').select('id, channel, sms_number, contact_id, company_id').eq('id', opts.conversationId).eq('company_id', opts.companyId).maybeSingle(),
    db.from('companies').select('name').eq('id', opts.companyId).maybeSingle(),
  ])
  if (!conv) return { ok: false, error: 'Conversation not found.' }
  const meta = { agent_run_id: opts.runId, agent_name: opts.agentName || 'Support Agent', approved_by: opts.approvedBy?.name || null, approved_by_id: opts.approvedBy?.id || null, edited: !!opts.edited }
  const channel = String(conv.channel || 'chat')
  const businessName = co?.name || 'Us'
  const text = raw.slice(0, channel === 'email' ? 4000 : 1600)   // an email can say a little more

  if (['sms', 'widget', 'chat'].includes(channel)) {
    return sendAiReply(db, { conv, companyId: opts.companyId, businessName, text, meta })
  }
  if (channel !== 'email' && channel !== 'facebook' && channel !== 'instagram') {
    return { ok: false, error: `Agent replies on ${channel} aren’t supported yet — reply from the inbox.` }
  }

  // Send first, then record — a reply that didn't go out never shows as sent.
  const isEmail = channel === 'email'
  let out: any = {}
  try {
    const res = await fetch(`${origin()}${isEmail ? '/api/email/reply' : '/api/meta/send'}`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ conversationId: conv.id, content: text, agentName: businessName, skipChatMessage: true }),
    })
    out = await res.json().catch(() => ({}))
    if (!res.ok || out?.error) return { ok: false, error: out?.error || `The ${isEmail ? 'email' : 'message'} couldn’t be sent.`, channel }
  } catch (e: any) {
    return { ok: false, error: e?.message || `The ${isEmail ? 'email' : 'message'} couldn’t be sent.`, channel }
  }
  await db.from('messages').insert({
    conversation_id: conv.id, company_id: opts.companyId, sender_type: 'agent', sender_name: businessName,
    content: text, is_ai: true, is_read: true, delivery_channel: channel, metadata: meta,
    ...(isEmail
      ? (out.via === 'gmail' ? { gmail_message_id: out.id || null } : { email_message_id: out.id || null })
      : { meta_message_id: out.id || null }),
  })
  await db.from('conversations').update({ last_message: text.slice(0, 200), last_message_at: new Date().toISOString() }).eq('id', conv.id)
  return { ok: true, channel }
}
