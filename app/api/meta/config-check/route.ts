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
    // Sanity: prove the app token itself works, so a failure on the config below
    // is about the config, not the token.
    { label: 'app_node', url: `${GRAPH}/${META_APP_ID}?fields=id,name,link&access_token=${encodeURIComponent(appToken)}` },
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
  const appNode = results.find(r => r.probe === 'app_node')
  const appTokenOk = !!appNode?.ok
  const configNode = results.find(r => r.probe === 'config_node_bare' || r.probe === 'config_node')
  const configNotFound = !!configNode && !configNode.ok && configNode?.data?.error?.code === 100

  let hint: string
  if (!configId) {
    hint = 'META_LOGIN_CONFIG_ID is not set — the dialog would fall back to scope-based login.'
  } else if (deprecated.length) {
    hint = 'This configuration still lists a deprecated permission — remove it from the configuration in the Meta dashboard.'
  } else if (permissions) {
    hint = 'Configuration read OK. If the dialog still errors, check the Valid OAuth Redirect URIs and app mode/roles.'
  } else if (appTokenOk && configNotFound) {
    hint = 'Expected: Login-for-Business configurations are NOT readable via the Graph API (subcode 33), so a "does not exist" here does not mean the config is broken. First confirm in the dashboard (Facebook Login for Business → Configurations) that a config with this ID exists — if it does, the config_id is fine. A "Sorry, something went wrong" on the live dialog is then almost always: (1) the app is not yet App-Review-approved for the config\'s permissions, so ONLY app-role accounts (admin/dev/tester) can complete login — test by connecting as an app admin; (2) https://colvy.com/api/meta/callback is missing from Facebook Login for Business → Settings → Valid OAuth Redirect URIs; or (3) the config lists a deprecated permission (pages_read_user_content) — remove it via Edit configuration.'
  } else if (!appTokenOk) {
    hint = 'The app token could not even read the app node — check META_APP_ID / META_APP_SECRET.'
  } else {
    hint = 'Could not read the configuration with an app token (Meta may not expose configs to app tokens). Verify the config_id in the dashboard and try connecting as the app owner to isolate mode/roles.'
  }

  return NextResponse.json({
    configId: configId || null,
    configuredAppId: META_APP_ID,
    redirectUri: META_REDIRECT_URI,
    appTokenValid: appTokenOk,
    configReadable: !!permissions,
    permissions,
    deprecatedPermissionsFound: deprecated.length ? deprecated : null,
    hint,
    probes: results,
  })
}
