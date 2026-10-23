import { twilioSignatureOk, twilioSignedFor } from '@/lib/twilio-signature'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { setCallPreview } from '@/lib/call-card'
import {
  menuFor, menuTwiml, planFor, nextStep, nobodyTwiml, voicemailTwiml, sayThenTwiml, menuReplayUrl, choiceLabel, cbQueryOf,
  MENU_ACTIONS, MAX_MENU_PLAYS, type CallCtx, type MenuAction, type Step, type CallRouting,
} from '@/lib/call-routing'
import {
  getCallRouting, ringTargets, forwardingAllowed, noteRouting, noteStep, readCallRow, setRoutingColumns, textCallerFromMenu, type MenuTextResult,
} from '@/lib/call-routing-server'
import { getPhoneAgent, answerWithAgent, phoneBookable } from '@/lib/phone-agent'
import { agentsPaused } from '@/lib/agent/pilot'
import { getPhoneCatalog } from '@/lib/phone-catalog'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

const twiml = (body: string) => new NextResponse(`<?xml version="1.0" encoding="UTF-8"?>${body}`, { headers: { 'Content-Type': 'text/xml' } })

const TEXT_SAY: Record<MenuTextResult | 'pending', string> = {
  sent: 'We’ve sent you a text.',
  pending: 'We’re sending you a text now.',
  already: 'We’ve already sent you a text on this call.',
  not_textable: 'Sorry, we can only text Australian mobile numbers.',
  opted_out: 'Sorry, we can’t send a text to this number.',
  no_sms: 'Sorry, we can’t send a text right now.',
  blocked: 'Sorry, we can’t send a text right now.',
  failed: 'Sorry, we couldn’t send a text just now.',
}

// The phone menu (lib/call-routing menuTwiml) posts here.
//   op=pick  the key the caller pressed (Digits; empty when they pressed
//            nothing). A key with an option runs it; a wrong key or no key
//            replays the menu once, then the menu's default action runs.
//   op=play  back to the menu after a message.
// m=main|ah says which menu (the after-hours one while closed). The caller's
// choice is kept on the call (routing note and calls.ivr_choice) so the inbox
// and call history show "Pressed 2 · Support".
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    if (!(await twilioSignatureOk(req, form))) return new NextResponse('Forbidden', { status: 403 })
    const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
    const sp = req.nextUrl.searchParams
    const callRowId = sp.get('callRowId') || ''
    const companyId = sp.get('companyId') || ''
    const conversationId = sp.get('conversationId') || ''
    const which = sp.get('m') === 'ah' ? 'ah' : 'main'
    const op = sp.get('op') === 'play' ? 'play' : 'pick'
    const attempt = Math.max(1, Number.parseInt(sp.get('try') || '1', 10) || 1)
    const plays = Math.max(1, Number.parseInt(sp.get('n') || '1', 10) || 1)
    const db = admin()
    const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')

    const call = await readCallRow(db, callRowId)
    if (!call || call.company_id !== companyId) return twiml('<Response><Say>Sorry, something went wrong.</Say><Hangup/></Response>')
    // Signed by Colvy's account or this business's own, not another business's.
    if (!(await twilioSignedFor(req, form, db, companyId))) return new NextResponse('Forbidden', { status: 403 })
    const [routing, { data: co }, { data: integ }] = await Promise.all([
      getCallRouting(db, companyId, call.to_number || ''),
      db.from('companies').select('name').eq('id', companyId).maybeSingle(),
      db.from('twilio_integrations').select('ring_seconds, voicemail_greeting').eq('company_id', companyId).maybeSingle(),
    ])
    const ring = Math.max(Number(integ?.ring_seconds || 25), 20)
    const ctx: CallCtx = {
      base, callRowId, companyId, conversationId: conversationId || call.conversation_id || '',
      callerName: call.caller_name || null, contactId: call.contact_id || null,
      from: call.from_number || '', to: call.to_number || '', businessName: co?.name || '',
    }

    // Ring someone (a plan of ring steps); nobody to ring → the usual "nobody
    // answered" handling.
    const ringPlan = async (steps: Step[], route: string) => {
      const [targets, forwardAllowed] = await Promise.all([
        ringTargets(db, companyId),
        steps.some(s => s.kind === 'forward') ? forwardingAllowed(db, companyId) : Promise.resolve(false),
      ])
      const next = nextStep(ctx, steps, 0, route, { ringable: targets.ringUsers, closedNow: null, forwardAllowed, answered: true })
      if (!next) return twiml(nobodyTwiml(ctx, route))
      try { await db.from('calls').update({ status: 'ringing_agents' }).eq('id', callRowId) } catch {}
      await noteStep(db, callRowId, route, next, call)
      return twiml(next.twiml)
    }
    const ringEveryone = (route: string) => ringPlan([{ kind: 'ring', users: 'all', seconds: ring, when: 'always' }], route)

    // The menu was switched off mid-call: ring everyone, as without one.
    if (!routing || routing.strategy !== 'menu') return ringEveryone('x')
    const menu = menuFor(routing, which)

    if (op === 'play') {
      if (plays > MAX_MENU_PLAYS) return twiml(sayThenTwiml('Thanks for calling. Goodbye.'))
      return twiml(menuTwiml(ctx, menu, which, { attempt: 1, plays }))
    }

    const digits = get('Digits').trim()
    const option = menu.options.find(o => o.key === digits)
    if (!option && attempt < 2) {
      // Once more, then the default action.
      return twiml(menuTwiml(ctx, menu, which, { attempt: attempt + 1, plays, prefix: digits ? 'Sorry, that’s not one of the options.' : '' }))
    }
    const prefix = which === 'ah' ? 'a' : 'm'
    const route = option ? `${prefix}${option.key}` : `${prefix}d`
    const action: MenuAction = option ? option.action : menu.defaultAction
    const label = option ? option.label : (MENU_ACTIONS.find(a => a.id === action.type)?.label || '')
    const choice = option ? choiceLabel(option.key, option.label) : choiceLabel(null, label)
    await noteRouting(db, callRowId, { route, choice: { key: option ? option.key : null, label: option ? option.label : null, at: new Date().toISOString() }, pathAdd: choice }, call)
    await setRoutingColumns(db, callRowId, { ivr_choice: choice })
    return await runAction(action, { route, label, isDefault: !option })

    async function runAction(a: MenuAction, o: { route: string; label: string; isDefault: boolean }): Promise<NextResponse> {
      const r = routing as CallRouting
      switch (a.type) {
        case 'ring_all':
        case 'ring_order':
        case 'forward':
          return ringPlan(planFor(r, o.route, ring), o.route)
        case 'voicemail': {
          const box = o.isDefault ? '' : o.label
          try {
            await db.from('calls').update({ status: 'voicemail_greeting', is_voicemail: true, cause: `menu: voicemail${box ? ` (${box})` : ''}` }).eq('id', callRowId)
          } catch {}
          if (box) await setRoutingColumns(db, callRowId, { voicemail_box: box })
          await noteRouting(db, callRowId, { ...(box ? { voicemailBox: box } : {}), pathAdd: box ? `Voicemail · ${box}` : 'Voicemail' }, call)
          // Provisional, as for any voicemail: the recording callback upgrades it.
          try { await setCallPreview(db as any, ctx.conversationId, '📞 Missed call') } catch {}
          const greeting = integ?.voicemail_greeting || 'Please leave a message after the tone.'
          return twiml(voicemailTwiml(base, greeting, cbQueryOf(ctx)))
        }
        case 'ai': {
          // Only while the AI receptionist is switched on and not paused;
          // otherwise the caller rings everyone instead.
          try {
            const agent = await getPhoneAgent(db, companyId)
            const paused = agent.enabled ? (await agentsPaused(db, companyId)).paused : true
            if (agent.enabled && !paused) {
              const [catalog, bookable] = await Promise.all([getPhoneCatalog(db, companyId), agent.skills.booking ? phoneBookable(db, companyId) : Promise.resolve(false)])
              await noteRouting(db, callRowId, { pathAdd: 'AI receptionist' }, call)
              return twiml(await answerWithAgent(db, {
                agent, reason: 'always', bookable, base, cbQuery: cbQueryOf(ctx), callRowId, companyId, companyName: ctx.businessName, catalog,
                conversationId: ctx.conversationId || null, contactId: ctx.contactId, from: ctx.from,
                routing: call.routing_state, causeDetail: `(chosen from the phone menu${o.label ? `: ${o.label}` : ''})`,
              }))
            }
          } catch (e) { console.error('[twilio menu] AI receptionist failed — ringing everyone', e instanceof Error ? e.message : e) }
          return ringEveryone('x')
        }
        case 'message':
        case 'sms': {
          let say = a.text.replace(/\{\s*(business|company)\s*\}/gi, ctx.businessName || 'us')
          if (a.type === 'sms') {
            let timer: ReturnType<typeof setTimeout> | undefined
            const late = new Promise<'pending'>(res => { timer = setTimeout(() => res('pending'), 5000) })
            const result = await Promise.race([textCallerFromMenu(db, { companyId, call, text: a.text, businessName: ctx.businessName }), late])
            if (timer) clearTimeout(timer)
            say = TEXT_SAY[result]
            await noteRouting(db, callRowId, { pathAdd: result === 'sent' || result === 'pending' ? 'Texted the caller' : `Text not sent (${result})` }, call)
          } else {
            await noteRouting(db, callRowId, { pathAdd: 'Message played' }, call)
          }
          // Back to the menu, unless this ends the call (always so for the
          // default action, which would otherwise loop).
          if (a.then === 'menu' && !o.isDefault && plays < MAX_MENU_PLAYS) {
            return twiml(sayThenTwiml(say, { replayUrl: menuReplayUrl(ctx, which, plays + 1) }))
          }
          // The menu answered the caller: not a missed call.
          const now = new Date().toISOString()
          try {
            await db.from('calls').update({ status: 'completed', answered_at: now, ended_at: now, agent_name: 'Phone menu', cause: `menu: ${o.label || a.type} then hung up` }).eq('id', callRowId)
          } catch {}
          return twiml(sayThenTwiml(`${say} Thanks for calling. Goodbye.`))
        }
      }
    }
  } catch (e) {
    console.error('[twilio menu] error', e instanceof Error ? e.message : e)
    return twiml('<Response><Say>Sorry, something went wrong.</Say><Hangup/></Response>')
  }
}
