import { NextRequest, NextResponse } from 'next/server'
import { checkBurst } from '@/lib/rate-limit'
import { portalDb } from '@/lib/portal/auth'
import { buildReceipt } from '@/lib/portal/receipts'
import { readReceiptToken } from '@/lib/portal/receipt-link'

export const dynamic = 'force-dynamic'

// GET ?t=<receipt link token> → the receipt (public, no sign-in: the signed
// link names exactly one receipt of one business; lib/portal/receipt-link).

const json = (d: any, status = 200) => NextResponse.json(d, { status, headers: { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex' } })

export async function GET(req: NextRequest) {
  try {
    const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'ip'
    if (!checkBurst(`receipt-view:${ip}`, 40)) return json({ error: 'Too many requests. Please wait a moment.' }, 429)
    const t = readReceiptToken(req.nextUrl.searchParams.get('t'))
    if (!t) return json({ error: 'This receipt link isn’t valid.' }, 404)
    const db = portalDb()
    const { data: co } = await db.from('companies').select('id, name, slug, logo_url, accent_color').eq('id', t.companyId).maybeSingle()
    if (!co) return json({ error: 'This receipt link isn’t valid.' }, 404)
    const receipt = await buildReceipt(db, t.companyId, t.key, null)
    if (!receipt) return json({ error: 'This receipt isn’t available any more.' }, 404)
    return json({ business: { name: co.name, slug: co.slug, logoUrl: co.logo_url || null, accent: co.accent_color || null }, receipt })
  } catch (e: any) {
    console.error('[receipt]', e?.message || e)
    return json({ error: 'Something went wrong. Please try again.' }, 500)
  }
}
