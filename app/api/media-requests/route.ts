import { isInternalCall } from '@/lib/internal-call'
import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { resolveSmsSender } from '@/lib/sms-provider'
import { companyFlagEnabled } from '@/lib/feature-flags'
import { shortenUrl } from '@/lib/short-link'
import { recordLinkClick } from '@/lib/link-click'

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
    const { companyId, conversationId, contactId, prompt, accept, maxFiles, expiryHours, createdBy, deliveryChannel } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'Missing companyId' }, { status: 400 })
    const db = admin()
    // Workspace members only.
    if (!isInternalCall(req) && !(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

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

    // Tracked short link, so the inbox card shows when (and on what device)
    // the customer opened the upload page. Falls back to the plain link.
    try {
      const short = await shortenUrl(link, { companyId, conversationId: conversationId || undefined, kind: 'upload' })
      if (short) link = short
      const code = short && short.split('/l/')[1]
      if (code) await db.from('short_links').update({ link_type: 'upload', contact_id: contactId || null, conversation_id: conversationId || null }).eq('code', code)
    } catch {}

    const smsText = `${request.prompt}\nUpload here (private, full quality): ${link}`

    // Did this route text the link itself? Callers use it to avoid sending it a
    // second time, and the thread card is labelled from it.
    let texted = false

    if (conversationId) {
      // Actually deliver the link to the customer over SMS. Previously we only
      // inserted the message row, so it showed in the agent's thread but the
      // customer never received it — the agent had to copy the link and text it
      // by hand. Send it for real over whichever provider owns the number.
      try {
        const { data: conv } = await db.from('conversations')
          .select('sms_number, sms_enabled, contact_id').eq('id', conversationId).maybeSingle()
        // Recipient: the conversation's SMS number if set, else fall back to the
        // linked contact's phone. Previously only sms_number was used, so a
        // request on a call/mixed thread (no sms_number) recorded the message
        // but never actually texted the customer — the agent had to resend by
        // hand. Prefer the request's own contact, then the conversation's.
        let to: string | null = conv?.sms_number || null
        if (!to) {
          const cid = contactId || conv?.contact_id
          if (cid) {
            const { data: c } = await db.from('contacts').select('phone').eq('id', cid).maybeSingle()
            to = c?.phone || null
          }
        }
        // Per-company operational flag (default ON): skip texting the link when
        // media-link SMS is disabled for this company.
        const smsAllowed = await companyFlagEnabled(db, companyId, 'media_sms_fallback')
        if (to && conv?.sms_enabled !== false && smsAllowed) {
          const sender = await resolveSmsSender(db, companyId)
          if (sender) { await sender.send({ to, text: smsText }); texted = true }
        } else if (!to) {
          console.warn('[media-requests] no SMS recipient resolved for conversation', conversationId)
        }
      } catch (e: any) {
        console.error('[media-requests] sms send failed', e?.message || e)
      }

      // Post the request into the conversation as an agent message, labelled
      // with the channel it really went out on. The client's guess said "chat"
      // whenever it couldn't see a mobile, even though we had just texted it —
      // so a texted link read "Live Chat". Email/Messenger/Instagram are sent
      // by the client, so its value stands for those.
      const asked = typeof deliveryChannel === 'string' ? deliveryChannel : ''
      const channel = ['email', 'instagram', 'facebook'].includes(asked) ? asked : texted ? 'sms' : (asked || 'chat')
      await db.from('messages').insert({
        conversation_id: conversationId, company_id: companyId,
        sender_type: 'agent', sender_name: createdBy || 'Support',
        content: smsText,
        message_type: 'media_request',
        delivery_channel: channel,
        message_payload: { kind: 'media_request', token, prompt: request.prompt, accept: request.accept, max_files: request.max_files, expires_at, link },
      })
      await db.from('conversations').update({ last_message: 'Requested media upload', last_message_at: new Date().toISOString() }).eq('id', conversationId)
    }

    return NextResponse.json({ ok: true, token, link, texted })
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
    // Expired is expired, whatever else has happened to the request. This only
    // flipped an OPEN one — but the first successful upload marks a request
    // 'fulfilled', so a link that had been used once never read as expired
    // here, while the upload route (which checks expires_at directly) refused
    // every file sent through it. The customer got the normal page, picked
    // photos, and watched each one fail.
    let status = request.status
    if (status !== 'cancelled' && request.expires_at && new Date(request.expires_at).getTime() < Date.now()) status = 'expired'

    // Opening the upload page counts as opening its tracked link — covers
    // links sent before they were shortened. Skip if the /l/ redirect just
    // logged this same open.
    try {
      const { data: sl } = await db.from('short_links').select('id, company_id, contact_id, clicks, last_clicked_at')
        .eq('company_id', request.company_id).like('target_url', `%/u/${token}`).limit(1)
      const link = sl?.[0]
      if (link && (!link.last_clicked_at || Date.now() - Date.parse(link.last_clicked_at) > 60_000)) await recordLinkClick(db, link, req.headers)
    } catch {}

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
