import { requireCompanyAccess } from '@/lib/company-access'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { isMetaConfigured, getPageSubscription, subscribePageWebhooks } from '@/lib/meta'
import { isInstagramLoginConfigured, INSTAGRAM_REDIRECT_URI, isIgLoginChannel, getInstagramSubscription, subscribeInstagramWebhooks } from '@/lib/instagram-login'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET: the company's connected Meta channels + its outlets (for mapping).
export async function GET(req: NextRequest) {
  const companyId = new URL(req.url).searchParams.get('companyId')
  if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
  const db = admin()
  // Workspace members only.
  if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

  const { data: channels } = await db.from('meta_channels')
    .select('id, platform, page_id, page_name, ig_username, location_id, is_active, last_error, token_expires_at')
    .eq('company_id', companyId).order('created_at', { ascending: true })

  const { data: locations } = await db.from('company_locations')
    .select('id, label, suburb').eq('company_id', companyId)

  // The connect flow must start on the ROOT domain (colvy.com), because that's
  // the single redirect URI registered with Meta. Derive it from the configured
  // redirect URI so the client can build an absolute link regardless of which
  // company subdomain the agent is on.
  let rootOrigin = ''
  try { rootOrigin = new URL(process.env.META_REDIRECT_URI || '').origin } catch {}
  // The Instagram-Login connect flow starts on the domain its redirect URI is
  // registered under (usually the same root domain).
  let igRootOrigin = ''
  try { igRootOrigin = new URL(INSTAGRAM_REDIRECT_URI || '').origin } catch {}

  return NextResponse.json({
    configured: isMetaConfigured(),
    rootOrigin,
    igLoginConfigured: isInstagramLoginConfigured(),
    igRootOrigin: igRootOrigin || rootOrigin,
    channels: channels || [],
    locations: locations || [],
  })
}

// POST: map a channel to a location, toggle it, or disconnect it.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, id } = body
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
    const db = admin()
    // Members of the workspace that owns the channel; an outlet must be theirs too.
    const { data: ch } = await db.from('meta_channels').select('company_id').eq('id', id).maybeSingle()
    if (!ch || !(await requireCompanyAccess(req, db, ch.company_id)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    if (body.location_id) {
      const { data: loc } = await db.from('company_locations').select('company_id').eq('id', body.location_id).maybeSingle()
      if (!loc || loc.company_id !== ch.company_id) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    }

    if (action === 'map_location') {
      await db.from('meta_channels').update({ location_id: body.location_id || null }).eq('id', id)
      return NextResponse.json({ ok: true })
    }
    if (action === 'toggle') {
      await db.from('meta_channels').update({ is_active: body.is_active !== false }).eq('id', id)
      return NextResponse.json({ ok: true })
    }
    // Is this account sending its messages to Colvy? Asked live from Meta, so the
    // status shown is Meta's own answer. 'resubscribe' subscribes again first.
    if (action === 'webhook_status' || action === 'resubscribe') {
      const { data: row } = await db.from('meta_channels').select('id, platform, page_id, ig_account_id, page_access_token').eq('id', id).maybeSingle()
      if (!row?.page_access_token) return NextResponse.json({ error: 'This account has no access token. Connect it again.' }, { status: 400 })
      const igLogin = isIgLoginChannel(row)
      let subscribeError: string | null = null
      if (action === 'resubscribe') {
        const r = igLogin
          ? await subscribeInstagramWebhooks(String(row.ig_account_id), row.page_access_token)
          : await subscribePageWebhooks(String(row.page_id), row.page_access_token)
        subscribeError = r.ok ? null : (r.error || 'Subscription failed')
      }
      const status = igLogin
        ? await getInstagramSubscription(String(row.ig_account_id), row.page_access_token)
        : await getPageSubscription(String(row.page_id), row.page_access_token)
      // Keep the connection's error line in step with what Meta just said.
      await db.from('meta_channels').update({ last_error: status.subscribed ? null : (subscribeError || status.error || 'Not subscribed to webhooks: new messages won’t arrive.') }).eq('id', id)
      return NextResponse.json({
        ...status, subscribeError, checkedAt: new Date().toISOString(),
        endpoint: igLogin ? `GET graph.instagram.com/${row.ig_account_id}/subscribed_apps` : `GET graph.facebook.com/${row.page_id}/subscribed_apps`,
        via: igLogin ? 'instagram' : row.platform === 'instagram' ? 'page' : 'facebook',
      })
    }
    if (action === 'disconnect') {
      await db.from('meta_channels').delete().eq('id', id)
      return NextResponse.json({ ok: true })
    }
    return NextResponse.json({ error: 'unknown action' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
