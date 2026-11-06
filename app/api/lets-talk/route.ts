import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { signValue, readValue } from '@/lib/oauth-state'
import { checkBurst, callerKey } from '@/lib/rate-limit'
import { verifyTurnstile, requestIp } from '@/lib/turnstile'
import { colvyWorkspace, claimRate } from '@/lib/signup-attempts'
import { findContactByPhone, isBlockedPhone } from '@/lib/contact-capture'
import { emitInboundEvent } from '@/lib/integration-hooks'
import { emitIntegrationEvent } from '@/lib/integration-events'
import { isColvyNumber } from '@/lib/colvy-contact'
import { phoneKey } from '@/lib/phone'
import {
  cleanLeadName, cleanLeadPhone, displayLeadPhone, leadPage,
  LETS_TALK_MIN_MS, LETS_TALK_SUBJECT, LETS_TALK_TAG, LETS_TALK_TOKEN_TTL_MS,
} from '@/lib/lets-talk'

export const dynamic = 'force-dynamic'

// "Have questions? Let's talk." (components/marketing/LetsTalk.tsx): a name
// and a phone number from any marketing page, filed in Colvy's own workspace
// (the one sign-up leads go to) as a contact and a conversation in the inbox,
// so the team calls or texts them back from there.
//
// Spam: a hidden field only bots fill; a signed ticket the form fetches when
// someone starts on it, which has to be a few seconds old; Cloudflare
// Turnstile (once its keys are set); a per-server burst limit; shared daily
// limits per IP, per number and in all; and names and numbers that have to
// look real. A refused bot is told "thanks" where telling it why would help it.

const KIND = 'lets-talk'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)

const json = (body: any, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } })
const thanks = () => json({ ok: true })
const refuse = (error: string, status = 400) => json({ error }, status)

/** GET: the form's ticket, fetched when someone starts filling it in. */
export async function GET() {
  return json({ token: signValue({ kind: KIND, at: Date.now() }, LETS_TALK_TOKEN_TTL_MS) })
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    // 1. The hidden "website" field: people never see it, bots fill it in.
    if (typeof body.website === 'string' && body.website.trim()) return thanks()

    // 2. Our own ticket, from when the form was started, a moment ago at least.
    const ticket = readValue(typeof body.token === 'string' ? body.token : '', KIND)
    if (!ticket || typeof ticket.at !== 'number') return refuse('Please refresh the page and try again.')
    if (Date.now() - ticket.at < LETS_TALK_MIN_MS) return refuse('Please wait a moment and try again.')

    // 3. One server being hammered.
    if (!checkBurst(`lets-talk:${callerKey(req)}`, 3)) {
      return json({ error: 'Too many requests. Please wait a minute and try again.' }, 429)
    }

    // 4. A real-looking name and a number we can call.
    const name = cleanLeadName(body.name)
    if (!name) return refuse('Please enter your name.')
    const phone = cleanLeadPhone(body.phone)
    if (!phone) return refuse('Please enter a phone number we can call, like 0412 345 678.')

    // 5. Cloudflare's "are you human?" check (off until its keys are set).
    const ip = requestIp(req.headers) || 'unknown'
    const human = await verifyTurnstile(body.turnstileToken, ip === 'unknown' ? undefined : ip)
    if (!human.ok) return refuse('Please confirm you’re human and try again.')

    if (isColvyNumber(phone)) return thanks()
    const db = admin()

    // 6. Across every server, per day: 6 from one IP, 3 for one number, 300 in all.
    const { over } = await claimRate(db, [`lets-talk:ip:${ip}`, `lets-talk:phone:${phoneKey(phone)}`, 'lets-talk:all'], [6, 3, 300], 86_400)
    if (over && over.includes(':phone:')) return thanks()   // we already have this number today
    if (over) return json({ error: 'We’ve had a lot of requests today. Please call or email us instead.' }, 429)

    await fileLead(db, { name, phone, page: leadPage(body.page) })
    return thanks()
  } catch (e: any) {
    console.error('[lets-talk]', e?.message || e)
    return json({ error: 'Something went wrong. Please call or email us instead.' }, 500)
  }
}

type Lead = { name: string; phone: string; page: string }

/** The contact, the conversation and its message in Colvy's workspace. */
async function fileLead(db: any, lead: Lead) {
  const shown = displayLeadPhone(lead.phone)
  const content = [
    `${lead.name} asked for a call back from colvy.com${lead.page === '/' ? '' : lead.page}.`,
    `Name: ${lead.name}`,
    `Phone: ${shown}`,
    `Page: colvy.com${lead.page}`,
  ].join('\n')

  const co = await colvyWorkspace(db)
  if (!co) { await emailLead(lead, content, 'no Colvy workspace is set'); return }
  if (await isBlockedPhone(db, co.id, lead.phone)) return

  // The contact: the one with this number, else a new one (no marketing consent).
  let contactId: string | null = null
  const hit = await findContactByPhone(db, co.id, lead.phone)
  if (hit) {
    contactId = hit.id
    try {
      const { data: c } = await db.from('contacts').select('id, name, tags').eq('id', hit.id).maybeSingle()
      const tags: string[] = Array.isArray(c?.tags) ? c.tags : []
      const patch: any = {}
      if (!tags.includes(LETS_TALK_TAG)) patch.tags = [...tags, LETS_TALK_TAG]
      if (!c?.name) patch.name = lead.name
      if (Object.keys(patch).length) await db.from('contacts').update(patch).eq('id', hit.id)
    } catch {}
  } else {
    const base = { company_id: co.id, name: lead.name, phone: lead.phone, source: 'website', tags: [LETS_TALK_TAG] }
    const tries = [
      { ...base, subscribed_to_marketing: false, consent_basis: 'none', consent_source: 'Colvy website “Let’s talk” form (asked for a call back, no marketing consent)' },
      { ...base, subscribed_to_marketing: false },
      base,
      { company_id: co.id, name: lead.name, phone: lead.phone },
    ]
    for (const t of tries) {
      const ins = await db.from('contacts').insert(t).select('id').maybeSingle()
      if (!ins.error && ins.data) { contactId = ins.data.id; break }
    }
  }

  // Their call-back request that's still open (from the last fortnight) gets
  // this one too, rather than a second conversation.
  const now = new Date().toISOString()
  let conversationId: string | null = null
  let isNew = false
  if (contactId) {
    try {
      const since = new Date(Date.now() - 14 * 86_400_000).toISOString()
      const { data } = await db.from('conversations').select('id, unread_count')
        .eq('company_id', co.id).eq('contact_id', contactId).eq('channel', 'form').eq('subject', LETS_TALK_SUBJECT)
        .eq('status', 'open').gte('created_at', since).order('created_at', { ascending: false }).limit(1)
      const open = data?.[0]
      if (open) {
        conversationId = open.id
        await db.from('conversations').update({
          is_unread: true, unread_count: (open.unread_count || 0) + 1,
          last_message: content.slice(0, 200), last_message_at: now,
        }).eq('id', open.id)
      }
    } catch {}
  }
  if (!conversationId) {
    const { data: conv } = await db.from('conversations').insert({
      company_id: co.id, channel: 'form', subject: LETS_TALK_SUBJECT,
      contact_id: contactId, status: 'open', is_unread: true, unread_count: 1,
      last_message: content.slice(0, 200), last_message_at: now,
    }).select('id').maybeSingle()
    conversationId = conv?.id || null
    isNew = !!conversationId
  }
  if (!conversationId) { await emailLead(lead, content, 'the inbox conversation could not be created'); return }

  const { data: msg } = await db.from('messages').insert({
    conversation_id: conversationId, company_id: co.id,
    sender_type: 'visitor', sender_name: lead.name, content,
  }).select('id').maybeSingle()

  // Notifications, automations and webhooks, as for any new enquiry.
  await emitInboundEvent(db, {
    companyId: co.id, conversationId, isNew, text: content, channel: 'form',
    contactId, name: lead.name, phone: lead.phone, messageId: msg?.id || null,
  })
  emitIntegrationEvent(co.id, 'form.submitted', {
    title: `Call-back request from ${lead.name}`,
    summary: null,
    path: `/admin/inbox?conversation=${conversationId}`,
    customer: { name: lead.name, email: null, phone: lead.phone },
    fields: { Name: lead.name, Phone: shown, Page: `colvy.com${lead.page}` },
    data: { form: { id: KIND, name: 'Let’s talk', kind: 'website' }, answers: { name: lead.name, phone: lead.phone, page: lead.page } },
  }, { db })
}

/** When the inbox can't take it, the lead still reaches the team by email. */
async function emailLead(lead: Lead, content: string, why: string) {
  console.warn(`[lets-talk] ${why}: emailing the lead instead`)
  const key = process.env.RESEND_API_KEY
  if (!key) { console.warn('[lets-talk] RESEND_API_KEY not set: lead not emailed', { name: lead.name, page: lead.page }); return }
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Colvy <noreply@updates.colvy.com>',
        to: ['support@colvy.com'],
        subject: `Call-back request: ${lead.name}`,
        text: `${content}\n\n(Sent by email because ${why}.)`,
      }),
    })
    if (!res.ok) console.error('[lets-talk] email failed:', res.status, await res.text().catch(() => ''))
  } catch (e: any) {
    console.error('[lets-talk] email failed:', e?.message || e)
  }
}
