import { requireCompanyAccess, isStaffRow } from '@/lib/company-access'
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPhoneAgent, setPhoneAgent, cleanPhoneAgent, PHONE_VOICES, PHONE_STT, MAX_TEST_NUMBERS, relayConfigured, phoneBookable, businessClosedNow } from '@/lib/phone-agent'
import { MAX_GREETING } from '@/lib/phone-receptionist'
import { getPhoneCatalog, refreshPhoneCatalog } from '@/lib/phone-catalog'
import { agentsPaused } from '@/lib/agent/pilot'
import { resolveAgentName } from '@/lib/agent-name'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// The AI receptionist's settings: on/off, when it answers (test numbers, out
// of hours, when nobody answers, always), the numbers it always answers, its
// voice, greeting, skills, things it never discusses and how it files
// call-back tasks. Twilio numbers only for now; Telnyx numbers carry on as they
// are.
type Db = ReturnType<typeof admin>

async function provider(db: Db, companyId: string) {
  return (await company(db, companyId)).provider
}
async function company(db: Db, companyId: string): Promise<{ provider: 'telnyx' | 'twilio'; name: string }> {
  const { data } = await db.from('companies').select('number_provider, name').eq('id', companyId).maybeSingle()
  return { provider: data?.number_provider === 'telnyx' ? 'telnyx' : 'twilio', name: data?.name || '' }
}

// Who call-back tasks can be assigned to: the owner and the team (not board
// visitors or removed members). null when the team couldn't be read, so a
// database blip is never mistaken for an assignee having left.
async function teamIds(db: Db, companyId: string): Promise<string[] | null> {
  const [{ data: co, error: coErr }, { data: rows, error: rowsErr }] = await Promise.all([
    db.from('companies').select('owner_id').eq('id', companyId).maybeSingle(),
    db.from('team_members').select('user_id, role, status').eq('company_id', companyId).not('user_id', 'is', null).limit(200),
  ])
  if (coErr || rowsErr) return null
  const staff = (rows || []).filter(isStaffRow).map(r => String(r.user_id))
  return Array.from(new Set<string>([co?.owner_id ? String(co.owner_id) : '', ...staff].filter(Boolean)))
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const [settings, co, catalog, paused, bookable, closedNow, ids, { data: integ }] = await Promise.all([
    getPhoneAgent(db, companyId), company(db, companyId), getPhoneCatalog(db, companyId), agentsPaused(db, companyId),
    phoneBookable(db, companyId), businessClosedNow(db, companyId),
    teamIds(db, companyId).catch(() => null),
    db.from('twilio_integrations').select('ring_seconds, voicemail_enabled').eq('company_id', companyId).maybeSingle(),
  ])
  const team = ids
    ? (await Promise.all(ids.slice(0, 60).map(async id => ({ id, name: await resolveAgentName(db, id, companyId) }))))
      .sort((a, b) => a.name.localeCompare(b.name))
    // The team couldn't be read: the saved assignee still shows (and is kept on save).
    : settings.tasks.assigneeId ? [{ id: settings.tasks.assigneeId, name: settings.tasks.assigneeName || 'Team member' }] : []
  // A call-back assignee who has since left the team gets no tasks (the calls
  // check), so the card shows "Nobody" and its form matches what it shows.
  const tasks = ids && settings.tasks.assigneeId && !ids.includes(settings.tasks.assigneeId)
    ? { ...settings.tasks, assigneeId: null, assigneeName: null } : settings.tasks
  return NextResponse.json({
    ...settings, tasks, voices: PHONE_VOICES, sttOptions: PHONE_STT, maxTestNumbers: MAX_TEST_NUMBERS, supported: co.provider === 'twilio', realtime: relayConfigured(),
    companyName: co.name,
    productNames: catalog?.names?.length || 0,
    // For the card's summary and hints.
    ringSeconds: Math.max(20, Number(integ?.ring_seconds) || 25), voicemailEnabled: integ?.voicemail_enabled !== false,
    paused: paused.paused, bookable, hoursKnown: closedNow !== null, team,
  })
}

// Fields the card can send; any left out keep their saved value.
const FIELDS = ['enabled', 'testNumbers', 'voice', 'stt', 'mode', 'alsoNoAnswer', 'greeting', 'skills', 'neverDiscuss', 'tasks'] as const

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body?.companyId
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const current = await getPhoneAgent(db, companyId)
    const next: Record<string, unknown> = { ...current }
    for (const k of FIELDS) if (body[k] !== undefined) next[k] = body[k]
    if (body.testNumbers !== undefined && !Array.isArray(body.testNumbers)) next.testNumbers = String(body.testNumbers || '').split(/[,\n]/)
    const tasks: Record<string, unknown> = { ...current.tasks, ...(body.tasks && typeof body.tasks === 'object' ? body.tasks : {}) }

    if (String(next.greeting || '').trim().length > MAX_GREETING) return NextResponse.json({ error: `Keep the greeting under ${MAX_GREETING} characters.` }, { status: 400 })
    const check = cleanPhoneAgent(next)
    if (check.enabled && (await provider(db, companyId)) !== 'twilio') return NextResponse.json({ error: 'The AI receptionist works with Twilio numbers for now.' }, { status: 400 })
    if (check.enabled && check.mode === 'test' && !check.testNumbers.length) {
      return NextResponse.json({ error: 'Add at least one test number, like your mobile.' }, { status: 400 })
    }
    // The assignee must be on this business's team; their name comes from us, not the browser.
    // One saved earlier who has since left the team is quietly cleared, so it
    // can't block every other change (turning the AI off included). When the
    // team can't be read just now, the saved assignee stays as they are, and
    // a new pick has to wait for a retry.
    const assigneeId = String(tasks.assigneeId || tasks.assignee_id || '')
    const team = assigneeId ? await teamIds(db, companyId) : []
    const kept = assigneeId === current.tasks.assigneeId
    if (!team) {
      if (!kept) return NextResponse.json({ error: 'Couldn’t check your team just now. Try again in a moment.' }, { status: 503 })
      next.tasks = { ...tasks, assigneeId, assignee_id: undefined, assigneeName: current.tasks.assigneeName, assignee_name: undefined }
    } else {
      const onTeam = !!assigneeId && team.includes(assigneeId)
      if (assigneeId && !onTeam && !kept) return NextResponse.json({ error: 'Pick someone on your team for call-back tasks.' }, { status: 400 })
      if (onTeam) {
        next.tasks = { ...tasks, assigneeId, assignee_id: undefined, assigneeName: await resolveAgentName(db, assigneeId, companyId), assignee_name: undefined }
      } else next.tasks = { ...tasks, assigneeId: null, assignee_id: null, assigneeName: null, assignee_name: null }
    }

    const saved = await setPhoneAgent(db, companyId, next, access.userId || null)
    // Read the store's product names now, so the next call already knows them.
    if (saved.enabled) {
      const refresh = () => refreshPhoneCatalog(admin(), companyId, { force: true }).then(() => {})
      try { after(refresh) } catch { void refresh() }
    }
    return NextResponse.json({ ok: true, ...saved })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not save' }, { status: 500 })
  }
}
