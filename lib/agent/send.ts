// Sending an agent's message to the customer — the one path, whether a person
// approved the suggestion or (later) the agent acted within its limits.
// Reuses Colvy AI's delivery (lib/ai-live-reply.sendAiReply): SMS goes out by
// text, chat appears in the widget, and the message is saved on the thread.

import { sendAiReply } from '@/lib/ai-live-reply'

export async function sendAgentMessage(db: any, opts: {
  companyId: string
  conversationId: string
  text: string
  runId: string
  approvedBy?: { id: string | null; name: string | null } | null
  edited?: boolean
}): Promise<{ ok: boolean; error?: string; channel?: string }> {
  const text = String(opts.text || '').trim().slice(0, 1600)
  if (!text) return { ok: false, error: 'Nothing to send.' }
  const [{ data: conv }, { data: co }] = await Promise.all([
    db.from('conversations').select('id, channel, sms_number, contact_id, company_id').eq('id', opts.conversationId).eq('company_id', opts.companyId).maybeSingle(),
    db.from('companies').select('name').eq('id', opts.companyId).maybeSingle(),
  ])
  if (!conv) return { ok: false, error: 'Conversation not found.' }
  if (!['sms', 'widget', 'chat'].includes(String(conv.channel || 'chat'))) {
    return { ok: false, error: `Agent replies on ${conv.channel} aren’t supported yet — reply from the inbox.` }
  }
  return sendAiReply(db, {
    conv, companyId: opts.companyId, businessName: co?.name || 'Us', text,
    meta: { agent_run_id: opts.runId, agent_name: 'Support Agent', approved_by: opts.approvedBy?.name || null, approved_by_id: opts.approvedBy?.id || null, edited: !!opts.edited },
  })
}
