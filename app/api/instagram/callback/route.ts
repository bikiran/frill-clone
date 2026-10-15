import { readValue, safeReturn } from '@/lib/oauth-state'
import { safeSetupPath, addQuery } from '@/lib/setup-return'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeInstagramCode, instagramLongLivedToken, getInstagramProfile, subscribeInstagramWebhooks } from '@/lib/instagram-login'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Instagram redirects here after the business authorises via Instagram Login.
// We exchange the code for a long-lived Instagram user token, read the profile,
// and store it as an `instagram` meta_channels row. The page_id is a synthetic
// key (`iglogin:<igUserId>`) so it slots into the existing
// (company_id, platform, page_id) unique index without a migration and stays
// distinct from a Page-linked Instagram channel.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err = url.searchParams.get('error_description') || url.searchParams.get('error')
  const settingsPath = '/admin/crm-settings/channels/meta'

  let companyId = ''
  let origin = ''
  let returnTo = ''
  // Only a state this server signed for a member (lib/oauth-state); a plain
  // base64 company id is no longer trusted.
  const signed = readValue(state, 'state')
  if (signed && signed.purpose === 'instagram') {
    companyId = signed.companyId || ''
    origin = safeReturn(signed.origin)
    // Started from the setup checklist: a relative admin path to land on once
    // connected (checked again here — never trust what comes back blindly).
    returnTo = safeSetupPath(signed.returnTo)
  }

  const cookieOrigin = req.cookies.get('colvy_meta_origin')?.value || ''
  const baseOrigin = () => origin ? origin
    : safeReturn(cookieOrigin) ? cookieOrigin
    : new URL(req.url).origin
  const home = (params: string) => `${baseOrigin()}${settingsPath}?${params}`
  // Success goes back to where they started (the setup checklist) when asked;
  // errors always land on the settings page, which explains them and keeps
  // its "Back to setup" bar for another try.
  const connectedTo = (params: string) => returnTo ? `${baseOrigin()}${addQuery(returnTo, params)}` : home(params)

  console.log('[instagram callback]', Object.fromEntries(url.searchParams.entries()))

  if (err) {
    const reason = url.searchParams.get('error_reason')
    return NextResponse.redirect(home(`error=${encodeURIComponent(reason && reason !== err ? `${err} (${reason})` : err)}`))
  }
  if (!state) return NextResponse.redirect(home('error=missing_state'))
  if (!code) {
    const seen = Array.from(url.searchParams.keys()).filter(k => k !== 'state').join(', ') || 'none'
    return NextResponse.redirect(home(`error=${encodeURIComponent(`no_code — authorization didn't complete (returned: ${seen})`)}`))
  }
  if (!companyId) return NextResponse.redirect(home('error=bad_state'))

  try {
    const short = await exchangeInstagramCode(code)
    if (short.error || !short.token) throw new Error(short.error || 'no token')

    const long = await instagramLongLivedToken(short.token)
    const token = long.token || short.token
    const expiresIn = long.expiresIn || 55 * 24 * 3600   // default ~55 days

    const profile = await getInstagramProfile(token)
    if (profile.error) throw new Error(profile.error)
    const igId = profile.id || short.userId
    if (!igId) throw new Error('could not resolve the Instagram account id')

    const db = admin()
    const { error: upErr } = await db.from('meta_channels').upsert({
      company_id: companyId,
      platform: 'instagram',
      page_id: `iglogin:${igId}`,        // synthetic key — no Facebook Page here
      page_name: 'Instagram Login',
      ig_account_id: igId,
      ig_username: profile.username || null,
      page_access_token: token,          // this is the IG user token
      token_expires_at: new Date(Date.now() + expiresIn * 1000).toISOString(),
      is_active: true,
      last_error: null,
    }, { onConflict: 'company_id,platform,page_id' })
    if (upErr) throw new Error(upErr.message)

    // Subscribe this account to the app's webhooks so inbound DMs/comments are
    // delivered. Best-effort — the connection is already stored either way.
    subscribeInstagramWebhooks(igId, token).catch(() => {})

    return NextResponse.redirect(connectedTo('connected=1'))
  } catch (e: any) {
    return NextResponse.redirect(home(`error=${encodeURIComponent(e.message || 'connect failed')}`))
  }
}
