// After Stripe checkout the calls page asks the finalize route to set up the
// number until it's live. A 202 means "not yet": the payment is still settling,
// or the Stripe webhook is buying the number right now (lib/number-orders). It
// asks again less and less often for a few minutes; if the number still isn't
// there, the page says it's on its way rather than leaving "setting up" up.

export const FINALIZE_PATIENCE_MS = 4 * 60_000

export type FinalizeNext = { live: true } | { retryIn: number } | { stillSettingUp: true } | { failed: true }

/** What to do after the `tries`-th finalize answer, `elapsedMs` after the first. */
export function finalizeNext(res: { ok: boolean; status: number }, body: any, tries: number, elapsedMs: number): FinalizeNext {
  if (res.ok && body?.phoneNumber) return { live: true }
  // Refunded: asking again won't change that.
  if (body?.cancelled) return { failed: true }
  // 3s at first, doubling every four tries, at most 20s apart.
  if (res.status === 202 && elapsedMs < FINALIZE_PATIENCE_MS) return { retryIn: Math.min(3000 * 2 ** Math.floor((tries - 1) / 4), 20_000) }
  // Still pending after all that (or done without a number to show).
  if (res.ok) return { stillSettingUp: true }
  return tries < 4 ? { retryIn: 3000 } : { failed: true }
}
