import { NextRequest, NextResponse } from 'next/server'

// Direct email sending via Resend API
// This bypasses Supabase's built-in email rate limit (2/hour in dev mode)
// Supabase should also be configured to use a custom SMTP (Resend) in the dashboard.
export async function POST(req: NextRequest) {
  try {
    const { email, slug, name, companyId, type } = await req.json()
    
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
    const { createClient } = await import('@supabase/supabase-js')
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data: linkData, error: linkError } = await (adminClient.auth.admin as any).generateLink({
      type: 'signup',
      email,
      options: { redirectTo },
    })

    if (linkError || !linkData?.properties?.action_link) {
      console.error('Link generation error:', linkError)
      return NextResponse.json({ error: linkError?.message || 'Could not generate confirmation link' }, { status: 500 })
    }

    const confirmLink = linkData.properties.action_link
    const boardName = name || 'Your Board'
    const boardUrl = slug ? `${slug}.colvy.com` : 'colvy.com'

    // Send via Resend
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Colvy <noreply@colvy.com>',
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
