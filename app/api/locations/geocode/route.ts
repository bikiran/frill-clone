import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// Geocode all of a company's outlets that don't yet have coordinates, using the
// free OpenStreetMap Nominatim service. Call this after adding/editing outlets.
export async function POST(req: NextRequest) {
  try {
    const { companyId, force } = await req.json()
    if (!companyId) return NextResponse.json({ error: 'companyId required' }, { status: 400 })
    const db = admin()

    const { data: locations } = await db.from('company_locations').select('*').eq('company_id', companyId)
    if (!locations || locations.length === 0) return NextResponse.json({ ok: true, geocoded: 0, message: 'No outlets to geocode' })

    let geocoded = 0
    const results: any[] = []
    for (const loc of locations) {
      if (!force && loc.latitude != null && loc.longitude != null) { results.push({ id: loc.id, skipped: true }); continue }
      const parts = [loc.street_address, loc.suburb, loc.state, loc.postcode, loc.country || 'Australia'].filter(Boolean)
      const query = parts.join(', ')
      if (!query.trim()) { results.push({ id: loc.id, error: 'no address' }); continue }
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=au&q=${encodeURIComponent(query)}`
        const res = await fetch(url, { headers: { 'User-Agent': 'Colvy/1.0 (outlet geocoding)' } })
        const hits = await res.json()
        if (Array.isArray(hits) && hits[0]?.lat && hits[0]?.lon) {
          const lat = parseFloat(hits[0].lat), lon = parseFloat(hits[0].lon)
          await db.from('company_locations').update({ latitude: lat, longitude: lon, geocoded_at: new Date().toISOString() }).eq('id', loc.id)
          geocoded++
          results.push({ id: loc.id, label: loc.label, lat, lon })
        } else {
          results.push({ id: loc.id, label: loc.label, error: 'not found' })
        }
      } catch (e: any) {
        results.push({ id: loc.id, error: e.message })
      }
      // Nominatim asks for max 1 request/second.
      await new Promise(r => setTimeout(r, 1100))
    }

    return NextResponse.json({ ok: true, geocoded, results })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
