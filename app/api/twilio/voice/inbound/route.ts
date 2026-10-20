import { twilioSignatureOk } from '@/lib/twilio-signature'
import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { companyForInboundNumber } from '@/lib/inbound-company'
import { ensureContactByPhone, findContactByPhone, isBlockedPhone } from '@/lib/contact-capture'
import { alertCall } from '@/lib/call-alerts'
import { getPhoneCatalog } from '@/lib/phone-catalog'
import { getPhoneAgent, answerWithAgent, businessClosedNow, phoneBookable, answersRealCallers, ensureStatusCallbacks } from '@/lib/phone-agent'
import { aiAnswerDecision, needsHoursCheck, mayAnswerAtStart } from '@/lib/phone-receptionist'
import { agentsPaused } from '@/lib/agent/pilot'
import { queueMissedCallText } from '@/lib/missed-call-text'
import { TWILIO_MASTER } from '@/lib/twilio-platform'
import { ringTwiml, voicemailTwiml, menuTwiml, menuFor, nextStep, planFor, routingNeedsHours, routingForwards, type CallCtx } from '@/lib/call-routing'
import { getCallRouting, ringTargets, forwardingAllowed, noteRouting, noteStep } from '@/lib/call-routing-server'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const twiml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } })

// Inbound Voice webhook for a Twilio number. Configure the number's "A call
// comes in" webhook to POST here. Rings every online agent's browser client;
// falls back to voicemail when nobody's available or nobody answers.
//
// Call routing (lib/call-routing): a number can instead ring people in order,
// forward to an outside number, or play a phone menu. With no routing saved
// (or before V399 runs) everything below behaves exactly as it always has.
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    // Only Twilio (signed with the account's auth token).
    if (!(await twilioSignatureOk(req, form))) return new NextResponse('Forbidden', { status: 403 })
    const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
    const callSid = get('CallSid')
    const from = get('From')
    const to = get('To')

    const db = admin()
    const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')

    // Which company owns the dialled number? Resolve from the authoritative
    // phone_numbers table (NOT the stale integrations.phone_number column, which
    // leaked calls to the wrong tenant), then load that company's settings.
    const companyId = await companyForInboundNumber(db, to, 'twilio')
    if (!companyId) {
      // Not a number we manage — say so rather than hanging silently.
      return twiml('<Response><Say>This number is not configured.</Say><Hangup/></Response>')
    }
    // The AI phone agent's settings and the business name, read alongside the
    // caller lookups below rather than after them (the caller hears ringing
    // until we answer). What it needs to answer straight away (product names,
    // whether anything is bookable, whether the business is closed now) only
    // loads when it might.
    const agentP = getPhoneAgent(db, companyId)
    const coNameP: Promise<string> = Promise.resolve(db.from('companies').select('name').eq('id', companyId).maybeSingle())
      .then((r: any) => r.data?.name || '', () => '')
    const catalogP = agentP.then(a => mayAnswerAtStart(a, from) ? getPhoneCatalog(db, companyId) : null, () => null)
    const bookableP = agentP.then(a => mayAnswerAtStart(a, from) && a.skills.booking ? phoneBookable(db, companyId) : false, () => false)
    // This number's call routing (null: ring everyone at once, as before).
    const routingP = getCallRouting(db, companyId, to)
    const closedP: Promise<boolean | null> = Promise.all([agentP, routingP])
      .then(([a, r]) => needsHoursCheck(a, from) || routingNeedsHours(r) ? businessClosedNow(db, companyId) : null, () => null)
    const pausedP: Promise<boolean> = agentP.then(a => a.enabled && a.mode !== 'test' ? agentsPaused(db, companyId).then(p => p.paused) : false, () => false)
    // A number in Colvy's own Twilio account that was bought before numbers
    // got a status callback gets it once the AI may answer real callers
    // (lib/phone-agent.ts), or once it has a phone menu (a caller who hangs up
    // in the menu is a missed call, and the status callback is how we hear of
    // it). Checked after the call is answered, so the caller never waits on
    // it; once per number, not on every call.
    if (TWILIO_MASTER.accountSid && get('AccountSid') === TWILIO_MASTER.accountSid) {
      const backfill = () => Promise.all([agentP, routingP])
        .then(([a, r]) => answersRealCallers(a) || r?.strategy === 'menu' ? ensureStatusCallbacks(db, companyId, [to]) : undefined, () => undefined)
      try { after(backfill) } catch { void backfill() }
    }
    const { data: integ } = await db.from('twilio_integrations').select('*').eq('company_id', companyId).maybeSingle()
    if (!integ) {
      return twiml('<Response><Say>This number is not configured.</Say><Hangup/></Response>')
    }
    const greeting = integ.voicemail_greeting || 'Please leave a message after the tone.'

    // A blocked caller: busy tone, nobody rings, the inbox isn't bumped. The
    // attempt is still logged (status 'blocked') so it can be seen and undone.
    if (from && await isBlockedPhone(db, companyId, from)) {
      try {
        const c = await findContactByPhone(db, companyId, from)
        await db.from('calls').insert({
          company_id: companyId, direction: 'inbound', provider: 'twilio',
          from_number: from, to_number: to, caller_name: c?.name || null, contact_id: c?.id || null,
          status: 'blocked', cause: 'blocked contact — rejected', twilio_call_sid: callSid,
          created_at: new Date().toISOString(), ended_at: new Date().toISOString(),
        })
      } catch (e: any) { console.error('[twilio inbound] blocked call log failed', e?.message || e) }
      return twiml('<Response><Reject reason="busy"/></Response>')
    }

    // Resolve caller → contact + conversation, and make sure a conversation
    // EXISTS so the call is visible in the inbox for the whole team — even an
    // unanswered call from a number with no prior thread (which otherwise left
    // no trace anywhere but the call log).
    let contactId: string | null = null
    let callerName: string | null = null
    let conversationId: string | null = null
    try {
      // Query by the last-9-digit tail rather than scanning a capped page of
      // contacts, so a saved caller is matched regardless of contact-list size.
      const fromTail = (from || '').replace(/\D/g, '').slice(-9)
      const c = from ? await findContactByPhone(db, companyId, from) : null
      if (c) { contactId = c.id; callerName = c.name || null }

      // Unknown caller → save the number as a contact now, so it's in the CRM and
      // future calls/texts from them resolve to the same person.
      if (!contactId && from) {
        contactId = await ensureContactByPhone(db, companyId, from, { source: 'phone', known: true })
      }

      // Find an existing thread by the contact OR by the caller's number — many
      // threads key off contact_id with no sms_number, and vice-versa.
      const ors: string[] = []
      if (fromTail) ors.push(`sms_number.ilike.%${fromTail}%`)
      if (contactId) ors.push(`contact_id.eq.${contactId}`)
      if (ors.length) {
        const { data: conv } = await db.from('conversations')
          .select('id').eq('company_id', companyId).or(ors.join(','))
          .order('last_message_at', { ascending: false }).limit(1).maybeSingle()
        conversationId = conv?.id || null
      }

      const nowIso = new Date().toISOString()
      if (conversationId) {
        // Bump the existing thread to the top with a call preview.
        try { await db.from('conversations').update({ last_message: '📞 Incoming call', last_message_at: nowIso, is_unread: true }).eq('id', conversationId) } catch {}
      } else {
        // No thread yet — create one so the call lands in the inbox. Keyed to the
        // contact when known, otherwise to the caller's number.
        try {
          const { data: created } = await db.from('conversations').insert({
            company_id: companyId,
            contact_id: contactId,
            channel: 'phone',
            sms_number: from,
            status: 'open',
            last_message: '📞 Incoming call',
            last_message_at: nowIso,
            is_unread: true,
          }).select('id').maybeSingle()
          conversationId = created?.id || null
        } catch (e: any) { console.error('[twilio inbound] conversation create failed', e?.message || e) }
      }
    } catch {}

    // Create the call row (keyed by the Twilio Call SID) so it shows in logs and
    // the recording/status callbacks have something to attach to.
    let callRowId: string | null = null
    try {
      const { data: row } = await db.from('calls').insert({
        company_id: companyId, direction: 'inbound', provider: 'twilio',
        from_number: from, to_number: to, caller_name: callerName,
        contact_id: contactId, conversation_id: conversationId,
        status: 'ringing', twilio_call_sid: callSid, created_at: new Date().toISOString(),
      }).select('id').maybeSingle()
      callRowId = row?.id || null
    } catch (e: any) { console.error('[twilio inbound] call row insert failed', e?.message || e) }

    const cbQuery = `callRowId=${encodeURIComponent(callRowId || '')}&companyId=${encodeURIComponent(companyId)}&conversationId=${encodeURIComponent(conversationId || '')}`

    // Routing needs the call row: every step's callback finds the call by it.
    const routing = callRowId ? await routingP : null

    // AI receptionist, as the call comes in: a test number is always answered
    // by the AI straight away; beyond that the owner's mode decides (out of
    // hours: when the business is closed now; always: every call). Everyone
    // else goes through the normal ringing below, exactly as before.
    //
    // With a phone menu, the menu is the front door: it plays first even when
    // the AI is set to answer every call (the AI is then one of its options).
    // Out of hours with no after-hours menu, the AI still answers. Test
    // numbers always get the AI. A ring order or forwarding is just ringing,
    // so the AI's modes come first, as they do over ringing the team.
    if (callRowId) {
      try {
        const agent = await agentP
        if (agent.enabled) {
          const [closedNow, paused] = await Promise.all([closedP, pausedP])
          const reason = aiAnswerDecision(agent, { from, moment: 'incoming', closedNow, paused })
          const menuFirst = routing?.strategy === 'menu' && reason !== 'test' && (reason !== 'after_hours' || routing.afterHours.enabled)
          if (reason && !menuFirst) {
            const [companyName, catalog, bookable] = await Promise.all([coNameP, catalogP, bookableP])
            return twiml(await answerWithAgent(db, { agent, reason, bookable, base, cbQuery, callRowId, companyId, companyName, catalog, conversationId, contactId, from }))
          }
        }
      } catch (e: any) { console.error('[twilio inbound] phone agent start failed — ringing as normal', e?.message || e) }
    }

    const ctx = async (): Promise<CallCtx> => ({
      base, callRowId: callRowId || '', companyId, conversationId: conversationId || '',
      callerName, contactId, from, to, businessName: await coNameP,
    })

    // Phone menu: greet and wait for a key (app/api/twilio/voice/menu takes it
    // from there). The after-hours menu plays while the business is closed.
    if (routing?.strategy === 'menu' && callRowId) {
      try {
        const closedNow = routing.afterHours.enabled ? await closedP : null
        const which = routing.afterHours.enabled && closedNow === true ? 'ah' : 'main'
        const body = menuTwiml(await ctx(), menuFor(routing, which), which, { attempt: 1 })
        try { await db.from('calls').update({ status: 'menu' }).eq('id', callRowId) } catch {}
        await noteRouting(db, callRowId, { menu: which, pathAdd: which === 'ah' ? 'After-hours menu' : 'Phone menu' }, {})
        return twiml(body)
      } catch (e: any) { console.error('[twilio inbound] phone menu failed — ringing as normal', e?.message || e) }
    }

    // Who's online? Ring each one's browser and app by its Voice-SDK identity.
    // Twilio bridges the caller to whoever accepts first and cancels the rest —
    // no manual bridge needed. Web agents with a fresh heartbeat (not marked busy), every staff member's
    // app with a push token (always: Twilio's push wakes a closed app), and the
    // owner's browser; only people allowed calls or chats. The rules and their
    // history are in lib/call-routing-server.ts ringTargets (moved from here
    // unchanged; a ring order reuses them for each step).
    const { ringUsers, onlineCount, pushCount } = await ringTargets(db, companyId)

    // Ring order / forwarding: the first step that has someone to ring (or a
    // forward that applies now). Each step's callback (inbound-status) moves on
    // to the next; nobody to ring at any step is the "nobody online" case below.
    const ring = Math.max(Number(integ.ring_seconds || 25), 20)
    let routedNobody = false
    if (routing && callRowId && (routing.strategy === 'in_order' || routing.strategy === 'forward')) {
      try {
        const [closedNow, forwardAllowed] = await Promise.all([
          routingNeedsHours(routing) ? closedP : Promise.resolve(null),
          routingForwards(routing) ? forwardingAllowed(db, companyId) : Promise.resolve(false),
        ])
        const step = nextStep(await ctx(), planFor(routing, 'main', ring), 0, 'main', { ringable: ringUsers, closedNow, forwardAllowed, answered: false })
        if (step) {
          try { await db.from('calls').update({ status: 'ringing_agents' }).eq('id', callRowId) } catch {}
          await noteStep(db, callRowId, 'main', step, {})
          return twiml(step.twiml)
        }
        routedNobody = true
      } catch (e: any) { console.error('[twilio inbound] call routing failed — ringing as normal', e?.message || e) }
    }
    const identities = routedNobody ? [] : ringUsers

    // NOTE: we deliberately do NOT fire a separate /api/push/send "Ringing now"
    // notification here. Twilio's own Voice CallInvite push already raises a
    // full incoming-call notification (Answer/Decline, full-screen intent) on
    // every device below; a second Expo push just posted a duplicate, plain
    // notification for the same call. It never woke a closed app — only the
    // Twilio push does that — so dropping it leaves ringing intact.

    if (identities.length === 0) {
      // Nobody to ring, so this is where voicemail starts. The AI receptionist
      // takes it instead when the owner chose "when nobody answers".
      if (callRowId) {
        try {
          const agent = await agentP
          const reason = agent.enabled ? aiAnswerDecision(agent, { from, moment: 'no_answer', paused: await pausedP }) : null
          if (reason) {
            const [companyName, catalog, bookable] = await Promise.all([
              coNameP, getPhoneCatalog(db, companyId), agent.skills.booking ? phoneBookable(db, companyId) : false,
            ])
            return twiml(await answerWithAgent(db, {
              agent, reason, bookable, base, cbQuery, callRowId, companyId, companyName, catalog, conversationId, contactId, from,
              causeDetail: `with nobody online (online heartbeats=${onlineCount}, push devices=${pushCount})`,
            }))
          }
        } catch (e) { console.error('[twilio inbound] phone agent (nobody online) failed — voicemail as normal', e instanceof Error ? e.message : e) }
      }
      // Nobody online → straight to voicemail (if enabled). Record WHY on `cause`
      // (shown as "Hangup cause" in Call Diagnostics) so this is diagnosable: no
      // agent had a fresh presence heartbeat AND none had a push token to wake.
      if (integ.voicemail_enabled === false) {
        // No voicemail: it's a missed call — record it and tell the team.
        if (callRowId) { try { await db.from('calls').update({ status: 'missed', ended_at: new Date().toISOString(), cause: 'no_agent: nobody online, voicemail off' }).eq('id', callRowId) } catch {} }
        await alertCall(db, companyId, conversationId, 'Missed call', callerName || from || 'a caller')
        queueMissedCallText({ db, companyId, callId: callRowId })
        return twiml('<Response><Hangup/></Response>')
      }
      try {
        await db.from('calls').update({
          status: 'voicemail_greeting', is_voicemail: true,
          cause: `no_agent: nobody online (online heartbeats=${onlineCount}, push devices=${pushCount})`,
        }).eq('id', callRowId || '')
      } catch {}
      // Nobody can take it, so text the caller back now if switched on (as in
      // inbound-status: don't wait for a voicemail that may never come).
      queueMissedCallText({ db, companyId, callId: callRowId })
      return twiml(voicemailTwiml(base, greeting, cbQuery))
    }

    // Ring everyone at once for the number's ring time (floored at 20s above, so
    // a low/misconfigured ring_seconds can't send the call to voicemail after ~1
    // ring). The <Dial> and each <Client> are built by lib/call-routing
    // ringTwiml / clientXml, exactly as they always were here: one agent rung
    // passes soloUser to the action callback (so the answerer is recorded even if
    // the per-<Client> "answered" callback doesn't fire), `rang` carries how many
    // were rung (for Call Diagnostics), and each <Client> carries the call row,
    // workspace and caller for the apps.
    try { await db.from('calls').update({ status: 'ringing_agents' }).eq('id', callRowId || '') } catch {}

    return twiml(ringTwiml({ base, callRowId: callRowId || '', companyId, conversationId: conversationId || '', callerName, contactId, from, to, businessName: '' }, ringUsers, ring))
  } catch (err: any) {
    console.error('[twilio inbound] error', err)
    return twiml('<Response><Say>Sorry, something went wrong.</Say><Hangup/></Response>')
  }
}
