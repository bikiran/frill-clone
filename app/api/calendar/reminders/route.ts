import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { notifyCompany } from '@/lib/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * Tell the team about calendar events that are due or coming up.
 *
 * Sends an in-app notification always, and an email if the company has that
 * switched on. Each event is only ever announced once — a reminder that nags
 * every few minutes is worse than no reminder at all.
 *
 * Vercel Hobby can't run frequent crons, so this is called opportunistically
 * while an admin has the app open (throttled), and can also be hit manually.
 */
export async function GET(req: NextRequest) { return run(req) }
export async function POST(req: NextRequest) { return run(req) }

async function run(req: NextRequest) {
  try {
    const db = admin()
    const now = new Date()

    // Look ahead by the widest window any company might want.
    const horizon = new Date(now.getTime() + 48 * 3600 * 1000).toISOString()

    const { data: events } = await db.from('calendar_events')
      .select('*')
      .gte('starts_at', new Date(now.getTime() - 6 * 3600 * 1000).toISOString())
      .lte('starts_at', horizon)
      .in('status', ['scheduled', 'confirmed'])
      .limit(200)

    if (!events?.length) return NextResponse.json({ ok: true, sent: 0 })

    // Group by company so we read each company's settings once.
    const byCompany: Record<string, any[]> = {}
    for (const e of events) (byCompany[e.company_id] ||= []).push(e)

    let sent = 0
    const results: any[] = []

    for (const [companyId, list] of Object.entries(byCompany)) {
      const { data: company } = await db.from('companies')
        .select('name, slug, calendar_settings').eq('id', companyId).maybeSingle()

      const cfg = company?.calendar_settings || {}
      // Off by default — nobody gets surprise emails.
      if (cfg.reminders_enabled === false) continue
      if (!cfg.reminders_enabled) continue

      const leadHours = Number(cfg.lead_hours ?? 24)
      const emailOn = cfg.email !== false
      const cutoff = new Date(now.getTime() + leadHours * 3600 * 1000)

      for (const e of list) {
        const startsAt = new Date(e.starts_at)
        // Only announce events inside the lead window and not already announced.
        if (startsAt > cutoff) continue
        if (e.reminded_at) continue

        const when = e.is_all_day
          ? startsAt.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })
          : startsAt.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })

        const overdue = startsAt < now
        const label = e.event_type === 'delivery' ? 'Delivery'
          : e.event_type === 'booking' ? 'Booking'
          : e.event_type === 'task' ? 'Task'
          : e.event_type === 'pickup' ? 'Pickup' : 'Appointment'

        const line = overdue
          ? `${label} was due — ${e.title} (${when}${e.time_window ? `, ${e.time_window}` : ''})`
          : `${label} coming up — ${e.title} (${when}${e.time_window ? `, ${e.time_window}` : ''})`

        // Everyone assigned. Falls back to the single legacy field when the
        // event predates multi-assignment.
        const assignees: any[] = Array.isArray(e.assignees) && e.assignees.length
          ? e.assignees
          : (e.assigned_to_id ? [{ id: e.assigned_to_id, name: e.assigned_to_name }] : [])
        const hasAssignees = assignees.length > 0

        // Per-event channels, when the event is assigned to someone. An event
        // with no assignee keeps the old company-wide behaviour.
        const evtChannels: string[] = Array.isArray(e.reminder_channels) && e.reminder_channels.length
          ? e.reminder_channels
          : ['in_app', 'email', 'sms']
        const wantInApp = !hasAssignees || evtChannels.includes('in_app')
        const wantEmail = !hasAssignees || evtChannels.includes('email')
        const wantSms = hasAssignees && evtChannels.includes('sms')

        // ── In-app notification
        if (wantInApp) {
        try {
          if (hasAssignees) {
            // Assigned: notify each assignee.
            for (const a of assignees) {
              if (!a.id) continue
              await db.from('notifications').insert({
                company_id: companyId, user_id: a.id, type: 'calendar',
                title: line, body: e.notes || null,
                link: e.conversation_id ? `/admin/inbox?conversation=${e.conversation_id}` : '/admin/calendar',
                is_read: false,
              })
            }
          } else {
            await notifyCompany({
              db, companyId, type: 'calendar',
              message: line,
              actorName: 'Calendar',
              conversationId: e.conversation_id || undefined,
            })
          }
        } catch {}
        }

        // ── SMS the assignees (only when the event asks for it)
        if (wantSms && hasAssignees) {
          for (const a of assignees) {
            if (!a.id) continue
            try {
              const { data: mem } = await db.from('team_members')
                .select('phone').eq('company_id', companyId).eq('user_id', a.id).maybeSingle()
              if (mem?.phone) {
                const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
                await fetch(`${origin}/api/telnyx/sms/send`, {
                  method: 'POST', headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ companyId, to: mem.phone, text: line, skipChatMessage: true }),
                })
              }
            } catch (err) { console.error('[calendar reminder] sms failed', err) }
          }
        }

        // ── Customer reminder (delivery / appointment / booking / pickup)
        if (e.notify_customer && ['delivery', 'appointment', 'booking', 'pickup'].includes(e.event_type)) {
          try {
            const cid = e.customer_contact_id || e.contact_id
            if (cid) {
              const { data: ct } = await db.from('contacts')
                .select('phone, email, name, is_blocked, unsubscribed_at').eq('id', cid).maybeSingle()
              if (ct && !ct.is_blocked) {
                const custLine = `Reminder: your ${label.toLowerCase()} "${e.title}" is ${overdue ? 'due' : 'coming up'} — ${when}${e.time_window ? `, ${e.time_window}` : ''}.`
                const origin = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
                if (ct.phone) {
                  await fetch(`${origin}/api/telnyx/sms/send`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ companyId, to: ct.phone, text: custLine, skipChatMessage: true }),
                  })
                }
                await db.from('calendar_events').update({ customer_reminded_at: new Date().toISOString() }).eq('id', e.id)
              }
            }
          } catch (err) { console.error('[calendar reminder] customer notify failed', err) }
        }

        // ── Email the team
        if (emailOn && wantEmail && process.env.RESEND_API_KEY) {
          try {
            let to: string[] = []
            if (hasAssignees) {
              // Assigned event: email ONLY the assignees, matching the in-app
              // and SMS behaviour. (Previously this emailed the whole active
              // team even for an assigned event.)
              const ids = assignees.map((a: any) => a.id).filter(Boolean)
              if (ids.length) {
                const { data: members } = await db.from('team_members')
                  .select('email').eq('company_id', companyId).in('user_id', ids)
                to = (members || []).map((m: any) => m.email).filter(Boolean)
              }
            } else {
              // Unassigned event: fall back to the whole active team.
              const { data: members } = await db.from('team_members')
                .select('email').eq('company_id', companyId).eq('status', 'active')
              to = (members || []).map((m: any) => m.email).filter(Boolean)
            }

            if (to.length) {
              const { data: ec } = await db.from('email_channels')
                .select('from_address, from_name, inbound_address')
                .eq('company_id', companyId).eq('is_active', true).limit(1)
              const from = ec?.[0]?.from_address || ec?.[0]?.inbound_address || 'notifications@updates.colvy.com'
              const fromName = company?.name ? `${company.name} Calendar` : 'Colvy Calendar'

              // Link to the company's own subdomain — a roxyaquarium.colvy.com
              // link is recognisable to the team, a bare colvy.com one isn't.
              const siteBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
              let base = siteBase
              try {
                const u = new URL(siteBase)
                if (company?.slug && u.hostname.endsWith('colvy.com')) {
                  base = `${u.protocol}//${company.slug}.colvy.com`
                }
              } catch {}
              const body = [
                line,
                '',
                e.address ? `Address: ${e.address}` : '',
                e.notes ? `Notes: ${e.notes}` : '',
                '',
                `See it in the calendar: ${base}/admin/calendar`,
              ].filter(Boolean).join('\n')

              await fetch('https://api.resend.com/emails', {
                method: 'POST',
                headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  from: `${fromName} <${from}>`,
                  to,
                  subject: overdue ? `Overdue: ${e.title}` : `Coming up: ${e.title}`,
                  text: body,
                }),
              })
            }
          } catch (err) { console.error('[calendar reminder] email failed', err) }
        }

        // Mark it so we never announce the same event twice.
        await db.from('calendar_events')
          .update({ reminded_at: new Date().toISOString() }).eq('id', e.id)

        sent++
        results.push({ id: e.id, title: e.title, overdue })
      }
    }

    return NextResponse.json({ ok: true, sent, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
