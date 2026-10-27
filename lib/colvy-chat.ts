// The Colvy chat: everyone's private line to the Colvy team, pinned at the top
// of their inbox (components/inbox/ColvyChat). Like the official accounts in
// WhatsApp and Telegram: a welcome, the updates the Colvy team posts, and a
// reply box. Only that person sees it; colleagues each have their own.
//
// What they write lands in Colvy's OWN support workspace (slug "colvy", or
// COLVY_SUPPORT_SLUG) as a normal conversation on the 'colvy' channel, where
// the team answers it from the inbox like any chat; the inbox keeps those
// answers in the app (never email or SMS) and they come back into the chat.
// The welcome and the updates aren't copied into anyone's chat: they're put
// together when it's opened (lib/colvy-chat-core), and the support
// conversation is only created the first time the person writes.
//
// Tables (migration COLVY_V420): colvy_chats, colvy_updates. Server only.

import { buildThread, MAX_TEXT, type ColvyChatRow } from '@/lib/colvy-chat-core'
import { notifyCompany, pushInboundMessage } from '@/lib/notify'

export const supportSlug = () => process.env.COLVY_SUPPORT_SLUG || process.env.NEXT_PUBLIC_COLVY_SUPPORT_SLUG || 'colvy'

/** A table that hasn't been created yet (migration not run). */
export const isMissing = (e: any) => /does not exist|schema cache|Could not find/i.test(String(e?.message || e || ''))

export type ColvyUser = { id: string; email: string; name: string }
type Workspace = { id: string; name: string; logo_url: string | null }

let wsCache: { at: number; value: Workspace | null } | null = null
/** Forget the cached workspace (tests). */
export const resetColvyWorkspaceCache = () => { wsCache = null }
/** Colvy's own workspace, where people's messages to Colvy land. */
export async function colvyWorkspace(db: any): Promise<Workspace | null> {
  if (wsCache && Date.now() - wsCache.at < 5 * 60_000) return wsCache.value
  const { data } = await db.from('companies').select('id, name, logo_url').eq('slug', supportSlug()).maybeSingle()
  wsCache = { at: Date.now(), value: data ? { id: data.id, name: data.name || 'Colvy', logo_url: data.logo_url || null } : null }
  return wsCache.value
}

/** The signed-in person (Bearer access token), or null. */
export async function colvyUser(req: Request, db: any): Promise<ColvyUser | null> {
  try {
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return null
    const { data } = await db.auth.getUser(token)
    const u = data?.user
    if (!u?.id || !u.email) return null
    const meta = u.user_metadata || {}
    const name = String(meta.full_name || meta.name || '').trim() || u.email.split('@')[0]
    return { id: u.id, email: u.email.toLowerCase(), name: name.slice(0, 120) }
  } catch { return null }
}

export type ChatRow = ColvyChatRow & { user_id: string; email?: string | null; conversation_id?: string | null; contact_id?: string | null }

/** This person's chat, started now if they haven't one. null: the tables aren't there yet. */
export async function ensureChat(db: any, user: ColvyUser): Promise<ChatRow | null> {
  const read = async () => db.from('colvy_chats').select('*').eq('user_id', user.id).maybeSingle()
  const first = await read()
  if (first.error) { if (isMissing(first.error)) return null; throw first.error }
  if (first.data) return first.data
  // Two tabs opening at once: the primary key keeps it to one row.
  const ins = await db.from('colvy_chats').upsert({ user_id: user.id, email: user.email }, { onConflict: 'user_id', ignoreDuplicates: true })
  if (ins.error && isMissing(ins.error)) return null
  const again = await read()
  return again.data || null
}

/** Their thread: the welcome, recent updates, and their conversation with Colvy (never internal notes). */
export async function loadThread(db: any, chat: ChatRow) {
  const [ups, msgs] = await Promise.all([
    db.from('colvy_updates').select('id, title, body, link_url, link_label, published_at')
      .not('published_at', 'is', null).order('published_at', { ascending: false }).limit(60),
    chat.conversation_id
      ? db.from('messages').select('id, sender_type, sender_name, content, created_at, is_internal')
        .eq('conversation_id', chat.conversation_id).order('created_at', { ascending: false }).limit(300)
      : Promise.resolve({ data: [] }),
  ])
  return buildThread({ chat, updates: ups.data || [], messages: msgs.data || [] })
}

export async function markRead(db: any, userId: string) {
  await db.from('colvy_chats').update({ last_read_at: new Date().toISOString() }).eq('user_id', userId)
}

/**
 * What a person writes: into their conversation in Colvy's workspace (made
 * the first time), and the Colvy team is alerted like any new chat message.
 * `from` is the workspace they wrote from, shown to the team beside it.
 */
export async function sendToColvy(
  db: any,
  o: { user: ColvyUser; chat: ChatRow; text: string; from?: { id: string; name: string } | null },
  // How the Colvy team is alerted (tests pass their own).
  alert: { notifyCompany: typeof notifyCompany; pushInboundMessage: typeof pushInboundMessage } = { notifyCompany, pushInboundMessage },
): Promise<{ ok: true; id: string; at: string } | { ok: false; error: string; status: number }> {
  const text = o.text.trim()
  if (!text) return { ok: false, error: 'Write a message first.', status: 400 }
  if (text.length > MAX_TEXT) return { ok: false, error: 'That message is too long.', status: 413 }
  const ws = await colvyWorkspace(db)
  if (!ws) return { ok: false, error: 'Messaging Colvy isn’t available right now. Email support@colvy.com instead.', status: 503 }

  let conversationId = o.chat.conversation_id || null
  let contactId = o.chat.contact_id || null
  // A conversation that was deleted from Colvy's inbox starts afresh.
  if (conversationId) {
    const { data: c } = await db.from('conversations').select('id').eq('id', conversationId).eq('company_id', ws.id).maybeSingle()
    if (!c) {
      // Let go of it, so the new one below can be claimed.
      await db.from('colvy_chats').update({ conversation_id: null }).eq('user_id', o.user.id).eq('conversation_id', conversationId)
      conversationId = null
    }
  }
  if (!conversationId) {
    if (!contactId) {
      const { data: found } = await db.from('contacts').select('id').eq('company_id', ws.id).ilike('email', o.user.email).limit(1)
      contactId = found?.[0]?.id || null
      if (!contactId) {
        const { data: made } = await db.from('contacts').insert({ company_id: ws.id, name: o.user.name, email: o.user.email, source: 'colvy_app' }).select('id').maybeSingle()
        contactId = made?.id || null
      }
    }
    const { data: conv, error } = await db.from('conversations').insert({
      company_id: ws.id, contact_id: contactId, channel: 'colvy', status: 'open', subject: o.user.name,
    }).select('id').maybeSingle()
    if (error || !conv) return { ok: false, error: 'Your message couldn’t be sent. Try again.', status: 500 }
    // Two sends at once: keep whichever conversation was saved first.
    const { data: claimed } = await db.from('colvy_chats').update({ conversation_id: conv.id, contact_id: contactId })
      .eq('user_id', o.user.id).is('conversation_id', null).select('conversation_id').maybeSingle()
    if (claimed?.conversation_id === conv.id) conversationId = conv.id
    else {
      await db.from('conversations').delete().eq('id', conv.id)
      const { data: now } = await db.from('colvy_chats').select('conversation_id').eq('user_id', o.user.id).maybeSingle()
      conversationId = now?.conversation_id || null
      if (!conversationId) return { ok: false, error: 'Your message couldn’t be sent. Try again.', status: 500 }
    }
  }

  const at = new Date().toISOString()
  const { data: msg, error: mErr } = await db.from('messages').insert({
    conversation_id: conversationId, company_id: ws.id,
    sender_type: 'visitor', sender_name: o.user.name, sender_email: o.user.email,
    content: text, attachments: [], delivery_channel: 'colvy',
    metadata: { colvy_app: { user_id: o.user.id, ...(o.from ? { workspace_id: o.from.id, workspace_name: o.from.name } : {}) } },
  }).select('id, created_at').maybeSingle()
  if (mErr || !msg) return { ok: false, error: 'Your message couldn’t be sent. Try again.', status: 500 }

  await db.from('conversations').update({
    last_message: text.slice(0, 200), last_message_at: at, updated_at: at,
    is_unread: true, unread_count: 1, status: 'open',
  }).eq('id', conversationId)
  await markRead(db, o.user.id)

  // The Colvy team hears about it like any new chat message.
  const where = o.from?.name ? ` (${o.from.name})` : ''
  try { await alert.notifyCompany({ db, companyId: ws.id, type: 'chat', message: `New message from ${o.user.name}${where}: ${text.slice(0, 80)}`, actorName: o.user.name, conversationId }) } catch {}
  try { await alert.pushInboundMessage({ companyId: ws.id, conversationId, title: `New message from ${o.user.name}${where}`, body: text }) } catch {}
  return { ok: true, id: msg.id, at: msg.created_at || at }
}
