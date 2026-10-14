// Automatic upload-link reply for picture-message videos (and optionally photos).
//
// Carriers squeeze MMS media to about 1 MB, so a customer's video of a sick fish
// arrives as a blurry 176×320 clip. When the business switches this on
// (Settings → Automatic replies), Colvy answers such a text once with a private
// upload link, so the customer can send the original at full quality and it
// lands in the same conversation.
//
// Stored in companies.inbox_settings.media_upload_reply. Off unless switched on.
// At most once per conversation every few hours, and never when an upload link
// went out recently anyway (sent by hand, by the phone agent, or by the
// failed-media reply).

import { after } from 'next/server'
import { internalHeaders } from '@/lib/internal-call'

import { mediaUploadReplySettings, wantsUploadReply, MEDIA_UPLOAD_REPLY_HOURS } from '@/lib/media-upload-reply-settings'
export * from '@/lib/media-upload-reply-settings'

/**
 * Send the upload link if the business wants it and it hasn't gone out lately.
 * Returns what happened, for logs and tests. Never throws.
 */
export async function sendMediaUploadReply(p: {
  db: any; companyId: string; conversationId: string; contactId?: string | null
  media: { kind?: string }[]; origin: string
}): Promise<'sent' | 'off' | 'not_needed' | 'recent' | 'failed'> {
  try {
    const { data: co } = await p.db.from('companies').select('inbox_settings').eq('id', p.companyId).maybeSingle()
    const s = mediaUploadReplySettings(co?.inbox_settings)
    if (!s.enabled) return 'off'
    if (!wantsUploadReply(p.media, s)) return 'not_needed'

    const cutoff = new Date(Date.now() - MEDIA_UPLOAD_REPLY_HOURS * 3600_000).toISOString()
    // An upload link already went out recently (by hand, the phone agent, or
    // the failed-media reply) — don't send another.
    const { data: recent } = await p.db.from('messages').select('id')
      .eq('conversation_id', p.conversationId).eq('message_type', 'media_request')
      .gte('created_at', cutoff).limit(1)
    if (recent && recent.length) return 'recent'

    // Claim the reply on the conversation, so several clips arriving as separate
    // texts a second apart send one link, not one each. The conditional update
    // is atomic: only the first webhook gets the row back.
    const nowIso = new Date().toISOString()
    const { data: claimed, error: claimErr } = await p.db.from('conversations')
      .update({ media_upload_reply_at: nowIso })
      .eq('id', p.conversationId)
      .or(`media_upload_reply_at.is.null,media_upload_reply_at.lt."${cutoff}"`)
      .select('id')
    // Without the column (V360 not run yet) fall back to the message check above.
    if (!claimErr && !(claimed && claimed.length)) return 'recent'

    const res = await fetch(`${p.origin}/api/media-requests`, {
      method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        companyId: p.companyId, conversationId: p.conversationId, contactId: p.contactId || null,
        prompt: s.message, accept: ['image', 'video'],
        maxFiles: 10, expiryHours: null, createdBy: 'Auto-reply',
      }),
    })
    const data = await res.json().catch(() => ({}))
    return res.ok && data?.texted ? 'sent' : 'failed'
  } catch (e: any) {
    console.error('[media upload reply]', e?.message || e)
    return 'failed'
  }
}

/** Same, after the webhook has answered (the provider isn't kept waiting). */
export function queueMediaUploadReply(p: Parameters<typeof sendMediaUploadReply>[0]) {
  const work = () => sendMediaUploadReply(p)
  try { after(work) } catch { void work() }
}
