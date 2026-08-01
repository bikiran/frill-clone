import { createClient } from '@supabase/supabase-js'

// Records inbound webhooks into `webhook_events` so the Super Admin console can
// show a live feed with sources, types, per-company attribution and failures.
//
// Design rules:
//   • Never throw. A logging problem must not break message processing, so
//     every path is wrapped and swallowed.
//   • Never block long. We await a single insert (so it survives the serverless
//     function tearing down) but keep the payload small.
//   • Degrade quietly. If the table doesn't exist yet (migration not applied),
//     do nothing rather than erroring on every webhook.

let missing = false   // remember once, so we don't hammer a non-existent table

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Keep only a bounded, JSON-safe copy of the body. Webhook payloads can be
// large (full order objects, media metadata); we don't need the whole thing to
// diagnose traffic, and a runaway row would bloat the table.
function trim(payload: any): any {
  if (payload == null) return null
  try {
    const s = JSON.stringify(payload)
    if (s.length <= 16000) return JSON.parse(s)
    return { _truncated: true, _bytes: s.length, preview: s.slice(0, 4000) }
  } catch {
    return { _unserializable: true }
  }
}

export type WebhookLog = {
  source: string
  eventType?: string | null
  companyId?: string | null
  status?: 'received' | 'processed' | 'ignored' | 'error' | 'rejected'
  error?: string | null
  payload?: any
}

export async function logWebhookEvent(ev: WebhookLog): Promise<void> {
  if (missing) return
  try {
    const db = admin()
    const { error } = await db.from('webhook_events').insert({
      source: ev.source,
      event_type: ev.eventType || null,
      company_id: ev.companyId || null,
      status: ev.status || 'received',
      error: ev.error ? String(ev.error).slice(0, 500) : null,
      payload: trim(ev.payload),
    })
    if (error && /does not exist|schema cache/i.test(error.message)) missing = true
  } catch {
    /* logging must never break the webhook */
  }
}
