import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createWorkspace } from '@/lib/createWorkspace'

/**
 * Finish a mobile sign-up: confirm the emailed code, then build the workspace.
 *
 * The web flow creates the board when the confirmation link is opened in a
 * browser. The app has no browser in that loop, so it collects the six-digit
 * code Supabase issues alongside the link and posts it here.
 *
 * Both halves run server-side, in this order, on purpose. The app is not signed
 * in until this returns: the moment a session exists, the root navigator moves
 * off the sign-up screen and into the inbox, and if the board were still being
 * created the user would arrive in a workspace that does not exist yet.
 * Confirming here and signing in afterwards removes that window entirely.
 *
 * Ownership comes from the code, never from the request body. The body says
 * what to call the workspace; who it belongs to is whoever proved they can read
 * the email.
 */
export async function POST(req: NextRequest) {
  try {
    const { email, code, name, slug, industry, password } = await req.json()
    const addr = String(email || '').trim()
    const token = String(code || '').trim()
    if (!addr || !token) return NextResponse.json({ error: 'Email and code are required' }, { status: 400 })

    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const anon = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })

    const { data, error } = await anon.auth.verifyOtp({ email: addr, token, type: 'signup' })
    let userId: string | null = data?.user?.id || null

    if (!userId) {
      // A code can only be spent once. If the workspace insert failed the first
      // time through — a dropped connection, a slug taken half a second
      // earlier — the address is already confirmed and the user's second
      // attempt would be stuck behind a code that can never work again. The
      // password they just chose proves the same thing the code did, so accept
      // it as the way back in rather than stranding a confirmed account.
      if (password) {
        const retry = await anon.auth.signInWithPassword({ email: addr, password })
        if (retry.data?.user?.id) userId = retry.data.user.id
      }
      if (!userId) {
        return NextResponse.json(
          { error: error?.message || 'That code is not valid. Check it or ask for a new one.' },
          { status: 400 },
        )
      }
    }

    const res = await createWorkspace({ userId, email: addr, name, slug, industry })
    if (!res.ok) return NextResponse.json({ error: res.error }, { status: res.status })

    return NextResponse.json({
      ok: true,
      created: res.created,
      company: { id: res.company.id, slug: res.company.slug, name: res.company.name },
    })
  } catch (err: any) {
    console.error('[auth/mobile/confirm]', err)
    return NextResponse.json({ error: err?.message || 'Could not finish signing up' }, { status: 500 })
  }
}
