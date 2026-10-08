import type { NextRequest } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { signValue, readValue } from '@/lib/oauth-state'

/**
 * Who may read, post to or upload into a chat-widget conversation.
 *
 * The widget routes used to accept any conversation id with its company id, so
 * anyone holding an id (from a link, a log, a screenshot) could read the whole
 * thread — SMS and email threads included — and post into it. Now:
 *   • /api/widget/start hands the visitor a signed chat key for the thread it
 *     opened; the widget keeps it with the saved session and sends it as
 *     `x-colvy-chat` on every call.
 *   • Sessions saved before the key existed still carry this browser's visitor
 *     id (`x-colvy-visitor`), which must match the thread's visitor_id.
 * Only widget/chat threads qualify either way. Server-only.
 */

const KIND = 'widget-chat'
const YEAR = 365 * 24 * 3600 * 1000

export function chatKeyFor(conversationId: string): string {
  return signValue({ kind: KIND, c: conversationId }, YEAR)
}

export function chatKeyMatches(key: string | null | undefined, conversationId: string): boolean {
  const v = readValue(key, KIND)
  return !!v && v.c === conversationId
}

// '' covers early widget threads saved without a channel.
const WIDGET_CHANNELS = new Set(['widget', 'chat', 'live_chat', 'livechat', ''])

export type WidgetConv = { id: string; company_id: string; status?: string; channel?: string; visitor_id?: string | null }

/**
 * The conversation, if this caller is its visitor; otherwise null. `extra`
 * adds columns the route needs.
 */
export async function visitorConversation(
  req: NextRequest, db: SupabaseClient, companyId: string, conversationId: string, extra = '',
): Promise<WidgetConv | null> {
  const cols = ['id', 'company_id', 'channel', 'visitor_id', ...extra.split(',').map(s => s.trim()).filter(Boolean)]
  const { data: conv } = await db.from('conversations')
    .select(Array.from(new Set(cols)).join(', ')).eq('id', conversationId).maybeSingle()
  const c = conv as any
  if (!c || c.company_id !== companyId) return null
  if (!WIDGET_CHANNELS.has(String(c.channel || '').toLowerCase())) return null
  if (chatKeyMatches(req.headers.get('x-colvy-chat'), conversationId)) return c
  const visitor = (req.headers.get('x-colvy-visitor') || '').trim()
  if (visitor && c.visitor_id && visitor === c.visitor_id) return c
  return null
}
