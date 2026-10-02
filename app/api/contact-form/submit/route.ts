import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// POST { formId, data } — a public contact-form submission. Files it as an Inbox
// conversation (channel 'form') so it shows up like any other enquiry, and
// records the raw submission.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const formId = String(body.formId || '')
    const data: Record<string, string> = body.data || {}
    if (!formId) return NextResponse.json({ error: 'Missing form' }, { status: 400 })

    const db = admin()
    const { data: form } = await db.from('contact_forms').select('*').eq('id', formId).maybeSingle()
    if (!form || form.is_active === false) return NextResponse.json({ error: 'Form unavailable' }, { status: 404 })
    const companyId = form.company_id

    // Pull the well-known fields out of the submission by common keys/types.
    const fields: any[] = form.fields || []
    const pick = (...keys: string[]) => {
      for (const k of keys) if (data[k]?.trim()) return data[k].trim()
      return ''
    }
    const byType = (t: string) => { const f = fields.find(f => f.type === t); return f ? (data[f.key] || '').trim() : '' }
    const name = pick('name', 'full_name', 'your_name') || byType('text') || 'Website visitor'
    const email = pick('email', 'your_email') || byType('email')
    const phone = pick('phone', 'mobile', 'mobile_number', 'phone_number') || byType('tel')
    const message = pick('message', 'enquiry', 'comments') || byType('textarea')

    // A readable transcript of everything submitted.
    const lines = fields.map(f => `${f.label}: ${data[f.key] || '—'}`)
    const content = lines.join('\n')
    const subject = `New ${form.name || 'contact form'} submission`

    // Find or create the contact (by email, else phone).
    let contactId: string | null = null
    try {
      if (email) {
        const { data: ex } = await db.from('contacts').select('id').eq('company_id', companyId).ilike('email', email).limit(1)
        contactId = ex?.[0]?.id || null
      }
      if (!contactId) {
        const { data: created } = await db.from('contacts').insert({
          company_id: companyId, name, email: email || null, phone: phone || null,
        }).select('id').maybeSingle()
        contactId = created?.id || null
      }
    } catch {}

    // Create the conversation + first message.
    let conversationId: string | null = null
    try {
      const { data: conv } = await db.from('conversations').insert({
        company_id: companyId, channel: 'form', subject,
        assigned_location_id: form.location_id || null,
        contact_id: contactId, status: 'open',
        is_unread: true, unread_count: 1,
        last_message: content.slice(0, 200), last_message_at: new Date().toISOString(),
      }).select('id').maybeSingle()
      conversationId = conv?.id || null
      if (conversationId) {
        await db.from('messages').insert({
          conversation_id: conversationId, company_id: companyId,
          sender_type: 'visitor', sender_name: name, sender_email: email || null,
          content,
        })
      }
    } catch (e: any) {
      // Even if inbox wiring fails, keep the submission below.
      console.error('[contact-form] inbox create failed', e?.message || e)
    }

    // Record the raw submission.
    try {
      await db.from('contact_form_submissions').insert({
        form_id: formId, company_id: companyId, data, contact_id: contactId, conversation_id: conversationId,
      })
    } catch {}

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
