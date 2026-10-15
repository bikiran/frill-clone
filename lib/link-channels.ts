// Smart links for social posts, QR posters and newsletters.
//
// Pure helpers (no imports) shared by the browser pages and the server: the
// "Where will you post this?" choices, the click reference (?clv=) that ties
// an anonymous click to the chat, booking or form it led to, and a readable
// name for where a click came from.

/** The places a business posts a public link. Stored in short_links.channel. */
export const PUBLIC_LINK_CHANNELS: { id: string; label: string; short: string }[] = [
  { id: 'instagram_reel', label: 'Instagram Reel', short: 'Reel' },
  { id: 'social_post', label: 'Instagram / Facebook post', short: 'Post' },
  { id: 'tiktok', label: 'TikTok', short: 'TikTok' },
  { id: 'youtube', label: 'YouTube', short: 'YouTube' },
  { id: 'link_in_bio', label: 'Link in bio', short: 'Bio' },
  { id: 'qr', label: 'QR code / print', short: 'QR' },
  { id: 'newsletter', label: 'Email newsletter', short: 'Newsletter' },
  { id: 'public_other', label: 'Other', short: 'Other' },
]

const PUBLIC_IDS = new Set(PUBLIC_LINK_CHANNELS.map(c => c.id))

/**
 * A link posted publicly (a Reel, a poster…), as opposed to one sent to a
 * particular customer from the inbox or a campaign. Anyone can click these,
 * so a click carries no contact until the visitor tells us who they are.
 */
export const isPublicChannel = (channel: unknown): boolean => PUBLIC_IDS.has(String(channel || ''))

/** Labels for Link Reports — the public channels plus a readable "Other". */
export const PUBLIC_CHANNEL_LABEL: Record<string, string> = Object.fromEntries(
  PUBLIC_LINK_CHANNELS.map(c => [c.id, c.id === 'public_other' ? 'Other shared link' : c.label]),
)

// ── Click reference (?clv=) ─────────────────────────────────────────────────
// link_clicks.id is a UUID. Anything else is ignored before it reaches a query.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const NUM_RE = /^[1-9][0-9]{0,17}$/

/** The click id, if `v` looks like one; otherwise null. */
export function cleanClickRef(v: unknown): string | null {
  if (typeof v !== 'string' && typeof v !== 'number') return null
  const s = String(v).trim()
  if (UUID_RE.test(s)) return s.toLowerCase()
  if (NUM_RE.test(s)) return s
  return null
}

/** The ?clv= click id carried on a page address, if any. */
export function clickRefFromUrl(url: unknown): string | null {
  if (typeof url !== 'string' || !url.includes('clv=')) return null
  try { return cleanClickRef(new URL(url).searchParams.get('clv')) } catch { return null }
}

/**
 * The click a website visitor arrived through: an explicit ref first, then the
 * page they're on, then the pages they browsed this visit (newest first).
 */
export function clickRefFromVisit(opts: { ref?: unknown; pageUrl?: unknown; history?: unknown }): string | null {
  const direct = cleanClickRef(opts.ref)
  if (direct) return direct
  const fromPage = clickRefFromUrl(opts.pageUrl)
  if (fromPage) return fromPage
  const hist = Array.isArray(opts.history) ? opts.history : []
  for (let i = hist.length - 1; i >= 0 && i >= hist.length - 50; i--) {
    const found = clickRefFromUrl(hist[i]?.url)
    if (found) return found
  }
  return null
}

// ── The funnel for a link ───────────────────────────────────────────────────

export type FunnelClick = { id: string; contact_id?: string | null; ip?: string | null; user_agent?: string | null }
export type FunnelConversion = { id?: string; stage: string; order_id?: string | null; revenue?: number | string | null }
export type Funnel = { clicks: number; visitors: number; chats: number; leads: number; bookings: number; orders: number; revenue: number }

/** A paid booking is credited as a 'paid' row keyed book_<id> (lib/link-attribution). */
export const isBookingPayment = (v: { order_id?: string | null }) => String(v.order_id || '').startsWith('book_')

/**
 * Clicks → visitors → chats → leads → bookings → orders → revenue for one link
 * (or a group of links). A visitor is a known contact, or failing that one
 * device (IP + browser), so one person tapping a Reel three times counts once.
 * `counterClicks` is the link's own counter, for clicks recorded before
 * per-click rows existed.
 */
export function linkFunnel(clicks: FunnelClick[], conversions: FunnelConversion[], counterClicks = 0): Funnel {
  const people = new Set<string>()
  for (const c of clicks) {
    people.add(c.contact_id ? `c:${c.contact_id}` : c.ip ? `d:${c.ip}|${c.user_agent || ''}` : `k:${c.id}`)
  }
  const distinct = (rows: FunnelConversion[]) => new Set(rows.map((v, i) => v.order_id || v.id || `row${i}`)).size
  const paid = conversions.filter(v => v.stage === 'paid')
  return {
    clicks: Math.max(clicks.length, counterClicks || 0),
    visitors: clicks.length ? people.size : (counterClicks || 0),
    chats: distinct(conversions.filter(v => v.stage === 'conversation')),
    leads: distinct(conversions.filter(v => v.stage === 'lead')),
    bookings: distinct(conversions.filter(v => v.stage === 'booking' || v.stage === 'booked')),
    orders: distinct(paid.filter(v => !isBookingPayment(v))),
    revenue: paid.reduce((s, v) => s + (Number(v.revenue) || 0), 0),
  }
}

// ── Where a click came from ─────────────────────────────────────────────────

/**
 * A readable source for one click, from its referrer — or, when the app sent
 * none (Instagram and TikTok's in-app browsers often don't, and a QR scan
 * never does), from the in-app browser named in the user agent.
 */
export function clickSource(referrer: string | null | undefined, userAgent?: string | null): string {
  let host = ''
  try { host = referrer ? new URL(referrer).hostname.toLowerCase().replace(/^www\./, '') : '' } catch { host = '' }
  if (host) {
    if (/(^|\.)instagram\.com$/.test(host)) return 'Instagram'
    if (/(^|\.)(facebook\.com|fb\.com|fb\.me|messenger\.com)$/.test(host)) return 'Facebook'
    if (/(^|\.)tiktok\.com$/.test(host)) return 'TikTok'
    if (/(^|\.)(youtube\.com|youtu\.be)$/.test(host)) return 'YouTube'
    if (/^(t\.co|x\.com|twitter\.com)$/.test(host)) return 'X (Twitter)'
    if (/(^|\.)linktr\.ee$/.test(host)) return 'Linktree'
    // Webmail before Google, or Gmail reads as a Google search.
    if (/(^|\.)(mail\.google\.com|outlook\.(live|office)\.com|mail\.yahoo\.com)$/.test(host)) return 'Email'
    if (/(^|\.)google\.[a-z.]+$/.test(host)) return 'Google'
    return host
  }
  const ua = String(userAgent || '')
  if (/Instagram/i.test(ua)) return 'Instagram app'
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook app'
  if (/musical_ly|TikTok|BytedanceWebview|trill_/i.test(ua)) return 'TikTok app'
  if (/YouTube/i.test(ua)) return 'YouTube app'
  return 'No referrer (QR, app or typed)'
}
