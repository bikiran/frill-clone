import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Keywords that hint the customer wants a claim/return. Kept broad but specific
// enough to avoid false positives on ordinary chat.
const TRIGGER_WORDS = [
  'dead on arrival', 'doa', 'arrived dead', 'came dead', 'dead fish', 'dead',
  'claim', 'faulty', 'broken', 'damaged', 'defective', 'not working', "doesn't work",
  'refund', 'return', 'replacement', 'warranty',
]

// Checks an inbound customer message. If it hints at a claim, the company has a
// claim/return action enabled, and the customer matches a WooCommerce order,
// posts a friendly offer of the pre-filled form into the conversation (once).
export async function POST(req: NextRequest) {
  try {
    const { conversationId, text } = await req.json()
    if (!conversationId || !text) return NextResponse.json({ ok: true, skipped: 'missing' })

    const lower = String(text).toLowerCase()
    const matchedWord = TRIGGER_WORDS.find(w => lower.includes(w))
    if (!matchedWord) return NextResponse.json({ ok: true, triggered: false })

    const db = admin()
    const { data: conv } = await db.from('conversations').select('*').eq('id', conversationId).maybeSingle()
    if (!conv) return NextResponse.json({ ok: true, skipped: 'no conv' })
    // Only offer once per conversation
    if (conv.claim_offered) return NextResponse.json({ ok: true, skipped: 'already offered' })

    const { data: company } = await db.from('companies').select('name, conversation_actions').eq('id', conv.company_id).maybeSingle()
    const actions = company?.conversation_actions || {}
    // Which claim-style action is enabled? Prefer DOA, then return/refund, warranty.
    const claimKey = ['doa', 'return_refund', 'warranty'].find(k => actions[k]?.enabled)
    if (!claimKey) return NextResponse.json({ ok: true, triggered: false, reason: 'no claim action enabled' })

    // Match the customer against WooCommerce (by email or phone on the contact).
    let matched = false
    let contact: any = null
    if (conv.contact_id) {
      const { data: c } = await db.from('contacts').select('*').eq('id', conv.contact_id).maybeSingle()
      contact = c
    }
    const email = contact?.email
    const phone = contact?.phone || conv.sms_number
    if (email) {
      const { data } = await db.from('woocommerce_customers').select('id').eq('company_id', conv.company_id).ilike('email', email).limit(1)
      if (data && data.length > 0) matched = true
    }
    if (!matched && phone) {
      const clean = String(phone).replace(/\D/g, '').slice(-8)
      if (clean.length >= 6) {
        const { data } = await db.from('woocommerce_customers').select('id').eq('company_id', conv.company_id).ilike('phone', `%${clean}%`).limit(1)
        if (data && data.length > 0) matched = true
      }
    }
    if (!matched) return NextResponse.json({ ok: true, triggered: false, reason: 'customer not matched' })

    // Compose the offer. For a form-based action we send the form; for DOA/return
    // we post an offer message + a system flag the widget renders as a button.
    const businessName = company?.name || 'us'
    const firstName = contact?.name ? contact.name.split(' ')[0] : 'there'
    const offerText = `Hi ${firstName}, it looks like you may have an issue with an order. Would you like to start a claim? We can pre-fill most of the details for you — you'll just need to check they're correct. 📋`

    // If the enabled action is linked to a form, attach it so the widget renders it.
    let payload: any = { kind: 'claim_offer', action: claimKey }
    if (actions[claimKey]?.form_id) {
      const { data: form } = await db.from('forms').select('*').eq('id', actions[claimKey].form_id).maybeSingle()
      if (form) {
        payload = { kind: 'form', ref_id: form.id, title: form.title || 'Claim form', options: form.questions || form.options || null, prefill: {
          first_name: contact?.name?.split(' ')[0] || '',
          last_name: contact?.name?.split(' ').slice(1).join(' ') || '',
          email: email || '',
          phone: phone || '',
        } }
      }
    }

    await db.from('messages').insert({
      conversation_id: conversationId, company_id: conv.company_id,
      sender_type: 'agent', sender_name: businessName,
      content: offerText,
      message_type: payload.kind === 'form' ? 'form' : 'text',
      message_payload: payload.kind === 'form' ? payload : { claim_offer: true, action: claimKey },
      metadata: { auto: true, smart_trigger: matchedWord },
    })
    await db.from('conversations').update({
      claim_offered: true,
      last_message: offerText, last_message_at: new Date().toISOString(),
    }).eq('id', conversationId)

    return NextResponse.json({ ok: true, triggered: true, action: claimKey })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
