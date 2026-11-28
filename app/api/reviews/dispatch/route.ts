import { cronOr401 } from '@/lib/cron-auth'
import { isInternalCall } from '@/lib/internal-call'
import { internalHeaders } from '@/lib/internal-call'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { holidaySet, wallClock, isBlockedDay, nextOpenSlot } from '@/lib/holidays'
import { assessReviewSentiment } from '@/lib/review-sentiment'
import { shortenUrl } from '@/lib/short-link'
import { findCustomerGoogleReview } from '@/lib/review-match'
import { withJobLog } from '@/lib/job-log'
import { isLiveOnPage } from '@/lib/channel-choice'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Sends any review requests whose delay has elapsed. Vercel Cron runs it every
// ten minutes (vercel.json); CRON_SECRET guards it.
//
// Delivers over the channels the business enabled: chat (always available),
// SMS (Telnyx) and/or email (Resend).
async function getHandler(req: NextRequest) {
  return run(req)
}
async function postHandler(req: NextRequest) {
  return run(req)
}

async function run(req: NextRequest) {
  const denied = cronOr401(req)
  if (denied) return denied
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
    // Requests that were tried and reached nobody (no text, no email, and the
    // customer wasn't on the chat to see the thread row).
    let notDelivered = 0
    const results: any[] = []
    // Contacts already sent a review request in THIS run — so a customer with
    // several due orders doesn't get one review message per order in one pass.
    const sentContacts = new Set<string>()

    for (const rr of due) {
      try {
        const { data: co } = await db.from('companies')
          .select('name, review_request_settings').eq('id', rr.company_id).maybeSingle()
        const cfg = co?.review_request_settings || {}
        if (!cfg.enabled) {
          await db.from('review_requests').update({ status: 'skipped', error: 'Review requests disabled' }).eq('id', rr.id)
          continue
        }

        // Smart suppression — don't pester a customer who has already engaged
        // with a review request. Once a contact has clicked ANY review link
        // before (tracked via the /r/<id> redirect), skip future automatic
        // requests for them instead of asking after every order. First-time
        // buyers and returning customers who never clicked still get asked.
        if (cfg.suppress_after_click !== false && rr.contact_id) {
          const { data: c } = await db.from('contacts').select('review_clicked_at').eq('id', rr.contact_id).maybeSingle()
          if (c?.review_clicked_at) {
            await db.from('review_requests').update({ status: 'skipped', error: 'Customer already engaged with a review request' }).eq('id', rr.id)
            results.push({ id: rr.id, skipped: 'already reviewed' })
            continue
          }
        }

        // Already left a Google review? Never ask again. Checks the contact on
        // the request, or the one on its conversation when the request has none.
        {
          let reviewer = rr.contact_id as string | null
          if (!reviewer && rr.conversation_id) {
            const { data: cv } = await db.from('conversations').select('contact_id').eq('id', rr.conversation_id).maybeSingle()
            reviewer = cv?.contact_id || null
          }
          if (reviewer) {
            const prev = await findCustomerGoogleReview(db, rr.company_id, reviewer)
            if (prev.reviewed) {
              await db.from('review_requests').update({ status: 'skipped', error: `Customer already left a Google review${prev.rating ? ` (${prev.rating}/5)` : ''}` }).eq('id', rr.id)
              results.push({ id: rr.id, skipped: 'already reviewed on Google' })
              continue
            }
          }
        }

        // One review request per customer, not per order. A customer who placed
        // several orders otherwise gets a "leave us a review" message for each —
        // over SMS AND email. Skip if we've already sent one to this contact
        // this run, or sent one in the last 30 days (cross-run).
        if (rr.contact_id) {
          if (sentContacts.has(rr.contact_id)) {
            await db.from('review_requests').update({ status: 'skipped', error: 'Review request already sent to this customer' }).eq('id', rr.id)
            results.push({ id: rr.id, skipped: 'duplicate this run' })
            continue
          }
          try {
            const cutoff = new Date(Date.now() - 30 * 864e5).toISOString()
            const { data: prior } = await db.from('review_requests')
              .select('id').eq('company_id', rr.company_id).eq('contact_id', rr.contact_id)
              // 'failed' with a sent_at is a request that was tried and reached
              // nobody (below). It used to be stored as 'sent', so it still
              // counts here: who gets asked is unchanged.
              .in('status', ['sent', 'failed']).gte('sent_at', cutoff).neq('id', rr.id).limit(1)
            if (prior && prior.length) {
              await db.from('review_requests').update({ status: 'skipped', error: 'Review request already sent to this customer recently' }).eq('id', rr.id)
              results.push({ id: rr.id, skipped: 'recent review request' })
              continue
            }
          } catch { /* if the check fails, fall through and send */ }
        }

        // Timing rules — never message in quiet hours, on Sundays, or on public
        // holidays. A request that comes due at a disallowed time is deferred to
        // the next good slot (business-day start) rather than sent. Defaults to a
        // 9am–9pm Melbourne window, Sundays + VIC public holidays skipped.
        const quietStart = typeof cfg.quiet_start === 'number' ? cfg.quiet_start : 21   // 9pm
        const quietEnd = typeof cfg.quiet_end === 'number' ? cfg.quiet_end : 9          // 9am
        const tz = cfg.timezone || 'Australia/Melbourne'
        const quietOn = cfg.quiet_hours_enabled !== false
        const dayRules = { skipWeekends: cfg.skip_weekends !== false, skipHolidays: cfg.skip_holidays !== false }
        const holidays = holidaySet(cfg.public_holidays)
        const wc = wallClock(tz)
        const inQuiet = quietOn && (quietStart > quietEnd
          ? (wc.h >= quietStart || wc.h < quietEnd)   // window wraps midnight, e.g. 21..9
          : (wc.h >= quietStart && wc.h < quietEnd))
        const dayBlocked = isBlockedDay(tz, holidays, dayRules)
        if (inQuiet || dayBlocked) {
          const openHour = quietOn ? quietEnd : 9
          const deferred = nextOpenSlot(tz, openHour, holidays, dayRules)
          await db.from('review_requests').update({ send_after: deferred.toISOString() }).eq('id', rr.id)
          results.push({ id: rr.id, deferred: deferred.toISOString(), reason: dayBlocked ? 'closed day' : 'quiet hours' })
          continue
        }

        // Sentiment gate — don't ask an unhappy customer for a public review.
        // Reads the conversation and blocks the request if the customer likely
        // had a bad experience. Best-effort; a classifier failure allows the send.
        if (cfg.block_negative_sentiment !== false && rr.conversation_id) {
          const { data: msgs } = await db.from('messages')
            .select('sender_type, content').eq('conversation_id', rr.conversation_id)
            .order('created_at', { ascending: false }).limit(40)
          const transcript = (msgs || []).reverse()
            .map((m: any) => {
              const who = ['agent', 'system', 'bot'].includes(String(m.sender_type)) ? 'Business' : 'Customer'
              const body = String(m.content || '').trim().slice(0, 500)
              return body ? `${who}: ${body}` : ''
            })
            .filter(Boolean).join('\n').slice(0, 6000)
          if (transcript) {
            const s = await assessReviewSentiment(transcript)
            if (s.block) {
              await db.from('review_requests').update({ status: 'skipped', error: `Negative sentiment — ${s.reason || 'bad experience'}` }).eq('id', rr.id)
              results.push({ id: rr.id, skipped: 'negative sentiment', reason: s.reason })
              continue
            }
          }
        }

        // The link customers click to leave the review. We send a TRACKED link
        // (/r/<request id>) that records the click on the contact before
        // redirecting to Google — that click is what lets us stop asking a
        // customer who has already engaged. Falls back to the raw link if the
        // site URL isn't configured.
        const { data: gbp } = await db.from('google_business_accounts')
          .select('review_link').eq('company_id', rr.company_id).maybeSingle()
        const link = cfg.review_link || gbp?.review_link
        if (!link) {
          await db.from('review_requests').update({ status: 'failed', error: 'No Google review link configured' }).eq('id', rr.id)
          continue
        }
        const siteBase = String(process.env.NEXT_PUBLIC_SITE_URL || '').replace(/\/$/, '')
        let trackedLink = siteBase ? `${siteBase}/r/${rr.id}` : link
        // Send the tracked link behind the company's own short link
        // (roxyaquarium.colvy.com/l/<code>) instead of the raw
        // colvy.com/r/<uuid> redirect — short, branded, and less spammy. The
        // /l/<code> still resolves to /r/<id>, so the review-click tracking
        // (which lets us stop pestering customers who already engaged) is
        // preserved. Falls back to the raw tracked link if shortening fails.
        try {
          const short = await shortenUrl(trackedLink, { companyId: rr.company_id, kind: 'review', conversationId: rr.conversation_id })
          if (short) trackedLink = short
        } catch {}

        // Atomically claim this request BEFORE sending, so two overlapping cron
        // runs (or a retry) can't each send it: flip pending → sending and only
        // proceed if THIS update won the row. Without this the row stayed
        // 'pending' through the whole send and was only marked 'sent' at the
        // end, so a concurrent run sent the same review request a second time
        // (the duplicate message reported by users).
        const { data: claimed } = await db.from('review_requests')
          .update({ status: 'sending' })
          .eq('id', rr.id).eq('status', 'pending')
          .select('id')
        if (!claimed || claimed.length === 0) {
          results.push({ id: rr.id, skipped: 'already in progress' })
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
          .replace(/\{link\}/g, trackedLink)

        const channels = cfg.channels || { chat: true }

        // ── SMS. skipChatMessage stops the send route logging its OWN row — we
        // log a single review-request card row below, stamped with the channel
        // it actually went out on. Previously this sent SMS without the flag AND
        // posted its own default-'chat' card, so one request produced a
        // "Live Chat" card plus a duplicate "SMS" row.
        let smsSent = false
        // Why the text / the email didn't go, for the request's error when
        // nothing reached the customer.
        let smsWhy = !channels.sms ? 'texting is off for review requests' : !contact?.phone ? 'the contact has no phone number' : ''
        if (channels.sms && contact?.phone) {
          try {
            const base = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
            const res = await fetch(`${base}/api/telnyx/sms/send`, {
              method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
              body: JSON.stringify({ companyId: rr.company_id, conversationId: rr.conversation_id, to: contact.phone, text, senderName: business, skipChatMessage: true }),
            })
            smsSent = res.ok
            if (!res.ok) {
              const j = await res.json().catch(() => null) as { error?: string } | null
              smsWhy = `the text was refused (${String(j?.error || `HTTP ${res.status}`).slice(0, 160)})`
            }
          } catch (e) { console.error('[review request] sms failed', e); smsWhy = 'the text could not be sent' }
        }

        // ── One thread card row, stamped with the real delivery channel.
        // Written before the email as it always was, so it starts as 'sms' or
        // 'chat' and is corrected below once the email's answer is known.
        const posted = !!(rr.conversation_id && (channels.chat !== false || smsSent))
        let cardId: string | null = null
        if (posted) {
          const { data: card } = await db.from('messages').insert({
            conversation_id: rr.conversation_id, company_id: rr.company_id,
            sender_type: 'agent', sender_name: business,
            content: text, message_type: 'text', is_read: true,
            metadata: { auto: true, review_request: true },
            delivery_channel: smsSent ? 'sms' : 'chat',
          }).select('id').maybeSingle()
          cardId = card?.id || null
          await db.from('conversations').update({
            last_message: text.slice(0, 200), last_message_at: new Date().toISOString(), ...(smsSent ? { review_requested: true } : {}),
          }).eq('id', rr.conversation_id)
        }

        // ── Email
        let emailSent = false
        let emailWhy = !channels.email ? 'email is off for review requests' : !contact?.email ? 'the contact has no email address'
          : !process.env.RESEND_API_KEY ? 'email sending is not set up' : ''
        if (channels.email && contact?.email && process.env.RESEND_API_KEY) {
          try {
            const { data: ec } = await db.from('email_channels')
              .select('from_address, from_name, inbound_address').eq('company_id', rr.company_id).limit(1)
            const from = ec?.[0]?.from_address || ec?.[0]?.inbound_address
            if (from) {
              const er = await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: `${ec?.[0]?.from_name || business} <${from}>`,
                  to: [contact.email],
                  subject: `How did we do?`,
                  text,
                }),
              })
              emailSent = er.ok
              if (!er.ok) emailWhy = `the email was refused (HTTP ${er.status})`
            } else emailWhy = 'no mailbox is connected to send from'
          } catch (e) { console.error('[review request] email failed', e); emailWhy = 'the email could not be sent' }
        }

        // ── What really reached the customer. With no text and no email, the
        // thread row only reaches someone who is on the website chat right now
        // (conversations.page_seen_at, which only the widget writes) or who
        // reads this thread in the Colvy app.
        let onChat = false
        if (cardId && !smsSent && !emailSent) {
          const { data: cv } = await db.from('conversations').select('channel, page_seen_at').eq('id', rr.conversation_id).maybeSingle()
          onChat = isLiveOnPage(cv?.page_seen_at) || String(cv?.channel || '').toLowerCase() === 'colvy'
        }
        const delivered = smsSent || emailSent || onChat
        const why = delivered ? null
          : `Not sent to the customer: ${smsWhy}; ${emailWhy}${cardId ? '; only posted in the thread, and the customer was not on the website chat' : ''}`

        // The thread row says what happened: 'email' when only the email went,
        // and when nothing reached them it stays 'chat' (only posted in the
        // thread) with the reason. Metadata is merged, never replaced.
        if (cardId && !smsSent && emailSent) {
          await db.from('messages').update({ delivery_channel: 'email' }).eq('id', cardId)
        } else if (cardId && !delivered) {
          const { data: row } = await db.from('messages').select('metadata').eq('id', cardId).maybeSingle()
          if (row) {
            await db.from('messages').update({
              metadata: { ...(row.metadata || {}), delivery_failed: true, delivery_error: why, review_title: 'Review Request Not Sent' },
            }).eq('id', cardId)
          }
        }
        if (posted && !smsSent && delivered) {
          await db.from('conversations').update({ review_requested: true }).eq('id', rr.conversation_id)
        }

        // A request that reached nobody is 'failed' with the reason, not
        // 'sent'. It keeps sent_at (when it was tried) and its place in
        // sentContacts so the one-request-per-customer rules above skip
        // exactly the requests they skipped before.
        await db.from('review_requests').update(delivered
          ? { status: 'sent', sent_at: new Date().toISOString() }
          : { status: 'failed', error: why, sent_at: new Date().toISOString() }).eq('id', rr.id)
        if (rr.contact_id) sentContacts.add(rr.contact_id)
        if (delivered) {
          sent++
          results.push({ id: rr.id, order: rr.order_id, status: 'sent' })
        } else {
          notDelivered++
          results.push({ id: rr.id, order: rr.order_id, status: 'failed', error: why })
        }
      } catch (e: any) {
        await db.from('review_requests').update({ status: 'failed', error: e.message }).eq('id', rr.id)
        results.push({ id: rr.id, status: 'failed', error: e.message })
      }
    }

    // Anyone can nudge this (the admin shell pings it), but the per-request
    // details — ids, sentiment reasons, errors — are only for our own calls.
    return NextResponse.json(isInternalCall(req) ? { ok: true, sent, notDelivered, results } : { ok: true, sent, notDelivered })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export const GET = withJobLog('review-dispatch', getHandler)

export const POST = withJobLog('review-dispatch', postHandler)
