import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionSubdomain } from '@/lib/provision-domain'
import { boardSlugAllowed } from '@/lib/reserved-subdomains'
import { applyBrand } from '@/lib/workspace-brand'
import { checkBurst } from '@/lib/rate-limit'

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'

// How many workspaces one person can create: a few an hour and a handful a day
// (a business with a few brands fits; a script making hundreds doesn't).
const PER_HOUR = 3
const PER_DAY = 10
const HOUR = 3600_000
const DAY = 24 * HOUR
const tooMany = (at: number) => NextResponse.json(
  { error: 'Too many workspace creation attempts. Please wait before trying again.', code: 'rate_limited', retryAt: new Date(at).toISOString() },
  { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil((at - Date.now()) / 1000))) } },
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { slug, name, industry, accentColor, description } = body
    // The owner is whoever is signed in. Anyone could create a workspace for any
    // user id on any plan (paid plans for free). Only the platform admin may
    // provision for someone else or choose the plan.
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    const authDb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
      auth: { autoRefreshToken: false, persistSession: false },
    }) as any
    const { data: who } = token ? await authDb.auth.getUser(token) : { data: null }
    const caller = who?.user
    if (!caller) return NextResponse.json({ error: 'Please sign in again.' }, { status: 401 })
    const platformAdmin = caller.email === SUPER_ADMIN_EMAIL
    const userId: string = platformAdmin && body.userId ? body.userId : caller.id
    const plan: string | undefined = platformAdmin ? body.plan : undefined

    if (!slug || !name) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    // The slug becomes {slug}.colvy.com on Vercel and Cloudflare: Colvy's own
    // names (admin, api, support, login…) and malformed URLs are refused here,
    // not just in the browser. The platform admin may still provision any.
    if (!platformAdmin && !boardSlugAllowed(String(slug).toLowerCase().trim())) {
      return NextResponse.json({ error: 'That board URL isn’t available. Please choose another.', code: 'slug_taken' }, { status: 409 })
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

    // The limit: attempts in a burst (in memory), then the workspaces they've
    // actually made in the last hour and day. The answer says when they can
    // try again. The platform admin isn't limited.
    if (!platformAdmin) {
      if (!checkBurst(`ws-create:${caller.id}`, 4)) return tooMany(Date.now() + 60_000)
      const { data: recent } = await admin.from('companies').select('created_at').eq('owner_id', userId)
        .gte('created_at', new Date(Date.now() - DAY).toISOString()).order('created_at', { ascending: true })
      const made = ((recent || []) as { created_at: string }[]).map(r => Date.parse(r.created_at)).filter(Number.isFinite)
      const lastHour = made.filter(t => t > Date.now() - HOUR)
      if (lastHour.length >= PER_HOUR) return tooMany(lastHour[0] + HOUR)
      if (made.length >= PER_DAY) return tooMany(made[0] + DAY)
    }

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
        await applyBrand(admin, d2, body)

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
    if (data?.id) await applyBrand(admin, data, body)
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
