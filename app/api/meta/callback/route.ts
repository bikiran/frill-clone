import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { exchangeCodeForToken, longLivedToken, listManagedPages, subscribePageWebhooks } from '@/lib/meta'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Facebook redirects here after the business authorises. We exchange the code
// for Page tokens and store one meta_channels row per Page (and per linked
// Instagram account). The business then maps each to an outlet in Settings.
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const err = url.searchParams.get('error_description') || url.searchParams.get('error')
  const settingsPath = '/admin/crm-settings/channels/meta'

  // Parse state first — it carries the company AND the subdomain the user
  // started from, so we can send them back there (the callback itself runs on
  // the shared root domain, colvy.com).
  let companyId = ''
  let origin = ''
  try {
    const parsed = JSON.parse(Buffer.from(state || '', 'base64url').toString())
    companyId = parsed.companyId || ''
    origin = parsed.origin || ''
  } catch {}

  // Where to send the user when we're done. Their own subdomain if we know it,
  // otherwise back here on root.
  const home = (params: string) => {
    const base = origin && /^https?:\/\//.test(origin) ? origin : new URL(req.url).origin
    return `${base}${settingsPath}?${params}`
  }

  if (err) return NextResponse.redirect(home(`error=${encodeURIComponent(err)}`))
  if (!code || !state) return NextResponse.redirect(home('error=missing_code'))
  if (!companyId) return NextResponse.redirect(home('error=bad_state'))

  try {
    const short = await exchangeCodeForToken(code)
    if (short.error || !short.token) throw new Error(short.error || 'no token')

    const long = await longLivedToken(short.token)
    const userToken = long.token || short.token

    const { pages, error } = await listManagedPages(userToken)
    if (error) throw new Error(error)
    if (!pages || pages.length === 0) {
      return NextResponse.redirect(home('error=no_pages'))
    }

    const db = admin()
    let connected = 0

    for (const page of pages) {
      const pageToken: string = page.access_token
      if (!pageToken) continue

      // Subscribe the Page to messaging webhooks (best-effort; App Review may
      // gate this until approved).
      await subscribePageWebhooks(page.id, pageToken).catch(() => {})

      const ig = page.instagram_business_account

      // Messenger channel for the Page.
      await db.from('meta_channels').upsert({
        company_id: companyId,
        platform: 'facebook',
        page_id: page.id,
        page_name: page.name,
        page_access_token: pageToken,
        token_expires_at: new Date(Date.now() + 55 * 24 * 3600 * 1000).toISOString(),
        is_active: true,
        last_error: null,
      }, { onConflict: 'company_id,platform,page_id' })
      connected++

      // Instagram channel, if this Page has a linked IG business account.
      if (ig?.id) {
        await db.from('meta_channels').upsert({
          company_id: companyId,
          platform: 'instagram',
          page_id: page.id,
          page_name: page.name,
          ig_account_id: ig.id,
          ig_username: ig.username || null,
          page_access_token: pageToken,
          token_expires_at: new Date(Date.now() + 55 * 24 * 3600 * 1000).toISOString(),
          is_active: true,
          last_error: null,
        }, { onConflict: 'company_id,platform,page_id' })
        connected++
      }
    }

    return NextResponse.redirect(home(`connected=${connected}`))
  } catch (e: any) {
    return NextResponse.redirect(home(`error=${encodeURIComponent(e.message || 'connect failed')}`))
  }
}
