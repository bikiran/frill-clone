// Paid business-number checkouts, from payment to a live number — and the
// lock that makes each one buy exactly one number.
//
// "Get a business number" sends the ID details (number_regulatory_bundles),
// then Stripe checkout. After payment two things try to buy the number, often
// at the same moment: the calls page's finalize call and the Stripe webhook
// (through the internal /api/{twilio,telnyx}/number route). Each claims the
// checkout here first, the way V362 claims a missed-call text: an insert the
// primary key lets only one through, or a conditional update. Only the
// claimant buys; the other is told it's being set up (and waits) or that it's
// done (and gets the number). One row per paid checkout session:
//
//   provisioning  claimed: a number is being bought (by `claimed_by`)
//   active        the number is live (`phone_number`)
//   failed        buying it didn't work; the payment is safe, and the next
//                 try claims it again
//   cancelled     its subscription was cancelled (a refund) before a number
//                 was bought: nothing more is bought for it
//
// A claim whose holder died (a function killed mid-purchase) is taken over
// once it's CLAIM_STALE_MS old: longer than any function runs, so a holder
// that's slow but alive is never overtaken. Setup (lib/setup-status) uses the
// same rows for "Setting up your number" and "needs attention".
//
// Until COLVY_V373_NUMBER_ORDERS.sql runs there's no table: a claim comes back
// 'unavailable', callers fall back to numberBoughtFor() as their only check
// (not atomic, but what there is), and nothing is recorded.

export const CLAIM_STALE_MS = 15 * 60_000

export type NumberOrder = { sessionId: string; companyId: string; provider: 'twilio' | 'telnyx' }
/** A checkout this call has claimed, with the token that proves it. */
export type HeldOrder = NumberOrder & { token: string }
export type NumberClaim =
  | { state: 'claimed'; token: string }            // this call buys the number
  | { state: 'busy' }                              // another call is buying it right now
  | { state: 'done'; phoneNumber: string | null }  // already bought
  | { state: 'cancelled' }                         // refunded: nothing is bought for it
  | { state: 'unavailable' }                       // no table yet (before COLVY_V373)
  | { state: 'error' }                             // the database didn't answer: don't buy

// PostgREST's answers for a table (or column) that isn't there yet, or that
// this key may not use: no lock to be had, as before the migration — unlike a
// database that didn't answer, which mustn't lead to buying blind.
const missingTable = (e: any) => /does not exist|schema cache|permission denied|PGRST20[45]|42P01|42703|42501/i.test(`${e?.code || ''} ${e?.message || ''}`)

/**
 * Claim a paid checkout before buying its number. Atomic: the insert — or,
 * when the last try failed or its holder died, the conditional update —
 * succeeds for one caller only.
 */
export async function claimNumberOrder(db: any, o: NumberOrder, now: Date = new Date()): Promise<NumberClaim> {
  if (!o.sessionId || !o.companyId) return { state: 'error' }
  const token = crypto.randomUUID()
  const claim = { status: 'provisioning', claimed_by: token, error: null, updated_at: now.toISOString() }
  try {
    const { error } = await db.from('number_orders').insert({ stripe_session_id: o.sessionId, company_id: o.companyId, provider: o.provider, ...claim })
    if (!error) return { state: 'claimed', token }
    if (missingTable(error)) return { state: 'unavailable' }
    if (String(error.code) !== '23505') return { state: 'error' }   // anything but "already there"
    // Already there. Ours to try again if the last try failed, or if whoever
    // holds it has been at it far longer than any call runs.
    const stale = new Date(now.getTime() - CLAIM_STALE_MS).toISOString()
    const retakes = [(q: any) => q.eq('status', 'failed'), (q: any) => q.eq('status', 'provisioning').lt('updated_at', stale)]
    for (const only of retakes) {
      const { data, error: upErr } = await only(db.from('number_orders').update(claim)
        .eq('stripe_session_id', o.sessionId).eq('company_id', o.companyId)).select('stripe_session_id')
      if (upErr) return { state: 'error' }
      if (data && data.length) return { state: 'claimed', token }
    }
    const { data: cur, error: readErr } = await db.from('number_orders').select('status, phone_number').eq('stripe_session_id', o.sessionId).maybeSingle()
    if (readErr) return { state: 'error' }
    if (cur?.status === 'active') return { state: 'done', phoneNumber: cur.phone_number ? String(cur.phone_number) : null }
    return cur?.status === 'cancelled' ? { state: 'cancelled' } : { state: 'busy' }
  } catch { return { state: 'error' } }
}

/**
 * How a claimed purchase ended: live with its number, or failed — which hands
 * the claim back, so a later try (the page's retry, "Finish setting up") can
 * take it. Only the holder can hand its own claim back.
 */
export async function finishNumberOrder(db: any, held: HeldOrder, outcome: { phoneNumber: string } | { error?: string | null }): Promise<void> {
  const at = new Date().toISOString()
  try {
    if ('phoneNumber' in outcome) {
      await db.from('number_orders').update({ status: 'active', phone_number: outcome.phoneNumber, error: null, updated_at: at })
        .eq('stripe_session_id', held.sessionId)
    } else {
      await db.from('number_orders').update({ status: 'failed', error: String(outcome.error || 'The number could not be set up.').slice(0, 500), updated_at: at })
        .eq('stripe_session_id', held.sessionId).eq('claimed_by', held.token).eq('status', 'provisioning')
    }
  } catch { /* recorded best-effort; a claim left behind goes stale */ }
}

/**
 * A paid checkout whose provisioning never got as far as a claim (the webhook
 * couldn't reach the route, or the route turned it away): recorded as failed,
 * so setup asks for it to be finished and the next try claims it. Only ever an
 * insert, which the primary key refuses when anything already holds or
 * finished the checkout. Says whether the checkout is now on record:
 * 'recorded', 'exists' (it already was), 'unavailable' (no table yet), or
 * 'error' (the database didn't answer: nothing anywhere says it was paid).
 */
export async function recordUnclaimedFailure(db: any, o: NumberOrder, error?: string | null): Promise<'recorded' | 'exists' | 'unavailable' | 'error'> {
  if (!o.sessionId || !o.companyId) return 'error'
  try {
    const { error: insErr } = await db.from('number_orders').insert({
      stripe_session_id: o.sessionId, company_id: o.companyId, provider: o.provider, status: 'failed', claimed_by: null,
      error: String(error || 'The number could not be set up.').slice(0, 500), updated_at: new Date().toISOString(),
    })
    if (!insErr) return 'recorded'
    if (String(insErr.code) === '23505') return 'exists'
    return missingTable(insErr) ? 'unavailable' : 'error'
  } catch { return 'error' }
}

/**
 * The checkout's subscription was cancelled (support refunded it) before a
 * number was bought: no number is bought for it, and setup stops asking for
 * it to be finished. Only the holder can.
 */
export async function cancelNumberOrder(db: any, held: HeldOrder, reason: string): Promise<void> {
  try {
    await db.from('number_orders').update({ status: 'cancelled', error: reason.slice(0, 500), updated_at: new Date().toISOString() })
      .eq('stripe_session_id', held.sessionId).eq('claimed_by', held.token).eq('status', 'provisioning')
  } catch { /* recorded best-effort */ }
}

/** A number checkout's Stripe subscription is still being paid for. */
export const LIVE_SUBSCRIPTION = ['active', 'trialing']
export const CANCELLED_CHECKOUT = 'This number’s subscription has been cancelled, so it can’t be set up. Contact support if that’s a mistake.'

/** finishNumberOrder from a provisioning route's own response: a number → live; anything else → failed. */
export async function finishNumberOrderFrom(db: any, held: HeldOrder, res: Response): Promise<void> {
  let body: any = null
  try { body = await res.clone().json() } catch { /* not JSON */ }
  if (res.ok && body?.phoneNumber) await finishNumberOrder(db, held, { phoneNumber: String(body.phoneNumber) })
  else await finishNumberOrder(db, held, { error: body?.error || `HTTP ${res.status}` })
}

/** `answer`, when set, is the response to send instead of buying. */
export type PurchaseStart = { held: HeldOrder | null; answer: { status: number; body: Record<string, unknown> } | null }

/**
 * What a route that buys a paid checkout's number does first. Either go ahead
 * and buy (holding the claim — null before COLVY_V373), or answer now: it's
 * being bought elsewhere (202, the calls page tries again in a few seconds),
 * it's already bought (the number), or the claim couldn't be checked (503, so
 * nothing is bought blind). A route that went ahead, or answered while holding
 * the claim, passes its response to finishNumberOrderFrom.
 */
export async function startNumberPurchase(db: any, o: NumberOrder, subscriptionId?: string | null): Promise<PurchaseStart> {
  const claim = await claimNumberOrder(db, o)
  if (claim.state === 'busy') return { held: null, answer: { status: 202, body: { pending: true, error: 'Your number is being set up. This can take up to a minute.' } } }
  if (claim.state === 'cancelled') return { held: null, answer: { status: 409, body: { error: CANCELLED_CHECKOUT, cancelled: true } } }
  if (claim.state === 'error') return { held: null, answer: { status: 503, body: { error: 'Couldn’t start setting up your number just now. Your payment is safe — try again in a moment.' } } }
  const held = claim.state === 'claimed' ? { ...o, token: claim.token } : null
  // Already bought: the claim's record says so, or (before COLVY_V373, or for
  // a purchase from before it) what provisioning wrote does.
  const phoneNumber = (claim.state === 'done' && claim.phoneNumber) || await numberBoughtFor(db, { companyId: o.companyId, provider: o.provider, subscriptionId })
  if (phoneNumber || claim.state === 'done') return { held, answer: { status: 200, body: { ok: true, phoneNumber: phoneNumber || null, alreadyDone: true } } }
  return { held, answer: null }
}

/**
 * The number a checkout already bought, from what provisioning itself writes,
 * so it works before COLVY_V373 and for purchases made before it. (There's no
 * phone_numbers.stripe_subscription_id.) The carrier's integration row keeps
 * the latest purchase's Stripe subscription next to that number's id — Twilio
 * `number_sid`, Telnyx `number_order_id` — which phone_numbers stores as
 * `twilio_sid` / `telnyx_number_id`. Not atomic: two calls at the same moment
 * can both see nothing, which is what the claim is for.
 */
export async function numberBoughtFor(db: any, o: { companyId: string; provider: 'twilio' | 'telnyx'; subscriptionId?: string | null }): Promise<string | null> {
  if (!o.subscriptionId) return null
  const twilio = o.provider === 'twilio'
  try {
    const { data: integ } = await db.from(twilio ? 'twilio_integrations' : 'telnyx_integrations')
      .select(twilio ? 'phone_number, number_sid' : 'phone_number, number_order_id')
      .eq('company_id', o.companyId).eq('stripe_subscription_id', o.subscriptionId).maybeSingle()
    if (!integ) return null
    const numberId = twilio ? integ.number_sid : integ.number_order_id
    if (numberId) {
      const { data: pn } = await db.from('phone_numbers').select('phone_number')
        .eq('company_id', o.companyId).eq(twilio ? 'twilio_sid' : 'telnyx_number_id', numberId).maybeSingle()
      if (pn?.phone_number) return String(pn.phone_number)
    }
    // Bought, then, but not recorded in phone_numbers: the integration's own number.
    return integ.phone_number ? String(integ.phone_number) : null
  } catch { return null }
}
