import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionSubdomain } from '@/lib/provision-domain'
import { boardSlugAllowed } from '@/lib/reserved-subdomains'
import { publicUrlProblem } from '@/lib/site-crawl'

const SUPER_ADMIN_EMAIL = 'bishalstha76@gmail.com'

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

// ── Logo and website from the new-workspace flow ───────────────────────────────

const IMAGE_TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/gif': 'gif', 'image/x-icon': 'ico', 'image/vnd.microsoft.icon': 'ico' }

/** Copy a website's icon into Colvy's storage, so the workspace logo doesn't
 *  depend on that site. Public addresses only (checked on every redirect),
 *  images only, up to 1 MB. Returns the stored address, or null. */
async function copyIcon(admin: any, companyId: string, url: string): Promise<string | null> {
  let current = url
  for (let hop = 0; hop < 4; hop++) {
    if (await publicUrlProblem(current)) return null
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    try {
      const res = await fetch(current, { redirect: 'manual', signal: ctrl.signal, headers: { 'User-Agent': 'ColvyBot/1.0 (+https://colvy.com)' } })
      if (res.status >= 300 && res.status < 400 && res.headers.get('location')) { current = new URL(res.headers.get('location')!, current).toString(); continue }
      const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase()
      const ext = IMAGE_TYPES[type]
      if (!res.ok || !ext) return null
      const bytes = new Uint8Array(await res.arrayBuffer())
      if (!bytes.length || bytes.length > 1_000_000) return null
      const path = `logos/${companyId}-${Date.now()}.${ext}`
      for (const bucket of ['settings', 'idea-images']) {
        const { error } = await admin.storage.from(bucket).upload(path, bytes, { contentType: type, upsert: true })
        if (!error) return admin.storage.from(bucket).getPublicUrl(path).data?.publicUrl || null
      }
      return null
    } catch { return null } finally { clearTimeout(t) }
  }
  return null
}

/** Save the logo (an upload, or the website's icon) and the website, if given.
 *  Best effort: a workspace is never refused over its branding. */
async function applyBrand(admin: any, company: any, body: any) {
  try {
    const logo = typeof body?.logoUrl === 'string' ? body.logoUrl.trim() : ''
    if (/^https:\/\//i.test(logo) && logo.length <= 600) {
      const ours = !!process.env.NEXT_PUBLIC_SUPABASE_URL && logo.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL)
      const stored = ours ? logo : await copyIcon(admin, company.id, logo)
      if (stored) { await admin.from('companies').update({ logo_url: stored }).eq('id', company.id); company.logo_url = stored }
    }
    const site = typeof body?.website === 'string' ? body.website.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '') : ''
    if (/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(site) && site.length <= 120) {
      await admin.from('companies').update({ website: `https://${site}` }).eq('id', company.id)
    }
  } catch (e: any) { console.warn('[companies] branding not saved:', e?.message || e) }
}
