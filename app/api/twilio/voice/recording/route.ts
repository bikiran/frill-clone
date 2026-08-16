import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { TwilioService } from '@/lib/twilio-service'
import { uploadToR2, r2Configured } from '@/lib/r2'
import { notifyCompany } from '@/lib/notify'
import { ensureCallCard } from '@/lib/call-card'

export const dynamic = 'force-dynamic'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Recording-status callback for both answered calls and voicemails. Twilio's
// recording media sits behind account auth, so — like inbound MMS — we fetch it
// with the account credentials and re-host it publicly, then transcribe (calls)
// or notify (voicemails).
export async function POST(req: NextRequest) {
  try {
    const form = await req.formData()
    const get = (k: string) => { const v = form.get(k); return v == null ? '' : String(v) }
    const sp = req.nextUrl.searchParams
    const callRowId = sp.get('callRowId') || ''
    const companyId = sp.get('companyId') || ''
    const conversationId = sp.get('conversationId') || ''
    const kind = sp.get('kind') || 'call'

    const recordingUrl = get('RecordingUrl') // no extension; media is at .mp3
    if (!companyId || !recordingUrl) return NextResponse.json({ ok: true })

    const db = admin()
    const { data: integ } = await db.from('twilio_integrations').select('account_sid, auth_token').eq('company_id', companyId).maybeSingle()

    // Re-host the .mp3 to our public media domain so it plays in the browser and
    // the transcriber can fetch it without Twilio credentials.
    let publicUrl = `${recordingUrl}.mp3`
    if (integ?.account_sid && integ.auth_token) {
      try {
        const svc = new TwilioService(integ.account_sid, integ.auth_token)
        const { bytes, contentType } = await svc.fetchMedia(`${recordingUrl}.mp3`)
        const sid = get('RecordingSid') || recordingUrl.split('/').pop() || Math.random().toString(36).slice(2)
        const key = `${companyId}/${callRowId || sid}.mp3`
        if (r2Configured()) {
          publicUrl = await uploadToR2(`call-recordings/${key}`, bytes, contentType || 'audio/mpeg')
        } else {
          try {
            const { data: buckets } = await db.storage.listBuckets()
            if (!buckets?.some((b: any) => b.id === 'call-recordings')) await db.storage.createBucket('call-recordings', { public: true })
          } catch {}
          const { error } = await db.storage.from('call-recordings').upload(key, bytes, { contentType: contentType || 'audio/mpeg', upsert: true })
          if (!error) { const { data: pub } = db.storage.from('call-recordings').getPublicUrl(key); publicUrl = pub.publicUrl }
        }
      } catch (e: any) { console.error('[twilio recording] rehost failed, storing raw url', e?.message || e) }
    }

    // Locate the call row (by our id, else by Twilio Call SID).
    let rowId = callRowId
    if (!rowId) {
      const sid = get('CallSid')
      if (sid) { const { data } = await db.from('calls').select('id').eq('twilio_call_sid', sid).maybeSingle(); rowId = data?.id || '' }
    }
    if (!rowId) return NextResponse.json({ ok: true })

    if (kind === 'voicemail') {
      await db.from('calls').update({ recording_url: publicUrl, status: 'voicemail', is_voicemail: true, ended_at: new Date().toISOString() }).eq('id', rowId)
      const { data: c } = await db.from('calls').select('company_id, from_number, caller_name').eq('id', rowId).maybeSingle()
      if (c?.company_id) { try { await notifyCompany({ db, companyId: c.company_id, type: 'call', message: `New voicemail from ${c.caller_name || c.from_number}`, actorName: c.caller_name || c.from_number }) } catch {} }
      return NextResponse.json({ ok: true })
    }

    const callSid = get('CallSid')
    await db.from('calls').update({ recording_url: publicUrl, ...(callSid ? { twilio_call_sid: callSid } : {}) }).eq('id', rowId)
    // Make sure the thread has a card to display this recording/summary, even if
    // the browser never posted one. Idempotent — no-op if it already exists.
    await ensureCallCard(db, rowId)
    // Transcribe → AI summary (reuses the existing transcriber).
    try {
      const base = (process.env.NEXT_PUBLIC_SITE_URL || new URL(req.url).origin).replace(/\/$/, '')
      fetch(`${base}/api/telnyx/transcribe`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ callId: rowId, companyId, conversationId: conversationId || null }) }).catch(() => {})
    } catch {}
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    console.error('[twilio recording] error', err)
    return NextResponse.json({ ok: true })
  }
}
