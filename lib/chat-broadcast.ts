'use client'

import { supabase } from '@/lib/supabase'

/**
 * Live chat delivery to the public widget, over Broadcast rather than
 * postgres_changes.
 *
 * The widget used to watch the `messages` table directly for inserts. That
 * works, but realtime enforces row level security — so any policy that stops an
 * anonymous visitor reading other people's messages also stops their own chat
 * updating. Watching the table is what forced `messages` to stay readable by
 * anyone with the public key.
 *
 * Broadcast carries the payload over the socket instead of the visitor reading
 * rows, so the widget can be locked out of the table entirely and still receive
 * replies instantly.
 *
 * Delivery is best effort by design: if a broadcast is missed (a moment offline,
 * a reconnect), the widget refetches its history from the server and catches up.
 * Nothing depends on a broadcast arriving.
 */

export const widgetChannelName = (conversationId: string) => `chat:${conversationId}`

export interface BroadcastMessage {
  id?: string
  conversation_id: string
  sender_type: string
  sender_name?: string | null
  content?: string | null
  attachments?: any
  created_at?: string
  reply_to?: string | null
  [key: string]: any
}

/**
 * Announce a message to whoever is watching this conversation.
 * Safe to call from anywhere; failures are swallowed so a send is never lost
 * because the socket was unavailable.
 */
export async function broadcastMessage(conversationId: string, message: BroadcastMessage) {
  if (!conversationId) return
  try {
    const ch = supabase.channel(widgetChannelName(conversationId), {
      config: { broadcast: { self: false } },
    })
    await ch.subscribe()
    await ch.send({ type: 'broadcast', event: 'message', payload: message })
    // Nothing is listening on this end; release it rather than accumulating
    // one channel per message sent.
    setTimeout(() => { try { supabase.removeChannel(ch) } catch {} }, 1500)
  } catch {
    /* the message is already saved — delivery will catch up on refetch */
  }
}

/** Announce that a message changed (edited, deleted, read). */
export async function broadcastMessageUpdate(conversationId: string, message: BroadcastMessage) {
  if (!conversationId) return
  try {
    const ch = supabase.channel(widgetChannelName(conversationId), {
      config: { broadcast: { self: false } },
    })
    await ch.subscribe()
    await ch.send({ type: 'broadcast', event: 'message_update', payload: message })
    setTimeout(() => { try { supabase.removeChannel(ch) } catch {} }, 1500)
  } catch { /* best effort */ }
}
