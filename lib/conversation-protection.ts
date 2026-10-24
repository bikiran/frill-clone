// Conversation protection: spam and inappropriate messages, without
// blocking real customers. Server only (assessMessage is pure).
//
// A message is never judged on one word. Content signals (adult terms,
// "local singles" lures, scam pitches, link shorteners, obscured spelling,
// profanity) are weighed against who sent it (blocked, never spoken to
// before, or a customer the team has replied to / who has ordered — a known
// customer quoting abuse they received isn't spam). Then:
//
//   clean    nothing changes.
//   suspect  the message is kept and shown, but hidden behind "Review
//            message" in the inbox; the inbox preview and notifications say
//            "Message hidden: may be spam" instead of the text; automatic
//            replies (thank-you, keyword replies, Colvy AI, smart triggers, AI
//            agents) don't answer it.
//   spam     as suspect, and the conversation goes to Spam (out of the open
//            inbox, restorable) with no notification at all.
//   blocked  the sender is blocked: as spam.
//
// The team decides: "Not spam" clears it (and trusts that customer from then
// on), "Block sender" blocks them. Settings → Archived & Spam turns it off.
// Nothing is deleted; the original text is always kept.

export type Verdict = 'clean' | 'suspect' | 'spam' | 'blocked'
export type Assessment = { verdict: Verdict; score: number; reasons: string[] }

export const HIDDEN_PREVIEW = 'Message hidden: may be spam'

// Strong adult terms (whole words). Deliberately not "sex" (fish are sexed),
// "cock", "dick" or "breast" (roosters, names, chicken breast).
const ADULT = /\b(porn|porno|pornography|xxx|nudes?|naked\s+(?:pics?|photos?|girls?)|sexting|sex\s?(?:chat|cam|dating|video|tape)|escorts?|horny|onlyfans|only\s?fans|cam\s?girls?|camgirls?|milfs?|pussy|blowjobs?|hentai|nsfw)\b/gi
// "Local singles / amateurs / girls near you" lures.
const LURE = /\b(local|nearby|lonely|hot|sexy|single)\s+(?:[a-z]+\s+){0,3}?(amateurs?|singles|girls|women|wives|milfs?|ladies|babes?)\b|\b(?:meet|date|chat with)\s+(?:hot|sexy|local|lonely)\b|\b(amateurs?)\b.{0,40}\b(porn|nudes?|videos?)\b/i
// Scam and junk pitches.
const SCAM = /\b(crypto(?:currency)?\s+(?:investment|trading|profit)|bitcoin\s+(?:investment|profit|doubl\w*)|forex\s+(?:signals?|trading)|guaranteed\s+(?:profit|returns?|income)|earn\s+\$?\d+[k]?\s+(?:a|per)\s+(?:day|week)|work\s+from\s+home\s+(?:and\s+)?earn|loan\s+(?:approved|offer)|casino|sports?\s+betting|viagra|cialis|seo\s+(?:services?|expert|agency)|rank\s+(?:your|on)\s+(?:website|google|first\s+page)|guest\s+posts?|backlinks?|you\s+(?:have\s+)?won|claim\s+your\s+prize|gift\s+card\s+(?:winner|reward))\b/i
const SHORTENER = /\b(bit\.ly|tinyurl\.com|t\.me|telegram\.me|wa\.me|cutt\.ly|is\.gd|rb\.gy|shorturl\.at|t\.co|goo\.gl|ow\.ly|tiny\.cc)\//i
const URL = /\bhttps?:\/\/\S+|\bwww\.\S+/gi
// Mild profanity: rude, not spam. Only counts alongside other signals.
const PROFANITY = /\b(fuck\w*|shit\w*|bitch\w*|cunt\w*|bastard\w*|wank\w*)\b/i
// Letters spaced out or padded to dodge filters ("p o r n", "p.o.r.n").
const OBSCURED = /\b(?:p[\s.*_-]+o[\s.*_-]+r[\s.*_-]+n|s[\s.*_-]+e[\s.*_-]+x[\s.*_-]+y|n[\s.*_-]+u[\s.*_-]+d[\s.*_-]+e)\b/i

export type SenderSignals = {
  blocked?: boolean
  trusted?: boolean          // the team said "Not spam" for this customer before
  knownCustomer?: boolean    // has ordered, or the team has replied to them before
  firstContact?: boolean     // a new conversation from someone never spoken to
}

export function assessMessage(text: string, s: SenderSignals = {}): Assessment {
  if (s.blocked) return { verdict: 'blocked', score: 99, reasons: ['Sender is blocked'] }
  if (s.trusted) return { verdict: 'clean', score: 0, reasons: [] }
  const t = String(text || '').replace(/[​-‏⁠﻿]/g, '')
  const reasons: string[] = []
  let score = 0
  const adult = new Set((t.match(ADULT) || []).map(w => w.toLowerCase().replace(/\s+/g, ' ')))
  if (adult.size) { score += Math.min(2, adult.size) * 3; reasons.push('Adult content') }
  if (LURE.test(t)) { score += 2; reasons.push('Dating / adult lure') }
  if (OBSCURED.test(t)) { score += 2; reasons.push('Obscured wording') }
  if (SCAM.test(t)) { score += 3; reasons.push('Scam or junk pitch') }
  if (SHORTENER.test(t)) { score += 2; reasons.push('Shortened or Telegram link') }
  const links = (t.match(URL) || []).length
  if (links >= 2) { score += 1; reasons.push('Several links') }
  if (PROFANITY.test(t)) { score += 1; reasons.push('Offensive language') }
  // Content alone isn't enough to hide a message from someone the business knows.
  if (score > 0 && s.firstContact && !s.knownCustomer) { score += 1; reasons.push('First message from an unknown sender') }
  if (score > 0 && links >= 1 && s.firstContact && !s.knownCustomer) score += 1
  if (s.knownCustomer) score -= 3
  const verdict: Verdict = score >= 5 ? 'spam' : score >= 3 ? 'suspect' : 'clean'
  return { verdict, score, reasons: verdict === 'clean' ? [] : reasons }
}

// ── Settings ─────────────────────────────────────────────────────────────────

export async function protectionEnabled(db: any, companyId: string): Promise<boolean> {
  try {
    const { data } = await db.from('companies').select('inbox_settings').eq('id', companyId).maybeSingle()
    return data?.inbox_settings?.protection?.enabled !== false
  } catch { return true }
}

// ── Inbound ──────────────────────────────────────────────────────────────────

async function senderSignals(db: any, companyId: string, conversationId: string, contactId: string | null): Promise<SenderSignals> {
  const s: SenderSignals = {}
  let convIds: string[] = [conversationId]
  if (contactId) {
    try {
      const { data: c } = await db.from('contacts').select('*').eq('id', contactId).eq('company_id', companyId).maybeSingle()
      if (c?.is_blocked) return { blocked: true }
      if (c?.trusted_at) return { trusted: true }
    } catch {}
    try {
      const { data: convs } = await db.from('conversations').select('id').eq('company_id', companyId).eq('contact_id', contactId).limit(25)
      convIds = [...new Set([conversationId, ...(convs || []).map((r: any) => r.id)])]
    } catch {}
    try {
      const { data: o } = await db.from('orders').select('id').eq('company_id', companyId).eq('contact_id', contactId).limit(1)
      if (o?.length) s.knownCustomer = true
    } catch {}
  }
  if (!s.knownCustomer) {
    try {
      // A real reply from the team (not an automatic one) in any of their threads.
      const { data: replies } = await db.from('messages').select('metadata').in('conversation_id', convIds).eq('sender_type', 'agent').limit(20)
      if ((replies || []).some((m: any) => !m?.metadata?.auto)) s.knownCustomer = true
    } catch {}
  }
  if (!s.knownCustomer) {
    try {
      const { count } = await db.from('messages').select('id', { count: 'exact', head: true }).in('conversation_id', convIds).eq('sender_type', 'visitor')
      s.firstContact = (count || 0) <= 1
    } catch { s.firstContact = true }
  }
  return s
}

/**
 * Check a customer message that just arrived (after it's saved, before any
 * notification or automatic reply). Never throws; on any problem the message
 * is treated as clean.
 */
export async function protectInbound(db: any, p: { companyId: string; conversationId: string; messageId?: string | null; contactId?: string | null; text: string | null | undefined }): Promise<Assessment & { quiet: boolean }> {
  const clean = { verdict: 'clean' as Verdict, score: 0, reasons: [] as string[], quiet: false }
  try {
    if (!p.companyId || !p.conversationId) return clean
    if (!(await protectionEnabled(db, p.companyId))) return clean
    let contactId = p.contactId || null
    if (!contactId) {
      const { data: conv } = await db.from('conversations').select('contact_id').eq('id', p.conversationId).maybeSingle()
      contactId = conv?.contact_id || null
    }
    const a = assessMessage(String(p.text || ''), await senderSignals(db, p.companyId, p.conversationId, contactId))
    if (a.verdict === 'clean') return clean
    const at = new Date().toISOString()
    if (p.messageId) {
      const { data: m } = await db.from('messages').select('metadata').eq('id', p.messageId).maybeSingle()
      await db.from('messages').update({ metadata: { ...(m?.metadata || {}), protection: { verdict: a.verdict, score: a.score, reasons: a.reasons, at } } }).eq('id', p.messageId)
    }
    const convPatch: any = { last_message: HIDDEN_PREVIEW }
    if (a.verdict !== 'suspect') convPatch.is_spam = true
    await db.from('conversations').update(convPatch).eq('id', p.conversationId)
    try {
      await db.from('conversation_events').insert({
        conversation_id: p.conversationId, company_id: p.companyId, event_type: 'protection', actor_name: 'Colvy',
        detail: a.verdict === 'suspect' ? `Colvy hid a message that may be spam (${a.reasons.join(', ').toLowerCase()}). Automatic replies are paused until someone reviews it.`
          : a.verdict === 'blocked' ? 'A message from a blocked sender was moved to Spam.'
          : `Colvy moved this conversation to Spam (${a.reasons.join(', ').toLowerCase()}). No automatic replies were sent.`,
      })
    } catch {}
    return { ...a, quiet: true }
  } catch (e: any) {
    console.warn('[protection]', e?.message || e)
    return clean
  }
}

/**
 * Should automatic replies and notifications stay quiet for this
 * conversation? True when it's in Spam, its sender is blocked, or its latest
 * customer message was flagged and nobody has cleared it. Never throws.
 */
export async function quietVerdict(db: any, conversationId: string | null | undefined): Promise<Verdict | null> {
  if (!conversationId) return null
  try {
    const { data: conv } = await db.from('conversations').select('is_spam, contact_id').eq('id', conversationId).maybeSingle()
    if (!conv) return null
    if (conv.is_spam) return 'spam'
    const [{ data: last }, contact] = await Promise.all([
      db.from('messages').select('metadata').eq('conversation_id', conversationId).eq('sender_type', 'visitor').order('created_at', { ascending: false }).limit(1),
      conv.contact_id ? db.from('contacts').select('is_blocked').eq('id', conv.contact_id).maybeSingle().then((r: any) => r.data, () => null) : Promise.resolve(null),
    ])
    if (contact?.is_blocked) return 'blocked'
    const pr = last?.[0]?.metadata?.protection
    if (pr && pr.verdict && pr.verdict !== 'clean' && !pr.cleared) return pr.verdict
    return null
  } catch { return null }
}

/** Inbound notification types (bell rows) that carry a customer's words. */
export const INBOUND_NOTIFY_TYPES = new Set(['chat', 'sms', 'whatsapp', 'facebook', 'instagram', 'email', 'message', 'social', 'meta'])
