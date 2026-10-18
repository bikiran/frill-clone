import { createClient } from '@supabase/supabase-js'
import { memberOr403 } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { teamInviteEmail } from '@/lib/colvy-account-emails'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { email, companyId } = body
    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })
    // Members only. This sent any words and any link from invites@updates.colvy.com
    // to anyone, so the business name now comes from the database, the link must
    // be a Colvy join link, and everything shown is escaped.
    { const deny = await memberOr403(req, companyId); if (deny) return deny }
    const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { autoRefreshToken: false, persistSession: false } }) as any
    const { data: co } = await db.from('companies').select('name').eq('id', companyId).maybeSingle()
    const companyName = String(co?.name || 'the team')
    const inviterName = String(body.inviterName || 'A teammate').slice(0, 80)
    const role = ['viewer', 'editor', 'admin'].includes(body.role) ? body.role : 'editor'
    let inviteLink = ''
    try {
      const u = new URL(String(body.inviteLink || ''))
      const okHost = u.hostname === 'colvy.com' || u.hostname.endsWith('.colvy.com') || u.hostname === 'localhost'
      if (okHost && u.pathname === '/team/join') inviteLink = u.toString()
    } catch {}
    if (!inviteLink) return NextResponse.json({ error: 'Invalid invite link' }, { status: 400 })

    // The words are in lib/colvy-account-emails; it escapes everything shown.
    const mail = teamInviteEmail({ companyName, inviterName, role, inviteLink, email: String(email) })

    // Send via Resend if API key available
    if (process.env.RESEND_API_KEY) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Colvy <invites@updates.colvy.com>',
          to: email,
          subject: mail.subject,
          html: mail.html,
          text: mail.text,
        }),
      })

      if (!response.ok) {
        const detail = await response.text()
        console.error('Resend API error:', detail)
        // Honest status: the row was created but the email did NOT go out, so the
        // caller can fall back to sharing the invite link directly instead of
        // telling the inviter "sent" when nothing was delivered.
        return NextResponse.json({ ok: true, emailed: false, warning: 'The invite was created but the email could not be delivered. Share the invite link directly.' })
      }

      return NextResponse.json({ ok: true, emailed: true, message: 'Invitation email sent successfully' })
    }

    // No email provider configured — the invite row still exists, but nothing was
    // emailed. Say so, so the UI can offer the link instead of a false "sent".
    console.warn(`[TEAM INVITE] RESEND_API_KEY not set — no email sent to ${email}. Share the invite link directly.`)
    return NextResponse.json({ ok: true, emailed: false, warning: 'Email isn’t configured on the server, so no email was sent. Share the invite link directly.' })
  } catch (e: any) {
    console.error('Send team invite error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
