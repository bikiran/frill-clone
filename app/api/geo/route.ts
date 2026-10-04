import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Rough visitor location from Vercel's edge geo headers (no lookup, no cost).
// Used to bias "Find on Google" business search toward the visitor's area.
export async function GET(req: NextRequest) {
  const country = (req.headers.get('x-vercel-ip-country') || '').toUpperCase()
  const lat = parseFloat(req.headers.get('x-vercel-ip-latitude') || '')
  const lng = parseFloat(req.headers.get('x-vercel-ip-longitude') || '')
  return NextResponse.json(
    {
      country: /^[A-Z]{2}$/.test(country) ? country : null,
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
    },
    { headers: { 'Cache-Control': 'private, max-age=3600' } },
  )
}
