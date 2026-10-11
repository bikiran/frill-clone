// Business Memory (Phase 5): what the business tells its agents, edited by the
// owner on Business Memory. Stored in business_memory, one row per item:
//
//   tone        key 'voice'                    { style, first_name, sign_off, avoid }
//   policy      key shipping|returns|pickup|live_arrival|payment|<custom>   { title?, text }
//               (shown as “Must-know facts”: short, always in the prompt; full
//               policies live in AI Knowledge / the help centre, searched on demand)
//   instruction key <slug>                     { text }        rules the agent must follow
//   rule        key 'order_status_thresholds'  { processing_days, transit_days, stale_days }
//
// Only 'active' rows reach the agent. Things an agent learns arrive as
// 'proposed' (source 'learned') and do nothing until the owner keeps them.

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
    const title = clip(raw?.title, 80)
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
 */
export function renderMemory(rows: MemoryRow[]): { toneText: string; lines: string[]; refs: ContextRef[] } {
  const refs: ContextRef[] = []
  const policies: string[] = [], rules: string[] = [], faqs: string[] = [], other: string[] = []
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
      policies.push(`- ${policyTitle(m.key, c)}: ${clip(c.text, 1200)}`)
      refs.push({ type: 'business_memory', id: m.id, label: `Fact: ${policyTitle(m.key, c)}` })
    } else if (m.kind === 'instruction' && c.text) {
      rules.push(`- ${clip(c.text, 600)}`)
      refs.push({ type: 'business_memory', id: m.id, label: `Rule: ${clip(c.text, 40)}${String(c.text).length > 40 ? '…' : ''}` })
    } else if (m.kind === 'faq' && c.text) {
      faqs.push(`- ${c.title ? `${c.title}: ` : ''}${clip(c.text, 600)}`)
      refs.push({ type: 'business_memory', id: m.id, label: `FAQ: ${clip(c.title || c.text, 40)}` })
    } else if (m.kind === 'rule') {
      // Thresholds are applied in code by check_order_status, not by the model.
      continue
    } else {
      const text = typeof c === 'string' ? c : (c.text ?? '')
      if (text) { other.push(`- ${m.key}: ${clip(text, 600)}`); refs.push({ type: 'business_memory', id: m.id, label: `${m.kind}: ${m.key}` }) }
    }
  }
  const lines: string[] = []
  if (policies.length) lines.push(`Must-know facts from the business (always true — if anything you find with ask_knowledge disagrees, these win):\n${policies.join('\n')}`)
  if (rules.length) lines.push(`Rules from the business (always follow):\n${rules.join('\n')}`)
  if (faqs.length) lines.push(`Answers the business has given before:\n${faqs.join('\n')}`)
  if (other.length) lines.push(`Also:\n${other.join('\n')}`)
  return { toneText, lines, refs }
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
