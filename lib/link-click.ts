// Record one click on a tracked link (short_links): a link_clicks row with
// device / OS / browser / city, plus the link's own counter. Shared by the
// /l/ redirect and the /m/ viewer. Best-effort — never blocks the customer.

import { parseUserAgent } from '@/lib/link-tracking'

type HeaderBag = { get(name: string): string | null }

// Messengers and link-preview bots fetch the URL to draw a preview — those
// aren't the customer opening it.
const BOT_RE = /bot|crawler|spider|facebookexternalhit|whatsapp|slackbot|twitterbot|telegrambot|discordbot|skypeuripreview|linkedinbot|embedly|preview|headless/i

// Phone carriers and security filters open links in texts and emails the
// moment they're sent, to check them for scams. They pretend to be a normal
// browser (Windows Firefox, Android Chrome), so the user agent alone doesn't
// catch them, but they give themselves away:
//   • no Accept-Language header: every real browser sends one;
//   • a Chrome / Firefox / Edge user agent without Sec-Fetch-Mode, which those
//     browsers always send when a person opens a page (iPhones are left out:
//     older iOS and some in-app browsers don't send it);
//   • opened from overseas within two minutes of the link being made (the
//     checks seen so far come from London data centres seconds after sending).
// Any of these and the open isn't counted.
const HOME_COUNTRY = 'AU'
const SCAN_WINDOW_MS = 2 * 60_000

export function automatedOpenReason(headers: HeaderBag, link: { created_at?: string | null }): string | null {
  const ua = headers.get('user-agent') || ''
  if (!ua) return 'no user agent'
  if (BOT_RE.test(ua)) return 'bot user agent'
  if (!headers.get('accept-language')) return 'no accept-language'
  const ios = /iPhone|iPad|iPod/i.test(ua)
  if (!ios && /Chrome\/|Firefox\/|Edg\//.test(ua) && !headers.get('sec-fetch-mode')) return 'no sec-fetch-mode'
  const country = headers.get('x-vercel-ip-country')
  const made = link.created_at ? Date.parse(link.created_at) : NaN
  if (country && country !== HOME_COUNTRY && Number.isFinite(made) && Date.now() - made < SCAN_WINDOW_MS) return `opened from ${country} straight after sending`
  return null
}

/**
 * Returns the new click's id (null for a bot, or if it couldn't be saved), so
 * the /l/ redirect can hand it on as ?clv= for click stitching.
 */
export async function recordLinkClick(db: any, link: { id: string; company_id: string; contact_id?: string | null; clicks?: number | null; code?: string; created_at?: string | null }, headers: HeaderBag): Promise<string | null> {
  const automated = automatedOpenReason(headers, link)
  if (automated) {
    console.info(`[link] not counted (${automated}): ${link.code || link.id} ${headers.get('user-agent') || ''} ${headers.get('x-vercel-ip-city') || ''} ${headers.get('x-vercel-ip-country') || ''}`)
    return null
  }
  let clickId: string | null = null
  try {
    const ua = headers.get('user-agent') || ''
    const { device, os, browser } = parseUserAgent(ua)
    const ip = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || headers.get('x-real-ip') || null
    // Vercel supplies coarse geo headers at the edge (URL-encoded city names).
    const city = headers.get('x-vercel-ip-city')
    const base = {
      link_id: link.id, company_id: link.company_id, ip,
      city: city ? decodeURIComponent(city) : null,
      region: headers.get('x-vercel-ip-country-region') || null,
      country: headers.get('x-vercel-ip-country') || null,
      device, os, browser,
      referrer: headers.get('referer') || null,
      user_agent: ua || null,
    }
    // contact_id came with V192 — fall back to the base columns without it.
    const first = await db.from('link_clicks').insert({ ...base, contact_id: link.contact_id || null }).select('id').maybeSingle()
    if (first.error) {
      const second = await db.from('link_clicks').insert(base).select('id').maybeSingle()
      clickId = second.data?.id || null
    } else {
      clickId = first.data?.id || null
    }
  } catch { /* analytics table may not exist yet */ }
  try {
    await db.from('short_links').update({ clicks: (link.clicks || 0) + 1, last_clicked_at: new Date().toISOString() }).eq('id', link.id)
  } catch {}
  return clickId
}
