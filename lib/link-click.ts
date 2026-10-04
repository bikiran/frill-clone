// Record one click on a tracked link (short_links): a link_clicks row with
// device / OS / browser / city, plus the link's own counter. Shared by the
// /l/ redirect and the /m/ viewer. Best-effort — never blocks the customer.

import { parseUserAgent } from '@/lib/link-tracking'

type HeaderBag = { get(name: string): string | null }

// Messengers and link-preview bots fetch the URL to draw a preview — those
// aren't the customer opening it.
const BOT_RE = /bot|crawler|spider|facebookexternalhit|whatsapp|slackbot|twitterbot|telegrambot|discordbot|skypeuripreview|linkedinbot|embedly|preview|headless/i

export async function recordLinkClick(db: any, link: { id: string; company_id: string; contact_id?: string | null; clicks?: number | null; code?: string }, headers: HeaderBag) {
  try {
    const ua = headers.get('user-agent') || ''
    if (BOT_RE.test(ua)) return
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
    const { error } = await db.from('link_clicks').insert({ ...base, contact_id: link.contact_id || null })
    if (error) await db.from('link_clicks').insert(base)
  } catch { /* analytics table may not exist yet */ }
  try {
    await db.from('short_links').update({ clicks: (link.clicks || 0) + 1, last_clicked_at: new Date().toISOString() }).eq('id', link.id)
  } catch {}
}
