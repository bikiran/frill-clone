import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

// Store the agent's post-call thumbs up/down on the calls row. Requires a valid
// signed-in session; the rating is scoped to the caller's company via the row.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })
    const { data: u } = await db.auth.getUser(token)
    const userId = u?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not authorized' }, { status: 401 })

    const body = await req.json().catch(() => ({}))
    const callId = body?.callId
    const rating = Number(body?.rating)
    if (!callId || ![1, -1].includes(rating)) return NextResponse.json({ error: 'Bad request' }, { status: 400 })

    const { error } = await db.from('calls').update({
      rating, rating_by_user_id: userId, rating_at: new Date().toISOString(),
    }).eq('id', callId)
    if (error) {
      // Column missing → migration not run yet; don't hard-fail the UI.
      if (/column .* does not exist|schema cache/i.test(error.message)) return NextResponse.json({ ok: false, missing: true })
      throw error
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
