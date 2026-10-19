import { requireCompanyAccess, requireCompanyAdmin } from '@/lib/company-access'
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { toE164 } from '@/lib/phone'
import { cleanRouting, defaultRouting, validateRouting, routingForwards, routingUsesAi } from '@/lib/call-routing'
import { callTakers, forwardingAllowed, isMissing } from '@/lib/call-routing-server'
import { getPhoneAgent, businessClosedNow, ensureStatusCallbacks } from '@/lib/phone-agent'
import { agentsPaused } from '@/lib/agent/pilot'
import { resolveAgentName } from '@/lib/agent-name'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)
type Db = ReturnType<typeof admin>

// Call routing for each of a business's numbers (lib/call-routing): ring
// everyone at once (the default), ring in order, forward to an outside number,
// or a phone menu. Shown on Settings → Calls & SMS.
//
// Twilio numbers only. Colvy's main voice network (Twilio, where every number
// Colvy sells now lives) runs calls from TwiML webhooks, which is what the ring
// steps, forwarding and the menu are built on. The few numbers still on the
// older Telnyx network run on its call-control events instead
// (app/api/telnyx/webhook), so they keep ringing everyone at once, and the card
// says so for those numbers (as the AI receptionist does).
//
// GET: staff of the business. PUT (save): its owner or an admin, with the
// config checked here (validateRouting) against the team and the business's
// own numbers before it's saved.

type NumberRow = { id: string | null; phoneNumber: string; label: string | null; primary: boolean; supported: boolean }

async function companyNumbers(db: Db, companyId: string): Promise<NumberRow[]> {
  const [{ data: co }, { data: rows }, { data: integ }] = await Promise.all([
    db.from('companies').select('number_provider').eq('id', companyId).maybeSingle(),
    db.from('phone_numbers').select('*').eq('company_id', companyId).neq('status', 'released').order('is_primary', { ascending: false }).order('created_at', { ascending: true }),
    db.from('twilio_integrations').select('phone_number').eq('company_id', companyId).maybeSingle(),
  ])
  const companyTwilio = co?.number_provider !== 'telnyx'
  const out: NumberRow[] = (rows || []).filter((r: any) => toE164(r.phone_number)).map((r: any) => ({
    id: r.id, phoneNumber: toE164(r.phone_number), label: r.label || null, primary: !!r.is_primary,
    supported: r.provider ? r.provider === 'twilio' : companyTwilio,
  }))
  // A legacy number that only lives on the Twilio settings row.
  const legacy = toE164(integ?.phone_number || '')
  if (legacy && !out.some(n => n.phoneNumber === legacy)) out.push({ id: null, phoneNumber: legacy, label: null, primary: !out.length, supported: true })
  return out
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const [numbers, saved, takers, agent, paused, closedNow, fwdOk, canEdit, { data: integ }, { data: co }] = await Promise.all([
    companyNumbers(db, companyId),
    Promise.resolve(db.from('call_routing').select('phone_number, config, updated_at').eq('company_id', companyId)).then(r => r, e => ({ data: null, error: e })),
    callTakers(db, companyId),
    getPhoneAgent(db, companyId),
    agentsPaused(db, companyId).then(p => p.paused, () => false),
    businessClosedNow(db, companyId).catch(() => null),
    forwardingAllowed(db, companyId),
    requireCompanyAdmin(req, db, companyId).then(a => a.ok, () => false),
    db.from('twilio_integrations').select('ring_seconds, voicemail_enabled').eq('company_id', companyId).maybeSingle(),
    db.from('companies').select('name').eq('id', companyId).maybeSingle(),
  ])
  const available = !(saved as any).error
  if ((saved as any).error && !isMissing((saved as any).error)) console.error('[call routing] read failed', (saved as any).error?.message)
  const byNumber = new Map<string, any>(((saved as any).data || []).map((r: any) => [toE164(r.phone_number), r]))
  const team = takers
    ? (await Promise.all(takers.slice(0, 60).map(async id => ({ id, name: await resolveAgentName(db, id, companyId) })))).sort((a, b) => a.name.localeCompare(b.name))
    : []
  return NextResponse.json({
    available, canEdit, businessName: co?.name || '',
    numbers: numbers.map(n => {
      const row = byNumber.get(n.phoneNumber)
      return { ...n, config: row ? cleanRouting(row.config) : defaultRouting(), saved: !!row, updatedAt: row?.updated_at || null }
    }),
    team,
    ringSeconds: Math.max(20, Number(integ?.ring_seconds) || 25),
    voicemailEnabled: integ?.voicemail_enabled !== false,
    ai: { enabled: agent.enabled, mode: agent.mode, alsoNoAnswer: agent.alsoNoAnswer, paused, available: agent.enabled && !paused },
    hoursKnown: closedNow !== null,
    forwardAllowed: fwdOk,
  })
}

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body?.companyId
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    const access = await requireCompanyAdmin(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: access.notAdmin ? 'Only the owner or an admin can change call routing.' : 'Not authorized' }, { status: 403 })

    const phoneNumber = toE164(String(body.phoneNumber || ''))
    const numbers = await companyNumbers(db, companyId)
    const number = numbers.find(n => n.phoneNumber === phoneNumber)
    if (!number) return NextResponse.json({ error: 'That number isn’t one of yours.' }, { status: 400 })
    if (!number.supported) return NextResponse.json({ error: 'Call routing works on numbers on Colvy’s main voice network. Contact Colvy to move this number across.' }, { status: 400 })

    const [members, fwdOk, agent] = await Promise.all([
      callTakers(db, companyId),
      forwardingAllowed(db, companyId),
      getPhoneAgent(db, companyId),
    ])
    if (!members) return NextResponse.json({ error: 'Couldn’t check your team just now. Try again in a moment.' }, { status: 503 })
    const checked = validateRouting(body.config, {
      members: new Set(members),
      ownNumbers: new Set(numbers.map(n => n.phoneNumber)),
      forwardAllowed: fwdOk,
      aiAvailable: agent.enabled,
    })
    if ('problems' in checked) return NextResponse.json({ error: checked.problems[0], problems: checked.problems }, { status: 400 })
    const config = checked.config

    const now = new Date().toISOString()
    const { error } = await db.from('call_routing').upsert({
      company_id: companyId, phone_number: phoneNumber, phone_number_id: number.id,
      config, updated_by: access.userId || null, updated_at: now,
    }, { onConflict: 'company_id,phone_number' })
    if (error) {
      if (isMissing(error)) return NextResponse.json({ error: 'Call routing needs a quick database update first (COLVY_V399_CALL_ROUTING.sql). Until then, calls ring everyone at once.' }, { status: 503 })
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    // A phone menu needs the number's status callback (a caller who hangs up
    // in the menu is a missed call): Colvy numbers bought before they had one
    // get it now, as the AI receptionist does.
    if (config.strategy === 'menu') {
      const backfill = () => ensureStatusCallbacks(admin(), companyId, [phoneNumber])
      try { after(backfill) } catch { void backfill() }
    }
    return NextResponse.json({ ok: true, phoneNumber, config, saved: true, updatedAt: now, forwards: routingForwards(config), usesAi: routingUsesAi(config) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not save' }, { status: 500 })
  }
}
