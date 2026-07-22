import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { checkBurst, callerKey } from '@/lib/rate-limit'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const uuid = (v: any): string | null =>
  (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) ? v : null

/** A real person starts a handful of chats; a script starts hundreds. */
const STARTS_PER_MINUTE = 5

/**
 * POST /api/widget/start
 *
 * Begins (or resumes) a chat from the public widget: finds or creates the
 * contact, then reuses that customer's existing conversation rather than
 * opening a duplicate.
 *
 * This ran in the browser against `contacts` and `conversations` directly,
 * which is what forced both tables to accept writes from anyone holding the
 * public key. The behaviour here is deliberately identical to what it replaces:
 *
 *   • match an existing contact on email, then on the last 8 phone digits
 *   • fill in blanks on that contact, never overwrite what's already there
 *   • reuse their most recent conversation, reopening it if it was closed
 *   • note the reopen on the timeline so the agent sees why it came back
 */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const companyId = uuid(b.companyId)
    if (!companyId) {
      return NextResponse.json({ error: 'companyId is required' }, { status: 400 })
    }

    if (!checkBurst(`widget-start:${callerKey(req, companyId)}`, STARTS_PER_MINUTE)) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a moment.' },
        { status: 429, headers: { 'Retry-After': '60' } },
      )
    }

    const db = admin()

    const name = (b.name || '').toString().trim().slice(0, 120) || null
    const email = (b.email || '').toString().trim().slice(0, 200) || null
    const phone = (b.phone || '').toString().trim().slice(0, 40) || null
    const smsOptIn = !!b.smsOptIn
    const page = b.page || {}
    const pageHistory = Array.isArray(b.pageHistory) ? b.pageHistory.slice(0, 30) : []

    const last8 = phone ? phone.replace(/\D/g, '').slice(-8) : ''

    // ── Contact: find, or create ────────────────────────────────────────────
    let contactId: string | null = null
    let existing: any = null

    if (email) {
      const { data } = await db.from('contacts')
        .select('id, name, email, phone').eq('company_id', companyId)
        .ilike('email', email).limit(1)
      existing = data?.[0] || null
    }
    if (!existing && last8) {
      // Match on the last 8 digits so 0405… and +61405… are the same person.
      const { data } = await db.from('contacts')
        .select('id, name, email, phone').eq('company_id', companyId)
        .ilike('phone', `%${last8}%`).limit(20)
      existing = (data || []).find((c: any) =>
        (c.phone || '').replace(/\D/g, '').slice(-8) === last8) || null
    }

    if (existing) {
      contactId = existing.id
      const patch: any = {}
      if (!existing.email && email) patch.email = email
      if (!existing.phone && phone) patch.phone = phone
      if (!existing.name && name) patch.name = name
      if (Object.keys(patch).length) {
        await db.from('contacts').update(patch).eq('id', existing.id)
      }
    } else if (email || phone) {
      const { data: created } = await db.from('contacts').insert({
        company_id: companyId, name, email, phone, source: 'widget',
      }).select('id').maybeSingle()
      contactId = created?.id || null
    }

    // ── Conversation: reuse, or create ──────────────────────────────────────
    let conv: any = null
    let reopened = false

    if (contactId) {
      const { data: prior } = await db.from('conversations')
        .select('id, status').eq('company_id', companyId).eq('contact_id', contactId)
        .order('last_message_at', { ascending: false }).limit(1)
      if (prior?.[0]?.id) {
        const p = prior[0]
        const update: any = {
          status: 'open',
          is_unread: true,
          sms_enabled: !!(phone && smsOptIn),
          page_url: page.url || null,
          page_title: page.title || null,
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        if (phone) update.sms_number = phone
        if (pageHistory.length) update.page_history = pageHistory
        await db.from('conversations').update(update).eq('id', p.id)

        if (['closed', 'resolved'].includes((p.status || '').toLowerCase())) {
          reopened = true
          try {
            await db.from('conversation_events').insert({
              conversation_id: p.id, company_id: companyId,
              event_type: 'status', actor_name: name || 'Customer',
              detail: 'Customer started chatting again — reopened',
            })
          } catch { /* the timeline note is a nicety */ }
        }
        conv = p
      }
    }

    if (!conv) {
      const visitorId = `widget-${Date.now()}-${Math.random().toString(36).slice(2)}`
      const { data: created } = await db.from('conversations').insert({
        company_id: companyId,
        contact_id: contactId,
        channel: 'widget',
        status: 'open',
        subject: name,
        visitor_id: visitorId,
        sms_number: phone,
        sms_enabled: !!(phone && smsOptIn),
        // Only ever the real parent page — inside the iframe the widget's own
        // URL is useless to an agent.
        page_url: page.url || null,
        page_title: page.title || null,
        page_history: pageHistory.length
          ? pageHistory
          : (page.url ? [{ url: page.url, title: page.title || null, ts: new Date().toISOString() }] : []),
        last_message_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).select('id').maybeSingle()
      conv = created
    }

    if (!conv?.id) {
      return NextResponse.json({ error: 'Could not start the chat' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      conversationId: conv.id,
      contactId,
      reopened,
    })
  } catch (e: any) {
    console.error('[widget start] failed', e)
    return NextResponse.json({ error: 'Could not start the chat' }, { status: 500 })
  }
}
