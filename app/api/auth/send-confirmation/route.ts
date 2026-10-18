import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { confirmEmail } from '@/lib/colvy-account-emails'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Who may ask for a confirmation email: only someone who already signed up and
 * hasn't confirmed yet, and who knows the password they signed up with.
 *
 * This used to take any address. generateLink({ type: 'signup' }) creates the
 * account when it doesn't exist, so anyone could create accounts for other
 * people's addresses and have Colvy mail them. Signing in with the password
 * tells us both things at once: GoTrue checks the password first and only then
 * answers "email not confirmed".
 */
async function unconfirmedWithPassword(email: string, password: string): Promise<'ok' | 'confirmed' | 'denied'> {
  const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data, error } = await anon.auth.signInWithPassword({ email, password })
  if (data?.session) return 'confirmed'
  const code = String((error as any)?.code || '')
  if (code === 'email_not_confirmed' || /email not confirmed/i.test(error?.message || '')) return 'ok'
  return 'denied'
}

// Direct email sending via Resend API
// This bypasses Supabase's built-in email rate limit (2/hour in dev mode)
// Supabase should also be configured to use a custom SMTP (Resend) in the dashboard.
export async function POST(req: NextRequest) {
  try {
    // mode: 'code' is the mobile app asking for the six-digit code rather than
    // a link — it has no browser for a link to land in.
    const body = await req.json()
    const email = typeof body.email === 'string' ? body.email.trim() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const slug = typeof body.slug === 'string' && /^[a-z0-9-]{1,40}$/.test(body.slug) ? body.slug : ''
    const name = typeof body.name === 'string' ? body.name.slice(0, 80) : ''
    const companyId = typeof body.companyId === 'string' && UUID.test(body.companyId) ? body.companyId : null
    const wantCode = body.mode === 'code'

    if (!email || !password) return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    if (!checkBurst(`send-confirmation:${email.toLowerCase()}`, 3) || !checkBurst(`send-confirmation:${callerKey(req)}`, 10)) {
      return NextResponse.json({ error: 'Please wait a minute before asking again.' }, { status: 429 })
    }
    const state = await unconfirmedWithPassword(email, password)
    if (state === 'confirmed') return NextResponse.json({ ok: true, alreadyConfirmed: true })
    if (state === 'denied') return NextResponse.json({ error: 'Check the email and password you signed up with.' }, { status: 401 })
    
    const RESEND_KEY = process.env.RESEND_API_KEY
    if (!RESEND_KEY) {
      // Fallback: no Resend key — let Supabase handle it (may be rate-limited)
      return NextResponse.json({ error: 'RESEND_API_KEY not configured' }, { status: 500 })
    }

    const baseUrl = 'https://colvy.com'
    const redirectTo = companyId
      ? `${baseUrl}/auth/callback?company_id=${companyId}`
      : `${baseUrl}/auth/callback?slug=${encodeURIComponent(slug || '')}&name=${encodeURIComponent(name || '')}`

    // Build the confirmation link — we use Supabase's admin API to generate it
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    // GoTrue requires the password for a type:'signup' link — without it the
    // call is rejected, which is why a resend could quietly do nothing. The app
    // still holds what the user typed a moment ago and sends it back, so the
    // second email is generated the same way the first one was.
    const { data: linkData, error: linkError } = await (adminClient.auth.admin as any).generateLink({
      type: 'signup',
      email,
      password,
      options: { redirectTo },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Link generation error:', linkError)
      return NextResponse.json({ error: linkError?.message || 'Could not generate confirmation link' }, { status: 500 })
    }

    const confirmLink = linkData.properties.action_link
    const emailOtp = linkData.properties.email_otp

    // A link is no use to a screen waiting for six digits, so fail loudly
    // rather than send something the app cannot act on.
    if (wantCode && !emailOtp) {
      return NextResponse.json({ error: 'Confirmation code could not be generated' }, { status: 500 })
    }

    // Send via Resend
    const mail = confirmEmail({ mode: wantCode ? 'code' : 'link', link: confirmLink, code: emailOtp, slug, resend: true })
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Colvy <noreply@updates.colvy.com>',
        to: [email],
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      }),
    })

    if (!resendRes.ok) {
      const err = await resendRes.json()
      console.error('Resend error:', err)
      return NextResponse.json({ error: 'Email send failed: ' + JSON.stringify(err) }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('send-confirmation error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
