// Typed, safe wrapper around the initialized PostHog instance.
//
// Components call `track(...)` to record a named business event. It's a no-op
// until Analytics.tsx has initialized PostHog (which only happens when
// NEXT_PUBLIC_POSTHOG_KEY is set), and it NEVER throws — analytics must not be
// able to break a user action. PostHog automatically attaches the identified
// user and their `company` group to every event, so these events power
// per-staff and per-workspace dashboards without passing that context here.
//
// Why named events (not just autocapture): autocapture masks all element text
// and attributes on this CRM (customer PII), so a click alone can't tell you an
// order shipped. These explicit events are what fulfilment funnels and
// throughput dashboards are built from.

let ph: any = null

// Called once by Analytics.tsx after posthog.init(). Safe to call again on
// auth changes — the instance is stable.
export function setPosthog(instance: any) { ph = instance }

// The canonical set of business events. Keeping them here (rather than free
// strings at call sites) prevents typos that would fragment a funnel across
// "order_shipped" / "orderShipped" / "shipped".
export type ColvyEvent =
  | 'order_status_set'      // a staff member changed order status (props: status, count, bulk)
  | 'order_labels_printed'  // shipping labels printed (props: count)
  | 'order_slips_printed'   // packing slips printed (props: count)
  | 'order_assigned'        // orders assigned to a teammate (props: count, unassign)
  | 'order_outlet_assigned' // orders assigned to an outlet (props: count)
  // Acquisition / conversion funnel (signup → workspace → checkout)
  | 'signup_started'        // signup page opened
  | 'signup_submitted'      // account created (props: via, joining)
  | 'workspace_created'     // a new workspace came into existence
  | 'pricing_viewed'        // the billing/plans page was opened
  | 'checkout_started'      // upgrade clicked, redirecting to Stripe (props: tier, billing)
  | 'checkout_completed'    // returned from Stripe checkout success (props: tier)
  | 'sale_recorded'         // a tenant logged an attributed sale (props: amount, currency, payment_method)

export function track(event: ColvyEvent, props?: Record<string, any>): void {
  try { ph?.capture?.(event, props) } catch { /* analytics must never break the app */ }
}
