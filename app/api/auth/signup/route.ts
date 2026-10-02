import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Full server-side signup flow. This bypasses two problems with doing
// signUp() directly from the browser:
//  1. Supabase's built-in email has a strict rate limit (2/hour in dev mode) —
//     emails get silently dropped once exceeded.
//  2. Calling admin.generateLink({ type: 'signup' }) AFTER a client-side
//     signUp() call fails because the user already exists.
// Doing user creation AND email generation in one server call avoids both.
export async function POST(req: NextRequest) {
  try {
    // mode: 'code' is the mobile app. It has no browser to land a confirmation
    // link in, so it needs the six-digit code that Supabase issues alongside
    // the link, typed back into the app instead.
    const { email, password, name, slug, industry, companyId, mode } = await req.json()
    const wantCode = mode === 'code'

    if (!email || !password) {
      return NextResponse.json({ error: 'Email and password are required' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceKey) {
      return NextResponse.json({ error: 'Server misconfigured: SUPABASE_SERVICE_ROLE_KEY not set' }, { status: 500 })
    }

    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // 1. Create the user directly (unconfirmed) — never touches Supabase's
    //    rate-limited email sender since we pass email_confirm: false and
    //    send our own email via Resend below.
    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: {
        display_name: name || email.split('@')[0],
        company: name || null,
        industry: industry || null,
        // Carry the full board intent on the USER, not just in the callback's
        // query string. Supabase's email-verify redirect can drop the redirect_to
        // query params, which left auth/callback without slug/name and so the
        // company row was never created (user exists, board doesn't). Reading
        // these back from metadata makes creation reliable.
        company_slug: slug || null,
        company_name: name || null,
        company_industry: industry || null,
        pending_company_id: companyId || null,
      },
    })

    const taken = 'An account with this email already exists. Try signing in instead.'
    let resumed = false

    if (createErr) {
      const exists = createErr.message?.toLowerCase().includes('already') || createErr.status === 422
      if (!exists) return NextResponse.json({ error: createErr.message }, { status: 500 })

      // The web flow stops here: the browser tab still has the confirmation
      // email waiting for it, so a second signup really is a duplicate.
      if (!wantCode) return NextResponse.json({ error: taken }, { status: 409 })

      // The app's flow can be interrupted — the account is created a screen
      // BEFORE the code is entered, so backing out of that screen leaves an
      // unconfirmed account that the same person cannot sign in to and cannot
      // sign up with either. Dead end, and they did nothing wrong.
      //
      // Supabase tells the two cases apart: correct credentials on an
      // unconfirmed account fail specifically with email_not_confirmed, while a
      // wrong password fails as invalid credentials. So the same password that
      // made the account is proof enough to send a fresh code and let them pick
      // the flow back up. Anything else is a genuine duplicate.
      const probe = await createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      ).auth.signInWithPassword({ email, password })

      if (probe.data?.session) return NextResponse.json({ error: taken }, { status: 409 })
      const why = `${(probe.error as any)?.code || ''} ${probe.error?.message || ''}`
      if (!/email[_ ]not[_ ]confirmed|not confirmed/i.test(why)) {
        return NextResponse.json({ error: taken }, { status: 409 })
      }
      resumed = true
    }

    const user = created?.user || null
    if (!user && !resumed) return NextResponse.json({ error: 'User creation failed' }, { status: 500 })

    // 2. Generate the confirmation link for this exact user
    const baseUrl = 'https://colvy.com'
    const redirectTo = companyId
      ? `${baseUrl}/auth/callback?company_id=${companyId}`
      : `${baseUrl}/auth/callback?slug=${encodeURIComponent(slug || '')}&name=${encodeURIComponent(name || '')}&industry=${encodeURIComponent(industry || '')}`

    const { data: linkData, error: linkError } = await (admin.auth.admin as any).generateLink({
      type: 'signup',
      email,
      password, // required by generateLink for type 'signup'
      options: { redirectTo },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Link generation error:', linkError)
      // User was created but link generation failed — still return success
      // with a flag so the client can offer a resend option
      return NextResponse.json({ ok: true, userId: user?.id || null, resumed, emailSent: false, linkError: linkError?.message })
    }

    const confirmLink = linkData.properties.action_link
    // Supabase issues both forms of the same confirmation: a link for a browser
    // and a six-digit code for anywhere there isn't one.
    const emailOtp = linkData.properties.email_otp
    const boardName = name || 'Your Board'
    const boardUrl = slug ? `${slug}.colvy.com` : 'colvy.com'

    // Asked for a code and Supabase did not give one — send nothing rather than
    // a link, because the app is about to ask for six digits and a link would
    // leave the user with no way to answer. Reported so resend can be offered.
    if (wantCode && !emailOtp) {
      return NextResponse.json({
        ok: true, userId: user?.id || null, resumed, emailSent: false,
        emailError: 'Confirmation code could not be generated',
      })
    }

    // 3. Send the confirmation email via Resend
    const RESEND_KEY = process.env.RESEND_API_KEY
    let emailSent = false
    let emailError: string | null = null
    if (RESEND_KEY) {
      const resendRes = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'Colvy <noreply@updates.colvy.com>',
          to: [email],
          subject: wantCode ? `${emailOtp} is your Colvy confirmation code` : 'Confirm your email address — Colvy',
          html: wantCode ? `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:40px 24px">
              <h1 style="font-size:28px;font-weight:800;color:#0d0d0d;margin:0 0 8px">Welcome to Colvy! 🎉</h1>
              <p style="font-size:16px;color:#6b7280;margin:0 0 28px">Enter this code in the Colvy app to confirm your email address.</p>
              <div style="background:#fff4f1;border-radius:12px;padding:24px;text-align:center;margin-bottom:28px">
                <p style="font-size:34px;font-weight:800;color:#ff7a6b;letter-spacing:8px;margin:0">${emailOtp}</p>
              </div>
              ${slug ? `
              <div style="background:#fafafa;border-radius:12px;padding:16px 20px;margin-bottom:28px">
                <p style="font-size:13px;font-weight:600;color:#9ca3af;margin:0 0 4px">YOUR BOARD URL</p>
                <p style="font-size:16px;font-weight:800;color:#ff7a6b;margin:0">${boardUrl}</p>
              </div>
              ` : ''}
              <hr style="border:none;border-top:1px solid #f0f0f0;margin:32px 0">
              <p style="font-size:12px;color:#9ca3af;margin:0">
                This code expires in an hour. If you didn't sign up for Colvy, you can safely ignore this email — nobody can use the code without it.
              </p>
            </div>
          ` : `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:40px 24px">
              <h1 style="font-size:28px;font-weight:800;color:#0d0d0d;margin:0 0 8px">Welcome to Colvy! 🎉</h1>
              <p style="font-size:16px;color:#6b7280;margin:0 0 32px">Please confirm your email address to activate your account.</p>
              ${slug ? `
              <div style="background:#fff4f1;border-radius:12px;padding:16px 20px;margin-bottom:28px">
                <p style="font-size:13px;font-weight:600;color:#9ca3af;margin:0 0 4px">YOUR BOARD URL</p>
                <p style="font-size:16px;font-weight:800;color:#ff7a6b;margin:0">${boardUrl}</p>
              </div>
              ` : ''}
              <a href="${confirmLink}"
                style="display:block;background:#ff7a6b;color:#fff;text-align:center;padding:16px 0;border-radius:12px;font-weight:700;font-size:16px;text-decoration:none;margin-bottom:24px">
                ✓ Confirm my email address
              </a>
              <p style="font-size:13px;color:#9ca3af;margin:0 0 8px">If the button above doesn't work, copy and paste this link into your browser:</p>
              <p style="font-size:12px;color:#9ca3af;word-break:break-all;margin:0 0 32px">${confirmLink}</p>
              <hr style="border:none;border-top:1px solid #f0f0f0;margin:32px 0">
              <p style="font-size:12px;color:#9ca3af;margin:0">
                This link expires in 24 hours. If you didn't sign up for Colvy, you can safely ignore this email.
              </p>
            </div>
          `,
        }),
      })
      if (resendRes.ok) {
        emailSent = true
      } else {
        const err = await resendRes.json().catch(() => ({}))
        console.error('Resend send error:', err)
        emailError = err?.message || err?.error || JSON.stringify(err)
      }
    } else {
      console.warn('RESEND_API_KEY not set — confirmation email was not sent')
      emailError = 'RESEND_API_KEY not configured on the server'
    }

    return NextResponse.json({ ok: true, userId: user?.id || null, resumed, emailSent, emailError })
  } catch (err: any) {
    console.error('Server signup error:', err)
    return NextResponse.json({ error: err.message || 'Signup failed' }, { status: 500 })
  }
}
