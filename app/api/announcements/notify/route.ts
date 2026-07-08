import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// Notifies subscribers about a newly published announcement:
// 1. In-app notification row for any subscriber who is also a registered user
// 2. Email via Resend to every subscribed contact with an email address
export async function POST(req: NextRequest) {
  try {
    const { announcementId, companyId } = await req.json()
    if (!announcementId || !companyId) {
      return NextResponse.json({ error: 'Missing announcementId or companyId' }, { status: 400 })
    }

    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: announcement } = await admin.from('announcements').select('*').eq('id', announcementId).maybeSingle()
    if (!announcement) return NextResponse.json({ error: 'Announcement not found' }, { status: 404 })

    const { data: company } = await admin.from('companies').select('name, slug, logo_url, accent_color').eq('id', companyId).maybeSingle()
    const companyName = company?.name || 'Colvy'
    const boardUrl = company?.slug ? `https://${company.slug}.colvy.com` : 'https://colvy.com'
    const accent = company?.accent_color || '#ff7a6b'

    // Subscribers: contacts with marketing opt-in + an email address
    const { data: contacts } = await admin
      .from('contacts')
      .select('id, name, email')
      .eq('company_id', companyId)
      .eq('subscribed_to_marketing', true)
      .not('email', 'is', null)
      .limit(2000)

    const subscribers = (contacts || []).filter(c => c.email)

    // 1. In-app notifications for subscribers who are also registered auth users
    //    (matched by email against team_members, since contacts aren't auth users)
    let inAppCount = 0
    try {
      const emails = subscribers.map(s => s.email)
      if (emails.length > 0) {
        const { data: members } = await admin.from('team_members').select('user_id, email').in('email', emails)
        for (const m of members || []) {
          if (!m.user_id) continue
          await admin.from('notifications').insert({
            user_id: m.user_id,
            type: 'announcement',
            related_idea_id: null,
            message: `New update: "${announcement.title}"`,
            actor_name: companyName,
            is_read: false,
          })
          inAppCount++
        }
      }
    } catch (e) {
      console.warn('In-app notification insert failed (non-blocking):', e)
    }

    // 2. Email every subscribed contact via Resend
    let emailCount = 0
    const RESEND_KEY = process.env.RESEND_API_KEY
    if (RESEND_KEY && subscribers.length > 0) {
      const plainDescription = (announcement.description || '').replace(/<[^>]+>/g, '').slice(0, 300)
      // Resend batch endpoint sends up to 100 per call — chunk if needed
      const chunks: typeof subscribers[] = []
      for (let i = 0; i < subscribers.length; i += 90) chunks.push(subscribers.slice(i, i + 90))

      for (const chunk of chunks) {
        const emails = chunk.map(c => ({
          from: `${companyName} <noreply@colvy.com>`,
          to: [c.email],
          subject: `${companyName}: ${announcement.title}`,
          html: `
            <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;padding:40px 24px">
              <p style="font-size:13px;font-weight:700;color:${accent};text-transform:uppercase;letter-spacing:1px;margin:0 0 8px">${announcement.tag || 'Update'}</p>
              <h1 style="font-size:26px;font-weight:800;color:#0d0d0d;margin:0 0 16px">${announcement.title}</h1>
              <p style="font-size:15px;color:#4b5563;line-height:1.6;margin:0 0 28px">${plainDescription}${plainDescription.length >= 300 ? '…' : ''}</p>
              <a href="${boardUrl}/announcements" style="display:inline-block;background:${accent};color:#fff;padding:13px 28px;border-radius:12px;font-weight:700;font-size:14px;text-decoration:none">
                Read full update →
              </a>
              <hr style="border:none;border-top:1px solid #f0f0f0;margin:36px 0 16px">
              <p style="font-size:12px;color:#9ca3af;margin:0">
                You're receiving this because you subscribed to updates from ${companyName}.
              </p>
            </div>
          `,
        }))

        try {
          const res = await fetch('https://api.resend.com/emails/batch', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify(emails),
          })
          if (res.ok) emailCount += chunk.length
          else console.error('Resend batch error:', await res.text())
        } catch (e) {
          console.error('Resend batch send failed:', e)
        }
      }
    }

    await admin.from('announcements').update({ notified_at: new Date().toISOString() }).eq('id', announcementId)

    return NextResponse.json({ ok: true, inAppCount, emailCount, totalSubscribers: subscribers.length })
  } catch (err: any) {
    console.error('announcement notify error:', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
