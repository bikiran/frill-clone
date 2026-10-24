import { internalHeaders } from '@/lib/internal-call'
import { staffUserIds } from '@/lib/company-access'
import { createClient } from '@supabase/supabase-js'
import { quietVerdict, HIDDEN_PREVIEW, INBOUND_NOTIFY_TYPES } from '@/lib/conversation-protection'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Resolve the user ids who should receive a company's activity notifications:
// the owner plus the staff. Never a board visitor: their bell is on the public
// board, and these carry customers' messages, orders and bookings. Nor a
// removed member. Optionally exclude one user (e.g. the actor).
async function companyRecipients(db: any, companyId: string, excludeUserId?: string): Promise<string[]> {
  const ids = await staffUserIds(db, companyId)
  if (excludeUserId) ids.delete(excludeUserId)
  return Array.from(ids)
}

/**
 * Fire an Expo push for an INBOUND customer message (chat / SMS / email / Meta).
 *
 * Always passes conversationId so /api/push/send tags the push with
 * categoryId: 'message' — that's what gives the phone its Reply (text box) and
 * Mark-read quick actions. notifyCompany() only writes the in-app bell rows and
 * does NOT push, so every inbound-message path must call this too.
 *
 * Safe/no-throw and awaited (un-awaited fetches can be dropped when a serverless
 * function returns). The push route de-dupes tokens and skips excludeUserId.
 */
export async function pushInboundMessage(params: {
  companyId: string
  conversationId: string
  title: string
  body: string
  route?: string
  excludeUserId?: string
  baseUrl?: string
}) {
  try {
    // Conversation protection: nothing for spam or a blocked sender, and a
    // flagged message's words never reach a lock screen.
    const quiet = await quietVerdict(admin(), params.conversationId)
    if (quiet === 'spam' || quiet === 'blocked') return
    const body = quiet ? `${HIDDEN_PREVIEW}. Open Colvy to review it.` : params.body
    const base = params.baseUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
    await fetch(`${base}/api/push/send`, {
      method: 'POST',
      headers: internalHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({
        companyId: params.companyId,
        conversationId: params.conversationId,
        title: params.title,
        body,
        route: params.route,
        excludeUserId: params.excludeUserId,
      }),
    })
  } catch (e) {
    console.error('[pushInboundMessage] failed', e)
  }
}

/**
 * Create a notification for every member of a company.
 * `type` is a short tag (chat, order, ticket, assignment, cart …).
 * Safe/no-throw: notification failures never block the underlying action.
 */
export async function notifyCompany(params: {
  companyId: string
  type: string
  message: string
  actorName?: string
  actorEmail?: string
  excludeUserId?: string
  conversationId?: string
  db?: any
}) {
  try {
    const db = params.db || admin()
    // A customer's message in a conversation Colvy flagged (lib/conversation-protection):
    // no bell for spam or a blocked sender, and no message text for a suspect one.
    let message = params.message
    if (params.conversationId && INBOUND_NOTIFY_TYPES.has(params.type)) {
      const quiet = await quietVerdict(db, params.conversationId)
      if (quiet === 'spam' || quiet === 'blocked') return
      if (quiet) message = `${HIDDEN_PREVIEW} (from ${params.actorName || 'a customer'})`
    }
    const recipients = await companyRecipients(db, params.companyId, params.excludeUserId)
    if (recipients.length === 0) return
    const rows = recipients.map(uid => ({
      user_id: uid,
      company_id: params.companyId,
      type: params.type,
      message,
      actor_name: params.actorName || null,
      actor_email: params.actorEmail || null,
      conversation_id: params.conversationId || null,
      is_read: false,
    }))
    await db.from('notifications').insert(rows)
  } catch (e) {
    console.error('[notifyCompany] failed', e)
  }
}
