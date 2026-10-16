import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCallsAccess, draftTextBack } from '@/lib/command-centre-server'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/**
 * POST /api/command-centre/text-back { companyId, callId }
 *
 * Drafts a text back to a missed caller: written by AI from their voicemail or
 * the call's summary (the reply_draft job on the AI switchboard), or the
 * business's own missed-call message when AI agents are paused or AI isn't set
 * up. Never sends: a person reads, edits and sends it from the Command Centre
 * through the usual SMS route, which checks the opt-out again. Refused for
 * hidden, overseas and landline numbers, and for anyone who replied STOP.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}))
  const companyId = body?.companyId, callId = body?.callId
  if (!companyId || !callId) return NextResponse.json({ error: 'companyId and callId required' }, { status: 400 })
  const db = admin()
  if (!(await requireCallsAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const draft = await draftTextBack(db, companyId, String(callId))
    if ('reason' in draft) return NextResponse.json({ error: draft.message, reason: draft.reason }, { status: draft.reason === 'not_found' ? 404 : 409 })
    return NextResponse.json(draft, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Couldn’t draft a text' }, { status: 500 })
  }
}
