import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionSubdomain } from '@/lib/provision-domain'

export async function POST(req: NextRequest) {
  try {
    const { userId, slug, name, industry, accentColor, description, plan } = await req.json()

    if (!userId || !slug || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // New workspaces start a 14-day trial (unless a specific plan is passed, e.g.
    // an admin provisioning a paid/complimentary account). The trial_ends_at
    // drives the in-app countdown + upgrade wall and the super-admin trial funnel.
    const TRIAL_DAYS = 14
    const chosenPlan = plan || 'trial'
    const trialFields = chosenPlan === 'trial'
      ? { trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString() }
      : {}

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
      plan: chosenPlan,
      ...trialFields,
    }).select().single()

    if (error) {
      if (error.code === '23505') return NextResponse.json({ error: 'URL already taken' }, { status: 409 })
      if (error.code === '23503') {
        await new Promise(r => setTimeout(r, 2000))
        const { data: d2, error: e2 } = await admin.from('companies').insert({
          owner_id: userId, slug: slug.toLowerCase().trim(), name: name.trim(),
          industry: industry || '', accent_color: accentColor || '#ff7a6b',
          description: description || '', plan: chosenPlan, ...trialFields,
        }).select().single()
        if (e2) return NextResponse.json({ error: e2.message }, { status: 400 })
        
        // Seed data for new company (non-blocking)
        const { seedCompanyData } = await import('@/lib/seedCompany')
        seedCompanyData(d2.id, d2.name).catch(console.error)
        
        return NextResponse.json({ company: d2 })
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Register the subdomain with Vercel + Cloudflare BEFORE returning. This was
    // previously a fire-and-forget fetch to /api/domains, but a serverless
    // function is frozen as soon as it returns its response, so that background
    // request was routinely killed and the domain never got added — leaving the
    // new board on a 404'd subdomain. Call the provisioner directly and await it
    // (it never throws — returns a structured result).
    let domain: any = null
    if (data?.id) {
      try { domain = await provisionSubdomain(`${data.slug}.colvy.com`) } catch (e: any) { domain = { ok: false, error: e?.message } }

      // Seed sample data — safe to leave non-blocking (the board renders without
      // it and onboarding's ensure-domain re-seeds if it's still empty).
      try {
        const { seedCompanyData } = await import('@/lib/seedCompany')
        seedCompanyData(data.id, data.name).catch(console.error)
      } catch { /* non-fatal */ }
    }

    return NextResponse.json({ company: data, domain })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
