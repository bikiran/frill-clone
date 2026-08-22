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
      // The customer's number for a conversation notification. Carried in `data`
      // so the device's inline Reply action can send back without a lookup.
      from,
      // Optional Android notification channel (sound/importance). Defaults to
      // 'messages'; a caller can pass e.g. 'calls' for a distinct channel.
      channelId,
    } = await req.json()
    if (!companyId || !body) return NextResponse.json({ error: 'Missing companyId or body' }, { status: 400 })

    const db = admin()
    let q = db.from('push_tokens').select('expo_token, user_id, platform').eq('company_id', companyId)
    if (Array.isArray(userIds) && userIds.length > 0) q = q.in('user_id', userIds)
    const { data: tokens } = await q
    if (!tokens || tokens.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    const category = categoryId || (conversationId ? 'message' : undefined)
    const text = body.slice(0, 500)

    // De-dupe and optionally skip the person who sent the message
    const seen = new Set<string>()
    const messages = tokens
      .filter(t => t.expo_token && (!excludeUserId || t.user_id !== excludeUserId))
      .filter(t => { if (seen.has(t.expo_token)) return false; seen.add(t.expo_token); return true })
      .map(t => {
        // companyId + from let the device's Reply action call /api/telnyx/sms/send
        // straight from the notification, and Mark-read call /api/inbox/mark-read.
        const data = { conversationId: conversationId || null, route: route || null, companyId, from: from || null }
        const heading = title || 'New message'

        // ANDROID message pushes: send data-only so the app presents the
        // notification itself, which is the ONLY way the inline Reply / Mark-read
        // actions attach on Android — an OS-drawn notification can't carry them.
        // The app's @react-native-firebase background handler (added for VoIP)
        // presents it locally when it sees colvyLocal:'1', and that headless
        // handler runs even when the app is killed — so delivery stays reliable,
        // which is why we can send data-only again. (Non-message Android pushes,
        // and all iOS pushes, keep the notification form below.)
        if (t.platform === 'android' && category === 'message') {
          return {
            to: t.expo_token,
            // DATA-ONLY: keep this to `to`/`priority`/`data` only. Expo treats a
            // push carrying ANY top-level notification field — title/body/sound
            // AND channelId — as a notification and attaches an FCM `notification`
            // block, which Android then renders as a second, EMPTY heads-up
            // alongside the one the app presents locally. So channelId lives in
            // `data`; presentMessageNotification applies the channel when it
            // presents the notification itself.
            priority: 'high',
            data: {
              ...data,
              colvyLocal: '1',
              type: 'message',
              title: heading,
              body: text,
              senderName: heading,
              channelId: channelId || 'messages',
            },
          }
        }

        // iOS (and non-message pushes): a real NOTIFICATION push (title/body at
        // the top level) so the OS shows it whether the app is foregrounded,
        // backgrounded, or KILLED. iOS attaches the category's Reply / Mark-read
        // actions to remote notifications natively, so no local presentation is
        // needed there.
        return {
          to: t.expo_token,
          sound: 'default',
          title: heading,
          // Android expands long text when the shade is pulled down, so there's
          // no reason to truncate this hard.
          body: text,
          data,
          // High priority so it's delivered promptly even in Doze.
          priority: 'high',
          channelId: channelId || 'messages',
          // Enables the inline Reply / Mark read actions on the device.
          categoryId: category,
        }
      })

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
