import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { xmlEscape } from '@/lib/twilio-service'
import { setCallPreview } from '@/lib/call-card'
import { resolveAgentName } from '@/lib/agent-name'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const twiml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } })

// action= handler for an INBOUND call's ring-all <Dial>. If an agent answered,
// the dial is over and we end cleanly. If nobody picked up (no-answer/busy/
// failed), fall through to voicemail.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
    const sp = req.nextUrl.searchParams
    const callRowId = sp.get('callRowId') || ''
    const companyId = sp.get('companyId') || ''
    const conversationId = sp.get('conversationId') || ''
    const soloUser = sp.get('soloUser') || ''

    const dialStatus = (get('DialCallStatus') || '').toLowerCase()
    const durSecs = parseInt(get('DialCallDuration') || '0', 10) || 0
    // The SID of the child leg that actually answered (this callback ALWAYS
    // fires, unlike the per-<Client> "answered" callback). Map it back to the
    // agent via call_legs.
    const dialSid = get('DialCallSid')
    const db = admin()
    const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')

    // An agent answered → mark it and finish.
    if (dialStatus === 'completed' || dialStatus === 'answered') {
      if (callRowId) {
        try { await db.from('calls').update({ status: 'completed', answered_at: new Date().toISOString(), ended_at: new Date().toISOString(), ...(durSecs ? { duration_seconds: durSecs } : {}) }).eq('id', callRowId) } catch {}
        // Record WHO answered when the per-<Client> callback didn't. Prefer the
        // exact answering leg (call_legs mapping by DialCallSid — works even in a
        // simultaneous multi-agent ring); fall back to the solo-ring user id when
        // only one agent was rung. Claim only if still unattributed, so we never
        // overwrite a real answerer or double-fire.
        if (dialStatus === 'completed' && durSecs > 0) {
          let answerUser = ''
          if (dialSid) {
            try {
              const { data: leg } = await db.from('call_legs').select('user_id').eq('child_sid', dialSid).maybeSingle()
              answerUser = (leg as any)?.user_id || ''
            } catch {}
          }
          if (!answerUser && soloUser) answerUser = soloUser
          if (answerUser) {
            try {
              const name = await resolveAgentName(db, answerUser, companyId)
              const { data: claimed } = await db.from('calls')
                .update({ answered_by_user_id: answerUser, answered_by: name, agent_name: name })
                .eq('id', callRowId).is('answered_by_user_id', null)
                .select('id, contact_name, caller_name, from_number')
              // Notify the rest of the team who took it — once (claim-guarded, so
              // it never double-fires with the per-<Client> callback).
              if (Array.isArray(claimed) && claimed.length) {
                const row = claimed[0] as any
                const caller = String(row.contact_name || row.caller_name || row.from_number || '').trim()
                try {
                  await fetch(`${base}/api/push/send`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      companyId,
                      title: 'Call answered',
                      body: `${name} received the call${caller ? ` from ${caller}` : ''}`,
                      excludeUserId: answerUser,
                      channelId: 'calls',
                      ...(callRowId ? { route: `/call-detail/${callRowId}` } : {}),
                    }),
                  })
                } catch {}
              }
            } catch {}
          }
        }
      }
      // The call is over — show the outcome (with duration when we have it).
      try { await setCallPreview(db as any, conversationId, durSecs ? `📞 Call ended · ${Math.floor(durSecs / 60)}:${String(durSecs % 60).padStart(2, '0')}` : '📞 Call ended') } catch {}
      return twiml('<Response><Hangup/></Response>')
    }

    // Nobody answered → voicemail (if enabled).
    const { data: integ } = await db.from('twilio_integrations').select('voicemail_enabled, voicemail_greeting').eq('company_id', companyId).maybeSingle()
    if (integ?.voicemail_enabled === false) {
      if (callRowId) { try { await db.from('calls').update({ status: 'missed', ended_at: new Date().toISOString() }).eq('id', callRowId) } catch {} }
      try { await setCallPreview(db as any, conversationId, '📞 Missed call') } catch {}
      return twiml('<Response><Hangup/></Response>')
    }
    if (callRowId) { try { await db.from('calls').update({ status: 'voicemail_greeting', is_voicemail: true }).eq('id', callRowId) } catch {} }
    // Provisional — if they hang up without leaving a message it stays "Missed
    // call"; the recording callback upgrades it to "Voicemail" if one is left.
    try { await setCallPreview(db as any, conversationId, '📞 Missed call') } catch {}

    const greeting = integ?.voicemail_greeting || 'Please leave a message after the tone.'
    const cbQuery = `callRowId=${encodeURIComponent(callRowId)}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(conversationId)}&kind=voicemail`
    const recCb = `${base}/api/twilio/voice/recording?${cbQuery}`
    return twiml(
      `<Response>` +
        `<Say voice="Polly.Nicole">${xmlEscape(greeting)}</Say>` +
        `<Record maxLength="180" playBeep="true" trim="trim-silence" recordingStatusCallback="${xmlEscape(recCb)}" recordingStatusCallbackEvent="completed"/>` +
        `<Hangup/>` +
      `</Response>`
    )
  } catch {
    return twiml('<Response><Hangup/></Response>')
  }
}
