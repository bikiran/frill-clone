import { shortenUrl } from './short-link'

// Matches http(s) URLs inside a message body.
const URL_RE = /https?:\/\/[^\s<>"')]+/g

export interface ShortenContext {
  companyId?: string
  conversationId?: string
  contactId?: string
  messageId?: string
  channel?: string
  sentBy?: string
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
      if (short && short !== url) out = out.split(url).join(short)
    } catch { /* leave this URL as-is */ }
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
