import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setCallPreview } from '@/lib/call-card'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Tidy a display name out of an email local-part, e.g. "amit.panta12" → "Amit
// Panta" — the same shaping the app uses when a profile name is missing.
function prettyFromEmail(email: string): string {
  const local = String(email || '').split('@')[0] || ''
  const pretty = local
    .replace(/[._-]+/g, ' ')
    .replace(/\d+$/, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
  return pretty || local || 'A team member'
}

// Resolve an agent's display name from auth metadata (same source as
// /api/team/names), falling back to their team_members email username.
async function agentName(db: any, userId: string, companyId: string): Promise<string> {
  try {
    const { data } = await db.auth.admin.getUserById(userId)
    const u = data?.user
    const meta = (u?.user_metadata?.display_name || u?.user_metadata?.full_name) as string | undefined
    if (meta && meta.trim()) return meta.trim()
    if (u?.email) return prettyFromEmail(u.email)
  } catch { /* service-role unavailable, or not an auth user — fall through */ }
  try {
    const { data: tm } = await db.from('team_members')
      .select('email').eq('user_id', userId).eq('company_id', companyId).maybeSingle()
    if (tm?.email) return prettyFromEmail(tm.email)
  } catch {}
  return 'A team member'
}

// Per-<Client> status callback on an inbound ring-all Dial. When an agent's
// browser or mobile leg is ANSWERED, Twilio posts here with that child leg's
// CallSid and (via the callback URL) the agent's user id — the only reliable
// moment to capture WHO took the call. We record the answering agent on the
// call row (for warm transfer AND so the whole team sees who received it) and
// ping every other agent: "X received the call".
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
    const callRowId = req.nextUrl.searchParams.get('callRowId') || ''
    const companyId = req.nextUrl.searchParams.get('companyId') || ''
    const userId = req.nextUrl.searchParams.get('userId') || ''
    const childSid = get('CallSid')
    const status = (get('CallStatus') || '').toLowerCase()

    if (callRowId && childSid && (status === 'in-progress' || status === 'answered')) {
      const db = admin()

      // Resolve the answering agent's name once (best-effort).
      let name = ''
      if (userId) { try { name = await agentName(db, userId, companyId) } catch {} }

      const patch: any = {
        twilio_child_call_sid: childSid,
        status: 'in_progress',
        answered_at: new Date().toISOString(),
      }
      if (userId) patch.answered_by_user_id = userId
      if (name) { patch.answered_by = name; patch.agent_name = name }

      // Claim the call for the FIRST agent to answer. Filtering on
      // answered_by_user_id IS NULL means a ring-all where several legs briefly
      // report in-progress still records exactly one winner — and lets us fire
      // the "X received the call" ping only once. (When userId is absent — an
      // older cached TwiML — we skip the filter and keep the prior behaviour.)
      let claimed = false
      let convId: string | null = null
      let caller = ''
      try {
        let q = db.from('calls').update(patch).eq('id', callRowId)
        if (userId) q = q.is('answered_by_user_id', null)
        const { data: updated } = await q.select('id, conversation_id, contact_name, caller_name, from_number')
        claimed = Array.isArray(updated) && updated.length > 0
        convId = (updated as any)?.[0]?.conversation_id || null
        const row = (updated as any)?.[0] || {}
        caller = String(row.contact_name || row.caller_name || row.from_number || '').trim()
      } catch {}

      // Reflect the answer in the inbox list — once, for the winning agent.
      if (claimed && convId) {
        try { await setCallPreview(db as any, convId, name ? `📞 Call answered by ${name}` : '📞 Call answered') } catch {}
      }

      // Let the rest of the team know who picked it up — once.
      if (claimed && companyId && userId && name) {
        const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
        try {
          await fetch(`${base}/api/push/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              companyId,
              title: 'Call answered',
              body: `${name} received the call${caller ? ` from ${caller}` : ''}`,
              excludeUserId: userId,
              channelId: 'calls',
              ...(callRowId ? { route: `/call-detail/${callRowId}` } : {}),
            }),
          })
        } catch {}
      }
    }
    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: true })
  }
}
