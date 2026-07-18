/**
 * SMS segment counting.
 *
 * This matters commercially: carriers bill per segment, and the encoding
 * changes how many characters fit in one.
 *
 *   GSM-7  — 160 chars in a single segment, 153 per segment once it splits
 *   UCS-2  — 70 chars single, 67 per segment (used the moment ONE character
 *            falls outside GSM-7, e.g. an emoji or a curly quote)
 *
 * So adding a single emoji to a 150-character message takes it from 1 segment
 * to 3. The composer surfaces this so it isn't discovered on the invoice.
 */

// The GSM 03.38 basic character set.
const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà'

// These exist in GSM-7 but occupy TWO character slots each.
const GSM7_EXTENDED = '^{}\\[~]|€'

export type SmsEncoding = 'GSM-7' | 'UCS-2'

export interface SegmentInfo {
  encoding: SmsEncoding
  /** Billable character units (extended GSM chars count as 2). */
  length: number
  segments: number
  /** Characters left before another segment is added. */
  remaining: number
  perSegment: number
  /** Characters that forced UCS-2, for a helpful warning. */
  nonGsmChars: string[]
}

export function analyseSms(text: string): SegmentInfo {
  const msg = text || ''

  // Does every character fit in GSM-7?
  const nonGsm: string[] = []
  for (const ch of msg) {
    if (!GSM7_BASIC.includes(ch) && !GSM7_EXTENDED.includes(ch)) {
      if (!nonGsm.includes(ch)) nonGsm.push(ch)
    }
  }
  const encoding: SmsEncoding = nonGsm.length > 0 ? 'UCS-2' : 'GSM-7'

  let length: number
  if (encoding === 'GSM-7') {
    // Extended characters take two slots.
    length = 0
    for (const ch of msg) length += GSM7_EXTENDED.includes(ch) ? 2 : 1
  } else {
    // UCS-2 counts UTF-16 code units, so emoji outside the BMP count as 2.
    length = msg.length
  }

  const single = encoding === 'GSM-7' ? 160 : 70
  const multi = encoding === 'GSM-7' ? 153 : 67

  let segments: number
  let perSegment: number
  if (length === 0) { segments = 0; perSegment = single }
  else if (length <= single) { segments = 1; perSegment = single }
  else { segments = Math.ceil(length / multi); perSegment = multi }

  const capacity = segments <= 1 ? single : segments * multi
  return {
    encoding,
    length,
    segments,
    remaining: Math.max(0, capacity - length),
    perSegment,
    nonGsmChars: nonGsm.slice(0, 8),
  }
}

/**
 * Substitute personalisation variables.
 *
 * Used for the live preview and, later, for the real send. Unknown variables
 * are left visible rather than blanked, so a typo like {{frist_name}} is
 * obvious in the preview instead of silently producing "Hi ,".
 */
export function renderVariables(text: string, vars: Record<string, string>): string {
  return (text || '').replace(/\{\{(\w+)\}\}/g, (whole, key) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? (vars[key] ?? '') : whole
  )
}

/** Variables the composer offers, with sample values used for the preview. */
export const SMS_VARIABLES: { token: string; label: string; sample: string }[] = [
  { token: 'first_name',   label: 'First name',   sample: 'Sarah' },
  { token: 'store_name',   label: 'Store name',   sample: 'Roxy Aquarium' },
  { token: 'outlet',       label: 'Outlet',       sample: 'Somerton' },
  { token: 'order_number', label: 'Order number', sample: '121024' },
  { token: 'coupon_code',  label: 'Coupon code',  sample: 'FISH15' },
  { token: 'short_link',   label: 'Tracked link', sample: 'roxyaquarium.colvy.com/l/a7Kd93m' },
]

/**
 * Estimated campaign cost.
 *
 * Variables expand to different lengths per recipient, so this is an estimate
 * based on the previewed sample values — a recipient with a longer name can
 * tip a borderline message into an extra segment.
 */
export function estimateCost(segments: number, recipients: number, perSegmentPrice: number) {
  return segments * recipients * perSegmentPrice
}
