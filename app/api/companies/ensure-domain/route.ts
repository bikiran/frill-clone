import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { provisionSubdomain } from '@/lib/provision-domain'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Self-healing subdomain provisioning. Called automatically (e.g. from
// onboarding) so a board whose registration failed or never ran — a transient
// API hiccup, or a signup before the env vars were set — gets provisioned the
// next time its owner loads it, with no manual steps.
//
// Authenticated + scoped: it provisions ONLY the caller's own company slug, so
// this can't be abused to attach arbitrary domains to the project.
export async function POST(req: NextRequest) {
  try {
    const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const db = admin()
    const { data: auth } = await db.auth.getUser(token)
    const userId = auth?.user?.id
    if (!userId) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    // The caller's own board (oldest-owned = their primary), so the slug can't be
    // spoofed — we only ever provision a company this user owns.
    const { data: co } = await db.from('companies')
      .select('slug').eq('owner_id', userId)
      .order('created_at', { ascending: true }).limit(1).maybeSingle()
    if (!co?.slug) return NextResponse.json({ error: 'No board to provision' }, { status: 404 })

    const result = await provisionSubdomain(`${co.slug}.colvy.com`)
    return NextResponse.json({ ok: result.ok, ...result })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
