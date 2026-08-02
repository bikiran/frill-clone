import { NextRequest, NextResponse } from 'next/server'
import { demoAdmin, seedSampleData, wipeDemoData } from '@/lib/demo-seed'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const SUPER_ADMIN = 'bishalstha76@gmail.com'

const TEMPLATE_META: Record<string, { industry: string; accent: string }> = {
  cafe: { industry: 'Café & Hospitality', accent: '#0b8457' },
  retail: { industry: 'Retail & Ecommerce', accent: '#6366f1' },
  automotive: { industry: 'Automotive', accent: '#ef4444' },
  aquarium: { industry: 'Aquarium & Pet', accent: '#0891b2' },
}

async function requireSuperAdmin(req: NextRequest, db: any): Promise<boolean> {
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!token) return false
  try { const { data } = await db.auth.getUser(token); return data?.user?.email === SUPER_ADMIN } catch { return false }
}

function slugify(s: string) {
  return String(s || 'demo').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 28) || 'demo'
}

// GET — list demo workspaces (registry joined with company status).
export async function GET(req: NextRequest) {
  const db = demoAdmin()
  if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const { data: rows, error } = await db.from('demo_workspaces').select('*').order('created_at', { ascending: false }).limit(200)
    if (error) { if (/does not exist|schema cache/i.test(error.message)) return NextResponse.json({ demos: [], missing: true }); throw error }
    const ids = Array.from(new Set((rows || []).map((r: any) => r.company_id).filter(Boolean)))
    const cos: Record<string, any> = {}
    if (ids.length) { const { data: c } = await db.from('companies').select('id,name,slug,plan,is_demo,demo_expires_at').in('id', ids); (c || []).forEach((x: any) => { cos[x.id] = x }) }

    // Analytics aggregates over the recent event stream.
    const analytics: any = { total: 0, byEvent: {} as Record<string, number>, recent: [] as any[] }
    try {
      const { data: ev } = await db.from('demo_analytics').select('event, meta, created_at, company_id').order('created_at', { ascending: false }).limit(500)
      analytics.total = (ev || []).length
      ;(ev || []).forEach((e: any) => { analytics.byEvent[e.event] = (analytics.byEvent[e.event] || 0) + 1 })
      analytics.recent = (ev || []).slice(0, 20)
    } catch { /* analytics optional */ }

    return NextResponse.json({ demos: (rows || []).map((r: any) => ({ ...r, company: cos[r.company_id] || null })), analytics })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}

// POST — create or act on a demo workspace.
export async function POST(req: NextRequest) {
  const db = demoAdmin()
  if (!(await requireSuperAdmin(req, db))) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  try {
    const body = await req.json()
    const op = body.op || 'create'

    if (op === 'create') {
      const template = (['cafe', 'retail', 'automotive', 'aquarium'].includes(body.template) ? body.template : 'cafe') as any
      const meta = TEMPLATE_META[template]
      const name = String(body.businessName || 'Demo Workspace').trim()
      const demoType = ['private_sales', 'internal_testing', 'trial', 'shared_showcase'].includes(body.demoType) ? body.demoType : 'private_sales'
      const days = Math.min(Math.max(Number(body.days) || 14, 1), 365)
      const externalSending = demoType === 'trial' ? true : false
      // Unique-ish slug.
      const base = slugify(name)
      const slug = `${base}-${Math.floor(Math.random() * 9000 + 1000)}`
      const expires = new Date(Date.now() + days * 86400000).toISOString()

      const { data: co, error: coErr } = await db.from('companies').insert({
        name, slug, plan: demoType === 'trial' ? 'trial' : 'pro',
        is_demo: demoType !== 'trial', demo_type: demoType, demo_template: template,
        external_sending_enabled: externalSending, demo_read_only: demoType !== 'trial' && demoType !== 'internal_testing',
        demo_expires_at: expires, accent_color: meta.accent, industry: meta.industry,
        business_email: body.contactEmail || null,
      }).select('id, slug').maybeSingle()
      if (coErr) {
        if (/does not exist|schema cache|column/i.test(coErr.message)) return NextResponse.json({ error: 'Run COLVY_V223_DEMO.sql first.' }, { status: 501 })
        throw coErr
      }
      const counts = await seedSampleData(db, co!.id, template)
      const { data: row } = await db.from('demo_workspaces').insert({
        company_id: co!.id, demo_type: demoType, template, business_name: name,
        contact_name: body.contactName || null, contact_email: body.contactEmail || null,
        slug: co!.slug, status: 'active', salesperson: body.salesperson || null,
        internal_notes: body.notes || null, external_sending: externalSending,
        read_only: demoType !== 'trial' && demoType !== 'internal_testing', expires_at: expires,
        last_reset_at: new Date().toISOString(),
      }).select('*').maybeSingle()
      try { await db.from('demo_analytics').insert({ company_id: co!.id, event: 'demo_created', meta: { demoType, template } }) } catch {}
      return NextResponse.json({ ok: true, demo: row, slug: co!.slug, counts })
    }

    // Operations on an existing demo (by demo_workspaces id).
    const { id } = body
    if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })
    const { data: dw } = await db.from('demo_workspaces').select('*').eq('id', id).maybeSingle()
    if (!dw) return NextResponse.json({ error: 'Demo not found' }, { status: 404 })
    const companyId = dw.company_id

    if (op === 'reset') {
      if (companyId) { await wipeDemoData(db, companyId); await seedSampleData(db, companyId, dw.template || 'cafe') }
      await db.from('demo_workspaces').update({ last_reset_at: new Date().toISOString() }).eq('id', id)
      try { await db.from('demo_analytics').insert({ company_id: companyId, event: 'demo_reset' }) } catch {}
      return NextResponse.json({ ok: true })
    }
    if (op === 'extend') {
      const days = Math.min(Math.max(Number(body.days) || 14, 1), 365)
      const base = dw.expires_at ? new Date(dw.expires_at).getTime() : Date.now()
      const expires = new Date(Math.max(base, Date.now()) + days * 86400000).toISOString()
      await db.from('demo_workspaces').update({ expires_at: expires, status: 'active' }).eq('id', id)
      if (companyId) await db.from('companies').update({ demo_expires_at: expires }).eq('id', companyId)
      return NextResponse.json({ ok: true, expires })
    }
    if (op === 'disable' || op === 'enable') {
      const status = op === 'disable' ? 'disabled' : 'active'
      await db.from('demo_workspaces').update({ status }).eq('id', id)
      return NextResponse.json({ ok: true, status })
    }
    if (op === 'convert') {
      // Turn the demo into a real 14-day trial: sending on, demo flags off.
      const trialEnds = new Date(Date.now() + 14 * 86400000).toISOString()
      if (companyId) await db.from('companies').update({ is_demo: false, demo_type: null, external_sending_enabled: true, demo_read_only: false, plan: 'trial', trial_ends_at: trialEnds }).eq('id', companyId)
      await db.from('demo_workspaces').update({ status: 'converted', conversion_status: 'trial' }).eq('id', id)
      try { await db.from('demo_analytics').insert({ company_id: companyId, event: 'demo_converted', meta: { to: 'trial' } }) } catch {}
      return NextResponse.json({ ok: true })
    }
    if (op === 'delete') {
      // Only ever delete a demo company, never a real tenant.
      if (companyId) {
        const { data: co } = await db.from('companies').select('is_demo').eq('id', companyId).maybeSingle()
        if (co?.is_demo) {
          await wipeDemoData(db, companyId, '')   // remove all data incl. team
          try { await db.from('companies').delete().eq('id', companyId) } catch {}
        }
      }
      await db.from('demo_workspaces').delete().eq('id', id)
      try { await db.from('demo_analytics').insert({ company_id: companyId, event: 'demo_deleted' }) } catch {}
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'Unknown op' }, { status: 400 })
  } catch (e: any) { return NextResponse.json({ error: e.message }, { status: 500 }) }
}
