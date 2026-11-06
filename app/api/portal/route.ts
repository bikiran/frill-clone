import { NextRequest, NextResponse, after } from 'next/server'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { internalHeaders } from '@/lib/internal-call'
import { hidesPoweredBy } from '@/lib/branding'
import { accountCodeEmailHtml } from '@/lib/booking-email'
import { sendCustomerEmail } from '@/lib/customer-email'
import { resolveSmsSender } from '@/lib/sms-provider'
import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import { protectInbound } from '@/lib/conversation-protection'
import { emitInboundEvent } from '@/lib/integration-hooks'
import {
  portalDb, portalCompany, parseIdentifier, contactsFor, makeCode, checkCode, startSession, sessionFor, endSession,
  contactFromLink, portalEvent, maskEmail, maskPhone, isMissingPortalSchema, PORTAL_HINT, CODE_TTL_MS,
} from '@/lib/portal/auth'
import { portalData, savePrefs, loadContact, mainConversation } from '@/lib/portal/data'
import { portalReceipt } from '@/lib/portal/receipts'

export const dynamic = 'force-dynamic'

// The customer portal ("Your account", lib/portal). Public: a business's
// customers, signed in with a one-time code or a link the business sent.
//   GET  ?slug&op=company                         the business (name, logo, colour, sections), when it's on
//   GET  ?slug&op=me                       Bearer  everything on the page for the signed-in customer
//   GET  ?slug&op=receipt&key=woo:<id>|shop:<id>|pay:<id>   Bearer  a receipt, if that order is theirs
//   POST { slug, action: 'code', to }              send a code to that email or mobile (if it's a customer's)
//   POST { slug, action: 'verify', to, code }      → { token, expiresAt } (30 days unused)
//   POST { slug, action: 'link', booking | quote } → { token } from a booking / quote link (a day)
//   POST { slug, action: 'reply', text }   Bearer  a message into their conversation
//   POST { slug, action: 'prefs', name?, marketingEmail?, marketingSms? }   Bearer
//   POST { slug, action: 'track', kind, id? }      Bearer  "opened a booking / quote / pay link" (pilot numbers)
//   POST { slug, action: 'signout' }       Bearer

const json = (d: any, status = 200) => NextResponse.json(d, { status, headers: { 'Cache-Control': 'no-store' } })
const NOT_ON = (name?: string) => json({ error: name ? `${name} hasn’t turned on customer accounts.` : 'There’s no account page here.' }, 404)
const TRACK = new Set(['open_booking', 'open_quote', 'pay', 'open_order'])

async function business(db: any, slug: any) {
  const pc = await portalCompany(db, String(slug || ''))
  if (!pc) return { pc: null, res: NOT_ON() }
  if (!pc.settings.enabled) return { pc: null, res: NOT_ON(pc.company.name) }
  return { pc, res: null }
}

export async function GET(req: NextRequest) {
  try {
    const db = portalDb()
    const sp = req.nextUrl.searchParams
    if (!checkBurst(`portal-get:${callerKey(req)}`, 60)) return json({ error: 'Too many requests. Please wait a minute.' }, 429)
    const { pc, res } = await business(db, sp.get('slug'))
    if (!pc) return res!
    const op = sp.get('op') || 'company'
    if (op === 'company') {
      after(() => portalEvent(db, pc.company.id, null, 'visit'))
      return json({
        name: pc.company.name, slug: pc.company.slug, logoUrl: pc.company.logo_url || null, accent: pc.company.accent_color || null,
        hidePoweredBy: await hidesPoweredBy(db, pc.company.id, pc.company).catch(() => false), sections: pc.settings.sections,
      })
    }
    if (op === 'me') {
      const s = await sessionFor(db, req, pc.company.id)
      if (!s) return json({ error: 'Please sign in.' }, 401)
      const data = await portalData(db, pc, s.contactId, s)
      if (!data) { await endSession(db, s.id); return json({ error: 'Please sign in.' }, 401) }
      return json(data)
    }
    if (op === 'receipt') {
      if (!pc.settings.sections.orders) return json({ error: 'Not available.' }, 403)
      const s = await sessionFor(db, req, pc.company.id)
      if (!s) return json({ error: 'Please sign in.' }, 401)
      const contact = await loadContact(db, pc.company.id, s.contactId)
      const r = contact ? await portalReceipt(db, pc, contact, String(sp.get('key') || '')) : null
      if (!r) return json({ error: 'Receipt not found.' }, 404)
      after(() => portalEvent(db, pc.company.id, s.contactId, 'open_receipt', { key: String(sp.get('key') || '').slice(0, 80) }))
      return json(r)
    }
    return json({ error: 'Unknown request' }, 400)
  } catch (e: any) {
    if (isMissingPortalSchema(e)) return json({ error: PORTAL_HINT }, 503)
    console.error('[portal] GET', e?.message || e)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = portalDb()
    const body = await req.json().catch(() => ({}))
    const action = String(body.action || '')
    if (!checkBurst(`portal-post:${callerKey(req)}`, 30)) return json({ error: 'Too many tries. Please wait a minute.' }, 429)
    const { pc, res } = await business(db, body.slug)
    if (!pc) return res!
    const companyId = pc.company.id
    const origin = req.nextUrl.origin

    if (action === 'code') {
      const id = parseIdentifier(body.to)
      if (!id) return json({ error: 'Enter your email or mobile number.' }, 400)
      // A quick limit per server; the database check below holds across servers.
      if (!checkBurst(`portal-code:${companyId}:${id.key}`, 3)) return json({ error: 'We’ve just sent a few codes. Please wait a few minutes and try again.' }, 429)
      const typed = id.kind === 'email' ? maskEmail(id.key) : maskPhone(id.key)
      const matches = await contactsFor(db, companyId, id)
      // Same answer whether or not it matched, so the page never says who's a customer.
      if (!matches.length) return json({ ok: true, sentTo: typed })
      const contact = matches[0]
      if (matches.length > 1) after(() => portalEvent(db, companyId, contact.id, 'duplicate_contacts', { count: matches.length, via: id.kind }))
      // A mobile gets a text when the business can text; otherwise (or for an email) the code goes by email.
      let channel: 'sms' | 'email' = id.kind === 'sms' ? 'sms' : 'email'
      if (channel === 'sms' && !(await resolveSmsSender(db, companyId).catch(() => null))) channel = 'email'
      if (channel === 'email' && !contact.email) return json({ error: 'We can’t send a code there right now. Try your email address instead.' }, 400)
      // Three codes to one place in 15 minutes, across every server (the memory limit above is per server).
      const { count: recent } = await db.from('portal_codes').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('destination', id.key).gte('created_at', new Date(Date.now() - 15 * 60_000).toISOString())
      if ((recent || 0) >= 3) return json({ error: 'We’ve just sent a few codes. Please wait a few minutes and try again.' }, 429)
      const code = await makeCode(db, companyId, contact.id, channel, id.key)
      const mins = Math.round(CODE_TTL_MS / 60000)
      let sent = false
      if (channel === 'sms') {
        const r = await fetch(`${origin}/api/telnyx/sms/send`, {
          method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
          // Not logged in a conversation: the code is for the customer only.
          body: JSON.stringify({ companyId, to: contact.phone, text: `${code} is your ${pc.company.name} sign-in code. It expires in ${mins} minutes. If you didn't ask for it, you can ignore this.`, senderName: pc.company.name, skipChatMessage: true }),
        }).catch(() => null)
        sent = !!r?.ok
      } else {
        sent = await sendCustomerEmail(db, pc.company, {
          to: contact.email, subject: `${code} is your ${pc.company.name} sign-in code`,
          text: `Your code to sign in to your account with ${pc.company.name}: ${code}\n\nIt expires in ${mins} minutes. If you didn't ask for it, you can ignore this email.`,
          html: accountCodeEmailHtml({ business: pc.company.name, logoUrl: pc.company.logo_url || null, accent: pc.company.accent_color || null, hideBadge: await hidesPoweredBy(db, pc.company.id, pc.company).catch(() => false), code, mins }),
        }).catch(() => false)
      }
      if (!sent) return json({ error: 'We couldn’t send the code just now. Please try again in a minute.' }, 502)
      after(() => portalEvent(db, companyId, contact.id, 'code_sent', { channel }))
      // Where it went, so they know where to look (a mobile they typed may get an email).
      return json({ ok: true, channel, sentTo: channel === 'sms' ? maskPhone(contact.phone) : maskEmail(contact.email) })
    }

    if (action === 'verify') {
      const id = parseIdentifier(body.to)
      if (!id) return json({ error: 'Enter your email or mobile number.' }, 400)
      if (!checkBurst(`portal-verify:${callerKey(req)}`, 10)) return json({ error: 'Too many tries. Please wait a minute.' }, 429)
      const r = await checkCode(db, companyId, id.key, String(body.code || ''))
      if (!r.ok) {
        const why = (r as { reason: string }).reason
        return json({ error: why === 'wrong' ? 'That code isn’t right. Check it and try again.' : why === 'tries' ? 'Too many tries. Send yourself a new code.' : 'That code has expired. Send yourself a new one.', reason: why }, 400)
      }
      const contactId = (r as { contactId: string }).contactId
      const s = await startSession(db, companyId, contactId, 'code', req.headers.get('user-agent'))
      after(() => portalEvent(db, companyId, contactId, 'sign_in'))
      return json({ ok: true, token: s.token, expiresAt: s.expiresAt })
    }

    if (action === 'link') {
      const contactId = await contactFromLink(db, companyId, { booking: body.booking, quote: body.quote })
      if (!contactId) return json({ error: 'That link has expired.' }, 404)
      const s = await startSession(db, companyId, contactId, 'link', req.headers.get('user-agent'))
      after(() => portalEvent(db, companyId, contactId, 'link_sign_in', { from: body.booking ? 'booking' : 'quote' }))
      return json({ ok: true, token: s.token, expiresAt: s.expiresAt })
    }

    // Everything below is for a signed-in customer.
    const s = await sessionFor(db, req, companyId)
    if (!s) return json({ error: 'Please sign in again.' }, 401)

    if (action === 'signout') {
      await endSession(db, s.id)
      after(() => portalEvent(db, companyId, s.contactId, 'sign_out'))
      return json({ ok: true })
    }

    if (action === 'track') {
      const kind = String(body.kind || '')
      if (TRACK.has(kind)) after(() => portalEvent(db, companyId, s.contactId, kind, body.id ? { id: String(body.id).slice(0, 64) } : null))
      return json({ ok: true })
    }

    if (action === 'prefs') {
      if (!pc.settings.sections.preferences) return json({ error: 'Not available.' }, 403)
      const r = await savePrefs(db, pc, s.contactId, body, s)
      if (!r.ok) return json({ error: r.error }, 400)
      after(() => portalEvent(db, companyId, s.contactId, 'prefs', { name: typeof body.name === 'string', email: body.marketingEmail ?? null, sms: body.marketingSms ?? null }))
      return json({ ok: true, me: r.me })
    }

    if (action === 'reply') {
      if (!pc.settings.sections.messages) return json({ error: 'Not available.' }, 403)
      const text = String(body.text || '').replace(/\r\n/g, '\n').trim().slice(0, 2000)
      if (!text) return json({ error: 'Write a message first.' }, 400)
      if (!checkBurst(`portal-reply:${s.id}`, 8)) return json({ error: 'You’re sending messages very quickly. Please wait a moment.' }, 429)
      const contact = await loadContact(db, companyId, s.contactId)
      if (!contact) return json({ error: 'Please sign in again.' }, 401)
      const who = String(contact.name || '').trim() || 'A customer'
      let conv = await mainConversation(db, companyId, s.contactId)
      if (!conv) {
        const { data, error } = await db.from('conversations').insert({
          company_id: companyId, contact_id: s.contactId, channel: 'chat', subject: who, status: 'open',
          last_message: '', last_message_at: new Date().toISOString(),
        }).select('id, channel, last_message_at').maybeSingle()
        if (error || !data) throw error || new Error('Couldn’t start the conversation')
        conv = data
      }
      const { data: message, error } = await db.from('messages').insert({
        conversation_id: conv!.id, company_id: companyId, sender_type: 'visitor', sender_name: who.slice(0, 120),
        sender_email: contact.email || null, content: text, metadata: { source: 'portal' },
      }).select('id, created_at').maybeSingle()
      if (error || !message) throw error || new Error('Message not saved')
      const now = new Date().toISOString()
      await db.from('conversations').update({ last_message: text.slice(0, 200), last_message_at: now, is_unread: true, unread_count: 1, status: 'open', updated_at: now }).eq('id', conv!.id).eq('company_id', companyId)
      const convId = conv!.id
      after(async () => {
        try { await protectInbound(db, { companyId, conversationId: convId, messageId: message.id, text }) } catch {}
        try { await emitInboundEvent(db, { companyId, conversationId: convId, text, channel: 'chat', name: who, email: contact.email || null, messageId: message.id }) } catch {}
        try { await notifyCompany({ db, companyId, type: 'chat', message: `New message from ${who} (account page): ${text.slice(0, 80)}`, actorName: who, conversationId: convId }) } catch {}
        try { await pushInboundMessage({ companyId, conversationId: convId, title: `New message from ${who}`, body: text, baseUrl: origin }) } catch {}
        await portalEvent(db, companyId, s.contactId, 'reply')
      })
      return json({ ok: true, message: { id: message.id, mine: true, text, at: message.created_at || now, by: null } })
    }

    return json({ error: 'Unknown request' }, 400)
  } catch (e: any) {
    if (isMissingPortalSchema(e)) return json({ error: PORTAL_HINT }, 503)
    console.error('[portal] POST', e?.message || e)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
}

