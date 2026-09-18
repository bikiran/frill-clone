import { NextRequest, NextResponse } from 'next/server'
import { META_APP_ID, META_APP_SECRET, META_LOGIN_CONFIG_ID, META_REDIRECT_URI } from '@/lib/meta'

export const dynamic = 'force-dynamic'

const GRAPH = 'https://graph.facebook.com/v25.0'

// Diagnostic: read back what Meta has stored for a Facebook Login for Business
// *configuration* (the config_id the OAuth dialog uses). A "Sorry, something
// went wrong" on a config-based dialog is almost always the configuration
// itself — a deprecated/unavailable permission (classically
// pages_read_user_content) sitting in its permission list. This surfaces that
// list so you can see it without guessing.
//
//   GET /api/meta/config-check                    → uses META_LOGIN_CONFIG_ID
//   GET /api/meta/config-check?configId=<id>      → a specific configuration
//
// Uses an app access token (APP_ID|APP_SECRET). The token is never returned.
export async function GET(req: NextRequest) {
  const configId = new URL(req.url).searchParams.get('configId') || META_LOGIN_CONFIG_ID

  if (!META_APP_ID || !META_APP_SECRET) {
    return NextResponse.json({ error: 'META_APP_ID / META_APP_SECRET are not set.' }, { status: 400 })
  }

  const appToken = `${META_APP_ID}|${META_APP_SECRET}`
  const redact = (s: string) => s.replaceAll(appToken, '<app-token>').replaceAll(META_APP_SECRET, '<app-secret>')

  // Probe the endpoints that expose a Business Login configuration. The exact
  // edge name has varied across Graph versions, so try each and report all.
  const probes: { label: string; url: string }[] = [
    { label: 'config_node', url: `${GRAPH}/${configId}?fields=id,name,permissions,channel,login_variation,business_id,assets&access_token=${encodeURIComponent(appToken)}` },
    { label: 'config_node_bare', url: `${GRAPH}/${configId}?access_token=${encodeURIComponent(appToken)}` },
    { label: 'app_business_login_configs', url: `${GRAPH}/${META_APP_ID}/business_login_configs?fields=config_id,name,permissions&access_token=${encodeURIComponent(appToken)}` },
    { label: 'app_fb_business_login_configs', url: `${GRAPH}/${META_APP_ID}/fb_business_login_configs?fields=config_id,name,permissions&access_token=${encodeURIComponent(appToken)}` },
  ]

  const results: any[] = []
  for (const p of probes) {
    try {
      const res = await fetch(p.url)
      const json = await res.json().catch(() => ({}))
      results.push({ probe: p.label, ok: res.ok, status: res.status, data: json })
    } catch (e: any) {
      results.push({ probe: p.label, ok: false, error: redact(e?.message || 'request failed') })
    }
  }

  // Pull the permission list out of whichever probe returned one, for a quick read.
  let permissions: string[] | null = null
  for (const r of results) {
    if (!r.ok) continue
    const perms = r.data?.permissions?.data
      ? r.data.permissions.data.map((x: any) => x.permission || x.name || x).filter(Boolean)
      : Array.isArray(r.data?.permissions) ? r.data.permissions
        : r.data?.data?.[0]?.permissions?.data
          ? r.data.data[0].permissions.data.map((x: any) => x.permission || x.name || x).filter(Boolean)
          : null
    if (perms) { permissions = perms; break }
  }

  const deprecated = (permissions || []).filter(p => /pages_read_user_content/i.test(p))

  return NextResponse.json({
    configId: configId || null,
    configuredAppId: META_APP_ID,
    redirectUri: META_REDIRECT_URI,
    permissions,
    deprecatedPermissionsFound: deprecated.length ? deprecated : null,
    hint: !configId
      ? 'META_LOGIN_CONFIG_ID is not set — the dialog would fall back to scope-based login.'
      : deprecated.length
        ? 'This configuration still lists a deprecated permission — remove it from the configuration in the Meta dashboard.'
        : permissions
          ? 'Configuration read OK. If the dialog still errors, check the Valid OAuth Redirect URIs and app mode/roles.'
          : 'Could not read the configuration with an app token (see the raw probes). Confirm the config_id belongs to this app.',
    probes: results,
  })
}
