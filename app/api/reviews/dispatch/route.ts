import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Returns the next moment at `targetHour` (0-23) in the given timezone that is
// in the future — i.e. "defer this until 9am their time".
function nextAllowedTime(tz: string, targetHour: number): Date {
  const now = new Date()
  // Reliable timezone offset: format the same instant in the target tz and in
  // UTC, and diff them.
  const tzNow = new Date(now.toLocaleString('en-US', { timeZone: tz }))
  const utcNow = new Date(now.toLocaleString('en-US', { timeZone: 'UTC' }))
  const offsetMs = tzNow.getTime() - utcNow.getTime()   // tz = UTC + offsetMs

  // Wall-clock time in the target tz.
  const y = tzNow.getFullYear(), m = tzNow.getMonth(), d = tzNow.getDate(), h = tzNow.getHours()
  // Target local wall-clock: today at targetHour, or tomorrow if already past.
  const dayShift = h >= targetHour ? 1 : 0
  // Build the UTC instant that corresponds to that local wall-clock.
  const targetLocalMs = Date.UTC(y, m, d + dayShift, targetHour, 0, 0)
  const result = new Date(targetLocalMs - offsetMs)
  return result.getTime() > now.getTime() ? result : new Date(now.getTime() + 3600000)
}

// Sends any review requests whose delay has elapsed. Call this on a schedule
// (Vercel Cron: /api/reviews/dispatch every 15 min, or hourly).
//
// Delivers over the channels the business enabled: chat (always available),
// SMS (Telnyx) and/or email (Resend).
export async function GET(req: NextRequest) {
  return run(req)
}
export async function POST(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  try {
    const db = admin()
    const now = new Date().toISOString()

    const { data: due } = await db.from('review_requests')
      .select('*')
      .eq('status', 'pending')
      .lte('send_after', now)
      .limit(50)

    if (!due || due.length === 0) return NextResponse.json({ ok: true, sent: 0 })

    let sent = 0
    const results: any[] = []

    for (const rr of due) {
      try {
        const { data: co } = await db.from('companies')
          .select('name, review_request_settings').eq('id', rr.company_id).maybeSingle()
        const cfg = co?.review_request_settings || {}
        if (!cfg.enabled) {
          await db.from('review_requests').update({ status: 'skipped', error: 'Review requests disabled' }).eq('id', rr.id)
          continue
        }

        // Quiet hours — never message a customer in the middle of the night.
        // The business sets a window (e.g. 21:00–09:00) and a timezone; a
        // request that comes due inside it is deferred to the next allowed
        // start time rather than sent. Defaults to 9am–9pm Melbourne if unset.
        const quietStart = typeof cfg.quiet_start === 'number' ? cfg.quiet_start : 21   // 9pm
        const quietEnd = typeof cfg.quiet_end === 'number' ? cfg.quiet_end : 9          // 9am
        const tz = cfg.timezone || 'Australia/Melbourne'
        if (cfg.quiet_hours_enabled !== false) {
          // Current hour in the business's timezone.
          const tzNow = new Date(new Date().toLocaleString('en-US', { timeZone: tz }))
          const hour = tzNow.getHours()
          // Is `hour` inside the quiet window? The window can wrap past midnight.
          const inQuiet = quietStart > quietEnd
            ? (hour >= quietStart || hour < quietEnd)   // e.g. 21..24 or 0..9
            : (hour >= quietStart && hour < quietEnd)
          if (inQuiet) {
            // Defer to the next quietEnd (e.g. 9am) in the business timezone.
            const deferred = nextAllowedTime(tz, quietEnd)
            await db.from('review_requests').update({ send_after: deferred.toISOString() }).eq('id', rr.id)
            results.push({ id: rr.id, deferred: deferred.toISOString() })
            continue
          }
        }

        // The link customers click to leave the review.
        const { data: gbp } = await db.from('google_business_accounts')
          .select('review_link').eq('company_id', rr.company_id).maybeSingle()
        const link = cfg.review_link || gbp?.review_link
        if (!link) {
          await db.from('review_requests').update({ status: 'failed', error: 'No Google review link configured' }).eq('id', rr.id)
          continue
        }

        const { data: contact } = rr.contact_id
          ? await db.from('contacts').select('*').eq('id', rr.contact_id).maybeSingle()
          : { data: null as any }

        const business = co?.name || 'us'
        const name = contact?.name?.split(' ')[0] || 'there'
        const template = cfg.message ||
          'Hi {name}, thanks for shopping with {business}! If you have a moment, we\'d really appreciate a quick Google review: {link}'
        const text = template
          .replace(/\{name\}/g, name)
          .replace(/\{business\}/g, business)
          .replace(/\{link\}/g, link)

        const channels = cfg.channels || { chat: true }

        // ── Chat (in the conversation the order created)
        if (channels.chat !== false && rr.conversation_id) {
          await db.from('messages').insert({
            conversation_id: rr.conversation_id, company_id: rr.company_id,
            sender_type: 'agent', sender_name: business,
            content: text, message_type: 'text',
            metadata: { auto: true, review_request: true },
          })
          await db.from('conversations').update({
            last_message: text.slice(0, 200), last_message_at: new Date().toISOString(), is_unread: true, review_requested: true,
          }).eq('id', rr.conversation_id)
        }

        // ── SMS
        if (channels.sms && contact?.phone) {
          try {
            const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
            await fetch(`${base}/api/telnyx/sms/send`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyId: rr.company_id, conversationId: rr.conversation_id, to: contact.phone, text, senderName: business }),
            })
          } catch (e) { console.error('[review request] sms failed', e) }
        }

        // ── Email
        if (channels.email && contact?.email && process.env.RESEND_API_KEY) {
          try {
            const { data: ec } = await db.from('email_channels')
              .select('from_address, from_name, inbound_address').eq('company_id', rr.company_id).limit(1)
            const from = ec?.[0]?.from_address || ec?.[0]?.inbound_address
            if (from) {
              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: `${ec?.[0]?.from_name || business} <${from}>`,
                  to: [contact.email],
                  subject: `How did we do?`,
                  text,
                }),
              })
            }
          } catch (e) { console.error('[review request] email failed', e) }
        }

        await db.from('review_requests').update({ status: 'sent', sent_at: new Date().toISOString() }).eq('id', rr.id)
        sent++
        results.push({ id: rr.id, order: rr.order_id, status: 'sent' })
      } catch (e: any) {
        await db.from('review_requests').update({ status: 'failed', error: e.message }).eq('id', rr.id)
        results.push({ id: rr.id, status: 'failed', error: e.message })
      }
    }

    return NextResponse.json({ ok: true, sent, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
