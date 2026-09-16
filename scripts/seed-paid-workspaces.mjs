#!/usr/bin/env node
/**
 * Seed a couple of PAID test workspaces you can log into and exercise the
 * plan-gated features (Inbox, SMS, AI, white-label branding).
 *
 * It mirrors the app's own creation flow: an auth user (email pre-confirmed so
 * you can sign in immediately), a companies row on a paid plan (no trial), and
 * an owner team_member. Re-runnable — existing users/companies are reused and
 * their plan is updated rather than duplicated.
 *
 * REQUIRES (never hard-coded — read from the environment):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY        (service role — bypasses RLS; keep secret)
 * OPTIONAL:
 *   SEED_PASSWORD                    (shared login password; default below)
 *
 * Run from the repo root, e.g.:
 *   vercel env pull .env.seed        # or export the two vars yourself
 *   set -a && . ./.env.seed && set +a
 *   node scripts/seed-paid-workspaces.mjs
 */

import { createClient } from '@supabase/supabase-js'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!URL || !KEY) {
  console.error('✗ Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment first.')
  process.exit(1)
}

const PASSWORD = process.env.SEED_PASSWORD || 'ColvyTest!2026'

// The workspaces to create. Edit freely. `plan` must be one of the canonical
// tiers in lib/plan.ts: 'omnichannel' (Inbox), 'everything', 'feedback',
// 'enterprise'. Both below are paid so you can test the gated features.
const WORKSPACES = [
  {
    name: 'Test — Inbox Plan',
    slug: 'test-inbox',
    email: 'test-inbox@colvy-test.com',
    plan: 'omnichannel',
    industry: 'Retail & Ecommerce',
    accent: '#2b59ff',
  },
  {
    name: 'Test — Everything Plan',
    slug: 'test-everything',
    email: 'test-everything@colvy-test.com',
    plan: 'everything',
    industry: 'Café & Hospitality',
    accent: '#ff6a4d',
  },
  {
    name: 'Test — Feedback Plan',
    slug: 'test-feedback',
    email: 'test-feedback@colvy-test.com',
    plan: 'feedback',
    industry: 'SaaS & Software',
    accent: '#7c5cff',
  },
]

const db = createClient(URL, KEY, { auth: { autoRefreshToken: false, persistSession: false } })

// Find an existing auth user by email (createUser doesn't return the existing
// one), paging through the admin list.
async function findUserByEmail(email) {
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = (data?.users || []).find((u) => (u.email || '').toLowerCase() === email.toLowerCase())
    if (hit) return hit
    if (!data?.users?.length || data.users.length < 200) break
  }
  return null
}

async function ensureUser(email, password) {
  const { data, error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // pre-confirmed → can sign in right away, no email sent
    user_metadata: { display_name: email.split('@')[0] },
  })
  if (!error && data?.user) return { user: data.user, created: true }
  // Already exists → look it up and reset the password so login is predictable.
  const existing = await findUserByEmail(email)
  if (!existing) throw error || new Error(`Could not create or find user ${email}`)
  await db.auth.admin.updateUserById(existing.id, { password, email_confirm: true })
  return { user: existing, created: false }
}

async function ensureCompany(ws, ownerId) {
  const { data: existing } = await db
    .from('companies').select('id, slug, plan').eq('slug', ws.slug).maybeSingle()
  const patch = {
    owner_id: ownerId,
    name: ws.name,
    plan: ws.plan,
    trial_ends_at: null,          // paid, not on trial
    is_complimentary: false,
    plan_changed_at: new Date().toISOString(),
    accent_color: ws.accent,
    industry: ws.industry,
  }
  if (existing) {
    await db.from('companies').update(patch).eq('id', existing.id)
    return { id: existing.id, created: false }
  }
  const { data, error } = await db
    .from('companies').insert({ slug: ws.slug.toLowerCase().trim(), ...patch })
    .select('id').single()
  if (error) throw error
  return { id: data.id, created: true }
}

async function ensureOwnerMember(companyId, userId, email) {
  await db.from('team_members').upsert(
    { company_id: companyId, user_id: userId, email, role: 'owner', status: 'active' },
    { onConflict: 'company_id,email' },
  )
}

async function main() {
  console.log(`\nSeeding ${WORKSPACES.length} paid test workspace(s)…\n`)
  const results = []
  for (const ws of WORKSPACES) {
    try {
      const { user, created: userCreated } = await ensureUser(ws.email, PASSWORD)
      const { id: companyId, created: coCreated } = await ensureCompany(ws, user.id)
      await ensureOwnerMember(companyId, user.id, ws.email)
      results.push({ ...ws, ok: true, userCreated, coCreated, companyId })
      console.log(`✓ ${ws.name}  (${ws.plan})  user ${userCreated ? 'created' : 'reused'}, company ${coCreated ? 'created' : 'updated'}`)
    } catch (e) {
      results.push({ ...ws, ok: false, error: e.message })
      console.error(`✗ ${ws.name}: ${e.message}`)
    }
  }

  console.log('\n──────── Login details ────────')
  for (const r of results.filter((x) => x.ok)) {
    console.log(`\n  ${r.name}  [${r.plan}]`)
    console.log(`    Sign in : https://colvy.com/login`)
    console.log(`    Email   : ${r.email}`)
    console.log(`    Password: ${PASSWORD}`)
    console.log(`    Board   : https://${r.slug}.colvy.com  (needs subdomain provisioning; the app works via /admin after login)`)
  }
  console.log('\nNote: subdomains are not auto-provisioned by this script. If a')
  console.log('board URL 404s, add it in the platform-admin domains tool or via /api/domains.\n')

  if (results.some((r) => !r.ok)) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
