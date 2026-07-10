import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Called right after a new conversation's first inbound message. Sends:
//  1. A thank-you auto-reply (once per conversation)
//  2. If no email/phone is known, a prompt asking the customer to share them
// Works for any channel (widget, SMS, Instagram, Facebook) since it's server-side.
export async function POST(req: NextRequest) {
  try {
    const { conversationId } = await req.json()
    if (!conversationId) return NextResponse.json({ error: 'Missing conversationId' }, { status: 400 })

    const db = admin()
    const { data: conv } = await db.from('conversations').select('*').eq('id', conversationId).maybeSingle()
    if (!conv) return NextResponse.json({ error: 'Conversation not found' }, { status: 404 })
    if (conv.auto_replied) return NextResponse.json({ ok: true, skipped: 'already replied' })

    const { data: company } = await db.from('companies').select('*').eq('id', conv.company_id).maybeSingle()
    const businessName = company?.name || 'us'

    const messagesToSend: any[] = []

    // 1. Thank-you auto-reply
    if (company?.auto_reply_enabled !== false) {
      const text = (company?.auto_reply_message && company.auto_reply_message.trim())
        || `Thank you for contacting ${businessName}. We have received your message and appreciate you getting in touch. We'll get back to you as soon as we can.`
      messagesToSend.push({
        conversation_id: conversationId, company_id: conv.company_id,
        sender_type: 'agent', sender_name: businessName, content: text,
        message_type: 'text', metadata: { auto: true },
      })
    }

    // 2. Ask for contact info if we don't have email or phone
    let needContact = false
    if (company?.request_contact_info !== false && !conv.contact_info_requested) {
      let hasEmail = !!conv.sms_number
      let hasPhone = !!conv.sms_number
      if (conv.contact_id) {
        const { data: c } = await db.from('contacts').select('email, phone').eq('id', conv.contact_id).maybeSingle()
        hasEmail = hasEmail || !!c?.email
        hasPhone = hasPhone || !!c?.phone
      }
      if (!hasEmail && !hasPhone) {
        needContact = true
        messagesToSend.push({
          conversation_id: conversationId, company_id: conv.company_id,
          sender_type: 'agent', sender_name: businessName,
          content: 'Please text us your phone number and email in the chat. We will get back to you as soon as we can.',
          message_type: 'text', metadata: { auto: true, contact_request: true },
        })
      }
    }

    if (messagesToSend.length > 0) {
      await db.from('messages').insert(messagesToSend)
      await db.from('conversations').update({
        auto_replied: true,
        contact_info_requested: needContact ? true : conv.contact_info_requested,
        last_message: messagesToSend[messagesToSend.length - 1].content,
        last_message_at: new Date().toISOString(),
      }).eq('id', conversationId)
    }

    return NextResponse.json({ ok: true, sent: messagesToSend.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
