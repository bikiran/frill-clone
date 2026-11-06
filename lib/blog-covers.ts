// Every blog post shows a real photo, never a coloured tile. A post without
// its own cover (an article written in super admin without one, say) gets one
// of these, picked from its slug so it's always the same photo, and a cover
// that fails to load falls back to it too.

const FALLBACKS = [
  '/photos/inbox.jpg',
  '/solutions/customer-support.jpg',
  '/photos/crm.jpg',
  '/solutions/marketing.jpg',
  '/photos/tasks.jpg',
  '/solutions/hub.jpg',
  '/channels/sms.jpg',
  '/photos/calendar.jpg',
]

/** The stand-in photo for a post. */
export function fallbackCover(slug: string): string {
  let h = 0
  for (const ch of String(slug || '')) h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return FALLBACKS[h % FALLBACKS.length]
}

/** The post's own cover, else its stand-in photo. */
export const coverFor = (slug: string, cover?: string | null): string => (cover && cover.trim()) || fallbackCover(slug)
