import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// What happens when nobody answers an incoming call: how long phones ring,
// whether the caller can leave a voicemail, and the greeting they hear. These
// live on the company's call provider row (telnyx_integrations or
// twilio_integrations, which also hold API keys, so the browser never reads
// them directly).
const DEFAULT_GREETING = 'Please leave a message after the tone.'
const RING_MIN = 20, RING_MAX = 60   // the webhook never rings for less than 20s

const shape = (r: any) => ({
  ringSeconds: Math.max(RING_MIN, Math.min(RING_MAX, Number(r?.ring_seconds) || 25)),
  voicemailEnabled: r?.voicemail_enabled !== false,
  voicemailGreeting: String(r?.voicemail_greeting || '').trim() || DEFAULT_GREETING,
})

async function providerTable(db: any, companyId: string): Promise<string> {
  const { data } = await db.from('companies').select('number_provider').eq('id', companyId).maybeSingle()
  return data?.number_provider === 'telnyx' ? 'telnyx_integrations' : 'twilio_integrations'
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const table = await providerTable(db, companyId)
  const { data } = await db.from(table).select('ring_seconds, voicemail_enabled, voicemail_greeting').eq('company_id', companyId).maybeSingle()
  if (!data) return NextResponse.json({ connected: false, ...shape(null) })
  return NextResponse.json({ connected: true, ...shape(data) })
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body?.companyId
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const patch: Record<string, any> = {}
    if (body.ringSeconds !== undefined) {
      const n = Math.round(Number(body.ringSeconds))
      if (!Number.isFinite(n) || n < RING_MIN || n > RING_MAX) return NextResponse.json({ error: `Ring time must be ${RING_MIN}–${RING_MAX} seconds.` }, { status: 400 })
      patch.ring_seconds = n
    }
    if (body.voicemailEnabled !== undefined) patch.voicemail_enabled = !!body.voicemailEnabled
    if (body.voicemailGreeting !== undefined) {
      const g = String(body.voicemailGreeting || '').trim()
      if (g.length > 500) return NextResponse.json({ error: 'Keep the greeting under 500 characters.' }, { status: 400 })
      patch.voicemail_greeting = g || DEFAULT_GREETING
    }
    if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })
    const table = await providerTable(db, companyId)
    const { data, error } = await db.from(table).update(patch).eq('company_id', companyId)
      .select('ring_seconds, voicemail_enabled, voicemail_greeting').maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    if (!data) return NextResponse.json({ error: 'Set up calling first.' }, { status: 400 })
    return NextResponse.json({ ok: true, ...shape(data) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not save' }, { status: 500 })
  }
}
