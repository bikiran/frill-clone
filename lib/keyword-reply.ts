import { createClient } from '@supabase/supabase-js'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export interface KeywordReplyResult {
  matched: boolean
  rule?: string
  reply?: string
  reason?: string
}

// Lower-case, drop punctuation, collapse whitespace. So "located?" and
// "what's your store address?" compare cleanly against a typed-in message.
function norm(s: string): string {
  return String(s || '').toLowerCase().replace(/[^a-z0-9\s]+/g, ' ').replace(/\s+/g, ' ').trim()
}

// Common SMS/texting shorthand → full words, so "where r u located" is treated
// like "where are you located".
const SHORTHAND: Record<string, string> = {
  u: 'you', ur: 'your', r: 'are', pls: 'please', plz: 'please', thx: 'thanks',
  hrs: 'hours', hr: 'hour', addr: 'address', loc: 'location',
}
function expand(s: string): string {
  return norm(s).split(' ').map(w => SHORTHAND[w] || w).join(' ')
}

// Stopwords that carry no matching signal on their own.
const STOP = new Set(['where', 'are', 'is', 'am', 'you', 'your', 'the', 'a', 'an', 'do',
  'does', 'what', 'to', 'of', 'me', 'i', 'we', 'our', 'can', 'could', 'would', 'will',
  'please', 'hi', 'hello', 'hey', 'there', 'and', 'for', 'in', 'on', 'at', 'it'])

// A crude stem so "location" ~ "located" ~ "locating" all collapse together.
function stem(w: string): string { return w.length <= 5 ? w : w.slice(0, 5) }
function wordMatches(a: string, b: string): boolean {
  return a === b || a.startsWith(stem(b)) || b.startsWith(stem(a))
}

// Score how well a configured keyword matches the (expanded) message. 0 = no
// match; higher = more specific. A whole-phrase hit beats a word-level one.
function keywordScore(keyword: string, msgExpanded: string, msgWords: string[]): number {
  const k = norm(keyword)
  if (!k) return 0
  if (msgExpanded.includes(k)) return k.length + 100          // strongest: exact phrase present
  const kw = k.split(' ').filter(w => w.length > 1 && !STOP.has(w))
  if (!kw.length) return 0
  // Every significant word of the keyword must appear (exact or same stem).
  const all = kw.every(w => msgWords.some(mw => wordMatches(mw, w)))
  return all ? k.length : 0
}

/**
 * Intent gate: a keyword can appear in a message without the customer actually
 * ASKING the question the rule answers (e.g. "move my order to you vs elsewhere,
 * mostly bulk filter supplies" mentions nothing about our address, yet a loose
 * "location" keyword could still fire). Before sending an automated reply, ask
 * the model whether the customer is genuinely requesting/needing this info.
 *
 * Fail-open: if there's no API key or the check errors, we fall back to the
 * lexical match (preserving the existing behaviour) rather than silently
 * dropping a legitimate auto-reply.
 */
async function intentAllows(text: string, keywords: string[], reply: string): Promise<boolean> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return true
  const topic = (keywords || []).filter(Boolean).join(', ')
  const system =
    'You gate an automated FAQ auto-reply. A business auto-reply rule fires on keywords, ' +
    'but a keyword can appear in a message without the customer actually asking that question. ' +
    'Given the customer\'s message, the rule\'s keywords, and the canned answer it would send, ' +
    'decide whether the customer is genuinely ASKING FOR or NEEDS this information right now. ' +
    'Answer with ONLY "YES" or "NO". Answer NO when the topic is merely mentioned in passing, ' +
    'is part of a different request, or the canned answer would not actually address what they said.'
  const user =
    `Rule keywords: ${topic || '(none)'}\n` +
    `Canned answer it would send:\n"""${String(reply || '').slice(0, 600)}"""\n\n` +
    `Customer message:\n"""${String(text || '').slice(0, 1500)}"""\n\n` +
    'Should we send this auto-reply? Answer YES or NO.'
  try {
    const ctrl = new AbortController()
    const t = setTimeout(() => ctrl.abort(), 6000)
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5',
        max_tokens: 5,
        system,
        messages: [{ role: 'user', content: user }],
      }),
      signal: ctrl.signal,
    })
    clearTimeout(t)
    if (!res.ok) return true
    const data = await res.json()
    const out = (data.content || []).filter((c: any) => c.type === 'text').map((c: any) => c.text).join('').trim().toLowerCase()
    if (!out) return true
    return out.startsWith('y')
  } catch {
    return true
  }
}

/**
 * Answer a common question automatically, if the customer's message matches a
 * keyword rule the business configured.
 *
 * Deliberately conservative:
 *  - only fires on a real keyword match (never guesses)
 *  - the most SPECIFIC keyword wins, so "what time do you close" beats "time"
 *  - answers at most once per rule per conversation, so it doesn't nag
 *  - sends the business's exact saved answer — it never writes its own
 *
 * Works for any channel. `deliver` lets the caller push the reply out over the
 * customer's channel (e.g. text it back over SMS) in addition to storing it.
 */
export async function runKeywordReply(opts: {
  conversationId: string
  text: string
  companyId?: string
  // The channel the reply is actually delivered on, so the thread record is
  // labelled correctly (SMS/email/chat) instead of defaulting to Live Chat.
  channel?: string
  deliver?: (reply: string) => Promise<void>
}): Promise<KeywordReplyResult> {
  const { conversationId, text } = opts
  if (!conversationId || !text) return { matched: false }

  const db = admin()

  let companyId = opts.companyId
  if (!companyId) {
    const { data } = await db.from('conversations').select('company_id').eq('id', conversationId).maybeSingle()
    companyId = data?.company_id
  }
  if (!companyId) return { matched: false }

  const { data: rules } = await db.from('keyword_replies')
    .select('*').eq('company_id', companyId).eq('is_active', true)
  if (!rules?.length) return { matched: false }

  // Expand shorthand once; match keywords against the normalised message so
  // "Hi where r u located" still triggers "where are you located?" / "location".
  const msgExpanded = expand(text)
  const msgWords = msgExpanded.split(' ').filter(Boolean)

  // Most specific match wins.
  let best: any = null
  let bestScore = 0
  for (const r of rules) {
    for (const kw of (r.keywords || [])) {
      const score = keywordScore(String(kw), msgExpanded, msgWords)
      if (score > bestScore) { best = r; bestScore = score }
    }
  }
  if (!best) return { matched: false }

  // Don't repeat ourselves in the same conversation.
  if (best.once_per_conversation !== false) {
    const { data: hit } = await db.from('keyword_reply_hits')
      .select('id').eq('conversation_id', conversationId).eq('keyword_reply_id', best.id).maybeSingle()
    if (hit) return { matched: false, reason: 'already answered in this conversation' }
  }

  const reply: string = best.reply

  // AI context check: only send if the customer is actually asking for what this
  // rule answers — a lexical keyword hit alone isn't enough.
  const allowed = await intentAllows(text, best.keywords || [], reply)
  if (!allowed) return { matched: false, reason: 'keyword present but not asked in context' }

  const { data: company } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()

  await db.from('messages').insert({
    conversation_id: conversationId,
    company_id: companyId,
    sender_type: 'agent',
    sender_name: company?.name || 'Support',
    content: reply,
    message_type: 'text',
    delivery_channel: opts.channel || 'chat',
    metadata: { auto: true, keyword_reply: true, rule_id: best.id },
  })

  await db.from('conversations').update({
    last_message: reply.slice(0, 200),
    last_message_at: new Date().toISOString(),
  }).eq('id', conversationId)

  // Push it out over the customer's channel (SMS/email) if the caller can.
  if (opts.deliver) {
    try { await opts.deliver(reply) } catch (e) { console.error('[keyword reply] delivery failed', e) }
  }

  try {
    await db.from('keyword_reply_hits').insert({
      company_id: companyId, conversation_id: conversationId, keyword_reply_id: best.id,
    })
    await db.from('keyword_replies').update({ match_count: (best.match_count || 0) + 1 }).eq('id', best.id)
  } catch {}

  return { matched: true, rule: best.name, reply }
}
