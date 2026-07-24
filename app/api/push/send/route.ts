import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Sends an Expo push to all of a company's registered devices. Called when a
// new inbound customer message arrives (from the widget/SMS webhook), so agents
// get alerted on their phones. Expo's push service is free and needs no keys.
export async function POST(req: NextRequest) {
  try {
    const {
      companyId, title, body, conversationId, excludeUserId,
      // Target specific team members (mentions, task assignments). Omit to
      // notify the whole company as before.
      userIds,
      // Optional deep link for notifications that aren't about a conversation.
      route,
      categoryId,
    } = await req.json()
    if (!companyId || !body) return NextResponse.json({ error: 'Missing companyId or body' }, { status: 400 })

    const db = admin()
    let q = db.from('push_tokens').select('expo_token, user_id').eq('company_id', companyId)
    if (Array.isArray(userIds) && userIds.length > 0) q = q.in('user_id', userIds)
    const { data: tokens } = await q
    if (!tokens || tokens.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    // De-dupe and optionally skip the person who sent the message
    const seen = new Set<string>()
    const messages = tokens
      .filter(t => t.expo_token && (!excludeUserId || t.user_id !== excludeUserId))
      .filter(t => { if (seen.has(t.expo_token)) return false; seen.add(t.expo_token); return true })
      .map(t => ({
        to: t.expo_token,
        sound: 'default',
        title: title || 'New message',
        // Android expands long text when the shade is pulled down, so there's
        // no reason to truncate this hard.
        body: body.slice(0, 500),
        data: { conversationId: conversationId || null, route: route || null },
        channelId: 'messages',
        // Enables the inline Reply / Mark read actions on the device.
        categoryId: categoryId || (conversationId ? 'message' : undefined),
      }))

    if (messages.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    // Expo accepts up to 100 messages per request
    const res = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
      body: JSON.stringify(messages),
    })
    const result = await res.json().catch(() => ({}))

    // Prune tokens Expo reports as unregistered
    try {
      const data = result?.data
      if (Array.isArray(data)) {
        const dead: string[] = []
        data.forEach((r: any, i: number) => {
          if (r?.status === 'error' && r?.details?.error === 'DeviceNotRegistered') dead.push(messages[i].to)
        })
        if (dead.length) await db.from('push_tokens').delete().in('expo_token', dead)
      }
    } catch {}

    return NextResponse.json({ ok: true, sent: messages.length })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
