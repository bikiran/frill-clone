// Earned trust: when the team keeps approving an agent's drafts without
// changing them, suggest letting it do that one thing on its own.
//
// "You sent 47 of the last 50 opening-hours replies without changing a word —
// let the Support Agent send these on its own?" One tap applies the same
// setting the business could switch on by hand (still within its daily
// limits, and switchable back any time). "Not now" hides it for a while.
//
// A suggestion only appears when the record is strong: at least MIN_DECIDED
// drafts decided in the last 30 days, at least 90% sent unchanged, and none
// dismissed among the most recent ones. Drafts nobody looked at don't count
// either way.

import {
  AUTO_TOPICS, getAutoSend, setAutoSend, getReviewAuto, setReviewAuto, getCommentAuto, setCommentAuto,
  getSalesAuto, setSalesAuto, getSalesFollowup, setSalesFollowup, getOpsAuto, setOpsAuto,
  getTrustDismissed, TRUST_SNOOZE_DAYS,
} from './pilot'

export const TRUST_WINDOW_DAYS = 30
export const MIN_DECIDED = 12
export const MIN_RATE = 0.9
const RECENT = 10
const CONSIDER = 50

export type TrustSuggestion = {
  key: string
  role: string
  title: string           // "Let the Support Agent answer opening hours on its own"
  detail: string          // the track record, in plain words
  confirm: string         // what will change, for the confirm dialog
  accept: string          // button label
  stats: { decided: number; asIs: number; edited: number; dismissed: number }
}

type Candidate = { key: string; role: string; matches: (a: any, run: any) => boolean; what: string; title: string; confirm: string; accept: string; already: boolean; apply: (userId: string | null) => Promise<void> }

const TOPIC_WORDS: Record<string, string> = {
  opening_hours: 'opening-hours questions',
  order_status: '“where’s my order?” questions',
  stock: 'stock questions',
  store_info: 'questions your knowledge covers',
  booking: 'booking questions',
}

async function candidates(db: any, companyId: string): Promise<Candidate[]> {
  const [support, reception, review, comment, sales, followup, ops] = await Promise.all([
    getAutoSend(db, companyId), getAutoSend(db, companyId, 'reception'), getReviewAuto(db, companyId), getCommentAuto(db, companyId),
    getSalesAuto(db, companyId), getSalesFollowup(db, companyId), getOpsAuto(db, companyId),
  ])
  const out: Candidate[] = []
  const topicFor = (roleKey: 'support' | 'reception', cur: typeof support, agent: string) => {
    for (const [topic, t] of Object.entries(AUTO_TOPICS)) {
      if (roleKey === 'support' && topic === 'booking') continue
      if (roleKey === 'reception' && topic !== 'booking' && topic !== 'opening_hours' && topic !== 'store_info') continue
      const label = TOPIC_WORDS[topic] || t.label.toLowerCase()
      out.push({
        key: `${roleKey}:topic:${topic}`, role: roleKey,
        matches: (a, run) => a.action_key === 'send_message' && run?.role_key === roleKey && a.args?.topic === topic,
        what: `replies to ${label}`,
        title: `Let the ${agent} answer ${label} on its own`,
        confirm: `The ${agent} will answer ${label} straight away instead of waiting for you — only when it looked the answer up first, and within your daily limits (${cur.max_per_day} a day). You can switch it back any time on the Agents page.`,
        accept: 'Let it answer these',
        already: cur.enabled && cur.topics.includes(topic),
        apply: async uid => { await setAutoSend(db, companyId, cur.enabled ? { ...cur, topics: Array.from(new Set([...cur.topics, topic])) } : { ...cur, enabled: true, topics: [topic] }, uid, roleKey) },
      })
    }
  }
  topicFor('support', support, 'Support Agent')
  topicFor('reception', reception, 'Reception Agent')
  out.push({
    key: 'reputation:reviews', role: 'reputation',
    matches: (a, run) => a.action_key === 'reply_to_review' && Number(run?.input?.rating) >= 4,
    what: 'replies to 4 and 5-star reviews',
    title: 'Let the Reputation Agent reply to happy reviews on its own',
    confirm: `The Reputation Agent will post replies to 4 and 5-star Google reviews straight away (up to ${review.max_per_day} a day). Lower ratings still wait for you. You can switch it back any time.`,
    accept: 'Let it reply',
    already: review.enabled,
    apply: async uid => { await setReviewAuto(db, companyId, { ...review, enabled: true, min_rating: 4 }, uid) },
  })
  if (comment.on) out.push({
    key: 'reputation:comments', role: 'reputation',
    matches: a => a.action_key === 'reply_to_comment',
    what: 'comment replies',
    title: 'Let the Reputation Agent reply to friendly comments on its own',
    confirm: `The Reputation Agent will reply to friendly Facebook and Instagram comments straight away (up to ${comment.max_per_day} a day). Complaints and anything sensitive still come to you.`,
    accept: 'Let it reply',
    already: comment.enabled,
    apply: async uid => { await setCommentAuto(db, companyId, { ...comment, enabled: true }, uid) },
  })
  out.push({
    key: 'sales:carts', role: 'sales',
    matches: a => a.action_key === 'send_cart_followup',
    what: 'cart follow-ups',
    title: 'Let the Sales Agent follow up abandoned carts on its own',
    confirm: `The Sales Agent will send its cart follow-ups straight away (up to ${sales.max_per_day} a day, within sending hours). Anything offering a discount still waits for you.`,
    accept: 'Let it send',
    already: sales.enabled,
    apply: async uid => { await setSalesAuto(db, companyId, { ...sales, enabled: true }, uid) },
  })
  if (followup.on) out.push({
    key: 'sales:followups', role: 'sales',
    matches: a => a.action_key === 'send_sales_followup',
    what: 'quote and enquiry follow-ups',
    title: 'Let the Sales Agent follow up quotes and enquiries on its own',
    confirm: `The Sales Agent will send quote and enquiry follow-ups straight away (up to ${followup.max_per_day} a day). You can switch it back any time.`,
    accept: 'Let it send',
    already: followup.enabled,
    apply: async uid => { await setSalesFollowup(db, companyId, { ...followup, enabled: true }, uid) },
  })
  out.push({
    key: 'operations:updates', role: 'operations',
    matches: a => a.action_key === 'send_order_update',
    what: 'order updates',
    title: 'Let the Operations Agent update customers on its own',
    confirm: `The Operations Agent will send customers its updates about late or held-up orders straight away (up to ${ops.max_per_day} a day). Carrier problems still come to you first.`,
    accept: 'Let it send',
    already: ops.enabled,
    apply: async uid => { await setOpsAuto(db, companyId, { ...ops, enabled: true }, uid) },
  })
  // Outside tools set to "Ask first".
  try {
    const { data: conns } = await db.from('agent_connections').select('id, name, tools, enabled').eq('company_id', companyId)
    for (const c of conns || []) {
      if (!c.enabled) continue
      for (const t of Array.isArray(c.tools) ? c.tools : []) {
        if (t?.mode !== 'ask' || !t.key) continue
        const label = t.title || String(t.name || '').replace(/[_-]+/g, ' ')
        out.push({
          key: `tool:${t.key}`, role: 'tools',
          matches: a => a.action_key === t.key,
          what: `“${label}” uses`,
          title: `Let agents use “${label}” (${c.name}) on its own`,
          confirm: `Agents will use “${label}” from ${c.name} without asking first, up to 50 times a day — after that a person approves. You can set it back to “Ask first” any time.`,
          accept: 'Let it run',
          already: false,
          apply: async () => {
            const { data: row } = await db.from('agent_connections').select('tools').eq('id', c.id).eq('company_id', companyId).maybeSingle()
            const tools = (row?.tools || []).map((x: any) => (x.key === t.key ? { ...x, mode: 'auto' } : x))
            await db.from('agent_connections').update({ tools, updated_at: new Date().toISOString() }).eq('id', c.id).eq('company_id', companyId)
          },
        })
      }
    }
  } catch { /* no outside tools yet */ }
  return out
}

async function decisions(db: any, companyId: string) {
  const since = new Date(Date.now() - TRUST_WINDOW_DAYS * 86_400_000).toISOString()
  const { data: approvals } = await db.from('agent_approvals').select('run_id, action_key, args, status, created_at, decided_at')
    .eq('company_id', companyId).gte('created_at', since).in('status', ['executed', 'approved', 'edited', 'rejected']).limit(5000)
  const list = (approvals || []).sort((a: any, b: any) => String(b.decided_at || b.created_at).localeCompare(String(a.decided_at || a.created_at)))
  const runIds = Array.from(new Set(list.map((a: any) => a.run_id)))
  const runs = new Map<string, any>()
  for (let i = 0; i < runIds.length; i += 200) {
    const { data } = await db.from('agent_runs').select('id, role_key, input, mode').in('id', runIds.slice(i, i + 200))
    for (const r of data || []) runs.set(r.id, r)
  }
  return { list, runs }
}

const record = (rows: any[]) => {
  const recent = rows.slice(0, CONSIDER)
  const asIs = recent.filter(a => a.status === 'executed' || a.status === 'approved').length
  const edited = recent.filter(a => a.status === 'edited').length
  const dismissed = recent.filter(a => a.status === 'rejected').length
  return { decided: recent.length, asIs, edited, dismissed, cleanRecent: !rows.slice(0, RECENT).some(a => a.status === 'rejected') }
}

/** Suggestions this business has earned right now (strongest record first). */
export async function trustSuggestions(db: any, companyId: string): Promise<TrustSuggestion[]> {
  try {
    const [cands, { list, runs }, dismissed] = await Promise.all([candidates(db, companyId), decisions(db, companyId), getTrustDismissed(db, companyId)])
    const snoozeCut = Date.now() - TRUST_SNOOZE_DAYS * 86_400_000
    const out: (TrustSuggestion & { rate: number })[] = []
    for (const c of cands) {
      if (c.already) continue
      if (dismissed[c.key] && new Date(dismissed[c.key]).getTime() > snoozeCut) continue
      const rows = list.filter((a: any) => { const run = runs.get(a.run_id); return run?.mode === 'live' && c.matches(a, run) })
      const r = record(rows)
      if (r.decided < MIN_DECIDED || !r.cleanRecent) continue
      const rate = r.asIs / r.decided
      if (rate < MIN_RATE) continue
      out.push({
        key: c.key, role: c.role, title: c.title, confirm: c.confirm, accept: c.accept, rate,
        detail: `Your team sent ${r.asIs} of the last ${r.decided} ${c.what} without changing a word${r.edited ? ` (${r.edited} edited` + (r.dismissed ? `, ${r.dismissed} dismissed)` : ')') : r.dismissed ? ` (${r.dismissed} dismissed)` : ''}.`,
        stats: { decided: r.decided, asIs: r.asIs, edited: r.edited, dismissed: r.dismissed },
      })
    }
    return out.sort((a, b) => b.rate - a.rate || b.stats.decided - a.stats.decided).map(({ rate: _r, ...s }) => s)
  } catch { return [] }
}

/** Apply a suggestion the business accepted (re-checked, so a stale tap can't do anything odd). */
export async function acceptTrust(db: any, companyId: string, key: string, userId: string | null): Promise<{ ok: boolean; error?: string }> {
  const current = await trustSuggestions(db, companyId)
  if (!current.some(s => s.key === key)) return { ok: false, error: 'That suggestion no longer applies.' }
  const c = (await candidates(db, companyId)).find(x => x.key === key)
  if (!c) return { ok: false, error: 'That suggestion no longer applies.' }
  await c.apply(userId)
  return { ok: true }
}
