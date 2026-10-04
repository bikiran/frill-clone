import { NextRequest, NextResponse } from 'next/server'
import crypto from 'crypto'
import { adminDb, generalIntegration, integrationAccess } from '@/lib/integration-access'
import { INTEGRATION_EVENTS, eventLabel } from '@/lib/integrations-catalog'
import { adminBase, sampleEvent, send, testConnection } from '@/lib/integration-events'

export const dynamic = 'force-dynamic'

// POST { companyId, integrationId, mode: 'connection' | 'event', event?, config? }
//   connection → check the details work (signs in, finds the project/board…)
//   event      → send a sample event, exactly as a real one would be sent
// Uses the details on screen (so you can test before saving); a secret left
// blank falls back to the saved one.
export async function POST(req: NextRequest) {
  const db = adminDb()
  const b = await req.json().catch(() => ({}))
  const companyId = String(b.companyId || '')
  const def = generalIntegration(String(b.integrationId || ''))
  if (!def) return NextResponse.json({ error: 'Unknown integration' }, { status: 400 })
  const access = await integrationAccess(req, db, companyId, { edit: true })
  if (!access.ok) return NextResponse.json({ error: access.error }, { status: access.status })

  const { data: saved } = await db.from('integration_configs').select('config').eq('company_id', companyId).eq('integration_id', def.id).maybeSingle()
  const cfg: Record<string, string> = { ...(saved?.config || {}) }
  for (const f of def.fields || []) {
    const v = typeof b.config?.[f.key] === 'string' ? b.config[f.key].trim() : ''
    if (v) cfg[f.key] = v
    else if (!f.secret) delete cfg[f.key]
  }

  if (b.mode === 'connection') {
    const r = await testConnection(def.id, cfg)
    return NextResponse.json(r)
  }

  const event = INTEGRATION_EVENTS.some(e => e.id === b.event) ? String(b.event) : (def.defaultEvents?.[0] || 'order.created')
  const { data: co } = await db.from('companies').select('id, name, slug').eq('id', companyId).maybeSingle()
  const p = sampleEvent(event)
  const fields: Record<string, string> = {}
  for (const [k, v] of Object.entries(p.fields || {})) if (v !== null && v !== undefined) fields[k] = String(v)
  const env = {
    id: crypto.randomUUID(), event, event_label: eventLabel(event), created_at: new Date().toISOString(),
    company: { id: companyId, name: co?.name || 'Colvy' },
    data: { ...(p.data || {}), title: p.title, summary: p.summary || null, url: p.path ? adminBase(co) + p.path : null, customer: p.customer || null, fields },
  } as any
  const started = Date.now()
  let res
  try { res = await send(def.id, cfg, env) } catch (e: any) { res = { ok: false, error: e?.message || 'Failed' } }
  try {
    await db.from('integration_deliveries').insert({
      company_id: companyId, integration_id: def.id, event, title: p.title.slice(0, 300),
      status: res.skipped ? 'skipped' : res.ok ? 'sent' : 'failed', http_status: res.status ?? null,
      error: res.ok ? null : (res.error || 'Failed').slice(0, 500), ref_url: res.ref || null, test: true, duration_ms: Date.now() - started,
    })
  } catch {}
  return NextResponse.json({
    ok: res.ok && !res.skipped, ref: res.ref || null,
    message: res.skipped ? (res.error || 'Skipped') : res.ok ? `Sent “${eventLabel(event)}” test event.` : (res.error || 'Failed'),
  })
}
