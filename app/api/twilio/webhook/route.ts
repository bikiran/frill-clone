import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TwilioService } from '@/lib/twilio-service'
import { ingestInboundSms, InboundAttachment } from '@/lib/inbound-sms'
import { uploadToR2, r2Configured } from '@/lib/r2'
import { logWebhookEvent } from '@/lib/webhook-log'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Empty TwiML — we reply via the REST API (resolveSmsSender), not by returning
// TwiML, so Twilio just needs a 200 with a valid <Response/>.
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
const xml = (body: string) => new NextResponse(body, { headers: { 'Content-Type': 'text/xml' } })

// Inbound MMS media sits behind Twilio's Basic-auth-protected media URLs, so a
// raw link would render as broken/spam in the thread. Fetch the bytes and
// re-host them on our own public media domain (R2, or Supabase as a fallback).
async function rehostMedia(svc: TwilioService, db: any, companyId: string, mediaUrl: string): Promise<InboundAttachment | null> {
  try {
    const { bytes, contentType } = await svc.fetchMedia(mediaUrl)
    const ct = String(contentType || '')
    const kind: InboundAttachment['kind'] = ct.startsWith('image/') ? 'image'
      : ct.startsWith('video/') ? 'video'
      : ct.startsWith('audio/') ? 'audio' : 'file'
    const ext = (ct.split('/')[1] || 'bin').split(';')[0].replace(/[^a-z0-9]/gi, '') || 'bin'
    const sid = mediaUrl.split('/').pop() || Math.random().toString(36).slice(2)
    const key = `${companyId}/mms/${sid}.${ext}`

    if (r2Configured()) {
      try {
        const url = await uploadToR2(`chat-attachments/${key}`, bytes, ct || 'application/octet-stream')
        return { url, kind, type: ct || undefined, name: kind === 'file' ? 'attachment' : kind }
      } catch (e: any) { console.warn('[twilio media] R2 failed, using Supabase', e?.message) }
    }
    try {
      const { data: buckets } = await db.storage.listBuckets()
      if (!buckets?.some((b: any) => b.id === 'chat-attachments')) {
        await db.storage.createBucket('chat-attachments', { public: true })
      }
    } catch {}
    const { error: upErr } = await db.storage.from('chat-attachments').upload(key, bytes, { contentType: ct || 'application/octet-stream', upsert: true })
    if (upErr) { console.error('[twilio media] Supabase upload failed', upErr.message); return null }
    const { data: pub } = db.storage.from('chat-attachments').getPublicUrl(key)
    return { url: pub.publicUrl, kind, type: ct || undefined, name: kind === 'file' ? 'attachment' : kind }
  } catch (e: any) {
    console.error('[twilio media] rehost failed', e?.message || e)
    return null
  }
}

// Single Twilio messaging webhook: inbound SMS/MMS + outbound status callbacks.
// Configure this URL as the number's Messaging webhook AND as the StatusCallback
//   https://<your-domain>/api/twilio/webhook
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const get = (k: string) => { const v = form.get(k); return v == null ? null : String(v) }

    const db = admin()
    logWebhookEvent({ source: 'twilio', eventType: get('MessageStatus') || get('SmsStatus') || 'message', payload: Object.fromEntries(form as any) })

    const numMediaRaw = get('NumMedia')
    const messageStatus = get('MessageStatus')

    // ── Delivery-status callback ──────────────────────────────────────────────
    // Status callbacks carry MessageStatus and no NumMedia. Match the campaign
    // recipient by the provider message SID (stored at send time) — same shape as
    // the Telnyx receipt handling.
    if (numMediaRaw === null && messageStatus) {
      try {
        const sid = get('MessageSid') || get('SmsSid')
        const status = messageStatus.toLowerCase()
        const delivered = status === 'delivered'
        const failed = ['undelivered', 'failed'].includes(status)
        if (sid && (delivered || failed)) {
          const errText = get('ErrorCode') ? `Twilio error ${get('ErrorCode')}` : null
          await db.from('campaign_recipients').update({
            status: delivered ? 'delivered' : 'failed',
            delivered_at: delivered ? new Date().toISOString() : null,
            error: failed ? String(errText || status).slice(0, 300) : null,
          }).eq('provider_id', sid)

          const { data: rec } = await db.from('campaign_recipients').select('campaign_id').eq('provider_id', sid).maybeSingle()
          if (rec?.campaign_id) {
            const { count: deliveredCount } = await db.from('campaign_recipients')
              .select('*', { count: 'exact', head: true }).eq('campaign_id', rec.campaign_id).eq('status', 'delivered')
            const { count: failedCount } = await db.from('campaign_recipients')
              .select('*', { count: 'exact', head: true }).eq('campaign_id', rec.campaign_id).eq('status', 'failed')
            await db.from('campaigns').update({ delivered_count: deliveredCount || 0, failed_count: failedCount || 0 }).eq('id', rec.campaign_id)
          }
        }
      } catch (e) { console.error('[twilio] delivery receipt failed', e) }
      return xml(EMPTY_TWIML)
    }

    // ── Inbound SMS / MMS ─────────────────────────────────────────────────────
    const from = get('From') || ''
    const to = get('To') || ''
    const text = get('Body') || ''
    if (!from || !to) return xml(EMPTY_TWIML)

    // Which company owns the receiving number?
    const { data: integ } = await db.from('twilio_integrations').select('company_id, account_sid, auth_token').eq('phone_number', to).maybeSingle()
    if (!integ?.company_id || !integ.account_sid || !integ.auth_token) return xml(EMPTY_TWIML) // not ours / not configured
    const companyId = integ.company_id

    // Re-host any MMS media so the actual photo/video shows in the thread.
    const media: InboundAttachment[] = []
    const numMedia = parseInt(numMediaRaw || '0', 10) || 0
    if (numMedia > 0) {
      const svc = new TwilioService(integ.account_sid, integ.auth_token)
      for (let i = 0; i < numMedia; i++) {
        const url = get(`MediaUrl${i}`)
        if (!url) continue
        const att = await rehostMedia(svc, db, companyId, url)
        if (att) media.push(att)
      }
    }
    // A picture message arrived but we couldn't fetch/store any of it → flag the
    // attempt so the agent can one-tap back an upload link.
    const mediaAttemptFailed = numMedia > 0 && media.length === 0

    const origin = req.headers.get('host')
      ? `${req.headers.get('x-forwarded-proto') || 'https'}://${req.headers.get('host')}`
      : (process.env.NEXT_PUBLIC_SITE_URL || 'https://colvy.com')

    await ingestInboundSms({
      db, companyId, from, to, text, media, mediaAttemptFailed,
      providerMessageId: get('MessageSid'),
      origin,
    })

    return xml(EMPTY_TWIML)
  } catch (err: any) {
    console.error('Twilio webhook error:', err)
    await logWebhookEvent({ source: 'twilio', status: 'error', error: err?.message })
    // Always 200 with valid TwiML so Twilio doesn't retry-storm.
    return xml(EMPTY_TWIML)
  }
}
