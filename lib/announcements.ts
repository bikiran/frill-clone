// Announcements: the shared, pure rules (no database, no React), used by the
// admin, the public updates page, the chat widget, the API routes and tests.

import { bodyToSafeHtml, excerpt, htmlToText, safeUrl } from '@/lib/safe-html'
import { parseDbTime } from '@/lib/db-time'

// ── Categories ───────────────────────────────────────────────────────────────
// Stored in the existing `tag` column. Older posts used other words (Feature,
// Bug Fix, new_feature …); categoryOf() reads those as the nearest category.
export type CategoryKey = 'new' | 'improvement' | 'fix' | 'event' | 'sale' | 'news'
export const CATEGORIES: { key: CategoryKey; label: string; color: string; bg: string; about: string }[] = [
  { key: 'new', label: 'New', color: '#047857', bg: '#d1fae5', about: 'New stock, a new service or something you’ve just started' },
  { key: 'improvement', label: 'Improvement', color: '#1d4ed8', bg: '#dbeafe', about: 'Something that got better' },
  { key: 'fix', label: 'Fix', color: '#b45309', bg: '#fef3c7', about: 'Something that was wrong and is now sorted' },
  { key: 'event', label: 'Event', color: '#7c3aed', bg: '#ede9fe', about: 'A workshop, open day or in-store event' },
  { key: 'sale', label: 'Sale', color: '#be123c', bg: '#ffe4e6', about: 'A sale, discount or limited-time offer' },
  { key: 'news', label: 'News', color: '#475569', bg: '#e2e8f0', about: 'Opening hours, store news and everything else' },
]
const LEGACY: Record<string, CategoryKey> = {
  new: 'new', feature: 'new', new_feature: 'new', 'new feature': 'new', launch: 'new', 'new arrivals': 'new',
  improvement: 'improvement', improved: 'improvement', update: 'improvement',
  fix: 'fix', fixed: 'fix', bug_fix: 'fix', 'bug fix': 'fix', bugfix: 'fix',
  event: 'event', events: 'event', workshop: 'event',
  sale: 'sale', promo: 'sale', promotion: 'sale', offer: 'sale', discount: 'sale',
  news: 'news', announcement: 'news', general: 'news',
}
export function categoryOf(tag: string | null | undefined): (typeof CATEGORIES)[number] {
  const k = LEGACY[String(tag || '').trim().toLowerCase()] || 'news'
  return CATEGORIES.find(c => c.key === k)!
}

// ── Status ───────────────────────────────────────────────────────────────────
// status column: 'draft' | 'scheduled' | 'published' (empty = published, as
// legacy rows were public). A scheduled post goes live at publish_at (the cron
// flips it, and readers treat a due one as live in case the cron is late). A
// post with expires_at in the past is over: hidden from the public, shown to
// the team as Expired.
export type AnnStatus = 'draft' | 'scheduled' | 'published' | 'expired'
export const STATUS_LABEL: Record<AnnStatus, string> = { draft: 'Draft', scheduled: 'Scheduled', published: 'Published', expired: 'Ended' }

// publish_at / expires_at are TIMESTAMPTZ, but created_at / updated_at are
// TIMESTAMP without time zone (UTC with no offset): lib/db-time.ts reads both.
const ts = (v: any): number | null => {
  if (!v) return null
  const n = parseDbTime(v)
  return Number.isFinite(n) ? n : null
}

export function statusOf(a: any, now = Date.now()): AnnStatus {
  // Exactly announcement_is_live() in V387: case-sensitive, empty = published.
  const raw = a?.status == null ? 'published' : String(a.status)
  const pub = ts(a?.publish_at)
  const exp = ts(a?.expires_at)
  if (raw === 'draft' || raw === 'archived') return 'draft'
  if (raw === 'scheduled' && (pub == null || pub > now)) return 'scheduled'
  if (raw !== 'scheduled' && raw !== 'published') return 'draft'
  // Published, or scheduled and due.
  if (pub != null && pub > now) return 'scheduled'
  if (exp != null && exp <= now) return 'expired'
  return 'published'
}

/** May a stranger see this post right now? */
export function isPublicNow(a: any, now = Date.now()): boolean {
  return statusOf(a, now) === 'published'
}

/**
 * The date a post shows: when it went (or goes) live, else when it was made.
 * Always an ISO instant with its offset, so pages and widgets that read it with
 * new Date() get the right day (created_at itself has no offset).
 */
export function shownDate(a: any): string {
  const t = ts(a?.publish_at) ?? ts(a?.created_at)
  return new Date(t ?? 0).toISOString()
}

// ── Audience ─────────────────────────────────────────────────────────────────
// location_ids (existing): empty = everyone; otherwise the outlets whose
// widget and board context show it. segmentation (existing text column):
// 'all' or 'segment:<RFM segment>'. A segment only narrows who gets the email
// and SMS; a public page can't know which segment an anonymous visitor is in.
// The RFM segments lib/campaign-audience.ts understands (SegmentationService.getRFMCategory).
export const SEGMENTS = ['Champions', 'Loyal Customers', 'Potential Loyalists', 'At Risk', 'Lost']
export function segmentOf(a: any): string | null {
  const s = String(a?.segmentation || '')
  return s.startsWith('segment:') ? s.slice(8) || null : null
}
export function audienceFilterOf(a: any): { type: 'all_subscribed' } | { type: 'outlet'; locationId: string } | { type: 'segment'; segment: string } {
  const seg = segmentOf(a)
  if (seg) return { type: 'segment', segment: seg }
  const ids: string[] = Array.isArray(a?.location_ids) ? a.location_ids.filter(Boolean) : []
  if (ids.length === 1) return { type: 'outlet', locationId: ids[0] }
  return { type: 'all_subscribed' }
}

// ── Reactions ────────────────────────────────────────────────────────────────
// Four reactions, drawn as SVG icons. Older posts stored emoji keys in the
// same reactions JSON; they're counted under the nearest reaction.
export type ReactionKey = 'like' | 'love' | 'celebrate' | 'interested'
export const REACTIONS: { key: ReactionKey; label: string }[] = [
  { key: 'like', label: 'Like' },
  { key: 'love', label: 'Love it' },
  { key: 'celebrate', label: 'Celebrate' },
  { key: 'interested', label: 'Interested' },
]
const LEGACY_REACTION: Record<string, ReactionKey> = {
  '\u{1F44D}': 'like', '❤️': 'love', '❤': 'love', '\u{1F389}': 'celebrate', '\u{1F525}': 'celebrate', '\u{1F602}': 'like', '\u{1F62E}': 'interested',
}
export function reactionCounts(reactions: any): Record<ReactionKey, number> {
  const out: Record<ReactionKey, number> = { like: 0, love: 0, celebrate: 0, interested: 0 }
  if (!reactions || typeof reactions !== 'object') return out
  for (const [k, v] of Object.entries(reactions)) {
    const key = (REACTIONS.some(r => r.key === k) ? k : LEGACY_REACTION[k]) as ReactionKey | undefined
    const n = Math.max(0, Math.floor(Number(v) || 0))
    if (key) out[key] += n
  }
  return out
}
export const totalReactions = (reactions: any) => Object.values(reactionCounts(reactions)).reduce((a, b) => a + b, 0)

// ── Media ────────────────────────────────────────────────────────────────────
/** A video link as something a page can play: a YouTube/Vimeo embed, or a file. */
export function videoOf(url: string | null | undefined): { kind: 'embed' | 'file'; src: string } | null {
  const u = safeUrl(url, 'media')
  if (!u || !/^https:/i.test(u)) return null
  const yt = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{6,15})/i.exec(u)
  if (yt) return { kind: 'embed', src: `https://www.youtube-nocookie.com/embed/${yt[1]}` }
  const vm = /vimeo\.com\/(?:video\/)?(\d{5,12})/i.exec(u)
  if (vm) return { kind: 'embed', src: `https://player.vimeo.com/video/${vm[1]}` }
  if (/\.(mp4|webm|mov|m4v)(\?|#|$)/i.test(u)) return { kind: 'file', src: u }
  return null
}

export function safeImage(url: string | null | undefined): string | null {
  const u = safeUrl(url, 'media')
  return u && /^(https:|\/)/i.test(u) ? u : null
}

// ── What the public gets ─────────────────────────────────────────────────────
// Only these fields leave the server for a stranger: no audience, no notify
// settings, no SMS campaign, no internal ids beyond the post's own.
export type PublicAnnouncement = {
  id: string
  title: string
  html: string
  excerpt: string
  category: CategoryKey
  category_label: string
  date: string
  is_pinned: boolean
  cover_image: string | null
  video: { kind: 'embed' | 'file'; src: string } | null
  cta_label: string | null
  cta_url: string | null
  expires_at: string | null
  idea_id: string | null
  views: number
  reactions: Record<ReactionKey, number>
  boost: { type: 'banner' | 'popup'; title: string; blurb: string; button: string; image: string | null } | null
  location_ids: string[] | null
}

export function toPublicAnnouncement(a: any): PublicAnnouncement {
  const cat = categoryOf(a?.tag)
  const cover = safeImage(a?.cover_image)
  const ctaUrl = safeUrl(a?.cta_url, 'link')
  const boosting = !!a?.boost_enabled && (a?.boost_type === 'banner' || a?.boost_type === 'popup')
  const title = String(a?.title || '').slice(0, 300)
  return {
    id: String(a.id),
    title,
    html: bodyToSafeHtml(a?.description ?? a?.content ?? ''),
    excerpt: excerpt(a?.description ?? a?.content ?? '', 200),
    category: cat.key,
    category_label: cat.label,
    date: shownDate(a),
    is_pinned: !!a?.is_pinned,
    cover_image: cover,
    video: videoOf(a?.video_url),
    cta_label: ctaUrl ? (String(a?.cta_label || '').trim().slice(0, 40) || 'Learn more') : null,
    cta_url: ctaUrl,
    expires_at: a?.expires_at || null,
    idea_id: a?.idea_id || null,
    views: Math.max(0, Number(a?.views) || 0),
    reactions: reactionCounts(a?.reactions),
    boost: boosting ? {
      type: a.boost_type,
      title: String(a?.boost_title || title).slice(0, 120),
      blurb: String(a?.boost_blurb || excerpt(a?.description, 140)).slice(0, 240),
      button: String(a?.boost_button_label || 'Read more').slice(0, 30),
      image: safeImage(a?.boost_image) || cover,
    } : null,
    location_ids: Array.isArray(a?.location_ids) && a.location_ids.length ? a.location_ids : null,
  }
}

/** Public order: pinned first, then newest first by the date shown. */
export function sortForPublic<T extends { is_pinned: boolean; date: string }>(list: T[]): T[] {
  return [...list].sort((a, b) => (Number(b.is_pinned) - Number(a.is_pinned)) || (ts(b.date)! - ts(a.date)!))
}

/** Location rule the widget already used: no outlets = everyone; else only that outlet's context. */
export function visibleAtLocation(a: { location_ids?: string[] | null }, location: string | null | undefined): boolean {
  const ids = a.location_ids
  if (!ids || ids.length === 0) return true
  if (!location) return false
  return ids.includes(location)
}

// ── Admin list helpers ───────────────────────────────────────────────────────
export type AdminFilter = 'all' | AnnStatus | 'pinned'
export function filterAnnouncements(list: any[], f: { status: AdminFilter; category: CategoryKey | 'all'; query: string }, now = Date.now()) {
  const q = f.query.trim().toLowerCase()
  return list.filter(a => {
    if (f.status === 'pinned' ? !a.is_pinned : f.status !== 'all' && statusOf(a, now) !== f.status) return false
    if (f.category !== 'all' && categoryOf(a.tag).key !== f.category) return false
    if (q && !`${a.title || ''} ${htmlToText(a.description || '')}`.toLowerCase().includes(q)) return false
    return true
  })
}
export function statusCounts(list: any[], now = Date.now()): Record<AdminFilter, number> {
  const c: Record<AdminFilter, number> = { all: list.length, draft: 0, scheduled: 0, published: 0, expired: 0, pinned: 0 }
  for (const a of list) { c[statusOf(a, now)]++; if (a.is_pinned) c.pinned++ }
  return c
}

/** "in 3 days", "2 hours ago" … in plain words. */
export function relative(iso: string | null | undefined, now = Date.now()): string {
  const t = ts(iso)
  if (t == null) return ''
  const d = t - now
  const abs = Math.abs(d)
  const unit = abs < 3600_000 ? [Math.max(1, Math.round(abs / 60_000)), 'minute'] : abs < 86400_000 ? [Math.round(abs / 3600_000), 'hour'] : abs < 30 * 86400_000 ? [Math.round(abs / 86400_000), 'day'] : null
  if (!unit) return new Date(t).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
  const [n, u] = unit as [number, string]
  const s = `${n} ${u}${n === 1 ? '' : 's'}`
  return d > 0 ? `in ${s}` : `${s} ago`
}

export function formatDate(iso: string | null | undefined, withTime = false): string {
  const t = ts(iso)
  if (t == null) return ''
  return new Date(t).toLocaleString('en-AU', withTime
    ? { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }
    : { day: 'numeric', month: 'long', year: 'numeric' })
}

/** SMS text: plain, one line breaks at most, trimmed to the budget with the link kept. */
export function smsFrom(title: string, body: string, link: string, max = 300): string {
  const base = `${title}. ${htmlToText(body).replace(/\s+/g, ' ')}`.trim()
  const room = Math.max(40, max - link.length - 1)
  const text = base.length > room ? base.slice(0, room - 1).replace(/\s+\S*$/, '') + '…' : base
  return `${text} ${link}`.trim()
}

// ── Telling people ───────────────────────────────────────────────────────────
export type Channels = { board?: boolean; email?: boolean }

/**
 * Which ways of telling people are finished for this post. Each one is sent
 * once; the other can still be sent later. A post told before this was
 * tracked per channel (notified_at set, no record) counts as both done.
 */
export function doneChannels(a: any): Channels {
  const d = a?.notify_stats && typeof a.notify_stats === 'object' ? a.notify_stats.done : null
  if (d && typeof d === 'object') return { board: !!d.board, email: !!d.email }
  return a?.notified_at ? { board: true, email: true } : {}
}
