import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { captureContactFromSms } from '@/lib/contact-capture'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Colvy AI contact capture — fired (best-effort, fire-and-forget) from the
// inbound-SMS paths. Runs the LLM extraction off the webhook's critical path so
// message ingestion is never delayed or blocked by it.
export async function POST(req: NextRequest) {
  try {
    const { companyId, conversationId, from, text } = await req.json()
    if (!companyId || !conversationId || !from) {
      return NextResponse.json({ ok: false, error: 'Missing companyId, conversationId or from' }, { status: 400 })
    }
    const result = await captureContactFromSms({ db: admin(), companyId, conversationId, from, text: text || '' })
    return NextResponse.json({ ok: true, ...result })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e?.message || 'capture failed' }, { status: 500 })
  }
}
