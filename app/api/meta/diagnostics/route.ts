import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { META_APP_ID, META_APP_SECRET } from '@/lib/meta'

export const dynamic = 'force-dynamic'

const GRAPH = 'https://graph.facebook.com/v21.0'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * GET /api/meta/diagnostics?companyId=...
 *
 * TEMPORARY diagnostics for the Facebook connection. Reports what token we hold
 * and what it can do, WITHOUT ever returning the token value:
 *   - tokenType        PAGE | USER | (unknown)
 *   - grantedScopes    the scopes actually granted to the token
 *   - selectedPageId   the connected Page id
 *   - hasPageToken     whether a Page token is stored at all
 *   - probes           live checks so a #10 shows up here with its real message
 *
 * Remove once the Page connection is verified working.
 */
export async function GET(req: NextRequest) {
  const companyId = new URL(req.url).searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })

  const db = admin()
  const { data: rows } = await db.from('meta_channels').select('*')
    .eq('company_id', companyId).eq('platform', 'facebook').eq('is_active', true).limit(1)
  const channel = rows?.[0]

  if (!channel) {
    return NextResponse.json({
      connected: false,
      hasPageToken: false,
      note: 'No active Facebook channel for this company. Connect a Page first.',
    })
  }

  const token: string | undefined = channel.page_access_token
  const result: any = {
    connected: true,
    selectedPageId: channel.page_id || null,
    pageName: channel.page_name || null,
    hasPageToken: !!token,
    tokenExpiresAt: channel.token_expires_at || null,
    lastError: channel.last_error || null,
    tokenType: null,
    grantedScopes: null as string[] | null,
    tokenValid: null as boolean | null,
    probes: {} as Record<string, any>,
  }

  if (!token) return NextResponse.json(result)

  // 1) What is this token? debug_token needs an APP access token, not the token
  // being inspected. Never echoes the token value.
  try {
    const appToken = `${META_APP_ID}|${META_APP_SECRET}`
    const r = await fetch(`${GRAPH}/debug_token?input_token=${encodeURIComponent(token)}&access_token=${encodeURIComponent(appToken)}`)
    const d = await r.json()
    const info = d?.data
    if (info) {
      result.tokenType = info.type || null              // 'PAGE' | 'USER'
      result.grantedScopes = Array.isArray(info.scopes) ? info.scopes : null
      result.tokenValid = info.is_valid ?? null
      result.tokenProfileId = info.profile_id || null   // the Page id for a Page token
    } else if (d?.error) {
      result.probes.debug_token = d.error.message
    }
  } catch (e: any) {
    result.probes.debug_token = e?.message || 'debug_token failed'
  }

  // 2) Live read of the Page's own feed (needs pages_read_engagement on a Page
  // token) — this is where #10 shows up. Report ok / the real Graph error.
  try {
    const r = await fetch(`${GRAPH}/${channel.page_id}/feed?fields=id&limit=1&access_token=${encodeURIComponent(token)}`)
    const d = await r.json()
    result.probes.readFeed = r.ok
      ? { ok: true, count: (d.data || []).length }
      : { ok: false, code: d?.error?.code, message: d?.error?.message }
  } catch (e: any) {
    result.probes.readFeed = { ok: false, message: e?.message }
  }

  return NextResponse.json(result)
}
