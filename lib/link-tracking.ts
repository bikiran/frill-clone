import { shortenUrl } from './short-link'

// Matches http(s) URLs inside a message body.
const URL_RE = /https?:\/\/[^\s<>"')]+/g

/**
 * Classify a URL so reports can group by what the link actually was.
 * Order matters: checkout/payment patterns are checked before the generic
 * product match, since a checkout URL often also contains shop paths.
 */
export function classifyLink(url: string): string {
  const u = (url || '').toLowerCase()
  if (/\.(png|jpe?g|gif|webp|heic|mp4|mov)(\?|$)/.test(u)) return 'image'
  if (u.includes('stripe.com') || /\/pay(ment)?\b/.test(u)) return 'payment'
  if (u.includes('/checkout') || u.includes('/cart')) return 'checkout'
  if (u.includes('/book') || u.includes('/appointment')) return 'booking'
  if (u.includes('/help/') || u.includes('/docs/')) return 'help'
  if (u.includes('/form') || u.includes('/survey')) return 'form'
  if (u.includes('/product/') || u.includes('/shop/')) return 'product'
  return 'external'
}

export interface ShortenContext {
  companyId?: string
  conversationId?: string
  contactId?: string
  messageId?: string
  channel?: string
  sentBy?: string
  sentById?: string
  locationId?: string
}

/**
 * Rewrites every URL in `text` to a trackable short link, so we can tell whether
 * the customer clicked it and from where.
 *
 * Fail-safe by design: it reuses shortenUrl(), which returns the ORIGINAL url if
 * anything goes wrong, so a tracking problem can never stop a message being
 * delivered.
 */
export async function trackLinksInText(text: string, ctx: ShortenContext): Promise<string> {
  if (!text) return text
  const urls = Array.from(new Set(text.match(URL_RE) || []))
  if (urls.length === 0) return text

  let out = text
  const created: { code: string; url: string }[] = []
  for (const url of urls) {
    // Don't re-shorten one of our own links — /l/ (tracked) or /m/ (media),
    // which the attachment path has already created.
    if (/\/(l|m)\/[A-Za-z0-9]+/.test(url)) continue
    try {
      const short = await shortenUrl(url, {
        companyId: ctx.companyId,
        conversationId: ctx.conversationId,
        kind: ctx.channel || 'sms',
      })
      if (short && short !== url) {
        out = out.split(url).join(short)
        const code = short.split('/l/')[1] || short.split('/m/')[1]
        if (code) created.push({ code, url })
      }
    } catch { /* leave this URL as-is */ }
  }

  // Stamp attribution onto the links we just made, so reports can break clicks
  // down by customer, agent, channel, outlet and link type. Best-effort: the
  // link already works without it.
  if (created.length) {
    try {
      const { createClient } = await import('@supabase/supabase-js')
      const db = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } }
      )
      for (const c of created) {
        await db.from('short_links').update({
          contact_id: ctx.contactId || null,
          message_id: ctx.messageId || null,
          conversation_id: ctx.conversationId || null,
          channel: ctx.channel || 'sms',
          sent_by: ctx.sentBy || null,
          sent_by_id: ctx.sentById || null,
          location_id: ctx.locationId || null,
          link_type: classifyLink(c.url),
        }).eq('code', c.code)
      }
    } catch { /* attribution is optional */ }
  }
  return out
}

/** Small UA parser — enough to report which device/browser opened a link. */
export function parseUserAgent(ua: string) {
  const s = (ua || '').toLowerCase()
  const isTablet = /ipad|tablet/.test(s)
  const isMobile = !isTablet && /mobile|android|iphone|ipod/.test(s)
  const device = isTablet ? 'tablet' : isMobile ? 'mobile' : 'desktop'

  let os = 'Unknown'
  if (/iphone|ipad|ipod/.test(s)) os = 'iOS'
  else if (/android/.test(s)) os = 'Android'
  else if (/windows/.test(s)) os = 'Windows'
  else if (/mac os|macintosh/.test(s)) os = 'macOS'
  else if (/linux/.test(s)) os = 'Linux'

  let browser = 'Unknown'
  // Order matters: Edge and Chrome both contain "safari" in their UA.
  if (/edg\//.test(s)) browser = 'Edge'
  else if (/opr\/|opera/.test(s)) browser = 'Opera'
  else if (/chrome|crios/.test(s)) browser = 'Chrome'
  else if (/firefox|fxios/.test(s)) browser = 'Firefox'
  else if (/safari/.test(s)) browser = 'Safari'

  return { device, os, browser }
}
