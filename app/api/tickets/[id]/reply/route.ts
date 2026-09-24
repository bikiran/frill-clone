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
    // Uses the SAME channel resolution + send path as the inbox email reply, so
    // it works whether the workspace's mailbox is a connected Gmail account
    // (sent via the Gmail API) or a domain mailbox (sent via Resend).
    if (kind === 'reply') {
      // Recipient: contact → parsed "From:" → legacy email column.
      let toEmail = ''
      if (ticket.contact_id) { try { const { data: c } = await db.from('contacts').select('email').eq('id', ticket.contact_id).maybeSingle(); toEmail = c?.email || '' } catch {} }
      if (!toEmail) toEmail = parseFrom(ticket.description || '')?.email || ticket.email || ''

      if (!toEmail) {
        emailNote = 'Saved, but no email address on file for this requester, so nothing was sent.'
      } else {
        // The company's active mailbox (any, oldest first — matches the inbox).
        let channel: any = null
        try {
          const { data: chs } = await db.from('email_channels').select('*').eq('company_id', ticket.company_id).eq('is_active', true).order('created_at', { ascending: true }).limit(1)
          channel = chs?.[0] || null
        } catch {}
        const { data: co } = await db.from('companies').select('name,support_email,business_email,email').eq('id', ticket.company_id).maybeSingle().then((r: any) => r, () => ({ data: null }))
        const fromName = channel?.from_name || co?.name || 'Support'
        const subject = `Re: ${ticket.subject} [${ticket.ticket_number}]`
        const escapeHtml = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const linkify = (t: string) => t.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1">$1</a>')
        const bodyHtml = `<div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;font-size:14px;line-height:1.5;color:#1a1a1a">${linkify(escapeHtml(text)).replace(/\n/g, '<br>')}</div>`

        if (channel?.provider === 'gmail') {
          // Send through the connected Gmail account (lands in their Sent folder).
          try {
            const { sendGmail } = await import('@/lib/gmail')
            const out = await sendGmail(channel, { to: toEmail, subject, body: text, html: bodyHtml })
            emailed = !out?.error
            if (out?.error) emailNote = `Saved, but the email could not be sent: ${out.error}`
          } catch (e: any) { emailNote = `Saved, but the email could not be sent: ${e.message}` }
        } else if (process.env.RESEND_API_KEY) {
          const fromAddress = channel?.from_address || channel?.inbound_address || channel?.address || co?.support_email || co?.business_email || co?.email || ''
          const replyTo = channel?.reply_to || channel?.inbound_address || fromAddress
          if (!fromAddress) {
            emailNote = 'Saved, but no verified sending address is configured for this workspace, so nothing was sent. Connect a mailbox under Inbox → Channels.'
          } else {
            try {
              const res = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({ from: `${fromName} <${fromAddress}>`, to: [toEmail], subject, text, html: bodyHtml, ...(replyTo ? { reply_to: replyTo } : {}) }),
              })
              emailed = res.ok
              if (!res.ok) { const o = await res.json().catch(() => ({})); emailNote = `Saved, but the email could not be sent: ${o?.message || res.status}` }
            } catch (e: any) { emailNote = `Saved, but the email could not be sent: ${e.message}` }
          }
        } else {
          emailNote = 'Saved, but email sending is not configured for this workspace, so the requester was not emailed.'
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
