import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionSubdomain } from '@/lib/provision-domain'

export const dynamic = 'force-dynamic'

// Final step of the multi-step signup wizard. Runs only after BOTH the email and
// SMS codes were verified (tracked on signup_verifications.token). Creates the
// auth user (already email-confirmed, since we verified it ourselves), the
// company with its full business profile, and the owner's team membership — then
// provisions the subdomain and seeds sample content, mirroring /api/companies.

const TRIAL_DAYS = 14

function admin() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return NextResponse.json({ error: 'Server misconfigured' }, { status: 500 })
    }
    const body = await req.json()
    const token = String(body.token || '')
    const password = String(body.password || '')
    const fullName = String(body.fullName || '').trim()
    const biz = body.business || {}
    const slug = String(biz.slug || '').toLowerCase().trim()
    const name = String(biz.name || '').trim()

    if (!token) return NextResponse.json({ error: 'Missing signup session' }, { status: 400 })
    if (password.length < 6) return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    if (!name || !slug) return NextResponse.json({ error: 'Business name and URL are required' }, { status: 400 })

    const db = admin()

    // 1. The verification row must exist, be unexpired, unconsumed, and BOTH
    //    channels verified — this is what proves the email + phone are real.
    const { data: row } = await db.from('signup_verifications').select('*').eq('token', token).maybeSingle()
    if (!row) return NextResponse.json({ error: 'This signup session has expired. Please start again.' }, { status: 404 })
    if (row.consumed_at) return NextResponse.json({ error: 'This signup session is already complete.' }, { status: 409 })
    if (new Date(row.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: 'This signup session has expired. Please start again.', code: 'expired' }, { status: 410 })
    }
    if (!row.email_verified || !row.sms_verified) {
      return NextResponse.json({ error: 'Please verify both your email and mobile number first.' }, { status: 403 })
    }

    const email = String(row.email || '').toLowerCase()

    // 2. Create the auth user, already confirmed (we verified the email via OTP).
    const { data: created, error: createErr } = await db.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        display_name: fullName || email.split('@')[0],
        full_name: fullName || null,
        company: name,
        company_name: name,
        company_slug: slug,
        company_industry: biz.industry || null,
      },
    })
    if (createErr) {
      if (createErr.message?.toLowerCase().includes('already') || createErr.status === 422) {
        return NextResponse.json({ error: 'An account with this email already exists. Try signing in instead.', code: 'email_in_use' }, { status: 409 })
      }
      return NextResponse.json({ error: createErr.message }, { status: 500 })
    }
    const user = created?.user
    if (!user) return NextResponse.json({ error: 'User creation failed' }, { status: 500 })

    // Small wait for auth.users to commit before FK inserts (matches /api/companies).
    await new Promise(r => setTimeout(r, 800))

    // 3. Create the company with the full business profile.
    const companyInsert: any = {
      owner_id: user.id,
      slug, name,
      industry: biz.industry || '',
      accent_color: '#ff7a6b',
      plan: 'trial',
      trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(),
      website: biz.website || null,
      business_address: biz.address || null,
      business_city: biz.city || null,
      business_state: biz.state || null,
      business_postcode: biz.postcode || null,
      business_country: biz.country || null,
      business_phone: biz.phone || null,
      business_mobile: row.phone || null,
      business_hours: biz.hours || null,
    }
    const { data: company, error: coErr } = await db.from('companies').insert(companyInsert).select().single()
    if (coErr) {
      // Slug collision — the account exists but the board doesn't. Roll the user
      // back so they can retry with a different URL cleanly.
      if (coErr.code === '23505') {
        try { await db.auth.admin.deleteUser(user.id) } catch {}
        return NextResponse.json({ error: 'That board URL is already taken. Please choose another.', code: 'slug_taken' }, { status: 409 })
      }
      return NextResponse.json({ error: coErr.message }, { status: 400 })
    }

    // 4. Owner membership with the person's name (so it shows across the app).
    try {
      await db.from('team_members').insert({
        company_id: company.id, user_id: user.id, email,
        role: 'owner', status: 'active',
        name: fullName || null,
      })
    } catch { /* ensure-domain will backfill membership if this raced */ }

    // 5. Provision subdomain + seed (mirrors /api/companies; non-fatal).
    let domain: any = null
    try { domain = await provisionSubdomain(`${slug}.colvy.com`) } catch (e: any) { domain = { ok: false, error: e?.message } }
    try {
      const { seedCompanyData } = await import('@/lib/seedCompany')
      seedCompanyData(company.id, company.name).catch(() => {})
    } catch { /* non-fatal */ }

    // 6. Consume the verification row so it can't be reused.
    try { await db.from('signup_verifications').update({ consumed_at: new Date().toISOString() }).eq('token', token) } catch {}

    return NextResponse.json({ ok: true, userId: user.id, email, slug, company: { id: company.id, slug: company.slug }, domain })
  } catch (err: any) {
    console.error('[complete-signup]', err)
    return NextResponse.json({ error: err.message || 'Signup failed' }, { status: 500 })
  }
}
