// Announcements: server-side reads and writes (service role). Every caller has
// already checked who's asking: staff via requireCompanyAccess, the public via
// isPublicNow. Server-only.

import { createClient } from '@supabase/supabase-js'
import { CATEGORIES, categoryOf, isPublicNow, SEGMENTS, statusOf } from '@/lib/announcements'
import { looksLikeHtml, safeUrl, sanitizeHtml } from '@/lib/safe-html'

export function adminDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server is missing its database key')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

// Columns COLVY_V387 adds. Until it runs, a write that names one is retried
// without it (see writeAnnouncement) and the admin says what's waiting on it.
export const V387_COLUMNS = ['cover_image', 'video_url', 'publish_at', 'expires_at', 'cta_label', 'cta_url', 'boost_enabled', 'boost_type', 'idea_id', 'language', 'sms_campaign_id', 'notify_stats', 'updated_by'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const clip = (v: any, n: number) => String(v ?? '').trim().slice(0, n)
const isoOrNull = (v: any): string | null => {
  if (!v) return null
  const t = new Date(v).getTime()
  return Number.isFinite(t) ? new Date(t).toISOString() : null
}

/** The column named in a "no such column" error, if that's what it is. */
export function missingColumn(error: any): string | null {
  const msg = String(error?.message || '')
  const code = String(error?.code || '')
  const m = /Could not find the '([\w]+)' column/i.exec(msg) || /column "?([\w]+)"? (of relation "?\w+"? )?does not exist/i.exec(msg) || /column [\w]+\.([\w]+) does not exist/i.exec(msg)
  if (m && (code === 'PGRST204' || code === '42703' || /column/i.test(msg))) return m[1]
  return null
}

/**
 * Insert or update an announcement, dropping columns this database doesn't
 * have yet (before V387) instead of failing. Returns the row and what was left out.
 */
export async function writeAnnouncement(db: any, op: { insert: any } | { update: any; id: string; companyId: string }): Promise<{ data: any; error: any; dropped: string[] }> {
  const dropped: string[] = []
  let payload = { ...('insert' in op ? op.insert : op.update) }
  for (let i = 0; i < 16; i++) {
    const q = 'insert' in op
      ? db.from('announcements').insert(payload).select('*').maybeSingle()
      : db.from('announcements').update(payload).eq('id', op.id).eq('company_id', op.companyId).select('*').maybeSingle()
    const { data, error } = await q
    if (!error) return { data, error: null, dropped }
    const col = missingColumn(error)
    if (!col || !(col in payload)) return { data: null, error, dropped }
    dropped.push(col)
    delete payload[col]
    if (!Object.keys(payload).length) return { data: null, error, dropped }
  }
  return { data: null, error: new Error('Could not save'), dropped }
}

let schemaCache: { at: number; ready: boolean } | null = null
/** Has V387 run? One cheap probe, remembered for a few minutes. */
export async function schemaReady(db: any): Promise<boolean> {
  if (schemaCache && Date.now() - schemaCache.at < 5 * 60_000) return schemaCache.ready
  let ready = true
  try {
    const { error } = await db.from('announcements').select('id, cover_image, publish_at, expires_at, boost_enabled, idea_id').limit(1)
    if (error) ready = !missingColumn(error)
  } catch { ready = false }
  schemaCache = { at: Date.now(), ready }
  return ready
}
export function resetSchemaCache() { schemaCache = null }

/**
 * The fields a team member may set, cleaned. Never company_id, counters,
 * notified_at or anything else the server owns.
 */
export function cleanInput(b: any, now = Date.now()): { row: Record<string, any>; error?: string } {
  const row: Record<string, any> = {}
  const has = (k: string) => b && Object.prototype.hasOwnProperty.call(b, k)
  if (has('title')) row.title = clip(b.title, 200)
  if (has('description')) {
    const d = String(b.description ?? '').slice(0, 200_000)
    row.description = looksLikeHtml(d) ? sanitizeHtml(d) : d
  }
  if (has('tag')) row.tag = CATEGORIES.find(c => c.key === b.tag)?.key || categoryOf(b.tag).key
  if (has('status')) {
    const s = String(b.status || '').toLowerCase()
    row.status = ['draft', 'scheduled', 'published'].includes(s) ? s : 'draft'
  }
  if (has('publish_at')) row.publish_at = isoOrNull(b.publish_at)
  if (has('expires_at')) row.expires_at = isoOrNull(b.expires_at)
  if (has('is_pinned')) row.is_pinned = !!b.is_pinned
  if (has('cover_image')) row.cover_image = safeUrl(b.cover_image, 'media') || null
  if (has('video_url')) row.video_url = safeUrl(b.video_url, 'media') || null
  if (has('cta_url')) row.cta_url = safeUrl(b.cta_url, 'link') || null
  if (has('cta_label')) row.cta_label = clip(b.cta_label, 40) || null
  if (has('location_ids')) {
    const ids = Array.isArray(b.location_ids) ? b.location_ids.filter((x: any) => typeof x === 'string' && UUID.test(x)).slice(0, 50) : []
    row.location_ids = ids.length ? ids : null
  }
  if (has('segmentation')) {
    const s = String(b.segmentation || 'all')
    row.segmentation = s.startsWith('segment:') && SEGMENTS.includes(s.slice(8)) ? s : 'all'
  }
  if (has('notify_subscribers')) row.notify_subscribers = !!b.notify_subscribers
  if (has('boost_enabled')) row.boost_enabled = !!b.boost_enabled
  if (has('boost_type')) row.boost_type = b.boost_type === 'popup' ? 'popup' : 'banner'
  if (has('boost_title')) row.boost_title = clip(b.boost_title, 120) || null
  if (has('boost_blurb')) row.boost_blurb = clip(b.boost_blurb, 240) || null
  if (has('boost_button_label')) row.boost_button_label = clip(b.boost_button_label, 30) || null
  if (has('boost_image')) row.boost_image = safeUrl(b.boost_image, 'media') || null
  if (has('idea_id')) row.idea_id = typeof b.idea_id === 'string' && UUID.test(b.idea_id) ? b.idea_id : null
  if (has('language')) row.language = clip(b.language, 30) || null
  // How to notify when a scheduled post goes live (the cron reads it).
  if (has('notify_plan')) row.notify_stats = { plan: { board: !!b.notify_plan?.board, email: !!b.notify_plan?.email } }

  if (row.title !== undefined && !row.title) return { row, error: 'Give it a title' }
  if (row.status === 'scheduled') {
    const at = row.publish_at ? new Date(row.publish_at).getTime() : NaN
    if (!Number.isFinite(at)) return { row, error: 'Pick when it should go live' }
    // A time already passed means "now".
    if (at <= now + 30_000) { row.status = 'published'; row.publish_at = new Date(now).toISOString() }
  }
  if (row.publish_at && row.expires_at && new Date(row.expires_at) <= new Date(row.publish_at)) return { row, error: 'The end date must be after it goes live' }
  return { row }
}

/** A staff member's company's announcement, or null. */
export async function loadOwned(db: any, companyId: string, id: string): Promise<any | null> {
  if (!UUID.test(id)) return null
  const { data } = await db.from('announcements').select('*').eq('id', id).eq('company_id', companyId).maybeSingle()
  return data || null
}

/** Resolve a public board's company from a slug or a host name. */
export async function companyForBoard(db: any, opts: { slug?: string | null; host?: string | null; companyId?: string | null }): Promise<any | null> {
  const cols = 'id, name, slug, logo_url, accent_color, is_private'
  const slug = String(opts.slug || '').toLowerCase().trim()
  if (slug && /^[a-z0-9-]{1,63}$/.test(slug)) {
    const { data } = await db.from('companies').select(cols).eq('slug', slug).maybeSingle()
    if (data) return data
  }
  const host = String(opts.host || '').toLowerCase().trim().replace(/^https?:\/\//, '').replace(/[:/].*$/, '')
  if (host && /^[a-z0-9.-]{3,253}$/.test(host)) {
    if (host.endsWith('.colvy.com') && host !== 'www.colvy.com') {
      const sub = host.slice(0, -'.colvy.com'.length)
      const { data } = await db.from('companies').select(cols).eq('slug', sub).maybeSingle()
      if (data) return data
    }
    const { data } = await db.from('companies').select(cols).or(`board_domain.eq.${host},help_domain.eq.${host}`).limit(1)
    if (data?.[0]) return data[0]
  }
  if (opts.companyId && UUID.test(opts.companyId)) {
    const { data } = await db.from('companies').select(cols).eq('id', opts.companyId).maybeSingle()
    if (data) return data
  }
  return null
}

/** A company's posts a stranger may see now (newest first, pinned not yet sorted). */
export async function publicRows(db: any, companyId: string, limit = 200): Promise<any[]> {
  const { data } = await db.from('announcements').select('*').eq('company_id', companyId)
    .in('status', ['published', 'scheduled']).order('created_at', { ascending: false }).limit(limit)
  // Legacy rows with no status were public (V96 back-filled them, but be safe).
  const { data: legacy } = await db.from('announcements').select('*').eq('company_id', companyId).is('status', null).limit(50)
  const now = Date.now()
  return [...(data || []), ...(legacy || [])].filter(a => isPublicNow(a, now))
}

/**
 * Add to a counter on one post. Atomic through announcement_bump() (V387);
 * before that, a read-then-write that can miss a count under a race.
 */
export async function bump(db: any, id: string, field: 'views' | 'impressions' | 'reaction', delta: number, reaction?: string): Promise<boolean> {
  try {
    const { error } = await db.rpc('announcement_bump', { p_id: id, p_field: field, p_key: reaction || null, p_delta: delta })
    if (!error) return true
    if (!/function|does not exist|PGRST202/i.test(String(error.message || '') + String(error.code || ''))) return false
  } catch {}
  const { data: a } = await db.from('announcements').select('id, views, impressions, reactions').eq('id', id).maybeSingle()
  if (!a) return false
  if (field === 'reaction' && reaction) {
    const r = { ...(a.reactions || {}) }
    r[reaction] = Math.max(0, (Number(r[reaction]) || 0) + delta)
    await db.from('announcements').update({ reactions: r }).eq('id', id)
  } else if (field !== 'reaction') {
    await db.from('announcements').update({ [field]: Math.max(0, (Number(a[field]) || 0) + delta) }).eq('id', id)
  }
  return true
}

/** Display status for the admin list (re-exported for routes). */
export { statusOf }
