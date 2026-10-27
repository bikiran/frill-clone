import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkBurst } from '@/lib/rate-limit'
import { requireCompanyAccess } from '@/lib/company-access'
import { colvyUser, colvyWorkspace, ensureChat, loadThread, markRead, sendToColvy } from '@/lib/colvy-chat'

export const dynamic = 'force-dynamic'

// The signed-in person's private Colvy chat (lib/colvy-chat). Only ever their
// own: the chat is found by the caller's account, never by an id they send.
//
// GET  ?companyId=<the workspace they're in>[&summary=1]
//      { available, unread, items? | last? }. Not available inside Colvy's own
//      workspace (that's where these chats are answered) or before the
//      migration (COLVY_V420) has run.
// POST { action: 'send', text, companyId }   write to the Colvy team
//      { action: 'read' }                     they've seen it all
const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } },
)
const noStore = { 'Cache-Control': 'no-store' }

export async function GET(req: NextRequest) {
  const db = admin()
  const user = await colvyUser(req, db)
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const companyId = req.nextUrl.searchParams.get('companyId')
  const ws = await colvyWorkspace(db)
  if (ws && companyId === ws.id) return NextResponse.json({ available: false }, { headers: noStore })
  const chat = await ensureChat(db, user)
  if (!chat) return NextResponse.json({ available: false }, { headers: noStore })
  const { items, unread } = await loadThread(db, chat)
  if (req.nextUrl.searchParams.get('summary')) {
    const last = items[items.length - 1]
    return NextResponse.json({ available: true, unread, last: last ? { kind: last.kind, text: last.title || last.text, at: last.at } : null }, { headers: noStore })
  }
  return NextResponse.json({ available: true, unread, items, canReply: !!ws }, { headers: noStore })
}

export async function POST(req: NextRequest) {
  const db = admin()
  const user = await colvyUser(req, db)
  if (!user) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const body = await req.json().catch(() => ({}))
  const chat = await ensureChat(db, user)
  if (!chat) return NextResponse.json({ error: 'The Colvy chat isn’t set up yet.' }, { status: 503 })

  if (body.action === 'read') {
    await markRead(db, user.id)
    return NextResponse.json({ ok: true })
  }
  if (body.action === 'send') {
    if (!checkBurst(`colvy-chat:${user.id}`, 10)) {
      return NextResponse.json({ error: 'You’re sending messages very quickly. Wait a moment.' }, { status: 429, headers: { 'Retry-After': '30' } })
    }
    // The workspace they wrote from, shown to the Colvy team, only if they're in it.
    let from: { id: string; name: string } | null = null
    const companyId = typeof body.companyId === 'string' ? body.companyId : null
    if (companyId && (await requireCompanyAccess(req, db, companyId)).ok) {
      const { data: co } = await db.from('companies').select('id, name').eq('id', companyId).maybeSingle()
      if (co) from = { id: co.id, name: co.name || 'their workspace' }
    }
    const out = await sendToColvy(db, { user, chat, text: String(body.text || ''), from })
    if ('error' in out) return NextResponse.json({ error: out.error }, { status: out.status })
    return NextResponse.json({ ok: true, id: out.id, at: out.at })
  }
  return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
}
