import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Haversine distance in km.
function distanceKm(aLat: number, aLon: number, bLat: number, bLon: number) {
  const R = 6371
  const dLat = (bLat - aLat) * Math.PI / 180
  const dLon = (bLon - aLon) * Math.PI / 180
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(aLat * Math.PI / 180) * Math.cos(bLat * Math.PI / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.asin(Math.sqrt(s))
}

// Given the visitor's IP (resolved to a state + coords), return the visitor's
// state and — only for Victorian visitors — the nearest VIC outlet plus the
// full VIC outlet list so they can change it. Interstate visitors get no outlet.
export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get('companyId')
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    // ── Resolve the visitor's location from their IP ──────────────────────────
    // Vercel/proxies set x-forwarded-for; take the first hop.
    const fwd = req.headers.get('x-forwarded-for') || ''
    const ip = (fwd.split(',')[0] || '').trim() || req.headers.get('x-real-ip') || ''

    let state: string | null = null
    let vLat: number | null = null
    let vLon: number | null = null
    try {
      // ipapi.co is free for low volume and returns region_code (e.g. VIC) + lat/lng.
      const geoRes = await fetch(`https://ipapi.co/${ip ? ip + '/' : ''}json/`, { headers: { 'User-Agent': 'Colvy/1.0' } })
      const geo = await geoRes.json()
      if (geo && geo.country_code === 'AU') {
        state = (geo.region_code || '').toUpperCase() || null  // VIC, NSW, ...
        vLat = typeof geo.latitude === 'number' ? geo.latitude : null
        vLon = typeof geo.longitude === 'number' ? geo.longitude : null
      } else if (geo && geo.region) {
        // Fallback: map common region names to codes.
        const map: Record<string, string> = { Victoria: 'VIC', 'New South Wales': 'NSW', Queensland: 'QLD', 'South Australia': 'SA', 'Western Australia': 'WA', Tasmania: 'TAS', 'Australian Capital Territory': 'ACT', 'Northern Territory': 'NT' }
        state = map[geo.region] || null
        vLat = typeof geo.latitude === 'number' ? geo.latitude : null
        vLon = typeof geo.longitude === 'number' ? geo.longitude : null
      }
    } catch {}

    // Only offer outlet selection to Victorian visitors.
    if (state !== 'VIC') {
      return NextResponse.json({ state, isVic: false, outlets: [], nearest: null })
    }

    // VIC outlets only.
    const { data: allLocations } = await db.from('company_locations').select('*').eq('company_id', companyId)
    const vicOutlets = (allLocations || []).filter((l: any) => (l.state || '').toUpperCase() === 'VIC')
    if (vicOutlets.length === 0) {
      return NextResponse.json({ state, isVic: true, outlets: [], nearest: null })
    }

    // Nearest by distance when we have coordinates for both sides.
    let nearest: any = null
    if (vLat != null && vLon != null) {
      let best = Infinity
      for (const o of vicOutlets) {
        if (o.latitude == null || o.longitude == null) continue
        const d = distanceKm(vLat, vLon, o.latitude, o.longitude)
        if (d < best) { best = d; nearest = o }
      }
    }
    // Fallback: the primary outlet, else the first.
    if (!nearest) nearest = vicOutlets.find((o: any) => o.is_primary) || vicOutlets[0]

    const shape = (o: any) => ({
      id: o.id,
      label: o.label,
      suburb: o.suburb,
      state: o.state,
      name: o.label ? `${o.label}` : (o.suburb || 'Outlet'),
    })

    return NextResponse.json({
      state, isVic: true,
      nearest: shape(nearest),
      outlets: vicOutlets.map(shape),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, state: null, isVic: false, outlets: [], nearest: null }, { status: 200 })
  }
}
