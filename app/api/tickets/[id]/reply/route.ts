import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

async function userFromReq(db: any, req: NextRequest): Promise<string | null> {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return null
  try { const { data } = await db.auth.getUser(token); return data?.user?.id || null } catch { return null }
}

// Resolve the requester's email from the ticket (contact → parsed body → legacy col).
function parseFrom(desc: string) {
  const m = /From:\s*([^<]+?)\s*<([^>]+)>/i.exec(desc || '')
  return m ? { name: m[1].trim(), email: m[2].trim() } : null
}

// GET /api/tickets/:id/reply — the reply + note thread for a ticket.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const db = admin()
    // If the table isn't there yet (migration not run), degrade to an empty thread.
    const { data, error } = await db.from('ticket_messages').select('*').eq('ticket_id', id).order('created_at', { ascending: true })
    if (error) return NextResponse.json({ messages: [], needsMigration: true })
    return NextResponse.json({ messages: data || [] })
  } catch (e: any) {
    return NextResponse.json({ messages: [], error: e.message })
  }
}

// POST /api/tickets/:id/reply  { kind:'reply'|'note', body, authorName }
// Stores the message, and for a reply also emails the requester (best-effort).
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params
    const db = admin()
    const userId = await userFromReq(db, req)
    const body = await req.json().catch(() => ({}))
    const kind = body?.kind === 'note' ? 'note' : 'reply'
    const text = String(body?.body || '').trim()
    const authorName = String(body?.authorName || 'Agent').trim()
    if (!text) return NextResponse.json({ error: 'Message is required' }, { status: 400 })

    const { data: ticket } = await db.from('support_tickets').select('*').eq('id', id).maybeSingle()
    if (!ticket) return NextResponse.json({ error: 'Ticket not found' }, { status: 404 })

    let emailed = false
    let emailNote: string | null = null

    // A reply goes out to the requester by email (an internal note never does).
    if (kind === 'reply') {
      // Recipient: contact → parsed "From:" → legacy email column.
      let toEmail = ''
      if (ticket.contact_id) { try { const { data: c } = await db.from('contacts').select('email').eq('id', ticket.contact_id).maybeSingle(); toEmail = c?.email || '' } catch {} }
      if (!toEmail) toEmail = parseFrom(ticket.description || '')?.email || ticket.email || ''

      if (!toEmail) {
        emailNote = 'Saved, but no email address on file for this requester, so nothing was sent.'
      } else if (!process.env.RESEND_API_KEY) {
        emailNote = 'Saved. Email sending is not configured (RESEND_API_KEY), so the requester was not emailed.'
      } else {
        // From: the company's active email channel, else its support address.
        let fromAddress = '', fromName = '', replyTo = ''
        try {
          const { data: ch } = await db.from('email_channels').select('from_address,from_name,address,inbound_address,reply_to').eq('company_id', ticket.company_id).eq('is_active', true).limit(1).maybeSingle()
          if (ch) { fromAddress = ch.from_address || ch.address || ''; fromName = ch.from_name || ''; replyTo = ch.reply_to || ch.inbound_address || '' }
        } catch {}
        if (!fromName || !fromAddress) {
          try { const { data: co } = await db.from('companies').select('name,support_email,business_email,email').eq('id', ticket.company_id).maybeSingle(); fromName = fromName || co?.name || 'Support'; fromAddress = fromAddress || co?.support_email || co?.business_email || co?.email || '' } catch {}
        }
        if (!fromAddress) {
          emailNote = 'Saved, but no verified sending address is configured for this workspace, so nothing was sent.'
        } else {
          try {
            const res = await fetch('https://api.resend.com/emails', {
              method: 'POST',
              headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({
                from: `${fromName} <${fromAddress}>`,
                to: [toEmail],
                subject: `Re: ${ticket.subject} [${ticket.ticket_number}]`,
                text,
                ...(replyTo ? { reply_to: replyTo } : {}),
              }),
            })
            emailed = res.ok
            if (!res.ok) { const o = await res.json().catch(() => ({})); emailNote = `Saved, but the email could not be sent: ${o?.message || res.status}` }
          } catch (e: any) { emailNote = `Saved, but the email could not be sent: ${e.message}` }
        }
      }
    }

    // Store the message. If the table is missing, tell the caller to run V318.
    const { error } = await db.from('ticket_messages').insert({
      ticket_id: id, company_id: ticket.company_id, kind, direction: 'out',
      body: text, author_name: authorName, author_id: userId, emailed,
    })
    if (error) {
      const missing = /relation .*ticket_messages.* does not exist|could not find|schema cache|PGRST205/i.test(error.message)
      return NextResponse.json({ error: missing ? 'The ticket reply store is not set up yet — run migrations/COLVY_V318_TICKET_MESSAGES.sql in Supabase.' : error.message }, { status: 500 })
    }

    // Reopen a resolved/closed ticket when the agent replies, and bump updated_at.
    try {
      const patch: any = { updated_at: new Date().toISOString() }
      await db.from('support_tickets').update(patch).eq('id', id)
    } catch {}

    return NextResponse.json({ ok: true, emailed, note: emailNote })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
