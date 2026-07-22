/**
 * Carriers we can send tracking links for.
 *
 * ── About the URL formats ───────────────────────────────────────────────────
 * Not every carrier supports a deep link that opens a specific parcel:
 *
 *  • Aramex    — ?l=<number> opens the parcel. Verified working.
 *  • AusPost   — /mypost/track/#/details/<n>. Verified working.
 *  • Team GE   — /myparcel?shipmentID=<n>. Verified working.
 *
 * All three are undocumented query/hash routes rather than published APIs, so
 * if a carrier reworks their site a link may start landing on a search page.
 *
 * The tracking number is always included in the message text as well, so if a
 * link ever stops resolving the customer can still paste the number into the
 * carrier's search box. `deepLink` records whether a carrier opens the parcel
 * directly, so the UI can tell the agent what to expect.
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
    deepLink: true,
    url: n => `https://teamglobalexp.com/myparcel?shipmentID=${encodeURIComponent(n)}`,
    note: 'Opens the parcel directly on MyTeamGE.',
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
