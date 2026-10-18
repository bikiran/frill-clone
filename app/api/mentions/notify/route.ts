import { requireCompanyAccess, staffUserIds } from '@/lib/company-access'
import { internalHeaders } from '@/lib/internal-call'
import { NextRequest, NextResponse } from 'next/server'
import { mentionEmail } from '@/lib/colvy-account-emails'
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
    const { companyId, conversationId, userIds: asked, mentionedBy, preview, context } =
      await req.json()

    if (!companyId || !Array.isArray(asked) || asked.length === 0) {
      return NextResponse.json({ ok: true, sent: 0, skipped: 'nothing to send' })
    }
    const db = admin()
    // Workspace members only.
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    // ...and only this workspace's staff and owner are told: never a board
    // visitor, nor any other account id passed in.
    const staff = await staffUserIds(db, companyId)
    const userIds: string[] = Array.from(new Set(asked.filter((id: unknown) => typeof id === 'string' && staff.has(id))))
    if (userIds.length === 0) return NextResponse.json({ ok: true, sent: 0, skipped: 'nobody on the team to tell' })

    // Resolve the mentioned users' email addresses and the company details.
    const { data: members } = await db
      .from('team_members')
      .select('user_id, email, phone')     // team_members has no name column — derive it from email
      .eq('company_id', companyId)
      .in('user_id', userIds)

    const { data: company } = await db
      .from('companies').select('name, slug, owner_id').eq('id', companyId).maybeSingle()

    const recipients: any[] = (members || []).filter((m: any) => m.email)
      .map((m: any) => ({ ...m, name: String(m.email).split('@')[0] }))

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
        headers: internalHeaders({ 'Content-Type': 'application/json' }),
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
    // Plain text: the email escapes it itself, and a text message shows it as is
    // (it used to carry &amp; and &lt; into the SMS).
    const snippet = String(preview || '').slice(0, 300)

    // ── In-app notification (the bell) ───────────────────────────────────────
    // Written for EVERY mentioned user, including any we couldn't find an email
    // for, so the mention is never silently lost.
    try {
      await db.from('notifications').insert(
        userIds.map((uid: string) => ({
          user_id: uid,
          company_id: companyId,
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
          const text = `${mentionedBy || 'A teammate'} mentioned you in ${where}${snippet ? `: ${snippet.slice(0, 120)}` : ''}\n${link}`
          const r = await fetch(`${siteBase}/api/telnyx/sms/send`, {
            method: 'POST', headers: internalHeaders({ 'Content-Type': 'application/json' }),
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
        // Raw values in: the layout (lib/colvy-email) escapes everything shown.
        const mail = mentionEmail({
          name: m.name || 'there', mentionedBy, where, companyName, preview: snippet, link,
        })
        const res = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: 'Colvy <notifications@updates.colvy.com>',
            to: m.email,
            subject: mail.subject,
            html: mail.html,
            text: mail.text,
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
