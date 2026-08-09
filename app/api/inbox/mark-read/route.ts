import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

// Clear a conversation's unread state. Small, service-role endpoint so a phone
// can mark a thread read straight from a push notification's "Mark read" action
// — no app session required in the notification handler.
const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export async function POST(req: NextRequest) {
  try {
    const { companyId, conversationId } = await req.json()
    if (!companyId || !conversationId) return NextResponse.json({ error: 'companyId and conversationId required' }, { status: 400 })
    const db = admin()
    const { error } = await db.from('conversations')
      .update({ is_unread: false, unread_count: 0 })
      .eq('id', conversationId).eq('company_id', companyId)
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
