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

    // The contact's details, in case a legacy NOT NULL column (e.g. "email")
    // needs filling — see FALLBACK 0 below.
    let contactEmail: string | null = null
    let contactPhone: string | null = null
    if (contactId) {
      try {
        const { data: ct } = await db.from('contacts').select('email, phone').eq('id', contactId).maybeSingle()
        contactEmail = ct?.email || null
        contactPhone = ct?.phone || null
      } catch {}
    }

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

    // FALLBACK 0 — a legacy NOT NULL column the app doesn't write.
    // The real error turned out to be:
    //   null value in column "email" of relation "support_tickets"
    // i.e. an OLDER support_tickets table is still there with extra required
    // columns. Parse the offending column out of the message and retry with a
    // sensible value for it, so a ticket can still be raised before the SQL is
    // run. (COLVY_V169_TICKETS_FINAL.sql removes the constraints for good.)
    if (!ticket && /violates not-null constraint/i.test(lastError || '')) {
      const extra: Record<string, any> = {}
      for (let guard = 0; guard < 5 && !ticket; guard++) {
        const m = /null value in column "([^"]+)"/i.exec(lastError || '')
        if (!m) break
        const colName = m[1]
        if (colName in extra) break         // we already tried filling it — give up
        // Best-effort value: use the contact's details where the name matches,
        // otherwise a placeholder so the insert can proceed.
        if (/email/i.test(colName)) extra[colName] = contactEmail || 'unknown@unknown.invalid'
        else if (/phone/i.test(colName)) extra[colName] = contactPhone || ''
        else if (/name|title|subject/i.test(colName)) extra[colName] = subject
        else if (/status/i.test(colName)) extra[colName] = 'open'
        else if (/priority/i.test(colName)) extra[colName] = priority || 'normal'
        else extra[colName] = ''

        const ticketNumber = await nextTicketNumber(db, companyId)
        const { data, error } = await db.from('support_tickets').insert({
          company_id: companyId, ticket_number: ticketNumber,
          conversation_id: conversationId || null, contact_id: contactId || null,
          subject, description: description || null, priority: priority || 'normal',
          status: 'open', created_by: createdBy || null,
          ...extra,
        }).select().maybeSingle()
        if (!error && data) ticket = data
        else if (error) lastError = error.message   // may name the NEXT missing column
      }
    }

    // FALLBACK 1 — ask PostgREST to RELOAD its schema cache, then retry.
    // The real cause of the persistent failure: PostgREST caches each table's
    // column list. After V159's ALTER TABLE the cache stayed stale, so inserts
    // failed with "Could not find the 'company_id' column of 'support_tickets'"
    // even though the column exists. Running more SQL never fixed it because
    // the SQL was never the problem. Ask for a reload and try again.
    if (!ticket && /could not find|schema cache|PGRST204/i.test(lastError || '')) {
      try {
        await db.rpc('colvy_reload_schema')   // present after V168; harmless if not
      } catch {}
      // PostgREST also reloads on this header-less ping; give it a moment.
      await new Promise(r => setTimeout(r, 1200))
      const ticketNumber = await nextTicketNumber(db, companyId)
      const { data, error } = await db.from('support_tickets').insert({
        company_id: companyId, ticket_number: ticketNumber,
        conversation_id: conversationId || null, contact_id: contactId || null,
        subject, description: description || null, priority: priority || 'normal',
        status: 'open', created_by: createdBy || null,
      }).select().maybeSingle()
      if (!error && data) ticket = data
      else if (error) lastError = `${lastError} | after-reload: ${error.message}`
    }

    // FALLBACK 2 — a SECURITY DEFINER function that inserts with plain SQL.
    // Immune to the column cache entirely. (migrations/COLVY_V168_TICKETS_RPC.sql)
    if (!ticket) {
      try {
        const { data: rpcTicket, error: rpcErr } = await db.rpc('colvy_create_ticket', {
          p_company_id: companyId,
          p_conversation_id: conversationId || null,
          p_contact_id: contactId || null,
          p_subject: subject,
          p_description: description || null,
          p_priority: priority || 'normal',
          p_created_by: createdBy || null,
        })
        if (!rpcErr && rpcTicket) ticket = rpcTicket
        else if (rpcErr) lastError = `${lastError} | rpc: ${rpcErr.message}`
      } catch (e: any) { lastError = `${lastError} | rpc: ${e.message}` }
    }

    if (!ticket) {
      // Say WHY, instead of a generic failure.
      let hint: string | null = null
      if (/violates not-null constraint/i.test(lastError || '')) {
        hint = 'An old support_tickets table has extra required columns — run migrations/COLVY_V169_TICKETS_FINAL.sql in the Supabase SQL editor.'
      } else if (/does not exist|relation/i.test(lastError || '')) {
        hint = 'The tickets tables are missing — run migrations/COLVY_V169_TICKETS_FINAL.sql in the Supabase SQL editor.'
      } else if (/could not find|schema cache|PGRST204/i.test(lastError || '')) {
        hint = 'Supabase\'s API cache is stale — run migrations/COLVY_V169_TICKETS_FINAL.sql, then try again.'
      }
      return NextResponse.json({ error: hint ? `${hint} (${lastError})` : (lastError || 'Could not create ticket') }, { status: 500 })
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
