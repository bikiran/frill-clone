import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''

const clientWith = (key: string) => createClient(URL_, key, { auth: { autoRefreshToken: false, persistSession: false } })

/**
 * TEMPORARY diagnostic for web↔mobile pin sync. Remove once resolved.
 * GET /api/debug/pins?email=<login email>
 *
 * Beyond listing rows, it proves WHERE the write is failing:
 *  - usingServiceRole: is the read using the service-role key (bypasses RLS) or
 *    falling back to anon (in which case "empty" could just be RLS hiding rows)?
 *  - serviceWriteTest: can the service role insert+read+delete a row? (table sane)
 *  - anonWriteTest: can the ANON role write? Its error message reveals whether
 *    RLS / missing grants are blocking the browser & mobile clients.
 */
export async function GET(req: NextRequest) {
  try {
    const email = (req.nextUrl.searchParams.get('email') || '').toLowerCase().trim()
    const db = clientWith(SERVICE || ANON)
    const usingServiceRole = !!SERVICE

    // Resolve the auth user id from the login email.
    let resolvedUserId: string | null = null
    if (email && SERVICE) {
      for (let page = 1; page <= 20 && !resolvedUserId; page++) {
        const { data } = await (db as any).auth.admin.listUsers({ page, perPage: 200 })
        const users = data?.users || []
        const u = users.find((x: any) => (x.email || '').toLowerCase() === email)
        if (u) resolvedUserId = u.id
        if (users.length < 200) break
      }
    }

    const { data: recentAnyUser } = await (db as any).from('conversation_pins')
      .select('user_id, conversation_id, company_id, created_at')
      .order('created_at', { ascending: false }).limit(30)

    // ── Service-role write self-test ─────────────────────────────────────────
    let serviceWriteTest = 'skipped (no service key)'
    if (SERVICE) {
      const id = `__diag_svc_${Date.now()}`
      const ins = await (db as any).from('conversation_pins').insert({ user_id: id, conversation_id: id, company_id: '__diag__' })
      if (ins.error) serviceWriteTest = `INSERT FAILED: ${ins.error.message}`
      else {
        const back = await (db as any).from('conversation_pins').select('user_id').eq('user_id', id).maybeSingle()
        serviceWriteTest = back.data ? 'ok (insert + read back worked)' : 'insert ok but read back empty (RLS?)'
        await (db as any).from('conversation_pins').delete().eq('user_id', id)
      }
    }

    // ── Anon-role write probe (mimics the browser / mobile client) ───────────
    let anonWriteTest = 'skipped (no anon key)'
    if (ANON) {
      const anon = clientWith(ANON)
      const id = `__diag_anon_${Date.now()}`
      const ins = await (anon as any).from('conversation_pins').insert({ user_id: id, conversation_id: id, company_id: '__diag__' })
      if (ins.error) anonWriteTest = `BLOCKED: ${ins.error.message} (code ${ins.error.code || '?'})`
      else {
        anonWriteTest = 'ok — anon can write (so writes are not the problem)'
        if (SERVICE) await (db as any).from('conversation_pins').delete().eq('user_id', id)
      }
    }

    return NextResponse.json({
      queriedEmail: email || null,
      usingServiceRole,
      resolvedUserId,
      recentRowCount: recentAnyUser?.length || 0,
      recentAnyUser: recentAnyUser || [],
      serviceWriteTest,
      anonWriteTest,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
