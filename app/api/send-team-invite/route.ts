import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const { email, companyName, role, inviteLink, inviterName } = await req.json()

    if (!email) return NextResponse.json({ error: 'Email required' }, { status: 400 })

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
          subject: `Join ${companyName}'s feedback board on Colvy`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="padding: 24px; background: linear-gradient(135deg, #ff7a6b 0%, #ff8f7b 100%); border-radius: 12px 12px 0 0;">
                <h1 style="margin: 0; color: white; font-size: 24px;">You're invited! 🎉</h1>
              </div>
              
              <div style="background: white; border: 1px solid #f0f0f0; border-radius: 0 0 12px 12px; padding: 32px;">
                <p style="margin: 0 0 16px 0; color: #1a1a1a; font-size: 16px;">
                  Hi there,
                </p>
                
                <p style="margin: 0 0 16px 0; color: #6b6b70; line-height: 1.6;">
                  ${inviterName} has invited you to join <strong>${companyName}</strong>'s feedback board on Colvy. 
                </p>
                
                <div style="background: #f8f8f8; padding: 16px; border-radius: 8px; margin: 20px 0;">
                  <p style="margin: 0 0 8px 0; color: #6b6b70; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Your Role</p>
                  <p style="margin: 0; font-size: 16px; font-weight: 600; color: #1a1a1a;">
                    ${role === 'viewer' ? '👁️ Viewer (Read-only)' : role === 'editor' ? '✏️ Editor (Can edit)' : '👑 Admin (Full access)'}
                  </p>
                </div>
                
                <div style="text-align: center; margin: 28px 0;">
                  <a href="${inviteLink}" style="display: inline-block; padding: 14px 32px; background: #ff7a6b; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 16px;">
                    Accept Invitation
                  </a>
                </div>
                
                <p style="margin: 24px 0 0 0; padding-top: 24px; border-top: 1px solid #f0f0f0; color: #9ca3af; font-size: 12px;">
                  This invitation was sent to ${email}. If you didn't expect this, you can ignore this email.
                </p>
              </div>
            </div>
          `,
        }),
      })

      if (!response.ok) {
        console.error('Resend API error:', await response.text())
        return NextResponse.json({ ok: true, warning: 'Invitation sent but email delivery may have failed' })
      }

      return NextResponse.json({ ok: true, message: 'Invitation email sent successfully' })
    }

    // Fallback: just log if no Resend API key
    console.log(`[TEAM INVITE] Email invitation sent to ${email} for ${companyName}`)
    return NextResponse.json({ ok: true, message: 'Invitation recorded' })
  } catch (e: any) {
    console.error('Send team invite error:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
