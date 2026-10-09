import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getAccessToken } from '@/lib/shopify-auth'
import { notifyCompany } from '@/lib/notify'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Refresh when the 90-day refresh token has under this long left. Any normal
// use (a sync, a webhook-driven call) refreshes too; this is for quiet stores.
const WINDOW_DAYS = 30

/**
 * GET /api/cron/shopify-tokens — daily. Keeps installed Shopify stores'
 * expiring tokens alive so a store nobody touched for three months doesn't
 * silently need reinstalling. A store whose refresh token is already dead is
 * flagged (needs_reauth) and the workspace is told once.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (secret && (req.headers.get('authorization') || '') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const db = admin()
  const threshold = new Date(Date.now() + WINDOW_DAYS * 86400_000).toISOString()
  const { data: stores } = await db.from('shopify_integrations').select('*')
    .eq('auth_type', 'oauth').eq('is_active', true).eq('needs_reauth', false)
    .not('refresh_token', 'is', null)
    .or(`refresh_expires_at.is.null,refresh_expires_at.lt.${threshold}`)
    .limit(200)

  let refreshed = 0, failed = 0
  for (const s of stores || []) {
    try {
      await getAccessToken(db, s, { force: true })
      refreshed++
    } catch (e: any) {
      failed++
      const { data: now } = await db.from('shopify_integrations').select('needs_reauth').eq('id', s.id).maybeSingle()
      if (now?.needs_reauth) {
        try { await notifyCompany({ db, companyId: s.company_id, type: 'integration', message: `Colvy lost access to the Shopify store ${s.store_name || s.store_domain}. Reconnect it under Integrations → Shopify.` }) } catch {}
      }
    }
  }
  return NextResponse.json({ ok: true, checked: stores?.length || 0, refreshed, failed })
}
