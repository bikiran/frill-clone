import { NextRequest, NextResponse } from 'next/server'
import { after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import { logWebhookEvent } from '@/lib/webhook-log'
import { getLead, getEnquiryByUrl, verifyWebhookSignature } from '@/lib/rea'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Inbound realestate.com.au EnquiryCreated webhook → Colvy conversation.
//
// The subscription is created for the agency by Colvy (server-side, with our
// partner credentials) and points here with the company's token:
//   https://colvy.com/api/webhooks/realestate?t=<company webhook token>
//
// REA requires the endpoint to acknowledge within 5 seconds, so we ACK first
// (202) and do the real work — Ed25519 signature verification, fetching the
// full enquiry, and ingesting it — AFTER the response, via next/server `after`.
// EnquiryCreated carries only an enquiry reference (+ often a `resourceUrl`), so
// the full buyer + listing detail is fetched from the Leads/Enquiries API with
// the master token. Field names are read tolerantly.

function pick(obj: any, ...keys: string[]) {
  for (const k of keys) {
    const v = k.split('.').reduce((o: any, p) => (o == null ? o : o[p]), obj)
    if (v != null && v !== '') return v
  }
  return null
}
const digits = (s: any) => String(s || '').replace(/\D/g, '')

// ── Subscription validation handshake ────────────────────────────────────────
// When a subscription is created (or periodically re-validated), REA pings the
// callback URL to confirm we own it and expects the challenge token echoed back.
// The exact shape isn't contractually fixed, so accept the common carriers:
// a query param, or a body field / a *Validation event. Echoed as text/plain,
// which is what challenge–response validators (incl. MS Graph style) expect.
function validationChallenge(url: URL, body: any): string | null {
  const q = url.searchParams
  const fromQuery = q.get('validationToken') || q.get('validation_token') || q.get('validationCode')
    || q.get('challenge') || q.get('hub.challenge') || q.get('crc_token')
  if (fromQuery) return fromQuery
  if (body && typeof body === 'object') {
    const t = body.validationToken || body.validation_token || body.validationCode
      || body.challenge || body.crcToken || body.token
    const et = String(body.eventType || body.type || '').toLowerCase()
    if (t && (et === '' || et.includes('valid') || et.includes('subscription'))) return String(t)
    if (t && !body.enquiry && !body.lead && !body.data) return String(t)
  }
  return null
}

export async function POST(req: NextRequest) {
  const url = new URL(req.url)
  const raw = await req.text()

  let parsed: any = {}
  try { parsed = raw ? JSON.parse(raw) : {} } catch { parsed = {} }

  // 1) Validation handshake — answer immediately, no token/signature needed.
  const challenge = validationChallenge(url, parsed)
  if (challenge) {
    return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  }

  // 2) Real event: identify the company synchronously (fast, indexed lookup) so
  //    we can ACK meaningfully, then verify + ingest AFTER responding.
  const token = url.searchParams.get('t') || req.headers.get('x-colvy-token') || ''
  if (!token) return NextResponse.json({ ok: false, reason: 'Missing webhook token' })

  const sigHeader = req.headers.get('x-rea-signature')
  const timestamp = req.headers.get('x-rea-timestamp') || req.headers.get('x-rea-request-timestamp')

  // Do the heavy lifting (signature check, Leads API fetch, DB writes) after the
  // response is flushed, keeping the ACK well under REA's 5s deadline.
  after(async () => {
    try {
      const db = admin()
      const { data: integ } = await db.from('realestate_integrations')
        .select('company_id, is_active').eq('webhook_token', token).maybeSingle()
      if (!integ?.company_id) { await logWebhookEvent({ source: 'realestate', status: 'error', error: 'Unknown webhook token' }); return }
      if (integ.is_active === false) { await logWebhookEvent({ source: 'realestate', companyId: integ.company_id, status: 'ignored', error: 'Channel disabled' }); return }
      const companyId = integ.company_id

      // Ed25519 signature verification over `timestamp + raw body`. Enforced by
      // default; set REA_WEBHOOK_VERIFY=log to log-but-allow during bring-up.
      const verifyMode = (process.env.REA_WEBHOOK_VERIFY || 'enforce').toLowerCase()
      const verdict = await verifyWebhookSignature({ rawBody: raw, signatureHeader: sigHeader, timestamp })
      if (!verdict.ok) {
        await logWebhookEvent({ source: 'realestate', companyId, status: 'error', error: `signature: ${verdict.reason}` })
        if (verifyMode !== 'log') return   // drop unverified events
      }

      await ingestEnquiry(db, companyId, parsed)
    } catch (e: any) {
      console.error('[realestate webhook]', e)
      await logWebhookEvent({ source: 'realestate', status: 'error', error: e?.message })
    }
  })

  // 3) Immediate acknowledgement.
  return NextResponse.json({ ok: true, accepted: true }, { status: 202 })
}

// Fetch the full enquiry and thread it into the contact's conversation.
async function ingestEnquiry(db: any, companyId: string, body: any) {
  // EnquiryCreated usually carries only a reference (and often a resourceUrl).
  // Fetch the full enquiry (buyer + listing) with the master token; fall back to
  // whatever the webhook itself included if that call isn't available.
  const resourceUrl = pick(body, 'resourceUrl', 'resource_url', 'data.resourceUrl', 'links.self', '_links.self.href')
  const leadId = pick(body, 'leadId', 'lead.id', 'data.leadId', 'enquiryId', 'id', 'data.id', 'payload.leadId')
  let e: any = body?.enquiry || body?.lead || body?.data || body
  let enriched = false
  try {
    if (resourceUrl) { const full = await getEnquiryByUrl(String(resourceUrl)); if (full) { e = full?.enquiry || full?.lead || full?.data || full; enriched = true } }
    if (!enriched && leadId) { const full = await getLead(String(leadId)); if (full) { e = full?.enquiry || full?.lead || full?.data || full; enriched = true } }
  } catch (err) { console.warn('[realestate] enquiry fetch failed — using webhook payload', err) }

  const name = pick(e, 'name', 'fullName', 'contact.name', 'from.name', 'firstName')
    || [pick(e, 'firstName', 'first_name'), pick(e, 'lastName', 'last_name')].filter(Boolean).join(' ') || null
  const email = (pick(e, 'email', 'emailAddress', 'contact.email', 'from.email') || '').toString().toLowerCase() || null
  const phone = pick(e, 'phone', 'phoneNumber', 'mobile', 'contact.phone') || null
  const message = pick(e, 'message', 'comments', 'enquiryMessage', 'body', 'text') || ''
  const listing = pick(e, 'listing.address', 'property.address', 'address', 'listingAddress', 'propertyAddress')
    || pick(e, 'listing.title', 'property.title', 'listingId', 'listing.id') || null
  const enquiryId = leadId || pick(e, 'id', 'enquiryId', 'reference')

  await logWebhookEvent({ source: 'realestate', eventType: 'enquiry', companyId, payload: { enquiryId, email, phone, listing, enriched } })

  if (!email && !phone && !name) {
    await logWebhookEvent({ source: 'realestate', companyId, status: 'ignored', error: 'Enquiry had no contact details' })
    return
  }

  // ── Find-or-create the contact (by email, else phone) ──────────────────────
  let contact: any = null
  if (email) {
    const { data } = await db.from('contacts').select('*').eq('company_id', companyId).ilike('email', email).limit(1)
    contact = data?.[0] || null
  }
  if (!contact && phone) {
    const d9 = digits(phone).slice(-9)
    if (d9) {
      const { data } = await db.from('contacts').select('*').eq('company_id', companyId).limit(1000)
      contact = (data || []).find((c: any) => c.phone && digits(c.phone).slice(-9) === d9) || null
    }
  }
  if (!contact) {
    const { data: created } = await db.from('contacts').insert({
      company_id: companyId, name: name || email || phone || 'RealEstate enquiry',
      email: email || null, phone: phone || null,
    }).select().maybeSingle()
    contact = created
  }

  // ── Compose the enquiry text (listing + buyer's message) ───────────────────
  const parts: string[] = []
  if (listing) parts.push(`🏠 Enquiry about: ${listing}`)
  if (message) parts.push(String(message))
  if (!message && !listing) parts.push('New realestate.com.au enquiry')
  const content = parts.join('\n\n')
  const subject = listing ? `realestate.com.au — ${listing}` : 'realestate.com.au enquiry'

  // ── Thread into the contact's open RealEstate conversation, else create ────
  let conv: any = null
  if (contact?.id) {
    const { data: recent } = await db.from('conversations').select('*')
      .eq('company_id', companyId).eq('contact_id', contact.id).eq('channel', 'realestate')
      .eq('status', 'open').order('last_message_at', { ascending: false }).limit(1)
    conv = recent?.[0] || null
  }
  if (!conv) {
    const { data: newConv } = await db.from('conversations').insert({
      company_id: companyId, channel: 'realestate', subject,
      contact_id: contact?.id || null, status: 'open',
      is_unread: true, unread_count: 1,
      last_message: content.slice(0, 200), last_message_at: new Date().toISOString(),
    }).select().maybeSingle()
    conv = newConv
  }
  if (!conv) { await logWebhookEvent({ source: 'realestate', companyId, status: 'error', error: 'Could not create conversation' }); return }

  await db.from('messages').insert({
    conversation_id: conv.id, company_id: companyId,
    sender_type: 'visitor',
    sender_name: name || email || phone || 'RealEstate enquiry',
    sender_email: email || null,
    content,
    metadata: { channel: 'realestate', listing, enquiry_id: enquiryId || null },
  })

  await db.from('conversations').update({
    last_message: content.slice(0, 200),
    last_message_at: new Date().toISOString(),
    is_unread: true, status: 'open',
    unread_count: (conv.unread_count || 0) + 1,
  }).eq('id', conv.id)

  try {
    await notifyCompany({
      db, companyId, type: 'realestate',
      message: `New realestate.com.au enquiry from ${name || email || phone}${listing ? ` about ${listing}` : ''}`,
      actorName: name || email || phone || 'RealEstate',
      conversationId: conv.id,
    })
  } catch {}
  try {
    await pushInboundMessage({
      companyId, conversationId: conv.id,
      title: `realestate.com.au enquiry from ${name || email || phone}`,
      body: (listing ? `${listing} — ` : '') + (message ? String(message).slice(0, 160) : 'New enquiry'),
    })
  } catch {}
}

// REA (and manual testing) may verify the endpoint with a GET, sometimes
// carrying the validation challenge as a query param.
export async function GET(req: NextRequest) {
  const challenge = validationChallenge(new URL(req.url), null)
  if (challenge) return new NextResponse(challenge, { status: 200, headers: { 'Content-Type': 'text/plain' } })
  return NextResponse.json({ ok: true, service: 'Colvy realestate.com.au enquiry webhook' })
}
