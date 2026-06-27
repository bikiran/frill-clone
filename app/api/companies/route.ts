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
    }) as any

    // Small wait for auth.users to commit
    await new Promise(r => setTimeout(r, 800))

    const { data, error } = await admin.from('companies').insert({
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
        await new Promise(r => setTimeout(r, 2000))
        const { data: d2, error: e2 } = await admin.from('companies').insert({
          owner_id: userId, slug: slug.toLowerCase().trim(), name: name.trim(),
          industry: industry || '', accent_color: accentColor || '#ff7a6b',
          description: description || '', plan: plan || 'free',
        }).select().single()
        if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })
        
        // Seed data for new company (non-blocking)
        const { seedCompanyData } = await import('@/lib/seedCompany')
        seedCompanyData(d2.id, d2.name).catch(console.error)
        
        return NextResponse.json({ company: d2 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Seed sample data + register subdomain (both non-blocking)
    if (data?.id) {
      const { seedCompanyData } = await import('@/lib/seedCompany')
      seedCompanyData(data.id, data.name).catch(console.error)

      // Register subdomain with Vercel + Cloudflare
      const newSlug = data.slug
      const baseUrl = process.env.NEXTAUTH_URL || 'https://colvy.com'
      fetch(`${baseUrl}/api/domains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain: `${newSlug}.colvy.com` }),
      }).catch(() => {})
    }

    return NextResponse.json({ company: data })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
