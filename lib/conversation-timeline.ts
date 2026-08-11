import type { SupabaseClient } from '@supabase/supabase-js'

// Timeline entry for a customer reopening a closed enquiry.
//
// Inbound webhooks (SMS, email, Messenger/IG) flip a conversation back to
// `open` when the customer messages again. Call this with the conversation's
// status *before* that flip: if it was closed/resolved, we drop an "Enquiry
// opened again." event so the thread shows the reopen the same way the agent's
// own close/reopen actions do. Best-effort — never throws, so it can't break
// message ingestion.
export async function logEnquiryReopened(
  db: SupabaseClient,
  opts: { conversationId: string; companyId: string; prevStatus?: string | null },
): Promise<void> {
  const { conversationId, companyId, prevStatus } = opts
  if (!conversationId || !companyId) return
  if (!['closed', 'resolved'].includes(String(prevStatus || ''))) return
  try {
    await (db as any).from('conversation_events').insert({
      conversation_id: conversationId,
      company_id: companyId,
      event_type: 'reopened',
      actor_name: null,
      detail: 'Enquiry opened again.',
    })
  } catch {
    // A missing timeline pill is cosmetic; a thrown webhook is not.
  }
}
