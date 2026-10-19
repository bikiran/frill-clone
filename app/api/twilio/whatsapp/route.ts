import { NextRequest, NextResponse, after } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { twilioMasterSignatureOk } from '@/lib/twilio-signature'
import { logWebhookEvent } from '@/lib/webhook-log'
import { toE164 } from '@/lib/phone'
import { stripWhatsApp, isWhatsAppAddress } from '@/lib/whatsapp-core'
import { companyForWhatsAppNumber, applyWhatsAppStatus, whatsappAccess, whatsappOptOut, masterCreds } from '@/lib/whatsapp'
import { rehostTwilioMedia, type RehostedMedia } from '@/lib/twilio-media'
import { ingestInboundWhatsApp } from '@/lib/inbound-whatsapp'
import { startSupportAgentForConversation } from '@/lib/agent/inbound'

// Media download and storage need the Node runtime.
export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Colvy replies through the REST API (lib/whatsapp sendWhatsApp), so Twilio
// only needs a 200 with an empty <Response/>.
const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>'
const xml = () => new NextResponse(EMPTY_TWIML, { headers: { 'Content-Type': 'text/xml' } })

// Statuses Twilio reports for messages Colvy SENT; an inbound message arrives
// as 'received' with a Body field.
const OUTBOUND_STATUSES = new Set(['queued', 'accepted', 'sending', 'sent', 'delivered', 'read', 'undelivered', 'failed', 'canceled', 'scheduled'])

// Twilio WhatsApp webhook: inbound messages AND status callbacks.
// In Colvy's Twilio console set each WhatsApp sender's "Webhook URL for
// incoming messages" and "Status callback URL" to
//   https://<your-domain>/api/twilio/whatsapp
// (outbound messages also carry it as their StatusCallback).
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    // Only Colvy's own Twilio account: every WhatsApp sender lives there, so the
    // AccountSid must be the master account and the signature its auth token
    // (strict, like sign-up code receipts: a business's own Twilio credentials
    // never count, and TWILIO_WEBHOOK_VERIFY doesn't switch it off).
    if (!twilioMasterSignatureOk(req, form)) return new NextResponse('Forbidden', { status: 403 })
    const get = (k: string) => { const v = form.get(k); return v == null ? null : String(v) }
    const db = admin()
    const status = String(get('MessageStatus') || get('SmsStatus') || '').toLowerCase()
    logWebhookEvent({ source: 'twilio_whatsapp', eventType: status || 'message', payload: { MessageSid: get('MessageSid'), MessageStatus: status, ErrorCode: get('ErrorCode'), To: get('To'), From: get('From'), NumMedia: get('NumMedia') } })

    // ── Status callback ─────────────────────────────────────────────────────
    if (get('Body') === null && get('NumMedia') === null && OUTBOUND_STATUSES.has(status)) {
      const sid = get('MessageSid') || get('SmsSid')
      if (sid) { try { await applyWhatsAppStatus(db, { sid, status, errorCode: get('ErrorCode') }) } catch (e) { console.error('[whatsapp] status failed', e) } }
      return xml()
    }

    // ── Inbound message ─────────────────────────────────────────────────────
    const fromRaw = get('From') || '', toRaw = get('To') || ''
    if (!isWhatsAppAddress(fromRaw) || !isWhatsAppAddress(toRaw)) return xml()   // not WhatsApp: the SMS webhook's job
    const from = toE164(stripWhatsApp(fromRaw)), to = toE164(stripWhatsApp(toRaw))
    const owner = await companyForWhatsAppNumber(db, to)
    if (!owner) return xml()   // not an approved Colvy WhatsApp sender (or V402 not run)
    const companyId = owner.companyId

    // Text: the message, a quick-reply button's text, or a shared location.
    let text = get('Body') || get('ButtonText') || ''
    const extra: Record<string, any> = {}
    if (get('WaId')) extra.wa_id = get('WaId')
    if (get('ButtonPayload')) extra.button_payload = get('ButtonPayload')
    const lat = get('Latitude'), lng = get('Longitude')
    if (lat && lng && Number.isFinite(Number(lat)) && Number.isFinite(Number(lng))) {
      const place = [get('Label'), get('Address')].filter(Boolean).join(', ')
      extra.location = { lat: Number(lat), lng: Number(lng), label: place || null }
      if (!text) text = `Shared a location${place ? `: ${place}` : ''}\nhttps://maps.google.com/?q=${Number(lat)},${Number(lng)}`
    }

    // Media sits behind Colvy's Twilio account: fetch it with the master
    // credentials and store it on Colvy's media domain, like inbound MMS.
    const media: RehostedMedia[] = []
    const numMedia = Math.min(10, parseInt(get('NumMedia') || '0', 10) || 0)
    for (let i = 0; i < numMedia; i++) {
      const url = get(`MediaUrl${i}`)
      if (!url) continue
      const m = await rehostTwilioMedia(db, { companyId, mediaUrl: url, creds: masterCreds(), folder: 'whatsapp', contentTypeHint: get(`MediaContentType${i}`), timeoutMs: 9000 })
      if (m) media.push(m)
    }
    const mediaAttemptFailed = numMedia > 0 && media.length < numMedia

    const origin = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
    const res = await ingestInboundWhatsApp({
      db, companyId, from, to, text, profileName: get('ProfileName'), media, mediaAttemptFailed,
      providerMessageId: get('MessageSid'), origin, extra,
    })

    // The Support / Reception Agent, if the business switched it on for
    // WhatsApp (lib/agent/inbound decides; off by default). Not for a STOP,
    // not for someone opted out, and not when this business can't send.
    if (res.conversationId && !res.duplicate && text && res.keyword !== 'opted_out') {
      const convId = res.conversationId
      const job = async () => {
        try {
          const [access, consent] = await Promise.all([whatsappAccess(db, companyId), whatsappOptOut(db, companyId, from)])
          if (!access.ok || consent !== 'ok') return
          await startSupportAgentForConversation(db, convId)
        } catch (e) { console.warn('[agent] whatsapp inbound', e) }
      }
      try { after(job) } catch { void job() }
    }
    return xml()
  } catch (err: any) {
    console.error('Twilio WhatsApp webhook error:', err)
    await logWebhookEvent({ source: 'twilio_whatsapp', status: 'error', error: err?.message })
    // Always 200 so Twilio doesn't retry-storm.
    return xml()
  }
}
