import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * POST /api/mentions/notify
 *
 * Emails the team members named in an @mention. Called after the mention rows
 * are written, and deliberately fail-soft: the in-app notification is already
 * recorded, so an email problem must never surface as a failed action.
 *
 * Body: { companyId, conversationId, userIds: string[], mentionedBy, preview, context? }
 */
export async function POST(req: NextRequest) {
  try {
    const { companyId, conversationId, userIds, mentionedBy, preview, context } =
      await req.json()

    if (!companyId || !Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, skipped: 'nothing to send' })
    }
    const db = admin()

    // Resolve the mentioned users' email addresses and the company details.
    const { data: members } = await db
      .from('team_members')
      .select('user_id, name, email, phone')
      .eq('company_id', companyId)
      .in('user_id', userIds)

    const { data: company } = await db
      .from('companies').select('name, slug, owner_id').eq('id', companyId).maybeSingle()

    const recipients: any[] = (members || []).filter((m: any) => m.email)

    // The company OWNER is mentionable but usually has no team_members row, so
    // the lookup above misses them entirely. Fall back to their auth record.
    const missing = userIds.filter((id: string) => !recipients.some(r => r.user_id === id))
    for (const uid of missing) {
      try {
        const { data: u } = await db.auth.admin.getUserById(uid)
        const email = u?.user?.email
        if (email) {
          recipients.push({
            user_id: uid,
            email,
            name: u?.user?.user_metadata?.display_name || email.split('@')[0],
          })
        }
      } catch { /* can't resolve this one — skip */ }
    }

    const companyName = company?.name || 'your team'

    // Push the mention to the named people's phones. Fire-and-forget for the
    // same reason the email is: the in-app notification is already written, so
    // a push failure must never surface as a failed action.
    try {
      const origin = req.nextUrl.origin
      fetch(`${origin}/api/push/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyId,
          userIds,
          title: `${mentionedBy || 'Someone'} mentioned you`,
          body: preview || context || 'You were mentioned in a conversation.',
          conversationId: conversationId || null,
        }),
      }).catch(() => {})
    } catch {}

    const base = company?.slug ? `https://${company.slug}.colvy.com` : 'https://colvy.com'
    const link = conversationId
      ? `${base}/admin/inbox?conversation=${conversationId}`
      : `${base}/admin/inbox`
    const where = context || 'a conversation'
    const safe = String(preview || '').slice(0, 300)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

    // ── In-app notification (the bell) ───────────────────────────────────────
    // Written for EVERY mentioned user, including any we couldn't find an email
    // for, so the mention is never silently lost.
    try {
      await db.from('notifications').insert(
        userIds.map((uid: string) => ({
          user_id: uid,
          type: 'mention',
          message: `${mentionedBy || 'A teammate'} mentioned you in ${where}`,
          actor_name: mentionedBy || null,
          conversation_id: conversationId || null,
          is_read: false,
        }))
      )
    } catch { /* the email below is still worth attempting */ }

    // Text them too. A mention is time-sensitive, and email alone is easy to
    // miss. Runs before the email guards below so a missing Resend key can't
    // stop the SMS going out.
    let smsSent = 0
    try {
      const siteBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
      const withPhone = (members || []).filter((m: any) => m.phone)
      for (const m of withPhone) {
        try {
          const text = `${mentionedBy || 'A teammate'} mentioned you in ${where}${safe ? `: ${String(safe).slice(0, 120)}` : ''}\n${link}`
          const r = await fetch(`${siteBase}/api/telnyx/sms/send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId, to: m.phone, text, skipChatMessage: true }),
          })
          if (r.ok) smsSent++
        } catch { /* keep going */ }
      }
    } catch { /* SMS is best-effort */ }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ ok: true, sent: 0, sms: smsSent, inApp: userIds.length, skipped: 'no RESEND_API_KEY' })
    }
    if (recipients.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, sms: smsSent, inApp: userIds.length, skipped: 'no addresses' })
    }

    let sent = 0
    for (const m of recipients) {
      try {
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Colvy <notifications@updates.colvy.com>',
            to: m.email,
            subject: `${mentionedBy || 'Someone'} mentioned you in ${where}`,
            html: `
              <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto">
                <div style="padding:20px 24px;background:linear-gradient(135deg,#ff7a6b 0%,#ff8f7b 100%);border-radius:12px 12px 0 0">
                  <h1 style="margin:0;color:#fff;font-size:19px">You were mentioned</h1>
                </div>
                <div style="background:#fff;border:1px solid #f0f0f0;border-top:none;border-radius:0 0 12px 12px;padding:24px">
                  <p style="margin:0 0 14px;color:#1a1a1a;font-size:15px">
                    Hi ${m.name || 'there'},
                  </p>
                  <p style="margin:0 0 16px;color:#1a1a1a;font-size:15px">
                    <strong>${mentionedBy || 'A teammate'}</strong> mentioned you in ${where} at ${companyName}.
                  </p>
                  ${safe ? `<div style="margin:0 0 18px;padding:12px 14px;background:#fffbeb;border:1px dashed #f59e0b;border-radius:10px;color:#78350f;font-size:14px;font-style:italic">${safe}</div>` : ''}
                  <a href="${link}" style="display:inline-block;padding:10px 18px;background:#ff7a6b;color:#fff;text-decoration:none;border-radius:8px;font-size:14px;font-weight:600">
                    Open in Colvy
                  </a>
                  <p style="margin:18px 0 0;color:#6b7280;font-size:12px">
                    You're receiving this because you were @mentioned by a teammate.
                  </p>
                </div>
              </div>`,
          }),
        })
        if (res.ok) sent++
      } catch { /* skip this recipient, keep going */ }
    }

    return NextResponse.json({ ok: true, sent, sms: smsSent })
  } catch (e: any) {
    // Never fail the caller — the in-app notification already exists.
    return NextResponse.json({ ok: false, error: e.message }, { status: 200 })
  }
}
