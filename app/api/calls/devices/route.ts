import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Identify the caller from the Supabase JWT (bearer). Returns null when absent
// or invalid — callers treat that as "unauthenticated".
async function userFromReq(db: any, req: NextRequest): Promise<string | null> {
  const token = (req.headers.get('authorization') || '').replace('Bearer ', '')
  if (!token) return null
  try { const { data } = await db.auth.getUser(token); return data?.user?.id || null } catch { return null }
}

// A device is considered online if it heartbeat within this window.
const ONLINE_WINDOW_MS = 70_000

/**
 * POST /api/calls/devices — register or heartbeat this device/session.
 *
 * Every logged-in Colvy session (a web tab, or the mobile app) registers itself
 * so a live call can be handed to a *specific* other device. Body:
 *   { deviceId, companyId, platform, deviceName, pushToken? }
 * Keyed by the client-generated, persistent deviceId; the user is taken from the
 * JWT so a device can only ever be registered to its own authenticated user.
 */
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const userId = await userFromReq(db, req)
    if (!userId) return NextResponse.json({ ok: true })   // can't identify; no-op

    const body = await req.json().catch(() => ({}))
    const deviceId = String(body?.deviceId || '').slice(0, 128)
    const companyId = String(body?.companyId || '')
    if (!deviceId || !companyId) return NextResponse.json({ error: 'deviceId and companyId are required' }, { status: 400 })

    const platform = ['web', 'ios', 'android'].includes(body?.platform) ? body.platform : 'web'
    const row: any = {
      device_id: deviceId,
      user_id: userId,
      company_id: companyId,
      platform,
      device_name: (body?.deviceName ? String(body.deviceName) : '').slice(0, 120) || null,
      online: body?.online === false ? false : true,
      last_seen_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }
    if (typeof body?.pushToken === 'string' && body.pushToken) row.push_token = body.pushToken.slice(0, 400)

    await db.from('call_devices').upsert(row, { onConflict: 'device_id' })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

/**
 * GET /api/calls/devices?companyId=…&exclude=<deviceId>
 *
 * The current user's OTHER online devices — the "Continue call on" list. Scoped
 * to the JWT user, so a device only ever sees its own user's devices.
 */
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const userId = await userFromReq(db, req)
    if (!userId) return NextResponse.json({ devices: [] })

    const companyId = req.nextUrl.searchParams.get('companyId') || ''
    const exclude = req.nextUrl.searchParams.get('exclude') || ''
    if (!companyId) return NextResponse.json({ devices: [] })

    const cutoff = new Date(Date.now() - ONLINE_WINDOW_MS).toISOString()
    const { data } = await db.from('call_devices')
      .select('device_id, platform, device_name, last_seen_at, online, push_token')
      .eq('user_id', userId).eq('company_id', companyId)
      .gte('last_seen_at', cutoff)
      .order('last_seen_at', { ascending: false })

    const devices = (data || [])
      .filter((d: any) => d.device_id !== exclude && d.online !== false)
      .map((d: any) => ({
        deviceId: d.device_id,
        platform: d.platform,
        deviceName: d.device_name || (d.platform === 'web' ? 'Web' : 'Mobile'),
        lastSeenAt: d.last_seen_at,
        hasPush: !!d.push_token,
      }))
    return NextResponse.json({ devices })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, devices: [] }, { status: 500 })
  }
}
