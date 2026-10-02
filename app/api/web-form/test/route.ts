import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { address } — a self-test for a web-form inbound address. Confirms the
// address is wired to a company and drops a sample submission into the inbox so
// the business can see the end-to-end routing works (this exercises everything
// except the external MX delivery). Auth: the caller must own the company.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
    if (!token) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    const { data: auth } = await db.auth.getUser(token)
    const uid = auth?.user?.id
    if (!uid) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })

    const { address } = await req.json().catch(() => ({}))
    if (!address) return NextResponse.json({ error: 'Missing address' }, { status: 400 })

    const { data: chan } = await db.from('email_channels').select('*')
      .ilike('inbound_address', String(address)).eq('provider', 'webform').maybeSingle()
    if (!chan) return NextResponse.json({ error: 'Unknown web-form address' }, { status: 404 })

    // The caller must own (or belong to) this channel's company.
    const { data: company } = await db.from('companies').select('id, owner_id').eq('id', chan.company_id).maybeSingle()
    let allowed = company?.owner_id === uid
    if (!allowed) {
      const { data: tm } = await db.from('team_members').select('id').eq('company_id', chan.company_id).eq('user_id', uid).limit(1)
      allowed = !!(tm && tm.length)
    }
    if (!allowed) return NextResponse.json({ error: 'Not authorized for this address' }, { status: 403 })

    const content = `This is a test submission from Colvy to confirm your Web Form address is receiving.\n\nName: Colvy Test\nEmail: test@colvy.com\nMessage: If you can see this in your inbox, your web form is wired up correctly.`
    const subject = 'Web Form test submission'

    const { data: conv } = await db.from('conversations').insert({
      company_id: chan.company_id, channel: 'form', subject,
      email_channel_id: chan.id, assigned_location_id: chan.location_id || null,
      status: 'open', is_unread: true, unread_count: 1,
      last_message: content.slice(0, 200), last_message_at: new Date().toISOString(),
    }).select('id').maybeSingle()
    if (conv?.id) {
      await db.from('messages').insert({
        conversation_id: conv.id, company_id: chan.company_id,
        sender_type: 'visitor', sender_name: 'Colvy Test', sender_email: 'test@colvy.com', content,
      })
    }

    return NextResponse.json({ ok: true, conversationId: conv?.id || null })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
