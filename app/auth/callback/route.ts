import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  let slug = searchParams.get('slug')
  let name = searchParams.get('name')
  let industry = searchParams.get('industry')
  const next = searchParams.get('next') || '/onboarding'

  const origin = req.nextUrl.origin

  // No code — could be a hash-based token (password reset)
  // Redirect to client-side handler that can read the hash fragment
  if (!code) {
    return NextResponse.redirect(`${origin}/auth/confirm${req.nextUrl.search}`)
  }

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await (supabase as any).auth.exchangeCodeForSession(code)
    if (error) throw error

    // New signup with company info in URL params
    if (slug && name && data.user) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
      const co = await (adminClient as any).from('companies').insert({
        owner_id: data.user.id,
        slug: (slug || '').toLowerCase(),
        name: decodeURIComponent(name || ''),
        industry: decodeURIComponent(industry || ''),
        accent_color: '#ff7a6b',
      }).select().single()

      // Auto-register subdomain with Vercel
      if (co.data?.slug) {
        const domain = `${co.data.slug}.colvy.com`
        try {
          await fetch('https://api.vercel.com/v10/projects/' + (process.env.VERCEL_PROJECT_ID || '') + '/domains', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${process.env.VERCEL_TOKEN}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ name: domain }),
          })
        } catch (e) {
          console.warn('Vercel domain registration failed (non-blocking):', e)
        }
      }

      return NextResponse.redirect(`${origin}/onboarding`)
    }

    // No company params — user confirmed email but needs to complete signup
    // Redirect to onboarding to enter company details
    return NextResponse.redirect(`${origin}/onboarding`)
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(err.message)}`)
  }
}
