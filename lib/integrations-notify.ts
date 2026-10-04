'use client'

import { supabase } from '@/lib/supabase'

/**
 * Let the business's integrations (Slack, webhooks, Zapier…) know about
 * something just saved from the browser. The server re-reads the record, so
 * only the event name and the record id are sent. Fire-and-forget: never
 * throws, never slows the UI.
 */
export function notifyIntegrations(event: string, ref: { id?: string | null; companyId?: string | null } = {}) {
  ;(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/integrations/notify', {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json', ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify({ event, id: ref.id || null, companyId: ref.companyId || null }),
      })
    } catch {}
  })()
}
