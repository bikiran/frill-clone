import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const uuidOrNull = (v: any): string | null =>
  (typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) ? v : null

/**
 * POST /api/notify/members
 *
 * Notify SPECIFIC team members across every channel at once — the in-app bell,
 * email, and SMS. Used when a task is assigned or someone is @mentioned, so
 * being tagged actually reaches the person instead of only appearing in an app
 * they may not have open.
 *
 * (The sibling /api/notify posts a company-wide activity notification; this one
 * targets named people and adds email + SMS.)
 *
 * Body:
 *   companyId  – required
 *   userIds    – auth user ids to notify (exclude the actor before calling)
 *   title      – short headline, e.g. "Bikiran assigned you a task"
 *   body       – the detail (task title, comment text)
 *   link       – in-app path, e.g. /admin/tasks
 *   type       – stored on the notification row
 *   channels   – optional subset of ['in_app','email','sms']; defaults to all
 *
 * Every channel is best-effort and reported separately, so a missing Resend key
 * or an unset mobile can never stop the others.
 */
export async function POST(req: NextRequest) {
  try {
    const b = await req.json()
    const companyId = b.companyId
    const ids: string[] = Array.from(new Set((b.userIds || []).filter(uuidOrNull))) as string[]
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    if (ids.length === 0) return NextResponse.json({ ok: true, notified: 0 })

    const db = admin()
    const title: string = b.title || 'Colvy update'
    const body: string = b.body || ''
    const link: string = b.link || '/admin'
    const type: string = b.type || 'mention'
    const channels: string[] = Array.isArray(b.channels) ? b.channels : ['in_app', 'email', 'sms']

    const result = { in_app: 0, email: 0, sms: 0, errors: [] as string[] }

    // ── In-app ───────────────────────────────────────────────────────────────
    if (channels.includes('in_app')) {
      try {
        const rows = ids.map(uid => ({
          company_id: companyId, user_id: uid, type,
          title, body: body.slice(0, 300), link, is_read: false,
        }))
        const { error } = await db.from('notifications').insert(rows)
        if (error) result.errors.push(`in_app: ${error.message}`)
        else result.in_app = rows.length
      } catch (e: any) { result.errors.push(`in_app: ${e.message}`) }
    }

    // Email and SMS both need the members' contact details.
    const { data: members } = await db.from('team_members')
      .select('user_id, email, phone').eq('company_id', companyId).in('user_id', ids)

    const { data: company } = await db.from('companies')
      .select('name, slug').eq('id', companyId).maybeSingle()

    // Link to the company's own subdomain — the team recognises that; a bare
    // colvy.com link looks like it came from somewhere else.
    const siteBase = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
    let base = siteBase
    try {
      const u = new URL(siteBase)
      if (company?.slug && u.hostname.endsWith('colvy.com')) {
        base = `${u.protocol}//${company.slug}.colvy.com`
      }
    } catch { /* keep the default */ }
    const fullLink = link.startsWith('http') ? link : `${base}${link}`

    // ── Email ────────────────────────────────────────────────────────────────
    if (channels.includes('email')) {
      const to = (members || []).map((m: any) => m.email).filter(Boolean)
      if (!process.env.RESEND_API_KEY) {
        result.errors.push('email: RESEND_API_KEY is not set')
      } else if (to.length === 0) {
        result.errors.push('email: no addresses on those team members')
      } else {
        try {
          const { data: ec } = await db.from('email_channels')
            .select('from_address, inbound_address')
            .eq('company_id', companyId).eq('is_active', true).limit(1)
          const from = ec?.[0]?.from_address || ec?.[0]?.inbound_address || 'notifications@updates.colvy.com'
          const fromName = company?.name || 'Colvy'

          const res = await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
              from: `${fromName} <${from}>`,
              to,
              subject: title,
              text: [body, '', `Open it here: ${fullLink}`].filter(Boolean).join('\n'),
            }),
          })
          if (res.ok) result.email = to.length
          else result.errors.push(`email: ${(await res.text()).slice(0, 200)}`)
        } catch (e: any) { result.errors.push(`email: ${e.message}`) }
      }
    }

    // ── SMS ──────────────────────────────────────────────────────────────────
    if (channels.includes('sms')) {
      const withPhone = (members || []).filter((m: any) => m.phone)
      if (withPhone.length === 0) {
        result.errors.push('sms: no mobile numbers set on those team members')
      }
      for (const m of withPhone) {
        try {
          const text = [title, body].filter(Boolean).join('\n').slice(0, 300)
          const res = await fetch(`${siteBase}/api/telnyx/sms/send`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ companyId, to: m.phone, text, skipChatMessage: true }),
          })
          if (res.ok) result.sms++
          else result.errors.push(`sms ${m.phone}: ${(await res.text()).slice(0, 160)}`)
        } catch (e: any) { result.errors.push(`sms ${m.phone}: ${e.message}`) }
      }
    }

    return NextResponse.json({ ok: true, notified: ids.length, ...result })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
