// The Colvy chat (see lib/colvy-chat.ts): how one person's thread is put
// together. Pure (no database), so it's tested on its own
// (scripts/colvy-chat.test.mjs) and safe to import anywhere.
//
// A thread is the welcome, the updates the Colvy team has posted since a
// little before the person's chat began, and their conversation with Colvy's
// support team. Only what they wrote and what the team sent them comes from
// that conversation: internal notes, system rows and empty rows never do.

export type ColvyItem = {
  id: string
  kind: 'welcome' | 'update' | 'team' | 'me'
  at: string
  text: string
  title?: string
  link?: { url: string; label: string } | null
  /** For 'team': who at Colvy wrote it ("Bikiran"). */
  from?: string | null
}

export type ColvyChatRow = { started_at: string; last_read_at?: string | null }
export type ColvyUpdateRow = { id: string; title: string; body?: string | null; link_url?: string | null; link_label?: string | null; published_at?: string | null }
export type ColvyMessageRow = { id: string; sender_type?: string | null; sender_name?: string | null; content?: string | null; created_at: string; is_internal?: boolean | null; metadata?: any }

export const WELCOME_TEXT =
  'Welcome to Colvy! 👋 This is your direct line to the Colvy team. We post what’s new here, and you can message us any time: a real person answers. Only you can see this chat.'

/** Updates published this long before a person's chat began still show, so a new account isn't empty. */
export const UPDATES_LOOKBACK_MS = 30 * 24 * 60 * 60 * 1000
export const MAX_UPDATES = 30
export const MAX_TEXT = 4000

const time = (s?: string | null) => { const t = s ? Date.parse(s) : NaN; return Number.isFinite(t) ? t : NaN }

/** Only https links (or a page inside Colvy) become a button. */
export function safeLink(url?: string | null, label?: string | null): { url: string; label: string } | null {
  const u = String(url || '').trim()
  if (!u) return null
  if (!/^https:\/\//i.test(u) && !/^\/(?!\/)/.test(u)) return null
  return { url: u, label: String(label || '').trim().slice(0, 40) || 'Open' }
}

/** The first name of a team member, for "Bikiran from Colvy". */
export function firstName(name?: string | null): string | null {
  const n = String(name || '').trim().split(/\s+/)[0]
  return n ? n.slice(0, 40) : null
}

export function buildThread(o: {
  chat: ColvyChatRow
  updates: ColvyUpdateRow[]
  messages: ColvyMessageRow[]
  now?: number
}): { items: ColvyItem[]; unread: number } {
  const now = o.now ?? Date.now()
  const started = time(o.chat.started_at)
  const items: ColvyItem[] = [{ id: 'welcome', kind: 'welcome', at: o.chat.started_at, text: WELCOME_TEXT }]

  const from = Number.isFinite(started) ? started - UPDATES_LOOKBACK_MS : -Infinity
  const updates = (o.updates || [])
    .filter(u => { const t = time(u.published_at); return Number.isFinite(t) && t >= from && t <= now })
    .sort((a, b) => time(b.published_at) - time(a.published_at))
    .slice(0, MAX_UPDATES)
  for (const u of updates) {
    items.push({ id: `update:${u.id}`, kind: 'update', at: u.published_at!, title: u.title, text: String(u.body || ''), link: safeLink(u.link_url, u.link_label) })
  }

  for (const m of o.messages || []) {
    const text = String(m.content || '').trim()
    if (!text || m.is_internal) continue
    if (m.sender_type === 'visitor') items.push({ id: m.id, kind: 'me', at: m.created_at, text })
    else if (m.sender_type === 'agent') items.push({ id: m.id, kind: 'team', at: m.created_at, text, from: firstName(m.sender_name) })
  }

  items.sort((a, b) => (time(a.at) || 0) - (time(b.at) || 0))
  const readAt = time(o.chat.last_read_at)
  const unread = items.filter(i => i.kind !== 'me' && (!Number.isFinite(readAt) || time(i.at) > readAt)).length
  return { items, unread }
}
