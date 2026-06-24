import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const slug = searchParams.get('slug')
  const name = searchParams.get('name')
  const industry = searchParams.get('industry')
  const next = searchParams.get('next') || '/admin'

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

    // New signup with pending company
    if (slug && name && data.user) {
      const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
      const adminClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
        auth: { autoRefreshToken: false, persistSession: false }
      })
      await (adminClient as any).from('companies').insert({
        owner_id: data.user.id,
        slug: slug.toLowerCase(),
        name: decodeURIComponent(name),
        industry: decodeURIComponent(industry || ''),
        accent_color: '#ff7a6b',
      }).select().single()
      return NextResponse.redirect(`${origin}/onboarding`)
    }

    return NextResponse.redirect(`${origin}${next}`)
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(err.message)}`)
  }
}
