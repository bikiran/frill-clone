import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  let slug = searchParams.get('slug')
  let name = searchParams.get('name')
  let industry = searchParams.get('industry')
  const companyId = searchParams.get('company_id')
  const next = searchParams.get('next') || '/onboarding'

  const origin = req.nextUrl.origin

  // Detect company subdomain from request host (e.g. acme.colvy.com)
  const host = req.headers.get('host') || ''
  let subdomainSlug: string | null = null
  if (host.endsWith('.colvy.com')) {
    const sub = host.split('.')[0]
    if (sub && sub !== 'www' && sub !== 'admin' && sub !== 'colvy') {
      subdomainSlug = sub
    }
  }

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

    // New signup with company info in URL params — explicit intent to create a company,
    // always takes priority over host-based subdomain detection below.
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

    // Company subdomain signup/signin — join company as viewer, redirect to board
    if ((companyId || subdomainSlug) && data.user) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })

      // Resolve the company either by id (email signup param) or by slug (subdomain host)
      let company: any = null
      if (companyId) {
        const res = await (adminClient as any).from('companies').select('id, slug').eq('id', companyId).single()
        company = res.data
      } else if (subdomainSlug) {
        const res = await (adminClient as any).from('companies').select('id, slug').eq('slug', subdomainSlug).single()
        company = res.data
      }

      if (company) {
        // Add user to the company as viewer (skip if already a member)
        const existing = await (adminClient as any).from('team_members')
          .select('id').eq('email', data.user.email).maybeSingle()
        if (!existing.data) {
          await (adminClient as any).from('team_members').insert({
            email: data.user.email,
            user_id: data.user.id,
            company_id: company.id,
            role: 'viewer',
            status: 'active',
          })
        }
        // Redirect to the company board
        return NextResponse.redirect(`https://${company.slug}.colvy.com/`)
      }
    }

    // No company params — user confirmed email but needs to complete signup
    // Redirect to onboarding to enter company details
    return NextResponse.redirect(`${origin}/onboarding`)
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(err.message)}`)
  }
}
