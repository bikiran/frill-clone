// The kinds of Australian number Colvy sells, and what differs between them:
// which Twilio inventory they come from, what they cost, and which regulatory
// bundle Twilio wants before it will sell one.
//
//   local     02 / 03 / 07 / 08 landline   AvailablePhoneNumbers/AU/Local
//   mobile    04 mobile                    AvailablePhoneNumbers/AU/Mobile
//   tollfree  1800 (callers ring free)     AvailablePhoneNumbers/AU/TollFree
//
// 1300 / 13 (local-rate) numbers aren't sold by Twilio, so Colvy doesn't offer
// them (COMING_SOON.localRateNumbers).
//
// Toll-free numbers take calls only (Twilio's AU toll-free numbers aren't SMS
// capable), and cost the business more to carry, so they have their own
// monthly price. Colvy doesn't bill call minutes per number; heavy 1800 use is
// an Enterprise conversation (the pricing page says minutes are metered and to
// contact us for high-volume rates).
//
// Env:
//   COLVY_NUMBER_PRICE_AUD               local + mobile, A$/month (default 15)
//   COLVY_TOLLFREE_PRICE_AUD             1800, A$/month (default 25)
//   TWILIO_TOLLFREE_BUNDLE_NUMBER_TYPE   the bundle NumberType Twilio wants for an
//                                        AU toll-free number (default 'toll-free',
//                                        Twilio's documented value); override if
//                                        the live account's AU regulation says
//                                        otherwise
//   TWILIO_TOLLFREE_END_USER_TYPE        force 'business' or 'individual' for
//                                        toll-free bundles (default: what the
//                                        form says, like local/mobile)
//   TWILIO_TOLLFREE_REGULATION_SID       optional RegulationSid (RNxxxx) to pin
//                                        the AU toll-free regulation

export type NumberKind = 'local' | 'mobile' | 'tollfree'

export const NUMBER_KINDS: NumberKind[] = ['local', 'mobile', 'tollfree']

/** A request's number type, defaulting to local for anything unknown. */
export function cleanNumberKind(v: unknown): NumberKind {
  const s = String(v || '').toLowerCase().replace(/[^a-z0-9]/g, '')
  if (s === 'mobile') return 'mobile'
  if (s === 'tollfree' || s === '1800') return 'tollfree'
  return 'local'
}

/** What kind an E.164 Australian number is (+614… mobile, +611800… toll-free, else local). */
export function numberKindOf(e164: string): NumberKind | 'localrate' {
  const d = String(e164 || '').replace(/[^\d]/g, '').replace(/^61/, '')
  if (d.startsWith('4')) return 'mobile'
  if (d.startsWith('1800')) return 'tollfree'
  if (d.startsWith('13')) return 'localrate'
  return 'local'
}

const num = (v: string | undefined, fallback: number) => {
  const n = parseFloat(String(v ?? ''))
  return Number.isFinite(n) && n >= 0 ? n : fallback
}

/** Monthly price in A$ for a number of this kind. */
export function monthlyPriceAud(kind: NumberKind): number {
  const standard = num(process.env.COLVY_NUMBER_PRICE_AUD, 15)
  return kind === 'tollfree' ? num(process.env.COLVY_TOLLFREE_PRICE_AUD, 25) : standard
}

/** Twilio's AvailablePhoneNumbers class for the kind. */
export function twilioInventory(kind: NumberKind): 'Local' | 'Mobile' | 'TollFree' {
  return kind === 'mobile' ? 'Mobile' : kind === 'tollfree' ? 'TollFree' : 'Local'
}

/** Whether to ask Twilio for SMS-capable numbers only (AU toll-free has none). */
export const smsCapable = (kind: NumberKind) => kind !== 'tollfree'

/** The Regulatory Compliance bundle parameters for a kind. */
export function bundleParamsFor(kind: NumberKind, entityType: string | null | undefined): { numberType: string; endUserType: string; regulationSid?: string } {
  const entity = entityType === 'individual' ? 'individual' : 'business'
  if (kind !== 'tollfree') return { numberType: kind, endUserType: entity }
  const forced = String(process.env.TWILIO_TOLLFREE_END_USER_TYPE || '').trim().toLowerCase()
  const regulationSid = String(process.env.TWILIO_TOLLFREE_REGULATION_SID || '').trim() || undefined
  return {
    numberType: String(process.env.TWILIO_TOLLFREE_BUNDLE_NUMBER_TYPE || '').trim() || 'toll-free',
    endUserType: forced === 'individual' || forced === 'business' ? forced : entity,
    ...(regulationSid ? { regulationSid } : {}),
  }
}

/**
 * The company's Twilio bundle for buying a number of this kind. Twilio ties a
 * bundle to a number type, so a toll-free purchase only uses a toll-free bundle.
 * Local and mobile keep their old behaviour (the latest non-toll-free bundle),
 * falling back to the latest bundle of any kind.
 */
export async function bundleSidFor(db: any, companyId: string, kind: NumberKind): Promise<{ bundleSid?: string; row: any | null }> {
  try {
    const { data } = await db.from('number_regulatory_bundles')
      .select('*').eq('company_id', companyId)
      .order('created_at', { ascending: false }).limit(20)
    const rows: any[] = Array.isArray(data) ? data : []
    const isTollfree = (r: any) => cleanNumberKind(r?.number_type) === 'tollfree'
    const row = kind === 'tollfree'
      ? rows.find(isTollfree) || null
      : rows.find(r => !isTollfree(r)) || null
    // Address details for the purchase can come from any bundle (same business),
    // the matching one first.
    const withAddress = [row, ...rows].find(r => r?.address_line1) || row || rows[0] || null
    return { bundleSid: row?.twilio_bundle_id || undefined, row: withAddress }
  } catch { return { row: null } }
}

/** Customer-facing words for each kind. */
export const KIND_LABEL: Record<NumberKind, string> = {
  local: 'landline',
  mobile: 'mobile',
  tollfree: '1800',
}

export const TOLLFREE_NOTE = 'Callers ring free from anywhere in Australia. 1800 numbers take calls only (no texting).'
export const TOLLFREE_VOLUME_NOTE = 'Incoming 1800 calls cost more to carry, so 1800 numbers have a higher monthly price. Very high call volumes may need an Enterprise plan.'
export const NO_TOLLFREE = 'No 1800 numbers available right now. Try again later, or choose a local or mobile number.'
export const LOCAL_RATE_SOON = '1300 numbers are coming soon.'
