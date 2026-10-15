// Business Memory (Phase 5): what the business tells its agents, edited by the
// owner on Business Memory. Stored in business_memory, one row per item:
//
//   tone        key 'voice'                    { style, first_name, sign_off, avoid }
//   policy      key shipping|returns|pickup|live_arrival|payment|<custom>   { title?, text }
//               (shown as “Must-know facts”: short, always in the prompt; full
//               policies live in AI Knowledge / the help centre, searched on demand)
//   instruction key <slug>                     { text }        rules the agent must follow
//   rule        key 'order_status_thresholds'  { processing_days, transit_days, stale_days }
//   faq         key <slug>                     { title (the question), text (the answer) }
//
// Only 'active' rows reach the agent. Things an agent learns arrive as
// 'proposed' (source 'learned', or 'assistant' when a team member asked Colvy
// AI to remember something) and do nothing until the owner keeps them.
//
// The Agent Engine and the phone agent read memory through buildContext; every
// other AI writer (inbox drafts, Colvy AI auto-reply, review and comment
// replies, the staff assistant, the AI Knowledge test box) reads it through
// memoryForPrompt below, so an owner rule holds on every path.

import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_THRESHOLDS } from '@/lib/order-assess'
import type { ContextRef } from './memory'

export const TONE_STYLES: Record<string, { label: string; prompt: string; sample: string }> = {
  warm: { label: 'Warm & friendly', prompt: 'Warm, friendly and upbeat — like a helpful local shop. Short sentences, plain words.', sample: 'Hi Jo! Good news — your order left us this morning with AusPost. Here’s the tracking link so you can follow it.' },
  professional: { label: 'Professional', prompt: 'Polite and professional. Clear and courteous, no slang.', sample: 'Hello Jo, thank you for your message. Your order was dispatched this morning with Australia Post; you can follow it with the tracking link below.' },
  short: { label: 'Short & direct', prompt: 'Brief and to the point. One or two sentences, no small talk.', sample: 'Hi Jo — shipped this morning with AusPost. Tracking: <link>' },
}

export const POLICY_TEMPLATES: Record<string, { title: string; placeholder: string }> = {
  shipping: { title: 'Shipping & delivery', placeholder: 'e.g. Live fish ship Monday–Wednesday only, never to WA or Tasmania.' },
  returns: { title: 'Returns & refunds', placeholder: 'e.g. Livestock can’t be returned.' },
  pickup: { title: 'Click & collect', placeholder: 'e.g. We hold click & collect orders for 7 days.' },
  live_arrival: { title: 'Live arrival guarantee', placeholder: 'e.g. Dead on arrival: photo within 2 hours of delivery, then we replace or refund.' },
  payment: { title: 'Payment', placeholder: 'e.g. No cash on delivery.' },
}

export const KINDS = ['tone', 'policy', 'instruction', 'rule', 'faq'] as const
export type MemoryRow = { id: string; kind: string; key: string; content: any; status: string; source?: string; version?: number; updated_at?: string; confidence?: number | null }

const clip = (s: any, n: number) => String(s ?? '').trim().slice(0, n)
const posInt = (v: any, d: number, max = 60) => { const n = Math.round(Number(v)); return Number.isFinite(n) && n > 0 ? Math.min(max, n) : d }

/** Validate and tidy what a person saves. Returns null when there's nothing worth keeping. */
export function cleanContent(kind: string, key: string, raw: any): any | null {
  if (kind === 'tone') {
    const style = TONE_STYLES[raw?.style] ? raw.style : 'warm'
    return { style, first_name: raw?.first_name !== false, sign_off: clip(raw?.sign_off, 80), avoid: clip(raw?.avoid, 600) }
  }
  if (kind === 'rule' && key === 'order_status_thresholds') {
    return {
      processing_days: posInt(raw?.processing_days, DEFAULT_THRESHOLDS.processing_days),
      transit_days: posInt(raw?.transit_days, DEFAULT_THRESHOLDS.transit_days),
      stale_days: posInt(raw?.stale_days, DEFAULT_THRESHOLDS.stale_days),
    }
  }
  if (kind === 'policy' || kind === 'instruction' || kind === 'faq') {
    const text = clip(typeof raw === 'string' ? raw : raw?.text, 2000)
    if (!text) return null
    // An FAQ's title is the customer's question, which runs longer than a policy name.
    const title = clip(raw?.title, kind === 'faq' ? 200 : 80)
    const out: any = { text }
    if (title) out.title = title
    if (raw?.evidence && typeof raw.evidence === 'object') out.evidence = raw.evidence
    return out
  }
  return null
}

export const slug = (s: string) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'item'

export function policyTitle(key: string, content: any): string {
  return content?.title || POLICY_TEMPLATES[key]?.title || key.replace(/_/g, ' ').replace(/^\w/, c => c.toUpperCase())
}

/**
 * What the agent reads: tone as its own section, policies and rules as plain
 * lines, each with a reference for "why did Colvy say this?".
 *
 * `tags` puts a short id in front of an item (“[M2] Never promise…”) so a model
 * can say which items it followed; `checkWith` names where else the model looks
 * things up, for the “these win” note (the Agent Engine's ask_knowledge).
 */
export function renderMemory(rows: MemoryRow[], opts: { tags?: Record<string, string>; checkWith?: string } = {}): { toneText: string; lines: string[]; refs: ContextRef[] } {
  const refs: ContextRef[] = []
  const policies: string[] = [], rules: string[] = [], faqs: string[] = [], other: string[] = []
  const tag = (id: string) => (opts.tags?.[id] ? `[${opts.tags[id]}] ` : '')
  let toneText = ''
  for (const m of rows) {
    const c = m.content || {}
    if (m.kind === 'tone') {
      const st = TONE_STYLES[c.style] || TONE_STYLES.warm
      toneText = [
        `- ${st.prompt}`,
        c.first_name !== false ? '- Greet the customer by first name when you know it.' : '- Don’t use the customer’s first name.',
        c.sign_off ? `- Sign off as “${c.sign_off}”.` : '',
        c.avoid ? `- Never say or do: ${c.avoid}` : '',
      ].filter(Boolean).join('\n')
      refs.push({ type: 'business_memory', id: m.id, label: 'Tone of voice' })
    } else if (m.kind === 'policy' && c.text) {
      policies.push(`- ${tag(m.id)}${policyTitle(m.key, c)}: ${clip(c.text, 1200)}`)
      refs.push({ type: 'business_memory', id: m.id, label: `Fact: ${policyTitle(m.key, c)}` })
    } else if (m.kind === 'instruction' && c.text) {
      rules.push(`- ${tag(m.id)}${clip(c.text, 600)}`)
      refs.push({ type: 'business_memory', id: m.id, label: `Rule: ${clip(c.text, 40)}${String(c.text).length > 40 ? '…' : ''}` })
    } else if (m.kind === 'faq' && c.text) {
      faqs.push(`- ${tag(m.id)}${c.title ? `${c.title}: ` : ''}${clip(c.text, 600)}`)
      refs.push({ type: 'business_memory', id: m.id, label: `FAQ: ${clip(c.title || c.text, 40)}` })
    } else if (m.kind === 'rule') {
      // Thresholds are applied in code by check_order_status, not by the model.
      continue
    } else {
      const text = typeof c === 'string' ? c : (c.text ?? '')
      if (text) { other.push(`- ${tag(m.id)}${m.key}: ${clip(text, 600)}`); refs.push({ type: 'business_memory', id: m.id, label: `${m.kind}: ${m.key}` }) }
    }
  }
  const lines: string[] = []
  if (policies.length) lines.push(`Must-know facts from the business (always true — if anything you find ${opts.checkWith || 'with ask_knowledge'} disagrees, these win):\n${policies.join('\n')}`)
  if (rules.length) lines.push(`Rules from the business (always follow):\n${rules.join('\n')}`)
  if (faqs.length) lines.push(`Answers the business has given before:\n${faqs.join('\n')}`)
  if (other.length) lines.push(`Also:\n${other.join('\n')}`)
  return { toneText, lines, refs }
}

// ── Memory for every AI prompt ───────────────────────────────────────────────
// One helper so every AI writer reads the same thing: this company's ACTIVE
// tone, must-know facts, rules and FAQs, capped so a long list can't blow a
// prompt's token budget. Proposals and archived items never reach a prompt.

export const MEMORY_HEADING = 'BUSINESS MEMORY (set by the owner)'
export const MEMORY_RULE = 'These come from the business owner. Always follow them: they override your general knowledge, and anything else you have been given, if they disagree.'
/** ~900 tokens: room for a good set of rules without crowding out the rest of a prompt. */
export const MEMORY_PROMPT_MAX_CHARS = 3500

export type MemoryItemRef = { ref: string; id: string; kind: string; title: string }
export type PromptMemory = {
  /** Tone guidance lines ('' when no tone is saved). */
  toneText: string
  /** Facts, rules and FAQs as prompt lines, grouped like the Agent Engine sees them. */
  lines: string[]
  /** Tone + lines as one block ('' when nothing is saved). */
  text: string
  /** The same with each fact, rule and FAQ tagged [M1], [M2]… so a model can say which it followed. */
  taggedText: string
  /** The tagged items, in prompt order. Tone isn't tagged: it applies to every reply. */
  items: MemoryItemRef[]
  /** Every business_memory row that made it into the prompt (tone included). */
  ids: string[]
  refs: ContextRef[]
  /** Some items were left out to stay under the cap. */
  truncated: boolean
}

const PROMPT_KINDS = ['tone', 'policy', 'instruction', 'faq']
// When the cap bites, FAQs go first, then rules; tone and must-know facts stay.
const PROMPT_ORDER: Record<string, number> = { tone: 0, policy: 1, instruction: 2, faq: 3 }
const CHECK_WITH = 'anywhere else'
const EMPTY_MEMORY: PromptMemory = { toneText: '', lines: [], text: '', taggedText: '', items: [], ids: [], refs: [], truncated: false }

const composeMemory = (toneText: string, lines: string[]) => [toneText ? `How replies should sound:\n${toneText}` : '', ...lines].filter(Boolean).join('\n\n')

/** A short name for an item, for “Followed: …” under a draft. */
export function memoryTitle(row: Pick<MemoryRow, 'kind' | 'key' | 'content'>): string {
  const c = row.content || {}
  if (row.kind === 'tone') return 'Tone of voice'
  if (row.kind === 'policy') return policyTitle(row.key, c)
  const s = String((row.kind === 'faq' ? c.title || c.text : c.text) || row.key || '').replace(/\s+/g, ' ').trim()
  return s.length > 60 ? `${s.slice(0, 59)}…` : s
}

type PromptRow = MemoryRow & { company_id?: string }

async function loadPromptMemory(db: SupabaseClient, companyId: string, max: number): Promise<PromptMemory> {
  let rows: PromptRow[] = []
  try {
    const { data, error } = await db.from('business_memory').select('id, company_id, kind, key, content, status, updated_at')
      .eq('company_id', companyId).eq('status', 'active').in('kind', PROMPT_KINDS)
      .order('updated_at', { ascending: true }).limit(200)
    if (error) return EMPTY_MEMORY   // table not there yet (V353 not run): prompts carry on without it
    // Belt and braces: only this company's active rows, whatever came back.
    rows = ((data || []) as PromptRow[]).filter(r => r && r.company_id === companyId && r.status === 'active' && PROMPT_KINDS.includes(r.kind))
  } catch { return EMPTY_MEMORY }
  if (!rows.length) return EMPTY_MEMORY

  // Most important first (stable within a kind: the order the owner added them).
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => (PROMPT_ORDER[a.r.kind] - PROMPT_ORDER[b.r.kind]) || (a.i - b.i)).map(x => x.r)
  const kept: MemoryRow[] = []
  const tags: Record<string, string> = {}
  let n = 0, truncated = false
  for (const r of sorted) {
    if (!renderMemory([r]).refs.length) continue   // nothing to say (an empty fact)
    const tag = r.kind === 'tone' ? null : `M${n + 1}`
    const tryTags = tag ? { ...tags, [r.id]: tag } : tags
    const t = renderMemory([...kept, r], { tags: tryTags, checkWith: CHECK_WITH })
    // Measured on the tagged text, the longer of the two, so both fit.
    if (composeMemory(t.toneText, t.lines).length > max) { truncated = true; continue }
    kept.push(r)
    if (tag) { tags[r.id] = tag; n++ }
  }
  const plain = renderMemory(kept, { checkWith: CHECK_WITH })
  const tagged = renderMemory(kept, { tags, checkWith: CHECK_WITH })
  return {
    toneText: plain.toneText,
    lines: plain.lines,
    text: composeMemory(plain.toneText, plain.lines),
    taggedText: composeMemory(tagged.toneText, tagged.lines),
    items: kept.filter(r => tags[r.id]).map(r => ({ ref: tags[r.id], id: r.id, kind: r.kind, title: memoryTitle(r) })),
    ids: kept.map(r => r.id),
    refs: plain.refs,
    truncated,
  }
}

// Per request: a route handler makes its own Supabase client, so keying on the
// client shares one read between the prompts a single request builds, and never
// across requests or companies. The short expiry covers long-lived clients.
const promptCache = new WeakMap<object, Map<string, { at: number; value: Promise<PromptMemory> }>>()
const PROMPT_CACHE_MS = 20_000

/**
 * Business Memory for a prompt: tone, must-know facts, rules and FAQs for ONE
 * company, active items only, at most `maxChars` long. Never throws; returns
 * an empty memory when there's nothing saved or the table isn't there yet.
 */
export async function memoryForPrompt(db: SupabaseClient | null | undefined, companyId: string | null | undefined, opts: { maxChars?: number } = {}): Promise<PromptMemory> {
  if (!db || !companyId) return EMPTY_MEMORY
  const max = Math.max(500, Math.min(8000, Math.round(Number(opts.maxChars) || MEMORY_PROMPT_MAX_CHARS)))
  const key = `${companyId}:${max}`
  const byDb = typeof db === 'object' ? (promptCache.get(db) || new Map()) : null
  const hit = byDb?.get(key)
  if (hit && Date.now() - hit.at < PROMPT_CACHE_MS) return hit.value
  const value = loadPromptMemory(db, companyId, max)
  if (byDb) { byDb.set(key, { at: Date.now(), value }); promptCache.set(db, byDb) }
  return value
}

/** The labelled section a prompt includes ('' when there's nothing saved). */
export function memoryBlock(mem: PromptMemory, opts: { tagged?: boolean; heading?: string; note?: string } = {}): string {
  const body = opts.tagged ? mem.taggedText : mem.text
  if (!body) return ''
  return `${opts.heading || MEMORY_HEADING}\n${MEMORY_RULE}${opts.note ? ` ${opts.note}` : ''}\n\n${body}`
}

/** The tagged items a model said it relied on (by their [M#] ids). */
export function followedMemory(mem: PromptMemory, used: Iterable<unknown>): { id: string; kind: string; title: string }[] {
  const said = new Set(Array.from(used, u => String(u).trim().toUpperCase()))
  return mem.items.filter(i => said.has(i.ref)).map(({ id, kind, title }) => ({ id, kind, title }))
}

/**
 * Suggest an item (a fact or a rule) for the owner to keep or dismiss on the
 * Business Memory page. Like learned proposals, it does nothing until kept.
 */
export async function proposeMemory(db: SupabaseClient, companyId: string, item: { kind: 'policy' | 'instruction'; text: string; title?: string; source: string; evidence?: Record<string, unknown> }): Promise<{ ok: boolean; id?: string; reason?: string; error?: string }> {
  const text = clip(item.text, 600)
  if (!text) return { ok: false, error: 'There’s nothing to remember.' }
  const norm = (s: unknown) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
  const { data, error: readErr } = await db.from('business_memory').select('content, status').eq('company_id', companyId).in('status', ['active', 'proposed']).limit(300)
  if (readErr) return { ok: false, error: /business_memory/.test(readErr.message || '') ? 'Business memory needs a database update first (COLVY_V353_AGENT_ENGINE.sql).' : readErr.message }
  const known = (data || []) as { content?: { text?: string } | null; status?: string }[]
  if (known.some(k => norm(k.content?.text) === norm(text))) return { ok: true, reason: 'already known' }
  if (known.filter(k => k.status === 'proposed').length >= 20) return { ok: false, error: 'There are already 20 suggestions waiting on the Business memory page. Keep or dismiss a few first.' }
  const kind = item.kind === 'policy' ? 'policy' : 'instruction'
  const title = kind === 'policy' ? clip(item.title, 80) : ''
  const { data: row, error } = await db.from('business_memory').insert({
    company_id: companyId, kind, key: `${item.source}_${slug(title || text).slice(0, 26)}_${Math.random().toString(36).slice(2, 6)}`,
    content: { text, ...(title ? { title } : {}), ...(item.evidence ? { evidence: item.evidence } : {}) },
    status: 'proposed', source: item.source, updated_at: new Date().toISOString(),
  }).select('id').maybeSingle()
  if (error) return { ok: false, error: error.message }
  return { ok: true, id: row?.id, reason: 'proposed' }
}

// ── Reading and saving ───────────────────────────────────────────────────────

export async function listMemory(db: any, companyId: string): Promise<MemoryRow[]> {
  const { data, error } = await db.from('business_memory').select('id, kind, key, content, status, source, version, confidence, updated_at')
    .eq('company_id', companyId).in('status', ['active', 'proposed']).order('updated_at', { ascending: true }).limit(300)
  if (error) throw error
  return data || []
}

/** Create or replace one item (by kind + key), as active. Bumps its version. */
export async function saveMemory(db: any, companyId: string, item: { kind: string; key?: string | null; content: any }, userId: string | null): Promise<MemoryRow | null> {
  const kind = String(item.kind || '')
  if (!(KINDS as readonly string[]).includes(kind)) throw new Error('Unknown kind of memory.')
  const key = kind === 'tone' ? 'voice'
    : kind === 'rule' ? 'order_status_thresholds'
      : item.key ? slug(item.key)
        // A new rule or FAQ: its own key, so two that start alike don't overwrite each other.
        : kind === 'policy' ? slug(item.content?.title || item.content?.text || '')
          : `${slug(item.content?.text || '').slice(0, 30)}_${Math.random().toString(36).slice(2, 6)}`
  const content = cleanContent(kind, key, item.content)
  if (!content) {
    // Emptying a policy or rule removes it (archived, so history stays).
    await db.from('business_memory').update({ status: 'archived', updated_by: userId, updated_at: new Date().toISOString() }).eq('company_id', companyId).eq('kind', kind).eq('key', key)
    return null
  }
  const { data: existing } = await db.from('business_memory').select('id, version').eq('company_id', companyId).eq('kind', kind).eq('key', key).maybeSingle()
  const now = new Date().toISOString()
  if (existing) {
    const { data, error } = await db.from('business_memory').update({ content, status: 'active', version: (Number(existing.version) || 1) + 1, updated_by: userId, updated_at: now })
      .eq('id', existing.id).select('id, kind, key, content, status, source, version, updated_at').maybeSingle()
    if (error) throw error
    return data
  }
  const { count } = await db.from('business_memory').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('status', ['active', 'proposed'])
  if ((count || 0) >= 200) throw new Error('That’s a lot to remember — tidy up a few items first.')
  const { data, error } = await db.from('business_memory').insert({ company_id: companyId, kind, key, content, status: 'active', source: 'owner', updated_by: userId, updated_at: now })
    .select('id, kind, key, content, status, source, version, updated_at').maybeSingle()
  if (error) throw error
  return data
}

/** Keep a proposal (optionally edited), or archive any item. */
export async function setMemoryStatus(db: any, companyId: string, id: string, status: 'active' | 'archived', content: any | undefined, userId: string | null): Promise<boolean> {
  const { data: row } = await db.from('business_memory').select('id, kind, key, content, version').eq('company_id', companyId).eq('id', id).maybeSingle()
  if (!row) return false
  const patch: any = { status, updated_by: userId, updated_at: new Date().toISOString() }
  if (status === 'active' && content !== undefined) {
    const c = cleanContent(row.kind, row.key, { ...row.content, ...(typeof content === 'object' ? content : { text: content }) })
    if (!c) return false
    patch.content = c; patch.version = (Number(row.version) || 1) + 1
  }
  const { error } = await db.from('business_memory').update(patch).eq('id', id)
  return !error
}

// ── What AI Knowledge already covers ─────────────────────────────────────────
// Agents search AI Knowledge (help centre articles, facts, files, website) on
// their own, so full policies belong there. This tells the owner which topics
// already have an article, so they don't copy them into Business Memory.

const TOPIC_MATCH: Record<string, RegExp> = {
  shipping: /\b(shipping|delivery|deliveries|postage|freight|dispatch)\b/i,
  returns: /\b(returns?|refunds?|exchanges?)\b/i,
  pickup: /\b(click\s*(and|&)\s*collect|pick\s*-?\s*up|collection)\b/i,
  live_arrival: /\b(live\s+arrival|dead\s+on\s+arrival|doa|arrive[sd]?\s+dead|livestock\s+guarantee)\b/i,
  payment: /\b(payments?|afterpay|zip\s*pay|paypal|pay\s+later)\b/i,
}
const SOURCE_LABEL: Record<string, string> = { help: 'help centre', fact: 'AI Knowledge facts', website: 'website', file: 'uploaded files' }

export type Coverage = {
  counts: Record<string, number>
  topics: Record<string, { title: string; source: string; where: string; url: string | null } | null>
}

export async function knowledgeCoverage(db: any, companyId: string): Promise<Coverage> {
  const empty: Coverage = { counts: {}, topics: Object.fromEntries(Object.keys(TOPIC_MATCH).map(k => [k, null])) }
  try {
    const { data } = await db.from('ai_knowledge').select('source, title, url').eq('company_id', companyId).in('source', ['help', 'fact', 'website', 'file']).limit(2000)
    const rows = (data || []) as { source: string; title: string | null; url: string | null }[]
    const counts: Record<string, number> = {}
    for (const r of rows) counts[r.source] = (counts[r.source] || 0) + 1
    // Help articles first — they're written for customers — then facts, files, website.
    const order = ['help', 'fact', 'file', 'website']
    const sorted = [...rows].sort((a, b) => order.indexOf(a.source) - order.indexOf(b.source))
    const topics: Coverage['topics'] = {}
    for (const [k, re] of Object.entries(TOPIC_MATCH)) {
      const hit = sorted.find(r => r.title && re.test(r.title))
      topics[k] = hit ? { title: String(hit.title).slice(0, 90), source: hit.source, where: SOURCE_LABEL[hit.source] || hit.source, url: hit.url || null } : null
    }
    return { counts, topics }
  } catch { return empty }
}
