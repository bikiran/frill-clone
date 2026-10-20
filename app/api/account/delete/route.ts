import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { deleteAccount, PURGE_AFTER_DAYS } from '@/lib/account-deletion'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

/**
 * POST /api/account/delete — delete the signed-in user's account.
 * Body: { confirm: 'DELETE' }. See lib/account-deletion.ts for what happens.
 */
export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    const body = await req.json().catch(() => ({}))
    if (String(body?.confirm || '').trim().toUpperCase() !== 'DELETE') {
      return NextResponse.json({ error: 'Type DELETE to confirm.' }, { status: 400 })
    }
    const db = admin()
    const { data, error } = await db.auth.getUser(token)
    const user = data?.user
    if (error || !user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
    const out = await deleteAccount(db, { id: user.id, email: user.email }, token)
    return NextResponse.json({ ok: true, ...out, purgeDays: PURGE_AFTER_DAYS })
  } catch (e: any) {
    console.error('[account delete]', e?.message || e)
    return NextResponse.json({ error: e?.message || 'Couldn’t delete the account.' }, { status: 500 })
  }
}

/** GET — what deleting would do, for the confirmation screen. */
export async function GET(req: NextRequest) {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const db = admin()
  const { data } = await db.auth.getUser(token)
  if (!data?.user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const { data: owned } = await db.from('companies').select('id, name').eq('owner_id', data.user.id)
  return NextResponse.json({ email: data.user.email, ownedWorkspaces: (owned || []).map((c: any) => c.name || 'Your workspace'), purgeDays: PURGE_AFTER_DAYS })
}
