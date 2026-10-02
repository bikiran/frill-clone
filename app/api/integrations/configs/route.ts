import { NextRequest, NextResponse } from 'next/server'
import { adminDb, generalIntegration, integrationAccess, maskSecret } from '@/lib/integration-access'
import { normaliseEvents } from '@/lib/integrations-catalog'
import { checkPublicUrl } from '@/lib/integration-events'

export const dynamic = 'force-dynamic'

// Settings for the general integrations (Slack, Jira, …) — one set per
// business. The table is server-only; every call checks the caller belongs to
// the business, and saving needs edit rights. Secrets (tokens, webhook URLs)
// are never sent back to the browser: GET returns "••••1234" for them, and a
// save that leaves one blank keeps the stored value.

const NEEDS_MIGRATION = 'Integration settings need a quick database update (migration V329) before they can be saved.'

export async function GET(req: NextRequest) {
  const db = adminDb()
  const companyId = req.nextUrl.searchParams.get('companyId') || ''
  const access = await integrationAccess(req, db, companyId)
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })
  const { data, error } = await db.from('integration_configs').select('integration_id, config, enabled, events').eq('company_id', companyId)
  if (error) return NextResponse.json({ configs: [], needsMigration: /company_id/.test(error.message) })
  const configs = (data || []).map((row: any) => {
    const def = generalIntegration(row.integration_id)
    const config: Record<string, string> = {}
    const secrets: Record<string, string> = {}
    for (const [k, v] of Object.entries(row.config || {})) {
      if (def?.fields?.find(f => f.key === k)?.secret) secrets[k] = maskSecret(v)
      else config[k] = String(v ?? '')
    }
    return { integration_id: row.integration_id, config, secrets, enabled: !!row.enabled, events: normaliseEvents(row.events) }
  })
  return NextResponse.json({ configs })
}

export async function POST(req: NextRequest) {
  const db = adminDb()
  const b = await req.json().catch(() => ({}))
  const companyId = String(b.companyId || '')
  const def = generalIntegration(String(b.integrationId || ''))
  if (!def) return NextResponse.json({ error: 'Unknown integration' }, { status: 400 })
  const access = await integrationAccess(req, db, companyId, { edit: true })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { data: existing, error: readErr } = await db.from('integration_configs').select('config').eq('company_id', companyId).eq('integration_id', def.id).maybeSingle()
  if (readErr && /company_id/.test(readErr.message)) return NextResponse.json({ error: NEEDS_MIGRATION }, { status: 503 })
  const prev: Record<string, any> = existing?.config || {}

  // Only this integration's fields; a blank secret keeps the saved one.
  const config: Record<string, string> = {}
  for (const f of def.fields || []) {
    const raw = b.config?.[f.key]
    const v = typeof raw === 'string' || typeof raw === 'number' ? String(raw).trim().slice(0, 2000) : ''
    if (v) config[f.key] = v
    else if (f.secret && prev[f.key]) config[f.key] = String(prev[f.key])
  }
  const enabled = !!b.enabled
  if (enabled) {
    const missing = (def.fields || []).filter(f => !f.optional && !config[f.key])
    if (missing.length) return NextResponse.json({ error: `Fill in ${missing.map(f => f.label.toLowerCase()).join(', ')} before switching it on.` }, { status: 400 })
  }
  // Addresses we'll call must be public https.
  for (const f of def.fields || []) {
    if (f.type === 'url' && config[f.key] && f.key !== 'board_url') {
      const bad = await checkPublicUrl(config[f.key])
      if (bad) return NextResponse.json({ error: `${f.label}: ${bad}` }, { status: 400 })
    }
  }
  if (def.id === 'slack' && config.webhook_url && !/^https:\/\/hooks\.slack\.com\//.test(config.webhook_url)) return NextResponse.json({ error: 'That isn’t a Slack incoming webhook URL (it starts with https://hooks.slack.com/).' }, { status: 400 })
  if (def.id === 'zapier' && config.webhook_url && !/^https:\/\/hooks\.zapier\.com\//.test(config.webhook_url)) return NextResponse.json({ error: 'That isn’t a Zapier catch hook URL (it starts with https://hooks.zapier.com/).' }, { status: 400 })

  const allowed = def.events?.length ? def.events : null
  const events = normaliseEvents(b.events).filter(e => !allowed || allowed.includes(e)).slice(0, 40)
  const row = { company_id: companyId, integration_id: def.id, config, enabled, events, updated_at: new Date().toISOString() }
  const { error } = await db.from('integration_configs').upsert(row, { onConflict: 'company_id,integration_id' })
  if (error) {
    const migration = /company_id|no unique|ON CONFLICT/i.test(error.message)
    return NextResponse.json({ error: migration ? NEEDS_MIGRATION : 'Could not save the settings.' }, { status: migration ? 503 : 500 })
  }
  const secrets: Record<string, string> = {}
  for (const f of def.fields || []) if (f.secret && config[f.key]) secrets[f.key] = maskSecret(config[f.key])
  return NextResponse.json({ ok: true, secrets })
}

