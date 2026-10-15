import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { loadBusinessHours, weekText, type BusinessHours } from '@/lib/business-hours'
import { resolveSmsSender } from '@/lib/sms-provider'
import {
  missedCallTextSettings, MISSED_CALL_TEXT_DEFAULT, MISSED_CALL_TEXT_MAX, type MissedCallTextSettings,
} from '@/lib/missed-call-text-settings'

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
//
// Also the missed-call text back (lib/missed-call-text): whether callers nobody
// answered get a text, what it says, and whether only when the business is
// closed. That one isn't tied to a provider, so it lives with the other
// automatic replies in companies.inbox_settings.missed_call_text.
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

// The opening hours "only when we're closed" goes by, so the screen can say
// which hours those are (or that there are none to go by). Google Business
// Profile is asked first, as when the text is sent, but the screen doesn't wait
// on it for long.
async function openingHours(db: ReturnType<typeof admin>, companyId: string): Promise<{ known: boolean; source?: string; summary?: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const slow = new Promise<null>(res => { timer = setTimeout(() => res(null), 2500) })
  let h: BusinessHours | null = await Promise.race([loadBusinessHours(db, companyId).catch(() => null), slow])
  clearTimeout(timer)
  if (!h) h = await loadBusinessHours(db, companyId, { google: false }).catch(() => null)
  const place = h?.places.find(p => Object.keys(p.week).length)
  if (!place) return { known: false }
  return { known: true, source: place.source === 'google' ? 'Google Business Profile' : 'your business details', summary: weekText(place.week) }
}

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const table = await providerTable(db, companyId)
  const [{ data }, { data: co }, hours, sender] = await Promise.all([
    db.from(table).select('ring_seconds, voicemail_enabled, voicemail_greeting').eq('company_id', companyId).maybeSingle(),
    db.from('companies').select('name, inbox_settings').eq('id', companyId).maybeSingle(),
    openingHours(db, companyId),
    resolveSmsSender(db, companyId).catch(() => null),
  ])
  const extra = {
    missedCallText: missedCallTextSettings(co?.inbox_settings),
    businessName: co?.name || '',
    hours,
    // No texting number → nothing would be sent; the screen says so.
    smsReady: !!sender,
  }
  if (!data) return NextResponse.json({ connected: false, ...shape(null), ...extra })
  return NextResponse.json({ connected: true, ...shape(data), ...extra })
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
    let text: MissedCallTextSettings | null = null
    if (body.missedCallText !== undefined) {
      const m = body.missedCallText && typeof body.missedCallText === 'object' ? body.missedCallText : {}
      const message = String(m.message ?? '').trim()
      if (message.length > MISSED_CALL_TEXT_MAX) return NextResponse.json({ error: `Keep the text under ${MISSED_CALL_TEXT_MAX} characters.` }, { status: 400 })
      if (m.when !== undefined && m.when !== 'always' && m.when !== 'after_hours') return NextResponse.json({ error: 'Choose when to send the text.' }, { status: 400 })
      text = { enabled: m.enabled === true, message: message || MISSED_CALL_TEXT_DEFAULT, when: m.when === 'after_hours' ? 'after_hours' : 'always' }
    }
    if (!Object.keys(patch).length && !text) return NextResponse.json({ error: 'Nothing to save' }, { status: 400 })

    const table = await providerTable(db, companyId)
    if (Object.keys(patch).length) {
      const { data, error } = await db.from(table).update(patch).eq('company_id', companyId).select('company_id').maybeSingle()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data) return NextResponse.json({ error: 'Set up calling first.' }, { status: 400 })
    }
    if (text) {
      // Merged into the latest settings, so automatic replies saved elsewhere
      // in the meantime are kept.
      const { data: co, error: readErr } = await db.from('companies').select('inbox_settings').eq('id', companyId).maybeSingle()
      if (readErr) return NextResponse.json({ error: readErr.message }, { status: 500 })
      const merged = { ...(co?.inbox_settings && typeof co.inbox_settings === 'object' ? co.inbox_settings : {}), missed_call_text: text }
      const { error } = await db.from('companies').update({ inbox_settings: merged }).eq('id', companyId)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    }

    const [{ data: row }, { data: co }] = await Promise.all([
      db.from(table).select('ring_seconds, voicemail_enabled, voicemail_greeting').eq('company_id', companyId).maybeSingle(),
      db.from('companies').select('inbox_settings').eq('id', companyId).maybeSingle(),
    ])
    return NextResponse.json({ ok: true, ...shape(row), missedCallText: missedCallTextSettings(co?.inbox_settings) })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not save' }, { status: 500 })
  }
}
