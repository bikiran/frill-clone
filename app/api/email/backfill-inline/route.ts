import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getGmailToken, applyInlineImages } from '@/lib/gmail'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/email/backfill-inline  { companyId, limit? }
 *
 * One-off (idempotent) repair for emails ingested before inline (cid:) images
 * were materialised: finds stored messages whose email_html still references a
 * cid:, re-fetches each from Gmail via its channel token, uploads the inline
 * bytes to storage, and rewrites email_html + email_attachments. Safe to re-run
 * — once fixed, a message no longer matches. Process in bounded batches (`limit`)
 * and call again until `remaining` is 0.
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, limit } = await req.json().catch(() => ({}))
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()

    // Gmail channels for this company → an auth header each (a message id belongs
    // to one mailbox, so we try each channel until one returns the message).
    const { data: channels } = await db.from('email_channels').select('*').eq('company_id', companyId).eq('provider', 'gmail')
    const auths: Record<string, string>[] = []
    for (const ch of (channels || [])) {
      const token = await getGmailToken(ch)
      if (token) auths.push({ Authorization: `Bearer ${token}` })
    }
    if (!auths.length) return NextResponse.json({ error: 'No connected Gmail channel to fetch from' }, { status: 400 })

    const batch = Math.max(1, Math.min(Number(limit) || 50, 200))
    const { data: rows } = await db.from('messages')
      .select('id, gmail_message_id, email_html, email_attachments')
      .eq('company_id', companyId)
      .not('gmail_message_id', 'is', null)
      .ilike('email_html', '%cid:%')
      .limit(batch)

    let scanned = 0, fixed = 0, images = 0, unresolved = 0
    for (const row of (rows || [])) {
      scanned++
      // Re-fetch the full Gmail message from whichever channel owns it.
      let payload: any = null, usedAuth: Record<string, string> | null = null
      for (const auth of auths) {
        try {
          const res = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${row.gmail_message_id}?format=full`, { headers: auth })
          if (res.ok) { payload = (await res.json())?.payload; usedAuth = auth; break }
        } catch {}
      }
      if (!payload || !usedAuth) { unresolved++; continue }

      const attachments = Array.isArray(row.email_attachments) ? [...row.email_attachments] : []
      const { html, changed } = await applyInlineImages(db, row.gmail_message_id, payload, usedAuth, companyId, row.email_html || '', attachments)
      if (changed > 0 && html !== row.email_html) {
        await db.from('messages').update({ email_html: html, email_attachments: attachments }).eq('id', row.id)
        fixed++; images += changed
      }
    }

    // How many still carry a cid: after this batch (so the caller knows to re-run).
    const { count: remaining } = await db.from('messages')
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).not('gmail_message_id', 'is', null).ilike('email_html', '%cid:%')

    return NextResponse.json({ ok: true, scanned, fixed, images, unresolved, remaining: remaining ?? null })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
