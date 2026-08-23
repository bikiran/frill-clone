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
  opts?: { receiptUrl?: string | null; paymentIntent?: string | null },
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

  // ── 2. Flip the in-chat payment card to paid.
  if (pay.message_id) {
    try {
      const { data: m } = await db.from('messages').select('message_payload').eq('id', pay.message_id).maybeSingle()
      await db.from('messages').update({
        message_payload: { ...((m as any)?.message_payload || {}), status: 'paid' },
      }).eq('id', pay.message_id)
    } catch {}
  }

  // ── 3. Post the confirmation into the thread.
  if (pay.conversation_id) {
    try {
      await db.from('messages').insert({
        conversation_id: pay.conversation_id,
        company_id: pay.company_id,
        sender_type: 'system',
        content: `✅ Payment received${amountStr ? ` — ${amountStr}` : ''}. A receipt has been emailed to the customer.`,
        metadata: { payment_confirmed: true, payment_id: pay.id },
      })
      await db.from('conversations').update({
        last_message: `✅ Payment received${amountStr ? ` — ${amountStr}` : ''}`,
        last_message_at: new Date().toISOString(),
      }).eq('id', pay.conversation_id)
    } catch {}
  }

  // ── 4. Push a phone notification to the team.
  try {
    // Name the payer so the notification reads "…from Jessica Hastings".
    let who = ''
    if (pay.conversation_id) {
      const { data: conv } = await db.from('conversations').select('subject, contact_id').eq('id', pay.conversation_id).maybeSingle()
      if (conv?.contact_id) {
        const { data: ct } = await db.from('contacts').select('name').eq('id', conv.contact_id).maybeSingle()
        who = String(ct?.name || '').trim()
      }
      if (!who) who = String(conv?.subject || '').trim()
    }
    const base = String(process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com').replace(/\/$/, '')
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

  return { confirmed: true }
}
