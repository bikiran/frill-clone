import { createClient } from '@supabase/supabase-js'
import { provisionSubdomain } from './provision-domain'

export type CreateWorkspaceInput = {
  userId: string
  email?: string | null
  name: string
  slug: string
  industry?: string | null
}

// One shape rather than a discriminated union: this project compiles with
// `strict: false`, which switches off the literal-type narrowing a
// `{ ok: true } | { ok: false }` union depends on, so callers could not read
// `error` off a failure without a cast.
export type CreateWorkspaceResult = {
  ok: boolean
  company?: any
  domain?: any
  created?: boolean
  error?: string
  status?: number
}

const TRIAL_DAYS = 14

/**
 * Create a workspace and everything that has to exist alongside it.
 *
 * Board creation used to be written out three times — in /api/companies, in
 * the email-confirmation callback, and in onboarding — and the three drifted:
 * one forgot the owner's team_members row, another fired the subdomain
 * registration into a serverless function that had already returned. Each
 * omission produced the same symptom from the user's side, a board that
 * half-exists, so they are gathered here.
 *
 * The four steps, in the order they have to happen:
 *
 *   1. The companies row, on a 14-day trial.
 *   2. The creator's OWNER membership. Admin access is granted on owner_id OR
 *      an owner/admin membership; without the row, anything that reads
 *      memberships (the team screen, the mobile app's workspace list) cannot
 *      see them at all.
 *   3. The subdomain, AWAITED. A serverless function is frozen the moment it
 *      responds, so registering in the background is registering never — that
 *      is how boards ended up on a 404'ing address.
 *   4. Sample content, which genuinely can run late.
 *
 * Idempotent on the caller's behalf: if this user already owns a workspace,
 * that one is returned rather than a second one created.
 */
export async function createWorkspace(input: CreateWorkspaceInput): Promise<CreateWorkspaceResult> {
  const name = (input.name || '').trim()
  const slug = (input.slug || '').toLowerCase().trim()
  if (!input.userId || !name || !slug) {
    return { ok: false, error: 'Workspace name and address are required', status: 400 }
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!serviceKey) return { ok: false, error: 'Server misconfigured', status: 500 }
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  }) as any

  // Already done — a retried request, or a second tap on a slow connection.
  const { data: owned } = await admin.from('companies')
    .select('*').eq('owner_id', input.userId).limit(1).maybeSingle()
  if (owned) {
    await ensureOwnerMembership(admin, owned.id, input.userId, input.email)
    return { ok: true, company: owned, domain: null, created: false }
  }

  const { data: company, error } = await admin.from('companies').insert({
    owner_id: input.userId,
    slug,
    name,
    industry: input.industry || '',
    accent_color: '#ff7a6b',
    plan: 'trial',
    trial_ends_at: new Date(Date.now() + TRIAL_DAYS * 86400000).toISOString(),
  }).select().single()

  if (error) {
    // 23505 is the unique index on slug: somebody took the address between the
    // availability check and this insert.
    if (error.code === '23505') return { ok: false, error: 'That address is already taken', status: 409 }
    return { ok: false, error: error.message, status: 400 }
  }

  await ensureOwnerMembership(admin, company.id, input.userId, input.email)

  let domain: any = null
  try { domain = await provisionSubdomain(`${company.slug}.colvy.com`) }
  catch (e: any) { domain = { ok: false, error: e?.message || String(e) } }

  try {
    const { seedCompanyData } = await import('./seedCompany')
    seedCompanyData(company.id, company.name).catch((e: any) =>
      console.warn('[createWorkspace] seed failed', e?.message || e))
  } catch (e: any) {
    console.warn('[createWorkspace] seed import failed', e?.message || e)
  }

  return { ok: true, company, domain, created: true }
}

async function ensureOwnerMembership(admin: any, companyId: string, userId: string, email?: string | null) {
  try {
    const { data: existing } = await admin.from('team_members')
      .select('id').eq('company_id', companyId).eq('user_id', userId).maybeSingle()
    if (existing) return
    await admin.from('team_members').insert({
      email: email || null, user_id: userId, company_id: companyId,
      role: 'owner', status: 'active',
    })
  } catch (e: any) {
    // Never fatal: owner_id alone still grants admin, so a failure here costs
    // visibility in member lists, not access.
    console.warn('[createWorkspace] owner membership insert failed', e?.message || e)
  }
}
