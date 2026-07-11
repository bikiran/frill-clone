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
  db?: any
}) {
  try {
    const db = params.db || admin()
    const recipients = await companyRecipients(db, params.companyId, params.excludeUserId)
    if (recipients.length === 0) return
    const rows = recipients.map(uid => ({
      user_id: uid,
      type: params.type,
      message: params.message,
      actor_name: params.actorName || null,
      actor_email: params.actorEmail || null,
      is_read: false,
    }))
    await db.from('notifications').insert(rows)
  } catch (e) {
    console.error('[notifyCompany] failed', e)
  }
}
