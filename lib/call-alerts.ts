// Alerts for calls the team needs to follow up: a missed call or a new
// voicemail. The in-app bell and a phone notification that opens the caller's
// conversation (notifyCompany alone only writes the bell). Shared by the
// Telnyx and Twilio call flows. Never throws.

import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import { internalHeaders } from '@/lib/internal-call'

export async function alertCall(db: any, companyId: string, conversationId: string | null | undefined, title: 'Missed call' | 'New voicemail', who: string) {
  try { await notifyCompany({ db, companyId, type: 'call', message: `${title} from ${who}`, actorName: who, conversationId: conversationId || undefined }) } catch {}
  if (conversationId) {
    try { await pushInboundMessage({ companyId, conversationId, title, body: who, route: `/conversation/${conversationId}` }) } catch {}
  }
}

// Transcribe a voicemail (and summarise it) so it can be read without playing
// it. Fire-and-forget: the recording is already saved.
export function transcribeCall(origin: string, callId: string, companyId: string, conversationId: string | null | undefined) {
  try {
    fetch(`${origin}/api/telnyx/transcribe`, {
      method: 'POST',
      headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ callId, companyId, conversationId: conversationId || null }),
    }).catch(() => {})
  } catch {}
}
