import type { SupabaseClient } from '@supabase/supabase-js'

const fmtDuration = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

// Keep the inbox list preview in step with a call's latest state, so a
// conversation doesn't stay stuck on "📞 Incoming call" after the call is
// answered, missed, or goes to voicemail. Best-effort; never throws.
export async function setCallPreview(
  db: SupabaseClient,
  conversationId: string | null | undefined,
  text: string,
): Promise<void> {
  if (!conversationId) return
  try {
    await (db as any).from('conversations').update({
      last_message: text,
      last_message_at: new Date().toISOString(),
    }).eq('id', conversationId)
  } catch { /* best-effort — a stale preview beats a thrown webhook */ }
}

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
      .select('id, conversation_id, company_id, contact_id, from_number, to_number, caller_name, contact_name, duration_seconds, agent_name, direction, is_voicemail, recording_url, ai_summary, status')
      .eq('id', callRowId)
      .maybeSingle()
    if (!call) return

    // Only connected calls that belong to a conversation get a card — the same
    // rule the browser applies. Failed/missed attempts and dial-pad calls (no
    // conversation) live in the dialer's Recent Calls, not the thread.
    //
    // "Connected" can't rely on duration alone: some providers (Telnyx inbound
    // answered on a SIP/mobile leg) finalise the row with duration_seconds still
    // 0 even though the call plainly happened — it has a recording, a transcript
    // and an AI summary. Treat any of those, or a completed/answered status, as
    // proof it connected so those calls aren't silently kept out of the thread.
    const secs = call.duration_seconds || 0
    const connected = secs > 0 || !!call.recording_url || !!call.ai_summary ||
      ['completed', 'answered'].includes(String(call.status || ''))
    if (!call.company_id || call.is_voicemail || !connected) return
    // A dial-pad call to an unknown number (no contact, no thread) stays in the
    // dialer's Recent Calls — not the inbox.
    if (!call.conversation_id && !call.contact_id) return

    // Attach the call to a conversation. An OUTBOUND call to a known contact
    // (and inbound calls that weren't pre-linked) should land in the customer's
    // thread — resolve the contact's most recent thread, then by number, and
    // create one only if the contact has none. This is what brings the contact
    // to the top of the inbox when a call is MADE, just like when one comes in.
    let conversationId: string | null = call.conversation_id || null
    const num = call.direction === 'inbound' ? call.from_number : call.to_number
    if (!conversationId) {
      const digits = String(num || '').replace(/\D/g, '').slice(-9)
      if (call.contact_id) {
        const { data } = await (db as any).from('conversations').select('id').eq('company_id', call.company_id).eq('contact_id', call.contact_id).order('last_message_at', { ascending: false }).limit(1).maybeSingle()
        conversationId = data?.id || null
      }
      if (!conversationId && digits) {
        const { data } = await (db as any).from('conversations').select('id').eq('company_id', call.company_id).ilike('sms_number', `%${digits}%`).order('last_message_at', { ascending: false }).limit(1).maybeSingle()
        conversationId = data?.id || null
      }
      if (!conversationId) {
        const { data } = await (db as any).from('conversations').insert({
          company_id: call.company_id, contact_id: call.contact_id || null, channel: 'phone', status: 'open',
          sms_number: num || null, subject: call.contact_name || call.caller_name || num || 'Call',
          last_message: '', last_message_at: new Date().toISOString(),
        }).select('id').maybeSingle()
        conversationId = data?.id || null
      }
      if (conversationId) { try { await (db as any).from('calls').update({ conversation_id: conversationId }).eq('id', call.id) } catch {} }
    }
    if (!conversationId) return
    call.conversation_id = conversationId

    // Bring the thread to the top, reopen it if it was closed, and set the call
    // preview so the inbox list reflects the call (with the call glyph).
    try {
      const { data: cv } = await (db as any).from('conversations').select('status').eq('id', conversationId).maybeSingle()
      const reopen = ['closed', 'resolved'].includes(String(cv?.status || ''))
      const preview = `📞 ${call.direction === 'inbound' ? 'Call received' : 'Call made'}${secs > 0 ? ` · ${fmtDuration(secs)}` : ''}`
      await (db as any).from('conversations').update({ last_message: preview, last_message_at: new Date().toISOString(), ...(reopen ? { status: 'open' } : {}) }).eq('id', conversationId)
    } catch { /* best-effort */ }

    // Skip if a card for this call already exists (browser or a prior webhook).
    const { data: existing } = await (db as any)
      .from('messages')
      .select('id')
      .eq('conversation_id', conversationId)
      .contains('metadata', { call_id: call.id })
      .limit(1)
    if (existing && existing.length) return

    const label = call.direction === 'inbound' ? 'Call received' : 'Call made'
    await (db as any).from('messages').insert({
      conversation_id: conversationId,
      company_id: call.company_id,
      sender_type: 'system',
      content: secs > 0 ? `${label} — ${fmtDuration(secs)}` : label,
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
