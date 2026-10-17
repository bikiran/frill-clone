import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { isInternalCall } from '@/lib/internal-call'
import { backfillEmptyEmailBodies } from '@/lib/email-backfill'
import { resendReceivingKey } from '@/lib/resend-receiving'
import { timingSafeEqual } from 'crypto'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST /api/email/backfill-bodies
//   body: { companyId?, days? (default 30, max 90), dryRun?, rethread? }
//
// Fills in customer emails that were saved with an empty body (Resend's inbound
// webhook carries no body; it used to be stored blank). Idempotent: rows that
// have a body are left alone and checked rows are stamped, so it can be re-run.
//
// Who may run it:
//   • a workspace member, for their own workspace: Authorization: Bearer <session token>, body.companyId
//   • the scheduler / an operator for every workspace: Authorization: Bearer $CRON_SECRET
//     (refused when CRON_SECRET isn't set — no open all-tenant mode).
//   • the platform super admin: super admin → Overview → "Recover empty email
//     replies" (/api/platform-admin/email-backfill), no secret needed.
// A key that isn't the CRON_SECRET with no companyId is told so (401), rather
// than "companyId required", which read as if the secret had worked.
//
// Examples:
//   curl -X POST https://colvy.com/api/email/backfill-bodies -H "Authorization: Bearer $CRON_SECRET" \
//        -H 'Content-Type: application/json' -d '{"dryRun":true}'
//   curl -X POST https://colvy.com/api/email/backfill-bodies -H "Authorization: Bearer $CRON_SECRET" \
//        -H 'Content-Type: application/json' -d '{"days":30,"rethread":true}'
function isCronSecret(req: NextRequest): boolean {
  if (isInternalCall(req)) return true
  const secret = process.env.CRON_SECRET
  if (!secret) return false
  const got = Buffer.from(req.headers.get('authorization') || '')
  const want = Buffer.from(`Bearer ${secret}`)
  return got.length === want.length && timingSafeEqual(got, want)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const db = admin()
    const companyId: string | null = body?.companyId ? String(body.companyId) : null
    if (!isCronSecret(req)) {
      if (!companyId) {
        const auth = req.headers.get('authorization')
        if (auth !== null) {
          // e.g. `-H "Authorization: Bearer $CRON_SECRET"` in a shell where it isn't set.
          const empty = !auth.replace(/^\s*Bearer\b/i, '').trim()
          return NextResponse.json({
            error: "That key isn't the CRON_SECRET — pass companyId to run it for one workspace, or use the super admin button",
            ...(empty ? { hint: 'The key was empty: is $CRON_SECRET set in this shell?' } : {}),
          }, { status: 401 })
        }
        return NextResponse.json({ error: 'companyId required (or Authorization: Bearer $CRON_SECRET for every workspace)' }, { status: 400 })
      }
      if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }
    if (!resendReceivingKey()) return NextResponse.json({ error: 'RESEND_API_KEY is not set, so received emails can’t be fetched.' }, { status: 400 })
    const result = await backfillEmptyEmailBodies(db, {
      companyId, days: Number(body?.days) || 30, dryRun: !!body?.dryRun, rethread: !!body?.rethread,
    })
    return NextResponse.json({ ok: true, ...result }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Backfill failed' }, { status: 500 })
  }
}
