import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getPhoneAgent, setPhoneAgent, PHONE_VOICES, PHONE_STT, MAX_TEST_NUMBERS, relayConfigured } from '@/lib/phone-agent'
import { getPhoneCatalog, refreshPhoneCatalog } from '@/lib/phone-catalog'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// The AI phone agent's settings (test stage): on/off, the numbers it answers,
// and its voice. Twilio numbers only for now.
async function provider(db: any, companyId: string) {
  const { data } = await db.from('companies').select('number_provider').eq('id', companyId).maybeSingle()
  return data?.number_provider === 'telnyx' ? 'telnyx' : 'twilio'
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const [settings, prov, catalog] = await Promise.all([getPhoneAgent(db, companyId), provider(db, companyId), getPhoneCatalog(db, companyId)])
  return NextResponse.json({
    ...settings, voices: PHONE_VOICES, sttOptions: PHONE_STT, maxTestNumbers: MAX_TEST_NUMBERS, supported: prov === 'twilio', realtime: relayConfigured(),
    productNames: catalog?.names?.length || 0,
  })
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const companyId = body?.companyId
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    const access = await requireCompanyAccess(req, db, companyId)
    if (!access.ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (body.enabled && (await provider(db, companyId)) !== 'twilio') return NextResponse.json({ error: 'The phone agent works with Twilio numbers for now.' }, { status: 400 })
    const raw = Array.isArray(body.testNumbers) ? body.testNumbers : String(body.testNumbers || '').split(/[,\n]/)
    if (body.enabled && !raw.some((n: any) => String(n || '').replace(/\D/g, '').length >= 8)) {
      return NextResponse.json({ error: 'Add at least one test number, like your mobile.' }, { status: 400 })
    }
    const saved = await setPhoneAgent(db, companyId, { enabled: !!body.enabled, testNumbers: raw, voice: body.voice, stt: body.stt }, access.userId || null)
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
