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
  ivr: true,              // press-1 menus / auto-attendant
  cascadeRing: true,      // ringing people one after another
  callForwarding: true,   // forwarding calls to an outside number
  internationalCalling: true,
  hdAudio: true,          // wideband / HD voice on calls
  bookingWaitlist: true,  // offering freed-up booking slots to a waitlist
  outletStock: true,      // stock levels for each store / outlet
} as const

export type ComingSoonKey = keyof typeof COMING_SOON

export const isComingSoon = (key: ComingSoonKey): boolean => COMING_SOON[key]

/** "Label (coming soon)" while the feature isn't live, else just "Label". */
export const soonLabel = (label: string, key: ComingSoonKey): string =>
  COMING_SOON[key] ? `${label} (coming soon)` : label
