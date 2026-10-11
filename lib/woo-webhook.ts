import { createHmac, timingSafeEqual } from 'crypto'
import type { NextRequest } from 'next/server'
import { pluginKeyFor } from '@/lib/company-secrets'

/**
 * WooCommerce signs each webhook delivery: X-WC-Webhook-Signature =
 * base64(HMAC-SHA256(secret, raw body)). Colvy registers its webhooks with a
 * secret derived per store (from the integration id), and the Colvy WordPress
 * plugin (3.0.3+) signs with the business's plugin key (company_secrets.api_key).
 *
 * Webhooks registered before this have no secret, so enforcement waits for
 * WOO_WEBHOOK_VERIFY=enforce (set it once every store has been re-registered:
 * WooCommerce page → Register webhooks, or the plugin's Connect button).
 * Until then failures are logged, not refused.
 */
export function wooIntegrationSecret(integrationId: string): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  return createHmac('sha256', key).update(`woo-webhook-v1:${integrationId}`).digest('hex')
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export async function wooSignatureOk(req: NextRequest, raw: string, db: any, companyId: string): Promise<boolean> {
  const sig = req.headers.get('x-wc-webhook-signature') || ''
  const secrets: string[] = []
  const integrationId = req.nextUrl.searchParams.get('integration')
  if (integrationId) secrets.push(wooIntegrationSecret(integrationId))
  try {
    const pluginKey = await pluginKeyFor(companyId)
    if (pluginKey) secrets.push(pluginKey)
  } catch {}
  const ok = !!sig && secrets.some(s => same(createHmac('sha256', s).update(raw, 'utf8').digest('base64'), sig))
  if (!ok) console.warn('[woo webhook] signature check failed for company', companyId, sig ? '(bad signature)' : '(no signature)')
  return ok || (process.env.WOO_WEBHOOK_VERIFY || '').toLowerCase() !== 'enforce'
}
