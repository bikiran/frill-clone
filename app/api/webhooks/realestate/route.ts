import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyCompany, pushInboundMessage } from '@/lib/notify'
import { logWebhookEvent } from '@/lib/webhook-log'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Inbound realestate.com.au enquiry → Colvy conversation.
//
// A buyer submits an enquiry on a listing; REA posts the lead here. Configure
// the webhook in the REA Portal to:
//   https://colvy.com/api/webhooks/realestate?t=<company webhook token>
// The token (from Channels → RealEstate) resolves the company.
//
// REA's exact field names live behind the partner portal, so we read the enquiry
// tolerantly across the common shapes and keep the raw payload for mapping.

function pick(obj: any, ...keys: string[]) {
  for (const k of keys) {
    const v = k.split('.').reduce((o: any, p) => (o == null ? o : o[p]), obj)
    if (v != null && v !== '') return v
  }
  return null
}
const digits = (s: any) => String(s || '').replace(/\D/g, '')

export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const url = new URL(req.url)
    const token = url.searchParams.get('t') || req.headers.get('x-colvy-token') || ''
    if (!token) return NextResponse.json({ ok: false, reason: 'Missing webhook token' })

    const { data: integ } = await db.from('realestate_integrations')
      .select('company_id, is_active').eq('webhook_token', token).maybeSingle()
    if (!integ?.company_id) return NextResponse.json({ ok: false, reason: 'Unknown token' })
    if (integ.is_active === false) return NextResponse.json({ ok: false, reason: 'Channel disabled' })
    const companyId = integ.company_id

    const body = await req.json().catch(() => ({}))
    // The enquiry may be nested (e.g. { enquiry: {...} } / { data: {...} }).
    const e = body?.enquiry || body?.data || body?.lead || body

    const name = pick(e, 'name', 'fullName', 'contact.name', 'from.name', 'firstName')
      || [pick(e, 'firstName', 'first_name'), pick(e, 'lastName', 'last_name')].filter(Boolean).join(' ') || null
    const email = (pick(e, 'email', 'emailAddress', 'contact.email', 'from.email') || '').toString().toLowerCase() || null
    const phone = pick(e, 'phone', 'phoneNumber', 'mobile', 'contact.phone') || null
    const message = pick(e, 'message', 'comments', 'enquiryMessage', 'body', 'text') || ''
    const listing = pick(e, 'listing.address', 'property.address', 'address', 'listingAddress', 'propertyAddress')
      || pick(e, 'listing.title', 'property.title', 'listingId', 'listing.id') || null
    const enquiryId = pick(e, 'id', 'enquiryId', 'reference', 'leadId')

    logWebhookEvent({ source: 'realestate', eventType: 'enquiry', companyId, payload: { enquiryId, email, phone, listing } })

    if (!email && !phone && !name) {
      // Nothing to attach to a contact — 200 so REA doesn't disable the hook.
      return NextResponse.json({ ok: false, reason: 'Enquiry had no contact details' })
    }

    // ── Find-or-create the contact (by email, else phone) ────────────────────
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

    // ── Compose the enquiry text (listing + buyer's message) ─────────────────
    const parts: string[] = []
    if (listing) parts.push(`🏠 Enquiry about: ${listing}`)
    if (message) parts.push(String(message))
    if (!message && !listing) parts.push('New realestate.com.au enquiry')
    const content = parts.join('\n\n')
    const subject = listing ? `realestate.com.au — ${listing}` : 'realestate.com.au enquiry'

    // ── Thread into the contact's open RealEstate conversation, else create ───
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
    if (!conv) return NextResponse.json({ ok: false, reason: 'Could not create conversation' })

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

    return NextResponse.json({ ok: true, conversationId: conv.id })
  } catch (e: any) {
    console.error('[realestate webhook]', e)
    await logWebhookEvent({ source: 'realestate', status: 'error', error: e?.message })
    return NextResponse.json({ ok: false, error: e.message })
  }
}

// REA (and manual testing) may verify the endpoint with a GET.
export async function GET() {
  return NextResponse.json({ ok: true, service: 'Colvy realestate.com.au enquiry webhook' })
}
