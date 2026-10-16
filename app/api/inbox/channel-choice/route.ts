import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveChannel } from '@/lib/channel-choice-server'
import { inboxReplyTo, INBOUND_ENABLED } from '@/lib/inbound-alias'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET ?conversationId=…  or  ?companyId=…&contactId=…
// → { channel, reason, canSms, canEmail, smsOptIn, replyTo, repliesToInbox }
//
// Which channel a reply to this customer should default to — the same rule the
// automated messages use (lib/channel-choice): the channel they last used,
// else SMS when they have a mobile, haven't opted out (and, on the website
// chat, opted in) and the business can text, else email; a website chat
// visitor on the page right now gets live chat. Also where an email reply's answer comes back to, for the
// composer's "Replies come back to this inbox" hint. Workspace members only.
export async function GET(req: NextRequest) {
  try {
    const sp = req.nextUrl.searchParams
    const conversationId = sp.get('conversationId')
    const db = admin()
    let companyId = sp.get('companyId')
    let contactId = sp.get('contactId')
    let conv: any = null
    if (conversationId) {
      const { data } = await db.from('conversations').select('id, company_id, contact_id, email_channel_id').eq('id', conversationId).maybeSingle()
      if (!data) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
      conv = data
      companyId = data.company_id
      contactId = contactId || data.contact_id || null
    }
    if (!companyId) return NextResponse.json({ error: 'conversationId or companyId required' }, { status: 400 })
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (contactId) {
      const { data: c } = await db.from('contacts').select('id').eq('id', contactId).eq('company_id', companyId).maybeSingle()
      if (!c) contactId = null
    }

    const pick = await resolveChannel(db, { companyId, conversationId: conv?.id || null, contactId })

    // Where a customer's email reply lands.
    let channel: any = null
    if (conv?.email_channel_id) {
      const { data } = await db.from('email_channels').select('inbound_address, from_address').eq('id', conv.email_channel_id).eq('company_id', companyId).maybeSingle()
      channel = data
    }
    if (!channel) {
      const { data } = await db.from('email_channels').select('inbound_address, from_address').eq('company_id', companyId).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
      channel = data?.[0] || null
    }
    const { data: company } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
    const replyTo = inboxReplyTo(company, channel) || null

    return NextResponse.json({
      channel: pick.channel, reason: pick.reason, canSms: pick.canSms, canEmail: pick.canEmail,
      // false: a website chat visitor who didn't opt in to texts (the inbox's
      // automatic send doesn't text them).
      smsOptIn: pick.facts.smsOptIn ?? null,
      replyTo,
      // On the Colvy inbound domain the reply comes straight back into this
      // inbox; on the mailbox's own address it arrives there (and the sync brings it in).
      repliesToInbox: !!replyTo && INBOUND_ENABLED,
    }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Could not work out the channel' }, { status: 500 })
  }
}
