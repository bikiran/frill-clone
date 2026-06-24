import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const code = searchParams.get('code')
  const slug = searchParams.get('slug')
  const name = searchParams.get('name')
  const industry = searchParams.get('industry')
  const type = searchParams.get('type') // 'recovery' for password reset

  const origin = req.nextUrl.origin

  if (!code) return NextResponse.redirect(`${origin}/signin?error=no_code`)

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    )

    const { data, error } = await (supabase as any).auth.exchangeCodeForSession(code)
    if (error) throw error

    // Password reset — redirect to reset page
    if (type === 'recovery') {
      return NextResponse.redirect(`${origin}/reset-password?confirmed=1`)
    }

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

    return NextResponse.redirect(`${origin}/admin`)
  } catch (err: any) {
    return NextResponse.redirect(`${origin}/signin?error=${encodeURIComponent(err.message)}`)
  }
}
