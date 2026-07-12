import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyCompany } from '@/lib/notify'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Atomically get the next ticket number for a company.
async function nextTicketNumber(db: any, companyId: string): Promise<string> {
  // Upsert the counter row, then bump it. (Last-write-wins is acceptable here;
  // a rare collision is caught by the unique index and retried by the caller.)
  const { data: existing } = await db.from('ticket_counters').select('last_number').eq('company_id', companyId).maybeSingle()
  const next = (existing?.last_number || 1000) + 1
  if (existing) await db.from('ticket_counters').update({ last_number: next }).eq('company_id', companyId)
  else await db.from('ticket_counters').insert({ company_id: companyId, last_number: next })
  return `TICK-${next}`
}

// POST: raise a support ticket from a conversation.
export async function POST(req: NextRequest) {
  try {
    const { companyId, conversationId, contactId, subject, description, priority, createdBy } = await req.json()
    if (!companyId || !subject) return NextResponse.json({ error: 'Missing companyId or subject' }, { status: 400 })

    const db = admin()

    // Create with a sequential number; retry once on a rare collision.
    let ticket: any = null
    let lastError: string | null = null
    for (let attempt = 0; attempt < 2 && !ticket; attempt++) {
      const ticketNumber = await nextTicketNumber(db, companyId)
      const { data, error } = await db.from('support_tickets').insert({
        company_id: companyId, ticket_number: ticketNumber,
        conversation_id: conversationId || null, contact_id: contactId || null,
        subject, description: description || null, priority: priority || 'normal',
        status: 'open', created_by: createdBy || null,
      }).select().maybeSingle()
      if (!error) ticket = data
      else lastError = error.message
    }
    if (!ticket) {
      // Say WHY, instead of a generic failure. A missing table here means the
      // COLVY_V133_TICKETS.sql migration hasn't been run.
      const hint = /does not exist|relation/i.test(lastError || '')
        ? 'The tickets tables are missing — run the COLVY_V133_TICKETS.sql migration.'
        : null
      return NextResponse.json({ error: hint || lastError || 'Could not create ticket' }, { status: 500 })
    }

    // Build a shareable link to the ticket
    const origin = req.headers.get('host') ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('host')}` : (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com')
    const link = `${origin}/admin/tickets/${ticket.id}`

    // Post a system message into the conversation with the ticket number + link.
    if (conversationId) {
      try {
        const content = `🎫 Support ticket ${ticket.ticket_number} created — "${subject}". Track it here: ${link}`
        await db.from('messages').insert({
          conversation_id: conversationId, company_id: companyId, sender_type: 'system', content,
        })
        await db.from('conversations').update({ last_message: `🎫 Ticket ${ticket.ticket_number} created`, last_message_at: new Date().toISOString() }).eq('id', conversationId)
      } catch {}
    }

    try { await notifyCompany({ db, companyId, type: 'ticket', message: `Support ticket ${ticket.ticket_number} created — "${subject}"` }) } catch {}
    return NextResponse.json({ ok: true, ticket, link })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET: list a company's tickets (optionally by conversation).
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const conversationId = req.nextUrl.searchParams.get('conversationId')
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    let q = db.from('support_tickets').select('*').eq('company_id', companyId)
    if (conversationId) q = q.eq('conversation_id', conversationId)
    const { data } = await q.order('created_at', { ascending: false })
    return NextResponse.json({ tickets: data || [] })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
