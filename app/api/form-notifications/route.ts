import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key)
}

async function sendEmailNotification(adminEmail: string, formTitle: string, responseCount: number, companyName: string) {
  try {
    // Try to send via Resend if API key is available
    if (process.env.RESEND_API_KEY) {
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'notifications@colvy.com',
          to: adminEmail,
          subject: `New response to "${formTitle}" • ${companyName}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="padding: 24px; background: #f8f8f8; border-radius: 12px; margin-bottom: 20px;">
                <h2 style="margin: 0 0 8px 0; color: #0d0d0d; font-size: 20px;">New Form Response</h2>
                <p style="margin: 0; color: #6b7280; font-size: 14px;">Someone just responded to your form</p>
              </div>
              
              <div style="background: white; border: 1px solid #f0f0f0; border-radius: 12px; padding: 24px; margin-bottom: 20px;">
                <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Form Name</p>
                <h3 style="margin: 0 0 16px 0; color: #0d0d0d; font-size: 18px;">${formTitle}</h3>
                
                <p style="margin: 0 0 12px 0; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em;">Total Responses</p>
                <p style="margin: 0 0 24px 0; color: #ff7a6b; font-size: 28px; font-weight: 700;">${responseCount}</p>
              </div>
              
              <div style="text-align: center;">
                <a href="https://colvy.com/admin/forms" style="display: inline-block; padding: 12px 28px; background: #ff7a6b; color: white; text-decoration: none; border-radius: 10px; font-weight: 600; font-size: 14px;">
                  View Responses
                </a>
              </div>
              
              <p style="margin-top: 24px; text-align: center; color: #9ca3af; font-size: 12px;">
                You received this email because you're the admin of this form on Colvy
              </p>
            </div>
          `,
        }),
      })

      if (!response.ok) {
        console.error('Resend API error:', await response.text())
      } else {
        console.log(`[EMAIL SENT] Form response notification sent to ${adminEmail}`)
        return true
      }
    }

    // Fallback logging
    console.log(`[EMAIL] Form "${formTitle}" received new response. Total: ${responseCount}. Notifying: ${adminEmail}`)
    return false
  } catch (error) {
    console.error('Email notification failed:', error)
    return false
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getDb()
    const { formId, userId } = await req.json()
    
    if (!formId || !userId) {
      return NextResponse.json({ error: 'formId and userId required' }, { status: 400 })
    }

    // Get form details
    const { data: form } = await (supabase as any).from('forms').select('*').eq('id', formId).single()
    if (!form) return NextResponse.json({ error: 'Form not found' }, { status: 404 })

    // Get company info
    const { data: company } = await (supabase as any).from('companies').select('*').eq('id', form.company_id).single()
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    // Get user (admin) email
    const { data: { user } } = await supabase.auth.admin.getUserById(userId)
    if (!user?.email) return NextResponse.json({ error: 'User email not found' }, { status: 404 })

    // Get response count
    const { count } = await (supabase as any).from('form_responses').select('*', { count: 'exact' }).eq('form_id', formId)

    // Send notification
    await sendEmailNotification(user.email, form.title, count || 0, company.name)

    // Store notification record (optional, for analytics)
    try {
      await (supabase as any).from('form_notifications').insert({
        form_id: formId,
        user_id: userId,
        type: 'new_response',
        sent_at: new Date().toISOString(),
      })
    } catch (error) {
      // Table might not exist yet
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
