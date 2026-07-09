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
    const { email, password, name, slug, industry, companyId } = await req.json()

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
      },
    })

    if (createErr) {
      // Already registered — tell the client so it can show a helpful message
      if (createErr.message?.toLowerCase().includes('already') || createErr.status === 422) {
        return NextResponse.json({ error: 'An account with this email already exists. Try signing in instead.' }, { status: 409 })
      }
      return NextResponse.json({ error: createErr.message }, { status: 500 })
    }

    const user = created.user
    if (!user) return NextResponse.json({ error: 'User creation failed' }, { status: 500 })

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
      return NextResponse.json({ ok: true, userId: user.id, emailSent: false, linkError: linkError?.message })
    }

    const confirmLink = linkData.properties.action_link
    const boardName = name || 'Your Board'
    const boardUrl = slug ? `${slug}.colvy.com` : 'colvy.com'

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
          subject: 'Confirm your email address — Colvy',
          html: `
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

    return NextResponse.json({ ok: true, userId: user.id, emailSent, emailError })
  } catch (err: any) {
    console.error('Server signup error:', err)
    return NextResponse.json({ error: err.message || 'Signup failed' }, { status: 500 })
  }
}
