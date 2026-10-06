import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { claimScheduled, deliverScheduled } from '@/lib/scheduled-send'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Scheduled replies on a conversation, for the inbox:
//   GET    ?conversationId=            → the ones still waiting to go
//   PATCH  { id, message?, scheduledFor? } → change the text or the time
//   POST   { id, action: 'send-now' }  → send it straight away
//   DELETE ?id=                        → cancel it
// Only a pending message can be changed; once it's sending or sent, it's final.

async function rowFor(req: NextRequest, db: any, id: string) {
  const { data: row } = await db.from('scheduled_messages').select('*').eq('id', id).maybeSingle()
  if (!row) return { error: NextResponse.json({ error: 'Scheduled message not found' }, { status: 404 }) }
  if (!(await requireCompanyAccess(req, db, row.company_id)).ok) return { error: NextResponse.json({ error: 'Not authorized' }, { status: 403 }) }
  return { row }
}

export async function GET(req: NextRequest) {
  const db = admin()
  const conversationId = req.nextUrl.searchParams.get('conversationId')
  if (!conversationId) return NextResponse.json({ error: 'conversationId required' }, { status: 400 })
  const { data: conv } = await db.from('conversations').select('id, company_id').eq('id', conversationId).maybeSingle()
  if (!conv) return NextResponse.json({ scheduled: [] })
  if (!(await requireCompanyAccess(req, db, conv.company_id)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
  const { data, error } = await db.from('scheduled_messages')
    .select('id, message, scheduled_for, channel, status, created_at')
    .eq('conversation_id', conversationId).eq('type', 'message').in('status', ['pending', 'sending', 'failed'])
    .order('scheduled_for', { ascending: true }).limit(50)
  if (error) return NextResponse.json({ scheduled: [] })
  return NextResponse.json({ scheduled: data || [] }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function PATCH(req: NextRequest) {
  const db = admin()
  const b = await req.json().catch(() => ({}))
  const { row, error } = await rowFor(req, db, String(b.id || ''))
  if (error) return error
  const patch: Record<string, any> = {}
  if (typeof b.message === 'string') {
    if (!b.message.trim()) return NextResponse.json({ error: 'The message can’t be empty.' }, { status: 400 })
    patch.message = b.message.trim()
  }
  if (b.scheduledFor) {
    const when = new Date(b.scheduledFor)
    if (isNaN(when.getTime())) return NextResponse.json({ error: 'Pick a valid date and time.' }, { status: 400 })
    if (when.getTime() < Date.now() + 30_000) return NextResponse.json({ error: 'Pick a time in the future.' }, { status: 400 })
    patch.scheduled_for = when.toISOString()
  }
  if (!Object.keys(patch).length) return NextResponse.json({ ok: true, scheduled: row })
  // A failed one can be edited to try again.
  if (row.status === 'failed') patch.status = 'pending'
  const { data, error: upErr } = await db.from('scheduled_messages').update(patch)
    .eq('id', row.id).in('status', ['pending', 'failed']).select('id, message, scheduled_for, channel, status, created_at').maybeSingle()
  if (upErr) return NextResponse.json({ error: upErr.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'It has already been sent.' }, { status: 409 })
  return NextResponse.json({ ok: true, scheduled: data })
}

export async function POST(req: NextRequest) {
  const db = admin()
  const b = await req.json().catch(() => ({}))
  if (b.action !== 'send-now') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const { row, error } = await rowFor(req, db, String(b.id || ''))
  if (error) return error
  // A failed one can be retried from here.
  if (row.status === 'failed') await db.from('scheduled_messages').update({ status: 'pending' }).eq('id', row.id).eq('status', 'failed')
  const sm = await claimScheduled(db, row.id)
  if (!sm) return NextResponse.json({ error: 'It has already been sent.' }, { status: 409 })
  const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
  const r = await deliverScheduled(db, base, sm)
  await db.from('scheduled_messages').update({ status: r.ok ? 'sent' : 'failed' }).eq('id', sm.id)
  if (!r.ok) return NextResponse.json({ error: r.error || 'Could not send' }, { status: 502 })
  return NextResponse.json({ ok: true })
}

export async function DELETE(req: NextRequest) {
  const db = admin()
  const { row, error } = await rowFor(req, db, String(req.nextUrl.searchParams.get('id') || ''))
  if (error) return error
  const { data } = await db.from('scheduled_messages').update({ status: 'cancelled' })
    .eq('id', row.id).in('status', ['pending', 'failed']).select('id').maybeSingle()
  if (!data) return NextResponse.json({ error: 'It has already been sent.' }, { status: 409 })
  return NextResponse.json({ ok: true })
}
