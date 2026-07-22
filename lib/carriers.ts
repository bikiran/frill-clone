/**
 * Carriers we can send tracking links for.
 *
 * ── About the URL formats ───────────────────────────────────────────────────
 * Not every carrier supports a deep link that opens a specific parcel:
 *
 *  • Aramex    — supports it properly (?l=<number> opens the parcel).
 *  • AusPost   — their tracker is a single-page app; the /track/#/details/<n>
 *                route is what most e-commerce integrations use, but Australia
 *                Post don't document it, so it may change.
 *  • Team GE   — no documented deep link at all; MyTeamGE expects the number to
 *                be typed into a field on the page.
 *
 * Where a deep link isn't reliable the customer still gets the number in the
 * message text, so they can paste it into the carrier's search box. That's why
 * `deepLink` is recorded per carrier — the UI tells the agent what to expect
 * rather than silently sending a link that lands on a search page.
 *
 * To add or correct a carrier, edit this list — nothing else needs to change.
 */
export interface Carrier {
  key: string
  label: string
  /** True when the URL opens the parcel directly. */
  deepLink: boolean
  /** Build the tracking URL for a number. */
  url: (trackingNumber: string) => string
  /** Shown under the field so the agent knows what the customer will see. */
  note?: string
}

export const CARRIERS: Carrier[] = [
  {
    key: 'auspost',
    label: 'Australia Post',
    deepLink: true,
    url: n => `https://auspost.com.au/mypost/track/#/details/${encodeURIComponent(n)}`,
    note: 'Opens the parcel on Australia Post. If it lands on the search page, the number is in the message too.',
  },
  {
    key: 'aramex',
    label: 'Aramex',
    deepLink: true,
    url: n => `https://www.aramex.com.au/tools/track?l=${encodeURIComponent(n)}`,
    note: 'Opens the parcel directly on Aramex.',
  },
  {
    key: 'tge',
    label: 'Team Global Express',
    deepLink: false,
    url: () => 'https://teamglobalexp.com/myparcel',
    note: "Team Global Express has no direct link — the customer enters the number on MyTeamGE. It's included in the message.",
  },
  {
    key: 'manual',
    label: 'Manual / other',
    deepLink: false,
    url: () => '',
    note: 'Paste the tracking URL yourself, or send just the number.',
  },
]

export const carrierByKey = (key: string): Carrier | undefined =>
  CARRIERS.find(c => c.key === key)
