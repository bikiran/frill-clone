import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createHash } from 'crypto'

export const dynamic = 'force-dynamic'

// Accept a team invitation: create (or reuse) the invitee's auth account with
// email auto-confirmed (the invite email already proves address ownership), set
// their password, and activate their team_members row. The client then signs in
// with the same password. This avoids the "confirm your email" gate that made
// client-side signUp return no session ("could not sign you in").
export async function POST(req: NextRequest) {
  try {
    const { email, password, companySlug, token } = await req.json()
    if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    if (String(password).length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    // The invite link's token is the only proof the person opened the invite
    // email. Without it this route set the password of ANY account that had a
    // team row — taking it over with nothing but an email address.
    if (!token || typeof token !== 'string') {
      return NextResponse.json({ error: 'This invite link is missing its code. Ask your inviter to send a new invite.' }, { status: 400 })
    }
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server is not configured for invitations (missing service role key).' }, { status: 500 })
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const userEmail = String(email).trim().toLowerCase()
    const tokenHash = createHash('sha256').update(token).digest('hex')

    let companyId: string | null = null
    if (companySlug) {
      const { data: co } = await admin.from('companies').select('id').eq('slug', companySlug).maybeSingle()
      companyId = co?.id || null
    }
    // Only a still-open invitation for this email whose code matches.
    const { data: invites } = await admin.from('team_members').select('*')
      .ilike('email', userEmail).eq('invite_token_hash', tokenHash)
      .in('status', ['invited', 'pending'])
      .order('created_at', { ascending: false })
    const invite = (invites || []).find((r: any) => companyId && r.company_id === companyId)
      || (invites || []).find((r: any) => r.company_id == null)
      || (invites || [])[0]
    if (!invite) return NextResponse.json({ error: 'This invite link isn’t valid any more. Ask your inviter to send a new one.' }, { status: 404 })
    if (invite.company_id == null && companyId) {
      try { await admin.from('team_members').update({ company_id: companyId }).eq('id', invite.id) } catch {}
      invite.company_id = companyId
    }

    // Create the account with the email confirmed (the invite email proves it).
    // An account that already exists keeps its own password: the inviter can see
    // this link too, so it must never be able to reset someone's password. They
    // sign in first and the page accepts through /api/team/activate.
    let userId: string | null = null
    const { data: created, error: createErr } = await (admin.auth.admin as any).createUser({
      email: userEmail, password, email_confirm: true,
    })
    if (createErr) {
      const exists = /already|registered|exists/i.test(createErr.message || '')
      if (exists) {
        return NextResponse.json({
          error: 'You already have a Colvy account with this email. Sign in with it, then open this invite link again.',
          signIn: true,
        }, { status: 409 })
      }
      return NextResponse.json({ error: createErr.message }, { status: 400 })
    }
    userId = created.user?.id || null
    if (!userId) return NextResponse.json({ error: 'Could not create the account.' }, { status: 500 })

    // Activate the membership.
    const { error: updateErr } = await admin.from('team_members')
      .update({ status: 'active', user_id: userId, joined_at: new Date().toISOString(), invite_token_hash: null })
      .eq('id', invite.id)
    if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Unexpected error' }, { status: 500 })
  }
}
