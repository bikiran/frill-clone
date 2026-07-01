import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key)
}

async function sendEmailNotification(adminEmail: string, formTitle: string, responseCount: number) {
  // For now, we'll use a simple logging mechanism
  // In production, integrate with Resend, SendGrid, or similar
  try {
    console.log(`[EMAIL] Form "${formTitle}" received new response. Total: ${responseCount}. Notifying: ${adminEmail}`)
    
    // Optional: Implement actual email sending here
    // await fetch('https://api.resend.com/emails', {
    //   method: 'POST',
    //   headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    //   body: JSON.stringify({
    //     from: 'noreply@colvy.com',
    //     to: adminEmail,
    //     subject: `New response to ${formTitle}`,
    //     html: `<p>Someone responded to your form <strong>${formTitle}</strong>. Total responses: ${responseCount}</p>`
    //   })
    // })
  } catch (error) {
    console.error('Email notification failed:', error)
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

    // Get user (admin) email
    const { data: { user } } = await supabase.auth.admin.getUserById(userId)
    if (!user?.email) return NextResponse.json({ error: 'User email not found' }, { status: 404 })

    // Get response count
    const { count } = await (supabase as any).from('form_responses').select('*', { count: 'exact' }).eq('form_id', formId)

    // Send notification
    await sendEmailNotification(user.email, form.title, count || 0)

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
