// How a visit arrived, grouped into channels. Shared by the traffic report
// (PostHog sessions) and each business's acquisition record (its first
// visit), so both read the same way.

const SEARCH = /(^|\.)(google|bing|duckduckgo|yahoo|ecosia|baidu|yandex|search\.brave)\./i
const SOCIAL = /(^|\.)(facebook|instagram|t\.co|twitter|x\.com|linkedin|lnkd|youtube|tiktok|reddit|pinterest|threads)\./i
const AI = /(chatgpt|openai|perplexity|claude|anthropic|gemini|copilot|you\.com)/i

export const CHANNELS = ['Paid', 'Email', 'Social', 'AI assistants', 'Organic search', 'Referral', 'Campaign', 'Direct'] as const
export type Channel = typeof CHANNELS[number]

/** src/med: utm_source / utm_medium; ref: the referring site's host; click: an ad click id was present. */
export function channelOf(s: { src?: string | null; med?: string | null; ref?: string | null; click?: string | null }): Channel {
  const med = String(s.med || '').toLowerCase(), src = String(s.src || '').toLowerCase(), ref = String(s.ref || '').toLowerCase()
  if (/cpc|ppc|paid|ads?$/.test(med) || s.click) return 'Paid'
  if (/email|newsletter/.test(med) || /email|newsletter/.test(src)) return 'Email'
  if (med === 'social' || SOCIAL.test(ref) || /facebook|instagram|linkedin|tiktok/.test(src)) return 'Social'
  if (AI.test(ref) || AI.test(src)) return 'AI assistants'
  if (SEARCH.test(ref) || /google|bing/.test(src)) return 'Organic search'
  if (!ref || ref === '$direct' || /colvy\.com$/.test(ref)) return src ? 'Campaign' : 'Direct'
  return 'Referral'
}

/** The host of a referrer that may be a full address, a bare host or empty. */
export function refHost(raw: string | null | undefined): string {
  const v = String(raw || '').trim()
  if (!v) return ''
  try { return new URL(/^https?:\/\//i.test(v) ? v : `https://${v}`).hostname.toLowerCase() } catch { return '' }
}
