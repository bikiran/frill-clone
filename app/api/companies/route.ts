import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { userId, slug, name, industry, accentColor, description, plan } = await req.json()

    if (!userId || !slug || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false }
    })

    // Small wait for auth.users to commit
    await new Promise(r => setTimeout(r, 800))

    const { data, error } = await (admin as any).from('companies').insert({
      owner_id: userId,
      slug: slug.toLowerCase().trim(),
      name: name.trim(),
      industry: industry || '',
      accent_color: accentColor || '#ff7a6b',
      description: description || '',
      plan: plan || 'free',
    }).select().single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'URL already taken' }, { status: 409 })
      if (error.code === '23503') {
        // FK timing — retry once
        await new Promise(r => setTimeout(r, 2000))
        const { data: d2, error: e2 } = await (admin as any).from('companies').insert({
          owner_id: userId, slug: slug.toLowerCase().trim(), name: name.trim(),
          industry: industry || '', accent_color: accentColor || '#ff7a6b',
          description: description || '', plan: plan || 'free',
        }).select().single()
        if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })
        return NextResponse.json({ company: d2 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ company: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
