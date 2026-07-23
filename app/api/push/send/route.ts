import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}

// Sends an Expo push notification to all registered devices belonging to a
// company. This is called when a new inbound customer message arrives so
// agents receive an alert on their phones.
export async function POST(req: NextRequest) {
  try {
    const {
      companyId,
      title,
      body,
      conversationId,
      excludeUserId,
    } = await req.json()

    if (!companyId || !body) {
      return NextResponse.json(
        { error: 'Missing companyId or body' },
        { status: 400 }
      )
    }

    const db = admin()

    const { data: tokens, error: tokenError } = await db
      .from('push_tokens')
      .select('expo_token, user_id')
      .eq('company_id', companyId)

    if (tokenError) {
      throw new Error(tokenError.message)
    }

    if (!tokens || tokens.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
      })
    }

    // De-duplicate tokens and optionally exclude the user who sent the message.
    const seen = new Set<string>()

    const messages = tokens
      .filter(
        (token) =>
          token.expo_token &&
          (!excludeUserId || token.user_id !== excludeUserId)
      )
      .filter((token) => {
        if (seen.has(token.expo_token)) {
          return false
        }

        seen.add(token.expo_token)
        return true
      })
      .map((token) => ({
        to: token.expo_token,
        sound: 'default',
        title: title || 'New message',

        // Allows Android's expanded notification view to display more text.
        body: body.slice(0, 500),

        data: {
          conversationId: conversationId || null,
        },

        channelId: 'messages',

        // Must match the notification category registered in the mobile app.
        // This enables the Reply and Mark read notification actions.
        categoryId: 'message',
      }))

    if (messages.length === 0) {
      return NextResponse.json({
        ok: true,
        sent: 0,
      })
    }

    // Expo accepts up to 100 notifications per push request.
    const response = await fetch(
      'https://exp.host/--/api/v2/push/send',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify(messages),
      }
    )

    const result = await response.json().catch(() => ({}))

    if (!response.ok) {
      console.error('Expo push request failed:', result)

      return NextResponse.json(
        {
          error: 'Expo push request failed',
          details: result,
        },
        { status: response.status }
      )
    }

    // Remove tokens Expo reports as no longer registered.
    try {
      const results = result?.data

      if (Array.isArray(results)) {
        const deadTokens: string[] = []

        results.forEach((pushResult: any, index: number) => {
          if (
            pushResult?.status === 'error' &&
            pushResult?.details?.error === 'DeviceNotRegistered'
          ) {
            const message = messages[index]

            if (message?.to) {
              deadTokens.push(message.to)
            }
          }
        })

        if (deadTokens.length > 0) {
          await db
            .from('push_tokens')
            .delete()
            .in('expo_token', deadTokens)
        }
      }
    } catch (cleanupError) {
      console.error(
        'Failed to remove invalid push tokens:',
        cleanupError
      )
    }

    return NextResponse.json({
      ok: true,
      sent: messages.length,
      expo: result,
    })
  } catch (error: unknown) {
    const message =
      error instanceof Error ? error.message : 'Unknown server error'

    console.error('Push notification error:', error)

    return NextResponse.json(
      { error: message },
      { status: 500 }
    )
  }
}