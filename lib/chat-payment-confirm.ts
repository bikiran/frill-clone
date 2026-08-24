// Shared "a chat payment just succeeded" handler, used by BOTH the Stripe
// webhook and the verify-payment reconciler so the two paths can't diverge or
// double-fire. It:
//   1. Claims the pending → paid transition atomically (only one caller wins),
//   2. Flips the in-chat payment card to "paid",
//   3. Posts a "Payment received" confirmation into the thread,
//   4. Pushes a phone notification to the team.
// Returns whether THIS call was the one that confirmed it (so the caller only
// runs its own side-effects — Woo order update, link report — once).

export interface ChatPaymentRow {
  id: string
  company_id: string
  conversation_id: string | null
  message_id: string | null
  amount_cents: number | null
}

export async function confirmChatPayment(
  db: any,
  pay: ChatPaymentRow,
  opts?: { receiptUrl?: string | null; paymentIntent?: string | null; orderId?: string | number | null; orderNumber?: string | null },
): Promise<{ confirmed: boolean }> {
  // ── 1. Claim the transition. Only proceeds if the row is still pending, so a
  // webhook and a verify-payment poll racing each other confirm exactly once.
  const patch: any = { status: 'paid', paid_at: new Date().toISOString() }
  if (opts?.receiptUrl) patch.receipt_url = opts.receiptUrl
  if (opts?.paymentIntent) patch.stripe_payment_intent = opts.paymentIntent
  let claimed = false
  try {
    const { data } = await db.from('chat_payments').update(patch).eq('id', pay.id).eq('status', 'pending').select('id')
    claimed = Array.isArray(data) && data.length > 0
  } catch {
    // Older schema without receipt/intent columns — retry minimal.
    try {
      const { data } = await db.from('chat_payments').update({ status: 'paid', paid_at: new Date().toISOString() })
        .eq('id', pay.id).eq('status', 'pending').select('id')
      claimed = Array.isArray(data) && data.length > 0
    } catch {}
  }
  if (!claimed) return { confirmed: false }

  const amountStr = pay.amount_cents ? `$${(pay.amount_cents / 100).toFixed(2)} AUD` : ''
  const base = String(process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')

  // ── 2. Flip the in-chat payment card to paid, and learn the channel it was
  // sent on (so the customer-facing confirmation goes back the same way).
  let paidChannel = ''
  let checkoutUrl = ''
  if (pay.message_id) {
    try {
      const { data: m } = await db.from('messages').select('message_payload, delivery_channel').eq('id', pay.message_id).maybeSingle()
      paidChannel = String((m as any)?.delivery_channel || '').toLowerCase()
      checkoutUrl = String((m as any)?.message_payload?.checkout_url || '')
      await db.from('messages').update({
        message_payload: { ...((m as any)?.message_payload || {}), status: 'paid' },
      }).eq('id', pay.message_id)
    } catch {}
  }

  // Look up the conversation + contact once — used for the pill, the timeline,
  // the customer reply, and the team push.
  let company = '', who = '', channel = paidChannel, phone = '', email = '', subject = ''
  if (pay.conversation_id) {
    try {
      const { data: conv } = await db.from('conversations').select('subject, contact_id, channel, sms_number').eq('id', pay.conversation_id).maybeSingle()
      subject = String(conv?.subject || '').trim()
      if (!channel) channel = String(conv?.channel || '').toLowerCase()
      phone = String(conv?.sms_number || '')
      if (conv?.contact_id) {
        const { data: ct } = await db.from('contacts').select('name, phone, email').eq('id', conv.contact_id).maybeSingle()
        who = String(ct?.name || '').trim()
        if (!phone) phone = String(ct?.phone || '')
        email = String(ct?.email || '')
      }
    } catch {}
  }
  try {
    const { data: co } = await db.from('companies').select('name').eq('id', pay.company_id).maybeSingle()
    company = String(co?.name || '').trim()
  } catch {}
  if (!who) who = subject

  // ── 3. Post the in-chat "Payment received" PILL (system event) + timeline.
  if (pay.conversation_id) {
    try {
      await db.from('messages').insert({
        conversation_id: pay.conversation_id,
        company_id: pay.company_id,
        sender_type: 'system',
        content: `✅ Payment received${amountStr ? ` — ${amountStr}` : ''}`,
        metadata: { payment_confirmed: true, payment_id: pay.id, kind: 'payment_received', amount_cents: pay.amount_cents || null },
      })
    } catch {}
    // Timeline pill (mirrors close/reopen/order events).
    try {
      await db.from('conversation_events').insert({
        conversation_id: pay.conversation_id,
        company_id: pay.company_id,
        event_type: 'payment_received',
        actor_name: who || null,
        detail: `Payment received${amountStr ? ` — ${amountStr}` : ''}`,
      })
    } catch {}
    try {
      await db.from('conversations').update({
        last_message: `✅ Payment received${amountStr ? ` — ${amountStr}` : ''}`,
        last_message_at: new Date().toISOString(),
      }).eq('id', pay.conversation_id)
    } catch {}
  }

  // ── 4. Send the customer a confirmation over their own channel, so it lands
  // in the thread as a sent message AND reaches them by SMS/email/DM.
  if (pay.conversation_id) {
    const custMsg = `Your payment of ${amountStr || 'the requested amount'} has been received. Thank you!`
    const senderName = company || 'Support'
    try {
      if (channel === 'email' && email) {
        await fetch(`${base}/api/email/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: pay.company_id, conversationId: pay.conversation_id, to: email, subject: subject || 'Payment received', text: custMsg, senderName }),
        })
      } else if (['facebook', 'instagram', 'messenger'].includes(channel)) {
        await fetch(`${base}/api/meta/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ conversationId: pay.conversation_id, content: custMsg, agentName: senderName }),
        })
      } else if (phone) {
        // SMS (and the default). The send route logs the outbound bubble itself.
        await fetch(`${base}/api/telnyx/sms/send`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ companyId: pay.company_id, conversationId: pay.conversation_id, to: phone, text: custMsg, senderName }),
        })
      } else {
        // Live-chat / unknown channel — just log it so the widget shows it.
        await db.from('messages').insert({
          conversation_id: pay.conversation_id, company_id: pay.company_id,
          sender_type: 'agent', sender_name: senderName, content: custMsg,
        })
      }
    } catch { /* delivery is best-effort — the pill + timeline still recorded it */ }
  }

  // ── 5. Push a phone notification to the team.
  try {
    await fetch(`${base}/api/push/send`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companyId: pay.company_id,
        title: 'Payment received',
        body: `${amountStr || 'Payment'} received${who ? ` from ${who}` : ''}`,
        channelId: 'payments',
        ...(pay.conversation_id ? { conversationId: pay.conversation_id, route: `/conversation/${pay.conversation_id}` } : {}),
      }),
    })
  } catch { /* notification is best-effort */ }

  // ── 6. Credit this payment link in Link Reports. The payment link WAS the
  // click, so its revenue is directly attributable — not merely "influenced".
  // This lives here (not in the caller) so it runs no matter WHICH path
  // confirmed the payment — the Stripe webhook OR the verify-payment poll —
  // and exactly once, because we only reach this line when THIS call claimed
  // the pending→paid transition. (Previously it lived only in the webhook, so
  // a payment confirmed by verify-payment showed Revenue "—" in the report.)
  try {
    const code = (checkoutUrl.match(/\/l\/([A-Za-z0-9_-]+)/) || [])[1]
    if (code) {
      const { data: link } = await db.from('short_links').select('id, contact_id').eq('code', code).maybeSingle()
      if (link?.id) {
        const orderId = opts?.orderId ? String(opts.orderId) : (opts?.paymentIntent || `pay_${pay.id}`)
        await db.from('link_conversions').upsert({
          company_id: pay.company_id, link_id: link.id, contact_id: link.contact_id || null,
          order_id: orderId,
          order_number: opts?.orderNumber || (opts?.orderId ? String(opts.orderId) : null),
          stage: 'paid',
          revenue: (pay.amount_cents || 0) / 100, currency: 'aud',
          clicked_at: new Date().toISOString(), converted_at: new Date().toISOString(),
        }, { onConflict: 'link_id,order_id,stage' })
      }
    }
  } catch { /* analytics only — never affect payment processing */ }

  return { confirmed: true }
}
