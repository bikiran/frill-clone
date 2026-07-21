import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Accept a team invitation: create (or reuse) the invitee's auth account with
// email auto-confirmed (the invite email already proves address ownership), set
// their password, and activate their team_members row. The client then signs in
// with the same password. This avoids the "confirm your email" gate that made
// client-side signUp return no session ("could not sign you in").
export async function POST(req: NextRequest) {
  try {
    const { email, password, companySlug } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    if (String(password).length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server is not configured for invitations (missing service role key).' }, { status: 500 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const userEmail = String(email).trim().toLowerCase()

    // Find the invitation row by email (case already normalised). Don't require
    // a matching company_id — invited rows can have a null company_id, and
    // hard-filtering on it made valid invites read as "not found". Prefer the
    // row for this company, then a null-company row, then the newest.
    let companyId: string | null = null
    if (companySlug) {
      const { data: co } = await admin.from('companies').select('id').eq('slug', companySlug).maybeSingle()
      companyId = co?.id || null
    }
    const { data: invites } = await admin.from('team_members').select('*')
      .ilike('email', userEmail).order('created_at', { ascending: false })
    const invite = (invites || []).find((r: any) => companyId && r.company_id === companyId)
      || (invites || []).find((r: any) => r.company_id == null)
      || (invites || [])[0]
    if (!invite) return NextResponse.json({ error: 'Invitation not found. Ask your inviter to resend it.' }, { status: 404 })
    // Backfill a missing company link so the membership is usable.
    if (invite.company_id == null && companyId) {
      try { await admin.from('team_members').update({ company_id: companyId }).eq('id', invite.id) } catch {}
      invite.company_id = companyId
    }

    // Create the account with email pre-confirmed, or reuse + set password if it
    // already exists.
    let userId: string | null = null
    const { data: created, error: createErr } = await (admin.auth.admin as any).createUser({
      email: userEmail, password, email_confirm: true,
    })
    if (createErr) {
      const exists = /already|registered|exists/i.test(createErr.message || '')
      if (!exists) return NextResponse.json({ error: createErr.message }, { status: 400 })
      // Reuse the existing user and update their password so they can sign in.
      let found: any = null
      for (let page = 1; page <= 25 && !found; page++) {
        const { data: list } = await (admin.auth.admin as any).listUsers({ page, perPage: 200 })
        const users = list?.users || []
        found = users.find((u: any) => (u.email || '').toLowerCase() === userEmail)
        if (users.length < 200) break
      }
      if (!found) return NextResponse.json({ error: 'This email exists but the account could not be located.' }, { status: 400 })
      userId = found.id
      await (admin.auth.admin as any).updateUserById(userId, { password, email_confirm: true })
    } else {
      userId = created.user?.id || null
    }
    if (!userId) return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 })

    // Activate the membership.
    const { error: updateErr } = await admin.from('team_members')
      .update({ status: 'active', user_id: userId, joined_at: new Date().toISOString() })
      .eq('id', invite.id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unexpected error' }, { status: 500 })
  }
}
