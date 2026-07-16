import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET current inbound-call settings for a company.
export async function GET(req: NextRequest) {
  const companyId = new URL(req.url).searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()
  const { data } = await db.from('telnyx_integrations')
    .select('ring_seconds, voicemail_enabled, voicemail_greeting')
    .eq('company_id', companyId).maybeSingle()
  return NextResponse.json({
    ring_seconds: data?.ring_seconds ?? 25,
    voicemail_enabled: data?.voicemail_enabled ?? true,
    voicemail_greeting: data?.voicemail_greeting || 'Thanks for calling. We are sorry we can not take your call right now. Please leave a message after the tone and we will get back to you.',
  })
}

// POST to update them.
export async function POST(req: NextRequest) {
  try {
    const { companyId, ring_seconds, voicemail_enabled, voicemail_greeting } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()
    const patch: any = {}
    if (ring_seconds !== undefined) patch.ring_seconds = Math.max(5, Math.min(60, Number(ring_seconds)))
    if (voicemail_enabled !== undefined) patch.voicemail_enabled = !!voicemail_enabled
    if (voicemail_greeting !== undefined) patch.voicemail_greeting = String(voicemail_greeting).slice(0, 500)
    await db.from('telnyx_integrations').update(patch).eq('company_id', companyId)
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
