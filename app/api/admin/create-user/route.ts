import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const SUPER_ADMIN = 'bishalstha76@gmail.com'

export async function POST(req: NextRequest) {
  try {
    const { email, password, name, role, companyId } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Email and password required' }, { status: 400 })

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // AUTHORIZATION — this route mints a confirmed auth account with the service
    // role, so it must never run unauthenticated. Require a caller who is the
    // owner or an admin of the company the new user is being added to (or the
    // platform super admin). Without this, anyone able to POST here could create
    // accounts at will.
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: authData } = await supabaseAdmin.auth.getUser(token)
    const caller = authData?.user
    if (!caller?.id) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const callerEmail = (caller.email || '').toLowerCase()
    if (callerEmail !== SUPER_ADMIN) {
      if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
      // Owner of the company?
      const { data: owned } = await (supabaseAdmin as any)
        .from('companies').select('id').eq('id', companyId).eq('owner_id', caller.id).maybeSingle()
      let allowed = !!owned
      if (!allowed) {
        // Or an admin/owner team member of the company?
        const { data: mem } = await (supabaseAdmin as any)
          .from('team_members').select('role, status')
          .eq('company_id', companyId).eq('user_id', caller.id)
          .in('role', ['owner', 'admin']).limit(1)
        allowed = !!(mem && mem.length && (mem[0].status == null || mem[0].status === 'active'))
      }
      if (!allowed) return NextResponse.json({ error: 'Forbidden — you must be an owner or admin of this workspace.' }, { status: 403 })
    }

    let userId: string | null = null
    let userEmail = email.trim().toLowerCase()
    // Track whether WE created the auth account on this request. If the
    // membership link below can't be written, a freshly-created account would be
    // left orphaned (a login with no workspace — visible in the global Users
    // list but in no team). We delete it in that case so "Create User" is
    // all-or-nothing. A pre-existing account is never deleted.
    let createdNewUser = false

    if (process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const { data, error } = await (supabaseAdmin.auth.admin as any).createUser({
        email: userEmail, password, email_confirm: true,
        user_metadata: { display_name: name || email.split('@')[0] },
      })
      if (error) {
        // If the user already exists, reuse their account rather than failing —
        // the super admin is provisioning a company for an existing person.
        const alreadyExists = /already|registered|exists/i.test(error.message || '')
        if (alreadyExists) {
          // Find the existing user by paging through auth users.
          let found: any = null
          for (let page = 1; page <= 20 && !found; page++) {
            const { data: list } = await (supabaseAdmin.auth.admin as any).listUsers({ page, perPage: 200 })
            const users = list?.users || []
            found = users.find((u: any) => (u.email || '').toLowerCase() === userEmail)
            if (users.length < 200) break
          }
          if (found) {
            userId = found.id
            userEmail = found.email || userEmail
          } else {
            return NextResponse.json({ error: 'This email is registered but the account could not be located. Check the Users list.' }, { status: 400 })
          }
        } else {
          return NextResponse.json({ error: error.message }, { status: 400 })
        }
      } else {
        userId = data.user?.id
        userEmail = data.user?.email || email
        createdNewUser = true
      }
    } else {
      const { data, error } = await supabaseAdmin.auth.signUp({
        email: userEmail, password,
        options: { data: { display_name: name || email.split('@')[0] } },
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      userId = data.user?.id
      createdNewUser = true
    }

    // Scope the membership to the owner's company. Without company_id the row is
    // orphaned: the team list filters by company_id, so the new user never shows
    // up there and can't reach the workspace. This link is NOT best-effort — if
    // it fails, the whole operation fails (and we undo a freshly-created account),
    // because a "created" user who lands in no workspace is the exact bug this
    // route caused: an account visible only in the global list, in no team.
    // Also avoid a duplicate row if this person is already a member of this
    // company (would break the single-row membership lookups elsewhere).
    const cid = companyId || null
    if (!cid) {
      if (createdNewUser && userId) { try { await (supabaseAdmin.auth.admin as any).deleteUser(userId) } catch {} }
      return NextResponse.json({ error: 'companyId required to add the user to a workspace' }, { status: 400 })
    }
    try {
      let existing: any = null
      if (userId) {
        const { data } = await (supabaseAdmin as any)
          .from('team_members').select('id').eq('company_id', cid).eq('user_id', userId).limit(1)
        existing = data?.[0] || null
      }
      if (existing) {
        const { error } = await (supabaseAdmin as any).from('team_members')
          .update({ role: role || 'editor', status: 'active', email: userEmail })
          .eq('id', existing.id)
        if (error) throw error
      } else {
        const { error } = await (supabaseAdmin as any).from('team_members').insert({
          email: userEmail, role: role || 'editor', status: 'active', user_id: userId,
          company_id: cid,
        })
        if (error) throw error
      }
    } catch (e: any) {
      // Roll back a just-created account so we never leave an orphan behind.
      if (createdNewUser && userId) { try { await (supabaseAdmin.auth.admin as any).deleteUser(userId) } catch {} }
      return NextResponse.json({ error: `Account created but could not be added to the workspace: ${e?.message || 'membership write failed'}` }, { status: 500 })
    }

    return NextResponse.json({ success: true, email: userEmail, userId, companyId: cid })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
