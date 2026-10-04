// Questions Colvy AI couldn't answer from the knowledge library (server only).
//
// Logged when auto-reply hands a customer to a person because of a knowledge
// gap, or an inbox draft found nothing to go on; and found in bulk by
// scanRecentQuestions(). Similar questions are grouped so the owner answers
// each one once, as a fact. Everything here is best effort: logging must never
// break a reply.

import Anthropic from '@anthropic-ai/sdk'
import { searchKnowledge } from '@/lib/ai-knowledge'

const STOP = new Set(['the', 'and', 'for', 'you', 'your', 'are', 'was', 'were', 'can', 'could', 'would', 'should', 'will', 'what', 'when', 'where', 'which', 'who', 'how', 'why', 'does', 'did', 'have', 'has', 'had', 'this', 'that', 'these', 'those', 'with', 'from', 'about', 'into', 'there', 'their', 'them', 'they', 'then', 'than', 'just', 'like', 'want', 'need', 'know', 'please', 'thanks', 'thank', 'hello', 'hey', 'any', 'some', 'get', 'got', 'also', 'still', 'much', 'many', 'very', 'our', 'out', 'not', 'yes', 'okay', 'today', 'is', 'do', 'hi', 'there', 'mate', 'guys', 'possible', 'able', 'tell', 'wondering', 'question', 'quick'])

const stem = (w: string) => w.replace(/(ies)$/, 'y').replace(/(ing|ed|es|s)$/, '')

export function questionWords(text: string): string[] {
  const words = (String(text).toLowerCase().match(/[a-z0-9][a-z0-9'-]+/g) || [])
    .map(w => w.replace(/'s$/, '').replace(/[^a-z0-9]/g, ''))
    .filter(w => w.length >= 3 && !STOP.has(w))
    .map(stem)
  return Array.from(new Set(words)).sort().slice(0, 10)
}

const keyOf = (words: string[]) => words.slice(0, 8).join(' ')
const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a), B = new Set(b)
  let inter = 0
  for (const x of A) if (B.has(x)) inter++
  return inter / Math.max(1, A.size + B.size - inter)
}

/** The question part of a customer message: the sentence with a "?", else the start. */
export function questionFrom(text: string): string {
  const t = String(text || '').replace(/\s+/g, ' ').trim()
  const q = t.split(/(?<=[.!?])\s+/).find(s => s.includes('?'))
  return (q || t).slice(0, 300)
}

type Example = { text: string; conversation_id?: string | null; source: string; at: string }

async function upsertGroup(db: any, companyId: string, g: { question: string; count: number; examples: Example[]; suggested?: string | null }) {
  const words = questionWords(g.question)
  if (!words.length) return
  const { data: rows, error } = await db.from('ai_unanswered').select('id, key, count, examples, suggested_answer, status')
    .eq('company_id', companyId).order('last_seen_at', { ascending: false }).limit(400)
  if (error) return   // table not there yet (V327 not run)
  const key = keyOf(words)
  const match = (rows || []).find((r: any) => r.key === key)
    || (rows || []).map((r: any) => ({ r, s: jaccard(words, String(r.key).split(' ')) }))
      .filter((x: any) => x.s >= 0.6).sort((a: any, b: any) => b.s - a.s)[0]?.r
  const now = new Date().toISOString()
  if (match) {
    const examples = [...g.examples, ...(Array.isArray(match.examples) ? match.examples : [])].slice(0, 5)
    await db.from('ai_unanswered').update({
      count: (match.count || 0) + g.count, examples, last_seen_at: now,
      ...(g.suggested && !match.suggested_answer ? { suggested_answer: g.suggested } : {}),
    }).eq('id', match.id)
  } else {
    await db.from('ai_unanswered').insert({
      company_id: companyId, question: g.question, key, count: g.count, examples: g.examples.slice(0, 5),
      suggested_answer: g.suggested || null, first_seen_at: now, last_seen_at: now,
    })
  }
}

/** Record one question Colvy AI couldn't answer. Never throws. */
export async function logUnanswered(db: any, companyId: string, text: string, opts: { source: 'ai_reply' | 'ai_draft'; conversationId?: string | null }) {
  try {
    const q = questionFrom(text)
    if (q.length < 6) return
    await upsertGroup(db, companyId, { question: q, count: 1, examples: [{ text: q, conversation_id: opts.conversationId || null, source: opts.source, at: new Date().toISOString() }] })
  } catch { /* best effort */ }
}

const LOOKS_LIKE_QUESTION = /\?|^(do|does|did|can|could|would|will|is|are|was|were|have|has|what|whats|what's|when|where|which|who|why|how|any|anyone)\b/i

/**
 * Look back over recent customer messages for questions the library doesn't
 * cover, group them with Colvy AI, and add them to the list along with how the
 * team answered (as a suggested fact).
 */
export async function scanRecentQuestions(db: any, companyId: string, days = 45): Promise<{ scanned: number; uncovered: number; groups: number } | { error: string }> {
  if (!process.env.ANTHROPIC_API_KEY) return { error: 'Colvy AI isn’t set up on this server yet.' }
  const since = new Date(Date.now() - days * 86400_000).toISOString()
  const { data: msgs, error } = await db.from('messages')
    .select('conversation_id, sender_type, content, is_ai, is_internal, created_at')
    .eq('company_id', companyId).gte('created_at', since)
    .order('created_at', { ascending: true }).limit(4000)
  if (error) return { error: error.message }

  // Customer questions, each with the team's next human reply.
  const byConv = new Map<string, any[]>()
  for (const m of msgs || []) {
    if (m.is_internal || !m.conversation_id) continue
    const list = byConv.get(m.conversation_id) || []
    list.push(m); byConv.set(m.conversation_id, list)
  }
  const cands: { text: string; reply: string; conv: string; at: string }[] = []
  const seen = new Set<string>()
  for (const [conv, list] of byConv) {
    for (let i = 0; i < list.length; i++) {
      const m = list[i]
      if (m.sender_type !== 'visitor') continue
      const text = String(m.content || '').replace(/\s+/g, ' ').trim()
      if (text.length < 8 || text.length > 500 || !LOOKS_LIKE_QUESTION.test(text)) continue
      const q = questionFrom(text)
      const k = keyOf(questionWords(q))
      if (!k || seen.has(k)) continue
      seen.add(k)
      const reply = list.slice(i + 1, i + 6).find((n: any) => n.sender_type === 'agent' && !n.is_ai && String(n.content || '').trim())
      cands.push({ text: q, reply: String(reply?.content || '').replace(/\s+/g, ' ').slice(0, 400), conv, at: m.created_at })
    }
  }
  const pool = cands.slice(-250)

  // Keep only what the library has nothing solid on.
  const uncovered: typeof pool = []
  for (let i = 0; i < pool.length; i += 10) {
    const res = await Promise.all(pool.slice(i, i + 10).map(c => searchKnowledge(db, companyId, c.text, 1).catch(() => [])))
    res.forEach((hits, j) => { if (!hits.length || Number(hits[0].rank || 0) < 0.45) uncovered.push(pool[i + j]) })
  }
  if (!uncovered.length) return { scanned: pool.length, uncovered: 0, groups: 0 }
  const list = uncovered.slice(-150)

  const { data: co } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
  try {
    const client = new Anthropic()
    const response = await client.beta.messages.create({
      model: 'claude-opus-5-5',
      max_tokens: 16000,
      output_config: {
        effort: 'low',
        format: {
          type: 'json_schema',
          schema: {
            type: 'object',
            properties: {
              groups: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: { question: { type: 'string' }, members: { type: 'array', items: { type: 'integer' } }, suggested_answer: { type: 'string' } },
                  required: ['question', 'members', 'suggested_answer'],
                  additionalProperties: false,
                },
              },
            },
            required: ['groups'],
            additionalProperties: false,
          },
        },
      },
      // If a safety classifier declines, the API retries on a fallback model within the same call.
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      system: `You help ${co?.name || 'a small business'} find the general questions customers keep asking that its knowledge base doesn't answer yet.
You get numbered customer messages, each with how the team replied (if they did).
- Group messages that ask the same thing. Each group gets one clear, general question in the customer's voice (e.g. "Do you deliver on weekends?").
- Leave out anything that isn't a general question about the business: greetings, thanks, and questions about one customer's own order, booking, payment or account (those are looked up live, not answered from a knowledge base). Also leave out questions about whether one specific product is in stock or its price.
- suggested_answer: a short, general answer in the business's voice, based ONLY on what the team actually replied. Remove names, order numbers, dates and anything about one person. If the replies don't give a general answer, use "".
- members: the message numbers in the group. At most 30 groups, most common first. Never use emojis.`,
      messages: [{ role: 'user', content: list.map((c, i) => `${i + 1}. Customer: ${c.text}${c.reply ? `\n   Team replied: ${c.reply}` : ''}`).join('\n') }],
    })
    if (response.stop_reason === 'refusal') return { error: 'Colvy AI declined to scan these conversations.' }
    const text = response.content.filter((b: any) => b.type === 'text').map((b: any) => b.text).join('')
    const groups: { question: string; members: number[]; suggested_answer: string }[] = JSON.parse(text).groups || []
    let n = 0
    for (const g of groups.slice(0, 30)) {
      const members = (g.members || []).map(i => list[i - 1]).filter(Boolean)
      if (!members.length || !String(g.question || '').trim()) continue
      await upsertGroup(db, companyId, {
        question: String(g.question).trim().slice(0, 300),
        count: members.length,
        examples: members.slice(-5).map(m => ({ text: m.text, conversation_id: m.conv, source: 'scan', at: m.at })),
        suggested: String(g.suggested_answer || '').trim() || null,
      })
      n++
    }
    return { scanned: pool.length, uncovered: list.length, groups: n }
  } catch (e: any) {
    console.error('[ai-unanswered] scan', e?.message || e)
    return { error: 'Colvy AI is busy right now. Please try the scan again in a moment.' }
  }
}
