import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET ?companyId=&from=&to=&locationId=&type=  → events in a range
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    const from = req.nextUrl.searchParams.get('from')
    const to = req.nextUrl.searchParams.get('to')
    const locationId = req.nextUrl.searchParams.get('locationId')
    const type = req.nextUrl.searchParams.get('type')
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

    const db = admin()

    let q = db.from('calendar_events').select('*').eq('company_id', companyId)
    if (from) q = q.gte('starts_at', from)
    if (to) q = q.lte('starts_at', to)
    if (locationId) q = q.eq('location_id', locationId)
    if (type) q = q.eq('event_type', type)

    const { data: events, error } = await q.order('starts_at', { ascending: true })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Attach contacts and outlets so the calendar can show real names.
    const contactIds = Array.from(new Set((events || []).map(e => e.contact_id).filter(Boolean)))
    let contacts: Record<string, any> = {}
    if (contactIds.length) {
      const { data } = await db.from('contacts').select('id, name, email, phone').in('id', contactIds)
      for (const c of data || []) contacts[c.id] = c
    }

    const { data: locations } = await db.from('company_locations')
      .select('id, label, suburb').eq('company_id', companyId)

    const enriched = (events || []).map(e => ({
      ...e,
      contact: e.contact_id ? contacts[e.contact_id] || null : null,
    }))

    return NextResponse.json({ events: enriched, locations: locations || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST → create / update / delete an event, or record a delivery update.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { companyId, action } = body
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    // ── Create or update ────────────────────────────────────────────────────
    if (!action || action === 'save') {
      const {
        id, event_type, title, notes, starts_at, ends_at, is_all_day, time_window,
        location_id, contact_id, conversation_id, order_id, assigned_to,
        address, status, created_by,
        assigned_to_id, assigned_to_name, reminder_channels,
        notify_customer, customer_contact_id, assignees,
      } = body

      if (!title || !starts_at) {
        return NextResponse.json({ error: 'Title and a start time are required' }, { status: 400 })
      }

      const row: any = {
        company_id: companyId,
        event_type: event_type || 'appointment',
        title, notes: notes || null,
        starts_at, ends_at: ends_at || null,
        is_all_day: !!is_all_day,
        time_window: time_window || null,
        location_id: location_id || null,
        contact_id: contact_id || null,
        conversation_id: conversation_id || null,
        order_id: order_id || null,
        assigned_to: assigned_to || assigned_to_name || null,
        address: address || null,
        status: status || 'scheduled',
        assigned_to_id: assigned_to_id || null,
        assigned_to_name: assigned_to_name || null,
        reminder_channels: reminder_channels || null,
        assignees: Array.isArray(assignees) ? assignees : [],
        notify_customer: !!notify_customer,
        customer_contact_id: customer_contact_id || contact_id || null,
        updated_at: new Date().toISOString(),
      }

      let event: any
      if (id) {
        const { data, error } = await db.from('calendar_events').update(row).eq('id', id).select().maybeSingle()
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        event = data
      } else {
        row.created_by = created_by || null
        const { data, error } = await db.from('calendar_events').insert(row).select().maybeSingle()
        if (error) return NextResponse.json({ error: error.message }, { status: 500 })
        event = data
      }

      // If it was scheduled from a chat, note it on the conversation timeline so
      // the whole team can see what was promised.
      if (event && conversation_id && !id) {
        try {
          const when = new Date(starts_at).toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short' })
          const label = event_type === 'delivery' ? 'Delivery' : event_type === 'booking' ? 'Booking' : 'Appointment'
          await db.from('conversation_events').insert({
            conversation_id, company_id: companyId,
            event_type: 'scheduled',
            actor_name: 'Team',
            detail: `${label} scheduled — ${when}${time_window ? `, ${time_window}` : ''}`,
          })
        } catch {}
      }

      return NextResponse.json({ ok: true, event })
    }

    // ── Delete ──────────────────────────────────────────────────────────────
    if (action === 'delete') {
      const { id } = body
      if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
      await db.from('delivery_updates').delete().eq('calendar_event_id', id)
      await db.from('calendar_events').delete().eq('id', id)
      return NextResponse.json({ ok: true })
    }

    // ── Status change (+ optional customer notification) ─────────────────────
    if (action === 'set_status') {
      const { id, status, notifyCustomer, note } = body
      if (!id || !status) return NextResponse.json({ error: 'id and status required' }, { status: 400 })

      const { data: event } = await db.from('calendar_events').select('*').eq('id', id).maybeSingle()
      if (!event) return NextResponse.json({ error: 'Event not found' }, { status: 404 })

      await db.from('calendar_events').update({ status, updated_at: new Date().toISOString() }).eq('id', id)

      await db.from('delivery_updates').insert({
        company_id: companyId, calendar_event_id: id,
        order_id: event.order_id || null,
        status, note: note || null,
        notified: !!notifyCustomer,
      })

      // Tell the customer, if asked and we have a conversation to say it in.
      if (notifyCustomer && event.conversation_id) {
        const MESSAGES: Record<string, string> = {
          confirmed: 'Your delivery is confirmed.',
          in_progress: 'Your delivery is on its way.',
          completed: 'Your delivery has been completed. Thanks for your order!',
          cancelled: 'Your delivery has been cancelled.',
          missed: 'We tried to deliver but couldn\'t reach you. We\'ll be in touch to rebook.',
        }
        const text = note || MESSAGES[status] || `Delivery status: ${status}`
        const { data: company } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()

        await db.from('messages').insert({
          conversation_id: event.conversation_id, company_id: companyId,
          sender_type: 'agent', sender_name: company?.name || 'Support',
          content: text, message_type: 'text',
          metadata: { auto: true, delivery_update: true, status },
        })
        await db.from('conversations').update({
          last_message: text.slice(0, 200), last_message_at: new Date().toISOString(),
        }).eq('id', event.conversation_id)
      }

      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
