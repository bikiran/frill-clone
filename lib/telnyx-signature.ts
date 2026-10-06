import { createPublicKey, verify } from 'crypto'
import type { NextRequest } from 'next/server'

/**
 * Telnyx signs webhooks with Ed25519 over `${telnyx-timestamp}|${raw body}`
 * (header telnyx-signature-ed25519). The public key is in the Telnyx portal
 * (Account → Keys & Credentials → Public Key); set it as TELNYX_PUBLIC_KEY.
 *
 * Until that variable is set the check can't run, so events are let through
 * with a warning. Once it is set, unsigned or forged events are refused
 * (TELNYX_WEBHOOK_VERIFY=log turns enforcement off as an emergency switch).
 */
const MAX_AGE_SEC = 5 * 60

export function telnyxSignatureOk(req: NextRequest, rawBody: string): boolean {
  const key = (process.env.TELNYX_PUBLIC_KEY || '').trim()
  if (!key) {
    console.warn('[telnyx] TELNYX_PUBLIC_KEY is not set; webhook signatures are not being checked')
    return true
  }
  const mode = (process.env.TELNYX_WEBHOOK_VERIFY || 'enforce').toLowerCase()
  let ok = false
  try {
    const sig = req.headers.get('telnyx-signature-ed25519') || ''
    const ts = req.headers.get('telnyx-timestamp') || ''
    const fresh = Math.abs(Date.now() / 1000 - Number(ts)) <= MAX_AGE_SEC
    if (sig && ts && fresh) {
      // Raw 32-byte Ed25519 key → SPKI DER so Node can load it.
      const raw = Buffer.from(key, 'base64')
      const der = raw.length === 32 ? Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]) : raw
      const pub = createPublicKey({ key: der, format: 'der', type: 'spki' })
      ok = verify(null, Buffer.from(`${ts}|${rawBody}`, 'utf-8'), pub, Buffer.from(sig, 'base64'))
    }
  } catch { ok = false }
  if (!ok) console.warn('[telnyx] webhook signature check failed')
  return ok || mode === 'log' || mode === 'off'
}
