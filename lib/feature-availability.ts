// Features the marketing site mentions that aren't live yet. Pages, menus,
// pricing and comparison tables read this map, so they label the feature
// "Coming soon" (and never tick it as available) while it's true.
//
// When a feature ships, set its value to false. The labels and pills go away
// everywhere at once; then reword that feature's own page, which describes it
// in the future tense while it's coming.
export const COMING_SOON = {
  whatsapp: true,         // WhatsApp Business messages in the shared inbox
  numberPorting: true,    // moving an existing number into Colvy
  nationalNumbers: true,  // 1300 / 1800 numbers
  ivr: false,             // press-1 menus / auto-attendant (call routing, V399)
  cascadeRing: false,     // ringing people one after another (call routing, V399)
  callForwarding: false,  // forwarding calls to an outside number (call routing, V399)
  internationalCalling: true,
  hdAudio: true,          // wideband / HD voice on calls
  bookingWaitlist: true,  // offering freed-up booking slots to a waitlist
  outletStock: false,     // stock for each store: Shopify locations; WooCommerce with the Stock Locations plugin (V401)
} as const

export type ComingSoonKey = keyof typeof COMING_SOON

export const isComingSoon = (key: ComingSoonKey): boolean => COMING_SOON[key]

/** "Label (coming soon)" while the feature isn't live, else just "Label". */
export const soonLabel = (label: string, key: ComingSoonKey): string =>
  COMING_SOON[key] ? `${label} (coming soon)` : label
