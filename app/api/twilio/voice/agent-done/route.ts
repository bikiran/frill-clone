import { twilioSignatureOk } from '@/lib/twilio-signature'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { phoneVoicemailTwiml, phoneGoodbyeTwiml, aiCallMissed, NO_VOICEMAIL_SAY, TROUBLE_SAY, type PhoneCallState } from '@/lib/phone-agent'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
const twiml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } })

// Twilio comes here when a real-time phone agent session ends (<Connect
// action>). The relay asks for voicemail by ending with handoffData
// {"action":"voicemail"}; a session that failed (relay unreachable) also goes
// to voicemail, so a caller is never left with silence. With voicemail
// switched off they hear a goodbye instead, and it's a missed call (unless it
// was a test call or the AI took a message: see aiCallMissed).
export async function POST(req: NextRequest) {
  const form = await req.formData()
  if (!(await twilioSignatureOk(req, form))) return new NextResponse('Forbidden', { status: 403 })
  const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
  const sp = req.nextUrl.searchParams
  const callRowId = sp.get('callRowId') || ''
  const companyId = sp.get('companyId') || ''
  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')

  let handoff: any = {}
  try { handoff = JSON.parse(get('HandoffData') || '{}') } catch {}
  const failed = get('SessionStatus') === 'failed'
  if (!(handoff?.action === 'voicemail' || failed)) return twiml('<Response><Hangup/></Response>')

  const db = admin()
  const { data: call } = await db.from('calls').select('id, company_id, conversation_id, routing_state').eq('id', callRowId).maybeSingle()
  if (!call || call.company_id !== companyId) return twiml('<Response><Hangup/></Response>')
  const state: PhoneCallState | null = call.routing_state?.phone_agent || null
  const voice: string = call.routing_state?.phone_voice || 'Polly.Olivia-Neural'
  const { data: integ } = await db.from('twilio_integrations').select('voicemail_enabled, voicemail_greeting').eq('company_id', companyId).maybeSingle()
  if (failed) console.error('[phone agent] relay session failed', get('ErrorCode'), get('ErrorMessage'))
  if (integ?.voicemail_enabled === false) {
    await aiCallMissed(db, call, failed ? `relay session failed ${get('ErrorCode') || ''} and voicemail is off`.replace(/\s+/g, ' ') : 'pressed 0 for voicemail, which is off')
    return twiml(phoneGoodbyeTwiml(voice, failed ? TROUBLE_SAY : NO_VOICEMAIL_SAY))
  }
  await db.from('calls').update({
    status: 'voicemail_greeting', is_voicemail: true,
    ...(failed ? { cause: `phone_agent: relay session failed ${get('ErrorCode')} ${get('ErrorMessage')}`.trim() } : {}),
  }).eq('id', call.id)
  const greeting = integ?.voicemail_greeting || 'Please leave a message after the tone.'
  const recCb = `${base}/api/twilio/voice/recording?callRowId=${encodeURIComponent(call.id)}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(call.conversation_id || '')}&kind=voicemail`
  void state
  return twiml(phoneVoicemailTwiml(voice, failed ? `Sorry, I’m having trouble on my end. ${greeting}` : greeting, recCb))
}
