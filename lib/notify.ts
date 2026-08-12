import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Resolve the user ids who should receive a company's activity notifications:
// the owner plus all team members. Optionally exclude one user (e.g. the actor).
async function companyRecipients(db: any, companyId: string, excludeUserId?: string): Promise<string[]> {
  const ids = new Set<string>()
  try {
    const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
    if (co?.owner_id) ids.add(co.owner_id)
  } catch {}
  try {
    const { data: tm } = await db.from('team_members').select('user_id').eq('company_id', companyId)
    ;(tm || []).forEach((r: any) => r.user_id && ids.add(r.user_id))
  } catch {}
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
    const base = params.baseUrl || process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
    await fetch(`${base}/api/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: params.companyId,
        conversationId: params.conversationId,
        title: params.title,
        body: params.body,
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
    const recipients = await companyRecipients(db, params.companyId, params.excludeUserId)
    if (recipients.length === 0) return
    const rows = recipients.map(uid => ({
      user_id: uid,
      company_id: params.companyId,
      type: params.type,
      message: params.message,
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
