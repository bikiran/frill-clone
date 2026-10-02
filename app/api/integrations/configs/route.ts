import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'

export const dynamic = 'force-dynamic'

// Settings for the general integrations (Slack, Jira, …) — one set per
// business. The table is server-only; every call checks the caller belongs to
// the business, and saving needs edit rights.

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const INTEGRATIONS = ['slack', 'jira', 'linear', 'trello', 'zapier', 'github', 'intercom', 'zendesk', 'webhook']
const NEEDS_MIGRATION = 'Integration settings need a quick database update (migration V329) before they can be saved.'

// Plain string settings only, kept small.
function cleanConfig(raw: any): Record<string, string> {
  const out: Record<string, string> = {}
  if (!raw || typeof raw !== 'object') return out
  for (const [k, v] of Object.entries(raw).slice(0, 30)) {
    if (!/^[a-z0-9_]{1,40}$/i.test(k)) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') out[k] = String(v).slice(0, 2000)
  }
  return out
}

export async function GET(req: NextRequest) {
  const db = admin()
  const companyId = req.nextUrl.searchParams.get('companyId') || ''
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data, error } = await db.from('integration_configs').select('integration_id, config, enabled, events').eq('company_id', companyId)
  if (error) return NextResponse.json({ configs: [], needsMigration: /company_id/.test(error.message) })
  return NextResponse.json({ configs: data || [] })
}

export async function POST(req: NextRequest) {
  const db = admin()
  const b = await req.json().catch(() => ({}))
  const companyId = String(b.companyId || '')
  const integrationId = String(b.integrationId || '')
  if (!INTEGRATIONS.includes(integrationId)) return NextResponse.json({ error: 'Unknown integration' }, { status: 400 })
  const access = await requireCompanyAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  // Viewers can look but not change settings.
  const { data: co } = await db.from('companies').select('owner_id').eq('id', companyId).maybeSingle()
  if (co?.owner_id !== access.userId) {
    const { data: tm } = await db.from('team_members').select('role').eq('company_id', companyId).eq('user_id', access.userId).limit(1)
    const role = tm?.[0]?.role
    if (tm?.length && !['owner', 'admin', 'editor'].includes(role)) return NextResponse.json({ error: "You don't have permission to change integrations." }, { status: 403 })
  }

  const row = {
    company_id: companyId,
    integration_id: integrationId,
    config: cleanConfig(b.config),
    enabled: !!b.enabled,
    events: Array.isArray(b.events) ? b.events.filter((e: any) => typeof e === 'string').slice(0, 20).map((e: string) => e.slice(0, 60)) : [],
    updated_at: new Date().toISOString(),
  }
  const { error } = await db.from('integration_configs').upsert(row, { onConflict: 'company_id,integration_id' })
  if (error) {
    const migration = /company_id|no unique|ON CONFLICT/i.test(error.message)
    return NextResponse.json({ error: migration ? NEEDS_MIGRATION : 'Could not save the settings.' }, { status: migration ? 503 : 500 })
  }
  return NextResponse.json({ ok: true })
}
