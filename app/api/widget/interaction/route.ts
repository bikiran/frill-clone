import { NextRequest, NextResponse } from 'next/server'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { visitorConversation, type WidgetConv } from '@/lib/widget-access'
import { checkBurst, callerKey } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

/**
 * /api/widget/interaction — a visitor answering a poll, survey or form card
 * that the business sent into their live chat.
 *
 *   GET  ?companyId=&conversationId=&messageId=  → { answered: boolean }
 *   POST { companyId, conversationId, messageId, response, respondent }
 *
 * The widget used to read and write chat_interactions straight from the
 * browser with the public key, so the table had to be open to everyone: anyone
 * could read every business's in-chat answers (names, emails, phone numbers)
 * and write or rewrite rows for any chat. V381 closes the table to the public
 * key; this route is now the only way a visitor touches it. It checks:
 *   • the caller is the visitor of this chat (signed chat key, or the older
 *     visitor id — lib/widget-access.ts), and the chat belongs to companyId;
 *   • the card being answered is a poll / survey / form message that this
 *     business (not a visitor, not another workspace) put into this chat;
 *   • one answer per card per chat.
 * kind, ref_id and company_id are taken from the message and conversation,
 * never from the body. GET only says whether the card was answered; it never
 * returns the answer itself.
 */

const KINDS = new Set(['poll', 'survey', 'form'])
/** Generous for a long form; stops a script parking megabytes in a row. */
const MAX_RESPONSE_BYTES = 32_000

const isUuid = (v: unknown): v is string =>
  typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)

/**
 * Service-role client. No anon-key fallback: after V381 the anon key can
 * neither read nor write chat_interactions, so a fallback would only fail
 * quietly. Throws if the key isn't configured (the route then answers 500).
 */
function serviceDb(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('chat interactions need SUPABASE_SERVICE_ROLE_KEY on the server')
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
}

const noStore = { 'Cache-Control': 'no-store' }

/** The card, if it's an interactive message this chat's own business sent. */
async function cardIn(db: SupabaseClient, conv: WidgetConv, messageId: string) {
  const { data } = await db.from('messages')
    .select('id, conversation_id, company_id, sender_type, message_type, message_payload')
    .eq('id', messageId).maybeSingle()
  const m = data as any
  if (!m || m.conversation_id !== conv.id || m.company_id !== conv.company_id) return null
  if (m.sender_type === 'visitor') return null
  const payload = m.message_payload && typeof m.message_payload === 'object' ? m.message_payload : null
  const kind = String(m.message_type || '')
  if (!payload || !KINDS.has(kind)) return null
  if (payload.kind && payload.kind !== kind) return null
  return { id: m.id as string, kind, refId: isUuid(payload.ref_id) ? payload.ref_id : null }
}

async function alreadyAnswered(db: SupabaseClient, conversationId: string, messageId: string): Promise<boolean> {
  const { data, error } = await db.from('chat_interactions').select('id')
    .eq('conversation_id', conversationId).eq('message_id', messageId).limit(1)
  if (error) throw new Error(error.message)
  return !!data?.length
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const companyId = sp.get('companyId')
  const conversationId = sp.get('conversationId')
  const messageId = sp.get('messageId')
  const out = (answered: boolean, status = 200) => NextResponse.json({ answered }, { status, headers: noStore })
  if (!isUuid(companyId) || !isUuid(conversationId) || !isUuid(messageId)) return out(false, 400)
  if (!checkBurst(`widget-interaction-get:${callerKey(req, conversationId)}`, 120)) return out(false, 429)
  try {
    const db = serviceDb()
    const conv = await visitorConversation(req, db, companyId, conversationId)
    if (!conv) return out(false, 404)
    return out(await alreadyAnswered(db, conv.id, messageId))
  } catch (e) {
    console.error('[widget interaction] read failed', e)
    return out(false, 500)
  }
}

export async function POST(req: NextRequest) {
  const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: noStore })
  let body: any
  try { body = await req.json() } catch { return fail('Bad request', 400) }
  if (!body || typeof body !== 'object') return fail('Bad request', 400)
  const { companyId, conversationId, messageId } = body
  if (!isUuid(companyId) || !isUuid(conversationId) || !isUuid(messageId)) {
    return fail('companyId, conversationId and messageId are required', 400)
  }

  // A string (a quick reply) or a plain object ({ option_index, label } for a
  // poll, { answers } for a form / survey) — nothing else, and not huge.
  const response = body.response
  const shapeOk = typeof response === 'string'
    ? response.trim().length > 0
    : !!response && typeof response === 'object' && !Array.isArray(response)
  if (!shapeOk) return fail('Response is empty', 400)
  let size = 0
  try { size = new TextEncoder().encode(JSON.stringify(response)).length } catch { return fail('Bad request', 400) }
  if (size > MAX_RESPONSE_BYTES) return fail('Response is too long', 413)
  const respondent = typeof body.respondent === 'string' ? body.respondent.trim().slice(0, 120) || null : null

  if (!checkBurst(`widget-interaction:${callerKey(req, conversationId)}`, 10)) {
    return NextResponse.json(
      { error: 'Please wait a moment and try again.' },
      { status: 429, headers: { ...noStore, 'Retry-After': '30' } },
    )
  }

  try {
    const db = serviceDb()
    const conv = await visitorConversation(req, db, companyId, conversationId)
    if (!conv) return fail('Conversation not found', 404)
    const card = await cardIn(db, conv, messageId)
    if (!card) return fail('Not found', 404)

    // One answer per card per chat. A second tap (or a reload mid-submit)
    // gets "already" and the widget shows the submitted state without
    // posting the "Responded" message again.
    if (await alreadyAnswered(db, conv.id, card.id)) {
      return NextResponse.json({ ok: true, already: true }, { headers: noStore })
    }

    const { error } = await db.from('chat_interactions').insert({
      company_id: conv.company_id,
      conversation_id: conv.id,
      message_id: card.id,
      kind: card.kind,
      ref_id: card.refId,
      respondent,
      response,
    })
    // 23505: the other of two simultaneous taps got there first (V381's
    // unique index on conversation_id + message_id).
    if (error && (error as any).code === '23505') {
      return NextResponse.json({ ok: true, already: true }, { headers: noStore })
    }
    if (error) {
      console.error('[widget interaction] insert failed', error)
      return fail('Could not save your response', 500)
    }
    return NextResponse.json({ ok: true, already: false }, { headers: noStore })
  } catch (e) {
    console.error('[widget interaction] failed', e)
    return fail('Could not save your response', 500)
  }
}
