import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logJobRun } from '@/lib/job-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

/**
 * GET /api/cron/send-scheduled
 *
 * Delivers scheduled chat replies whose time has come. An agent can compose a
 * reply and pick "Schedule message" from the Send menu; that stores a row in
 * scheduled_messages (status 'pending'). This cron finds due rows and sends each
 * one on the conversation's channel, exactly like the inbox does live:
 *   Instagram / Messenger → /api/meta/send
 *   Email                 → /api/email/reply
 *   SMS                   → /api/telnyx/sms/send
 *   Live chat / widget    → inserted straight into messages
 * Then marks the row 'sent' (or 'failed' with the reason).
 *
 * Runs on a schedule (see vercel.json). Honours CRON_SECRET like the others.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const db = admin()
  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')

  let sent = 0, failed = 0
  try {
    const { data: due } = await db.from('scheduled_messages').select('*')
      .eq('status', 'pending').eq('type', 'message')
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true }).limit(50)

    for (const sm of (due || [])) {
      const content: string = sm.message || ''
      if (!content.trim() || !sm.conversation_id) {
        await db.from('scheduled_messages').update({ status: 'failed' }).eq('id', sm.id)
        failed++; continue
      }
      const { data: conv } = await db.from('conversations').select('*').eq('id', sm.conversation_id).maybeSingle()
      if (!conv) {
        await db.from('scheduled_messages').update({ status: 'failed' }).eq('id', sm.id)
        failed++; continue
      }

      const channel = String(conv.channel || sm.channel || '').toLowerCase()
      let ok = false, err: string | null = null
      try {
        if (channel === 'instagram' || channel === 'facebook') {
          const r = await fetch(`${base}/api/meta/send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ conversationId: conv.id, content, agentName: sm.sender_name || 'Scheduled' }),
          })
          ok = r.ok; if (!ok) err = (await r.json().catch(() => ({})))?.error || `meta send ${r.status}`
        } else if (channel === 'email') {
          let to: string | null = conv.customer_email || null
          if (!to && conv.contact_id) {
            const { data: ct } = await db.from('contacts').select('email').eq('id', conv.contact_id).maybeSingle()
            to = ct?.email || null
          }
          if (!to) { err = 'no email address on this conversation' }
          else {
            const r = await fetch(`${base}/api/email/reply`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ conversationId: conv.id, content, agentName: sm.sender_name || 'Scheduled', to }),
            })
            ok = r.ok; if (!ok) err = (await r.json().catch(() => ({})))?.error || `email ${r.status}`
          }
        } else if (channel === 'sms') {
          let to: string | null = conv.sms_number || null
          if (!to && conv.contact_id) {
            const { data: ct } = await db.from('contacts').select('phone').eq('id', conv.contact_id).maybeSingle()
            to = ct?.phone || null
          }
          if (!to) { err = 'no phone number on this conversation' }
          else {
            const r = await fetch(`${base}/api/telnyx/sms/send`, {
              method: 'POST', headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ companyId: conv.company_id, conversationId: conv.id, to, text: content, senderName: sm.sender_name || 'Scheduled' }),
            })
            ok = r.ok; if (!ok) err = (await r.json().catch(() => ({})))?.error || `sms ${r.status}`
          }
        } else {
          // Live chat / widget: no external hop — record it on the thread. The
          // COLVY_V299 trigger bumps the conversation; the widget picks it up live.
          const { error } = await db.from('messages').insert({
            conversation_id: conv.id, company_id: conv.company_id,
            sender_type: 'agent', sender_name: sm.sender_name || 'Scheduled',
            content, delivery_channel: channel || 'chat',
          })
          ok = !error; if (!ok) err = error?.message || 'insert failed'
        }
      } catch (e: any) {
        err = e?.message || 'send failed'
      }

      await db.from('scheduled_messages').update({ status: ok ? 'sent' : 'failed' }).eq('id', sm.id)
      if (ok) sent++; else { failed++; if (err) console.warn('[send-scheduled]', sm.id, err) }
    }
  } catch (e: any) {
    await logJobRun({ job: 'send-scheduled', startedAt, durationMs: Date.now() - t0, status: 'error', detail: { error: e?.message } })
    return NextResponse.json({ error: e?.message }, { status: 500 })
  }

  await logJobRun({ job: 'send-scheduled', startedAt, durationMs: Date.now() - t0, status: (sent || failed) ? 'success' : 'idle', detail: { sent, failed } })
  return NextResponse.json({ ok: true, sent, failed })
}
