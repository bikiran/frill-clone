import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { userId, slug, name, industry, accentColor } = await req.json()

    if (!userId || !slug || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Use service role key to bypass RLS
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )

    const { data, error } = await (supabaseAdmin as any).from('companies').insert({
      owner_id: userId,
      slug: slug.toLowerCase().trim(),
      name: name.trim(),
      industry: industry || '',
      accent_color: accentColor || '#ff7a6b',
    }).select().single()

    if (error) {
      if (error.message?.includes('duplicate') || error.code === '23505') {
        return NextResponse.json({ error: 'That URL is already taken' }, { status: 409 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ company: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
