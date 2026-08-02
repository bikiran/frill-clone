import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { seedHarbourBean, demoAdmin, DEMO_EMAIL, DEMO_SLUG, demoPassword } from '@/lib/demo-seed'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

// POST /api/demo/session — mint a login session for the shared showcase.
// The demo password lives only on the server; we sign in here and hand the
// tokens back so the client can establish a session on the demo subdomain via
// /auth/handoff. Ensures the showcase exists (seeds it on first hit).
export async function POST(_req: NextRequest) {
  try {
    const admin = demoAdmin()
    // Ensure the demo company + user exist and are fully seeded. Seeds on first
    // run, and self-heals a partial/empty seed (e.g. a previous timed-out
    // attempt) — safe now that seeding is batched and fast.
    const { data: co } = await admin.from('companies').select('id, is_demo').eq('slug', DEMO_SLUG).maybeSingle()
    if (!co) {
      await seedHarbourBean(admin)
    } else {
      try {
        const { count } = await admin.from('conversations').select('id', { count: 'exact', head: true }).eq('company_id', co.id)
        if ((count || 0) < 20) await seedHarbourBean(admin)
      } catch {}
    }
    // Sign in as the demo user with the anon client to get real session tokens.
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } })
    const { data, error } = await anon.auth.signInWithPassword({ email: DEMO_EMAIL, password: demoPassword() })
    if (error || !data?.session) {
      return NextResponse.json({ error: 'Demo is warming up — please try again in a moment.' }, { status: 503 })
    }
    // Best-effort session analytics.
    try {
      const { data: c2 } = await admin.from('companies').select('id').eq('slug', DEMO_SLUG).maybeSingle()
      if (c2?.id) {
        admin.from('demo_analytics').insert({ company_id: c2.id, event: 'session_start' })
        admin.from('demo_workspaces').update({ last_login_at: new Date().toISOString() }).eq('company_id', c2.id).eq('demo_type', 'shared_showcase')
      }
    } catch {}
    return NextResponse.json({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      slug: DEMO_SLUG,
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not start demo session' }, { status: 500 })
  }
}
