import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * POST /api/team/activate   { companySlug }   Authorization: Bearer <token>
 *
 * Accept an invitation when the invited person is already signed in.
 *
 * The join page used to do this from the browser — an UPDATE straight onto
 * team_members setting status, user_id and joined_at. That only worked because
 * anyone could write to that table, which is the same permission that let a
 * stranger add themselves to any company and, through is_company_member, read
 * everything in it.
 *
 * Which invitation is activated is decided by the access token, never by the
 * request body. The caller can only ever claim an invitation addressed to the
 * email on their own session, so a valid token for one account cannot accept an
 * invitation belonging to another.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = req.headers.get('authorization') || ''
    const token = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : ''
    if (!token) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!key) return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: who, error: whoErr } = await db.auth.getUser(token)
    const user = who?.user
    if (whoErr || !user?.email) {
      return NextResponse.json({ error: 'Session expired — sign in again' }, { status: 401 })
    }

    const { companySlug } = await req.json().catch(() => ({ companySlug: null }))
    let companyId: string | null = null
    if (companySlug) {
      const { data: co } = await (db as any).from('companies').select('id').eq('slug', companySlug).maybeSingle()
      companyId = co?.id || null
    }

    const email = user.email.toLowerCase()
    const { data: rows } = await (db as any).from('team_members')
      .select('*').ilike('email', email).order('created_at', { ascending: false })
    const invite = (rows || []).find((r: any) => companyId && r.company_id === companyId)
      || (rows || []).find((r: any) => r.company_id == null)
      || (rows || [])[0]

    if (!invite) {
      return NextResponse.json({ error: 'Invitation not found. Ask your inviter to resend it.' }, { status: 404 })
    }

    const patch: any = { status: 'active', user_id: user.id, joined_at: new Date().toISOString() }
    // Backfill the company link when the invite was written without one.
    if (invite.company_id == null && companyId) patch.company_id = companyId

    const { error } = await (db as any).from('team_members').update(patch).eq('id', invite.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ ok: true, companyId: patch.company_id || invite.company_id })
  } catch (e: any) {
    console.error('[team/activate]', e?.message || e)
    return NextResponse.json({ error: e?.message || 'Could not accept the invitation' }, { status: 500 })
  }
}
