import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { detectAndTranslate } from '@/lib/translate'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Detect a message's language and, if it isn't English, store an English
// translation on the row so the inbox can show "Translated · English / View
// original". Called fire-and-forget after an inbound message is ingested (SMS
// today; other channels can call the same endpoint). Idempotent: skips a
// message that already has content_lang set.
export async function POST(req: NextRequest) {
  try {
    const { messageId } = await req.json()
    if (!messageId) return NextResponse.json({ error: 'messageId required' }, { status: 400 })

    const db = admin()
    const { data: msg } = await db.from('messages')
      .select('id, content, content_lang').eq('id', messageId).maybeSingle()
    if (!msg) return NextResponse.json({ ok: false, reason: 'not found' })
    // Already processed, or nothing to translate.
    if (msg.content_lang || !String(msg.content || '').trim()) return NextResponse.json({ ok: true, skipped: true })

    const { lang, translated } = await detectAndTranslate(msg.content)
    // Record the detected language either way (even 'en'), so we never re-check.
    await db.from('messages').update({
      content_lang: lang || 'unknown',
      ...(translated ? { translated_content: translated } : {}),
    }).eq('id', messageId)

    return NextResponse.json({ ok: true, lang, translated: !!translated })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 200 })
  }
}
