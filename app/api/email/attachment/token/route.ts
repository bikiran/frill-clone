import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { signValue } from '@/lib/oauth-state'

export const dynamic = 'force-dynamic'

// POST { conversationId } → { token } for /api/email/attachment links in that
// conversation. Members only; the token lasts 6 hours. Lets <img src> and plain
// links open Gmail attachments without exposing them to anyone with the ids.
export async function POST(req: NextRequest) {
  const { conversationId } = await req.json().catch(() => ({}))
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: conv } = await db.from('conversations').select('company_id').eq('id', conversationId).maybeSingle()
  if (!conv || !(await requireCompanyAccess(req, db, conv.company_id)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  return NextResponse.json({ token: signValue({ kind: 'att', conversationId }, 6 * 60 * 60 * 1000) })
}
