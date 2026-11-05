import { NextResponse } from 'next/server'
import { createSign } from 'crypto'

export const dynamic = 'force-dynamic'

/**
 * GET /api/app/version
 *
 * Tells the mobile app which store build is live per platform, so it can show
 * the in-app "update available" prompt when the installed build is behind.
 *
 * The app compares BUILD NUMBERS (Android versionCode / iOS build): every store
 * release has been version "1.5.0" with only the build number going up, so a
 * version-name comparison never found an update.
 *
 * Android's live build is read from Google Play itself (the production track's
 * fully rolled-out release) when GOOGLE_PLAY_SERVICE_ACCOUNT holds a Play
 * Console service-account key (the JSON, or the JSON base64-encoded) — the same
 * kind of key EAS Submit uses. The prompt then follows Play's "Your update is
 * live" with no one touching anything. Without it, or if Play can't be reached,
 * the env values and then the defaults below are used.
 *
 *   APP_ANDROID_BUILD / APP_IOS_BUILD         — live build number
 *   APP_ANDROID_MIN_BUILD / APP_IOS_MIN_BUILD — below this = forced update
 *   APP_ANDROID_LATEST / APP_IOS_LATEST       — live version name (shown in the prompt)
 *   APP_ANDROID_MIN / APP_IOS_MIN             — version-name hard minimum
 *   APP_ANDROID_URL / APP_IOS_URL             — store listing to open
 */
const PACKAGE = 'com.colvy.app'
const VERSION = '1.5.0'
// The builds live on the stores right now (the fallback when nothing else says).
const ANDROID_BUILD = 16
const IOS_BUILD = 0   // 0 = no prompt on iOS until APP_IOS_BUILD is set

const num = (v?: string | null) => (v && Number(v)) || 0

let playCache: { build: number; at: number } | null = null
const PLAY_TTL = 15 * 60 * 1000

function serviceAccount(): { client_email: string; private_key: string } | null {
  const raw = process.env.GOOGLE_PLAY_SERVICE_ACCOUNT
  if (!raw) return null
  try {
    const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8')
    const j = JSON.parse(text)
    return j.client_email && j.private_key ? j : null
  } catch { return null }
}

async function googleToken(sa: { client_email: string; private_key: string }): Promise<string | null> {
  const now = Math.floor(Date.now() / 1000)
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({
    iss: sa.client_email,
    scope: 'https://www.googleapis.com/auth/androidpublisher',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now, exp: now + 3600,
  })}`
  const sig = createSign('RSA-SHA256').update(unsigned).sign(sa.private_key).toString('base64url')
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${unsigned}.${sig}` }),
    cache: 'no-store',
  })
  if (!res.ok) return null
  return (await res.json())?.access_token || null
}

/** The highest versionCode in a fully rolled-out production release on Play; 0 when unknown. */
async function playLiveBuild(): Promise<number> {
  if (playCache && Date.now() - playCache.at < PLAY_TTL) return playCache.build
  const sa = serviceAccount()
  if (!sa) return 0
  try {
    const token = await googleToken(sa)
    if (!token) return 0
    const base = `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${PACKAGE}/edits`
    const auth = { Authorization: `Bearer ${token}` }
    const edit = await fetch(base, { method: 'POST', headers: auth, cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
    if (!edit?.id) return 0
    try {
      const track = await fetch(`${base}/${edit.id}/tracks/production`, { headers: auth, cache: 'no-store' }).then(r => (r.ok ? r.json() : null))
      // Only 'completed' releases: a staged rollout would prompt people Play
      // isn't offering the update to yet.
      const codes: number[] = (track?.releases || [])
        .filter((r: any) => r.status === 'completed')
        .flatMap((r: any) => r.versionCodes || [])
        .map(Number)
        .filter((n: number) => n > 0)
      const build = codes.length ? Math.max(...codes) : 0
      if (build) playCache = { build, at: Date.now() }
      return build
    } finally {
      // Edits are scratch space; don't leave one open.
      fetch(`${base}/${edit.id}`, { method: 'DELETE', headers: auth, cache: 'no-store' }).catch(() => {})
    }
  } catch {
    return 0
  }
}

export async function GET() {
  const androidBuild = (await playLiveBuild()) || num(process.env.APP_ANDROID_BUILD) || ANDROID_BUILD
  return NextResponse.json({
    android: {
      latest: process.env.APP_ANDROID_LATEST || VERSION,
      build: androidBuild,
      min: process.env.APP_ANDROID_MIN || '0.0.0',
      minBuild: num(process.env.APP_ANDROID_MIN_BUILD),
      url: process.env.APP_ANDROID_URL || `https://play.google.com/store/apps/details?id=${PACKAGE}`,
    },
    ios: {
      latest: process.env.APP_IOS_LATEST || VERSION,
      build: num(process.env.APP_IOS_BUILD) || IOS_BUILD,
      min: process.env.APP_IOS_MIN || '0.0.0',
      minBuild: num(process.env.APP_IOS_MIN_BUILD),
      url: process.env.APP_IOS_URL || 'https://apps.apple.com/app/id6803380512',
    },
  })
}
