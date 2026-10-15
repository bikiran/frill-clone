// Paid business-number checkouts, from payment to a live number.
//
// "Get a business number" sends the ID details (number_regulatory_bundles),
// then Stripe checkout, then the number is bought by the calls page's finalize
// call or the Stripe webhook, whichever gets there first. Nothing was written
// until the number was live, so setup (lib/setup-status) couldn't tell a
// checkout that was never paid from one that's paid and being set up, or one
// whose number didn't set up. One row per paid checkout session:
//
//   provisioning  paid, the number is being bought
//   active        the number is live
//   failed        buying it didn't work; the payment is safe, and the calls
//                 page's finalize can be run again for the same checkout
//
// Best-effort: until COLVY_V373_NUMBER_ORDERS.sql runs there's no table, every
// write here quietly does nothing, and setup reads as it did before.

export type NumberOrderStatus = 'provisioning' | 'active' | 'failed'
export type NumberOrder = { sessionId: string; companyId: string; provider: 'twilio' | 'telnyx' }

export async function noteNumberOrder(db: any, o: NumberOrder | null, status: NumberOrderStatus, extra: { phoneNumber?: string | null; error?: string | null } = {}): Promise<void> {
  if (!o?.sessionId || !o.companyId) return
  const now = new Date().toISOString()
  const error = status === 'failed' ? String(extra.error || 'The number could not be set up.').slice(0, 500) : null
  const row = { stripe_session_id: o.sessionId, company_id: o.companyId, provider: o.provider, status, error, updated_at: now }
  try {
    if (status === 'active') {
      await db.from('number_orders').upsert({ ...row, phone_number: extra.phoneNumber || null }, { onConflict: 'stripe_session_id' })
      return
    }
    // The page and the webhook can both be at work on one checkout: a number
    // that's live never goes back to "being set up" or "failed".
    const { data } = await db.from('number_orders').update({ status, error, updated_at: now })
      .eq('stripe_session_id', o.sessionId).eq('company_id', o.companyId).neq('status', 'active').select('stripe_session_id')
    if (Array.isArray(data) && data.length) return
    // Not recorded yet (or already live, and this just hits the key).
    await db.from('number_orders').insert(row)
  } catch { /* table not there yet */ }
}

/**
 * Record how a finalize / provisioning call for a paid checkout ended, from
 * its response: a number → live; an error → failed. 202 ("payment still
 * settling") says nothing yet.
 */
export async function noteNumberOrderResult(db: any, o: NumberOrder | null, res: Response): Promise<void> {
  if (!o || res.status === 202) return
  let body: any = null
  try { body = await res.clone().json() } catch { /* not JSON */ }
  if (res.ok && body?.phoneNumber) await noteNumberOrder(db, o, 'active', { phoneNumber: String(body.phoneNumber) })
  else if (!res.ok) await noteNumberOrder(db, o, 'failed', { error: body?.error })
}
