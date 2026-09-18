import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isIgLoginChannel, refreshInstagramToken } from '@/lib/instagram-login'
import { notifyCompany } from '@/lib/notify'
import { logJobRun } from '@/lib/job-log'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Refresh channels whose token expires within this window. IG-Login tokens are
// extended in place; a wide window means ~2 weeks of daily retries before a
// token actually lapses.
const REFRESH_WINDOW_DAYS = 15
const RECONNECT_MSG = 'Access token is expiring and can\'t be auto-refreshed — reconnect this account under Settings → Channels.'

// Page tokens (Facebook + page-linked Instagram) can't be self-refreshed, but
// tokens minted from a long-lived user token generally don't expire at all — so
// probe the token: if it still works, the stored 55-day expiry was a false alarm
// and we push it out; if it fails, the account genuinely needs reconnecting.
async function pageTokenValid(token: string): Promise<boolean> {
  try {
    const res = await fetch(`https://graph.facebook.com/v25.0/me?fields=id&access_token=${encodeURIComponent(token)}`)
    return res.ok
  } catch { return false }
}

/**
 * GET /api/cron/refresh-meta-tokens
 *
 * Keeps connected Meta (Messenger / Instagram) channels alive:
 *  - Instagram-Login channels: extend the long-lived user token (ig_refresh_token).
 *  - Facebook / page-linked Instagram: probe the Page token; extend the expiry
 *    stamp if it still works, otherwise flag the account for reconnection.
 * Runs daily (see vercel.json). A channel that can't be recovered gets a
 * one-time in-app alert and a last_error the Channels UI surfaces.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret) {
    const auth = req.headers.get('authorization') || ''
    if (auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startedAt = new Date().toISOString()
  const t0 = Date.now()
  const db = admin()

  const threshold = new Date(Date.now() + REFRESH_WINDOW_DAYS * 24 * 3600 * 1000).toISOString()
  const { data: channels } = await db.from('meta_channels').select('*')
    .eq('is_active', true)
    .not('token_expires_at', 'is', null)
    .lt('token_expires_at', threshold)

  let refreshed = 0, extended = 0, flagged = 0, errored = 0
  const results: any[] = []

  for (const ch of (channels || [])) {
    try {
      if (isIgLoginChannel(ch)) {
        // Instagram-Login: extend the long-lived token (another ~60 days).
        const r = await refreshInstagramToken(ch.page_access_token)
        if (r.token) {
          const expiresIn = r.expiresIn || 55 * 24 * 3600
          await db.from('meta_channels').update({
            page_access_token: r.token,
            token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
            last_error: null,
          }).eq('id', ch.id)
          refreshed++
          results.push({ id: ch.id, platform: ch.platform, action: 'refreshed' })
        } else {
          // Refresh failed (e.g. already lapsed) — the account must reconnect.
          await flagReconnect(db, ch)
          flagged++
          results.push({ id: ch.id, platform: ch.platform, action: 'flagged', error: r.error })
        }
      } else {
        // Facebook / page-linked Instagram: can't self-refresh, so verify.
        const ok = await pageTokenValid(ch.page_access_token)
        if (ok) {
          await db.from('meta_channels').update({
            token_expires_at: new Date(Date.now() + 55 * 24 * 3600 * 1000).toISOString(),
            last_error: ch.last_error === RECONNECT_MSG ? null : ch.last_error,
          }).eq('id', ch.id)
          extended++
          results.push({ id: ch.id, platform: ch.platform, action: 'extended' })
        } else {
          await flagReconnect(db, ch)
          flagged++
          results.push({ id: ch.id, platform: ch.platform, action: 'flagged' })
        }
      }
    } catch (e: any) {
      errored++
      results.push({ id: ch.id, platform: ch.platform, error: e?.message })
    }
  }

  await logJobRun({
    job: 'refresh-meta-tokens', startedAt, durationMs: Date.now() - t0,
    status: (channels || []).length === 0 ? 'idle' : (errored ? 'error' : 'success'),
    detail: { candidates: (channels || []).length, refreshed, extended, flagged, errored },
    error: errored ? results.find(r => r.error)?.error : null,
  })
  return NextResponse.json({ ok: true, candidates: (channels || []).length, refreshed, extended, flagged, errored, results })
}

// Flag an account for reconnection: set last_error and, the first time we flag
// it (last_error wasn't already the reconnect note), alert the team once.
async function flagReconnect(db: any, ch: any) {
  const firstTime = ch.last_error !== RECONNECT_MSG
  await db.from('meta_channels').update({ last_error: RECONNECT_MSG }).eq('id', ch.id)
  if (firstTime) {
    const name = ch.ig_username ? `@${ch.ig_username}` : (ch.page_name || 'a connected account')
    try {
      await notifyCompany({
        db, companyId: ch.company_id, type: ch.platform,
        message: `${ch.platform === 'instagram' ? 'Instagram' : 'Facebook'} account ${name} needs reconnecting — its access token is expiring. Reconnect it under Settings → Channels.`,
        actorName: 'System',
      })
    } catch {}
  }
}
