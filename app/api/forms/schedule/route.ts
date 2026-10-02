import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Booking for a public form's `scheduler` question. Writes into the shared
// calendar_events table as event_type='booking' so the booking shows on the
// business's admin calendar, and prevents double-booking with an overlap check.
//
// POST { action: 'slots', formId, questionId, from, to }
//   → { booked: [{ starts_at, ends_at }] }   (existing bookings to grey out)
// POST { action: 'book', formId, questionId, startsAt, releaseEventId? }
//   → { eventId, startsAt, endsAt }  |  409 { error } on a clash
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, formId, questionId } = body
    if (!formId || !questionId) return NextResponse.json({ error: 'formId and questionId required' }, { status: 400 })
    const db = admin()

    const { data: form } = await db.from('forms').select('id, company_id, title, questions, is_published').eq('id', formId).maybeSingle()
    if (!form || !form.is_published) return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    const q = (form.questions || []).find((x: any) => x.id === questionId && x.type === 'scheduler')
    if (!q) return NextResponse.json({ error: 'Scheduler question not found' }, { status: 404 })
    const cfg = q.schedule || {}
    const durationMins = Math.max(5, Number(cfg.durationMins) || Number(cfg.slotMins) || 30)
    const locationId = cfg.locationId || null

    const bookedQuery = (fromIso: string, toIso: string) => {
      let sel = db.from('calendar_events').select('starts_at, ends_at')
        .eq('company_id', form.company_id).eq('event_type', 'booking')
        .neq('status', 'cancelled')
        .gte('starts_at', fromIso).lt('starts_at', toIso)
      if (locationId) sel = sel.eq('location_id', locationId)
      return sel
    }

    if (action === 'slots') {
      const from = body.from, to = body.to
      if (!from || !to) return NextResponse.json({ error: 'from and to required' }, { status: 400 })
      const { data } = await bookedQuery(new Date(from).toISOString(), new Date(to).toISOString())
      return NextResponse.json({ ok: true, booked: (data || []).map((r: any) => ({ starts_at: r.starts_at, ends_at: r.ends_at })) })
    }

    if (action === 'book') {
      const startsAt = body.startsAt
      if (!startsAt) return NextResponse.json({ error: 'startsAt required' }, { status: 400 })
      const start = new Date(startsAt)
      if (isNaN(start.getTime())) return NextResponse.json({ error: 'Invalid time' }, { status: 400 })
      if (start.getTime() < Date.now() - 60000) return NextResponse.json({ error: 'That time is in the past.' }, { status: 400 })
      const end = new Date(start.getTime() + durationMins * 60000)

      // Release a previously-held slot by the same respondent (they changed pick).
      if (body.releaseEventId) {
        try { await db.from('calendar_events').delete().eq('id', body.releaseEventId).eq('event_type', 'booking').eq('company_id', form.company_id) } catch {}
      }

      // Overlap check: any booking where existing.start < newEnd AND existing.end > newStart.
      let clashSel = db.from('calendar_events').select('id')
        .eq('company_id', form.company_id).eq('event_type', 'booking').neq('status', 'cancelled')
        .lt('starts_at', end.toISOString()).gt('ends_at', start.toISOString())
      if (locationId) clashSel = clashSel.eq('location_id', locationId)
      const { data: clash } = await clashSel.limit(1)
      if (clash && clash.length > 0) return NextResponse.json({ error: 'Sorry, that time was just taken. Please pick another.' }, { status: 409 })

      const { data: ev, error } = await db.from('calendar_events').insert({
        company_id: form.company_id, event_type: 'booking',
        title: `Booking — ${form.title}`,
        starts_at: start.toISOString(), ends_at: end.toISOString(),
        status: 'scheduled', location_id: locationId,
        notes: 'Booked from a Colvy form',
      }).select('id').maybeSingle()
      if (error || !ev?.id) return NextResponse.json({ error: 'Could not save the booking' }, { status: 500 })
      return NextResponse.json({ ok: true, eventId: ev.id, startsAt: start.toISOString(), endsAt: end.toISOString() })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
