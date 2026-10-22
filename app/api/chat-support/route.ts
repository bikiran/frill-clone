import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { callerUser } from '@/lib/company-access'
import { checkBurst, callerKey } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key)
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getDb()
    const { message } = await req.json()
    if (!message || typeof message !== 'string') return NextResponse.json({ error: 'message required' }, { status: 400 })
    if (!checkBurst(`chat-support:${callerKey(req)}`, 20)) return NextResponse.json({ error: 'Too many messages' }, { status: 429 })
    // Filed under whoever the Bearer token says (or nobody), never a user id
    // from the body, and stamped by the server.
    const user = await callerUser(req, supabase as any)
    const userId = user?.id || null
    const timestamp = new Date().toISOString()

    // Store chat message (you can create a chat_messages table)
    try {
      await (supabase as any).from('chat_messages').insert({
        user_id: userId,
        message: message.slice(0, 4000),
        role: 'user',
        created_at: timestamp,
      })
    } catch (error) {
      // Table might not exist yet, silently fail
      console.error('Chat insert error:', error)
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
