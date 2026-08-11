import type { SupabaseClient } from '@supabase/supabase-js'

const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Ensure a connected call has a timeline card in its conversation.
//
// The card is normally posted by the browser on hang-up (CallBar.endCall). That
// write is best-effort: if the tab is closed/navigated, the SDK's disconnect
// event is missed, or the page crashes before it runs, the card is never created
// and the call — recording, transcript, AI summary and sentiment included, all
// of which live on the `calls` row — is left orphaned with nothing in the thread
// to display it.
//
// We call this from the server voice webhooks (which fire regardless of the
// browser) so a connected call ALWAYS logs. It reads everything it needs from
// the already-written `calls` row, so callers only need the row id.
//
// Idempotent: a card is keyed by metadata.call_id, so if the browser (or a
// sibling webhook) already posted one, this is a no-op. Best-effort throughout —
// never throws.
export async function ensureCallCard(db: SupabaseClient, callRowId: string): Promise<void> {
  if (!callRowId) return
  try {
    const { data: call } = await (db as any)
      .from('calls')
      .select('id, conversation_id, company_id, duration_seconds, agent_name, direction, is_voicemail')
      .eq('id', callRowId)
      .maybeSingle()
    if (!call) return

    // Only connected calls that belong to a conversation get a card — the same
    // rule the browser applies. Failed/missed attempts and dial-pad calls (no
    // conversation) live in the dialer's Recent Calls, not the thread.
    const secs = call.duration_seconds || 0
    if (!call.conversation_id || !call.company_id || call.is_voicemail || secs <= 0) return

    // Skip if a card for this call already exists (browser or a prior webhook).
    const { data: existing } = await (db as any)
      .from('messages')
      .select('id')
      .eq('conversation_id', call.conversation_id)
      .contains('metadata', { call_id: call.id })
      .limit(1)
    if (existing && existing.length) return

    await (db as any).from('messages').insert({
      conversation_id: call.conversation_id,
      company_id: call.company_id,
      sender_type: 'system',
      content: `Call — ${fmtDuration(secs)}`,
      metadata: {
        call_event: true,
        call_id: call.id,
        direction: call.direction || 'outbound',
        duration_seconds: secs,
        agent_name: call.agent_name || 'Agent',
      },
    })
  } catch {
    // Best-effort: a missing card is regrettable, a thrown webhook is worse.
  }
}
