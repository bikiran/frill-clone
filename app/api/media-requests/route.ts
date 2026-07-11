import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function genToken() {
  return Array.from({ length: 3 }, () => Math.random().toString(36).slice(2, 10)).join('')
}

// POST: create a media request and post the link into the conversation.
export async function POST(req: NextRequest) {
  try {
    const { companyId, conversationId, contactId, prompt, accept, maxFiles, expiryHours, createdBy } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()

    const token = genToken()
    const expires_at = expiryHours && Number(expiryHours) > 0 ? new Date(Date.now() + Number(expiryHours) * 3600 * 1000).toISOString() : null
    const { data: request, error } = await db.from('media_requests').insert({
      token, company_id: companyId, conversation_id: conversationId || null, contact_id: contactId || null,
      prompt: prompt || 'Please upload the requested files.',
      accept: Array.isArray(accept) && accept.length ? accept : ['image', 'video', 'pdf'],
      max_files: maxFiles || 10, expires_at, created_by: createdBy || null,
    }).select().maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    // Build the upload link on the company's own subdomain (e.g.
    // roxyaquarium.colvy.com/u/<token>) so it feels like the business's own site.
    // Falls back to the base Colvy domain if no slug or not a colvy.com host.
    const baseUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com'
    let link = `${baseUrl}/u/${token}`
    try {
      const { data: company } = await db.from('companies').select('slug').eq('id', companyId).maybeSingle()
      const u = new URL(baseUrl)
      if (company?.slug && u.hostname.endsWith('colvy.com')) {
        link = `${u.protocol}//${company.slug}.colvy.com/u/${token}`
      }
    } catch {}

    // Post the request into the conversation as an agent message.
    if (conversationId) {
      const acceptLabel = (request.accept || []).join(', ')
      await db.from('messages').insert({
        conversation_id: conversationId, company_id: companyId,
        sender_type: 'agent', sender_name: createdBy || 'Support',
        content: `📎 ${request.prompt}\nUpload here (private, full quality): ${link}`,
        message_type: 'media_request',
        message_payload: { kind: 'media_request', token, prompt: request.prompt, accept: request.accept, max_files: request.max_files, expires_at, link },
      })
      await db.from('conversations').update({ last_message: 'Requested media upload', last_message_at: new Date().toISOString() }).eq('id', conversationId)
    }

    return NextResponse.json({ ok: true, token, link })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// GET ?token=  → request details for the public upload page.
export async function GET(req: NextRequest) {
  try {
    const token = req.nextUrl.searchParams.get('token')
    if (!token) return NextResponse.json({ error: 'Missing token' }, { status: 400 })
    const db = admin()
    const { data: request } = await db.from('media_requests').select('*').eq('token', token).maybeSingle()
    if (!request) return NextResponse.json({ error: 'not_found' }, { status: 404 })

    // Expiry / status checks
    let status = request.status
    if (status === 'open' && request.expires_at && new Date(request.expires_at).getTime() < Date.now()) status = 'expired'

    const { data: company } = await db.from('companies').select('name, logo_url, accent_color').eq('id', request.company_id).maybeSingle()
    const { data: files } = await db.from('media_request_files').select('*').eq('request_id', request.id).order('created_at', { ascending: true })

    return NextResponse.json({
      request: { token: request.token, prompt: request.prompt, accept: request.accept, max_files: request.max_files, expires_at: request.expires_at, status },
      company: company || {},
      files: files || [],
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
