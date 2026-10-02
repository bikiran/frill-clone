import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'

export const dynamic = 'force-dynamic'

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// GET ?companyId=&codes=a,b,c → per tracked link: opens, type, destination
// and the latest opens (device / city / when). Drives the inbox link cards.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const sp = req.nextUrl.searchParams
    const companyId = sp.get('companyId')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })
    const codes = Array.from(new Set(String(sp.get('codes') || '').split(',').map(c => c.trim()).filter(c => /^[A-Za-z0-9_-]{4,16}$/.test(c)))).slice(0, 60)
    if (!codes.length) return NextResponse.json({ links: {} })

    const { data: rows } = await db.from('short_links')
      .select('id, code, target_url, label, kind, link_type, clicks, last_clicked_at, created_at')
      .eq('company_id', companyId).in('code', codes)
    const links: Record<string, any> = {}
    const byId = new Map<string, string>()
    for (const r of rows || []) {
      byId.set(r.id, r.code)
      links[r.code] = {
        target: r.target_url, label: r.label, kind: r.kind, type: r.link_type || null,
        clicks: r.clicks || 0, lastClickedAt: r.last_clicked_at, createdAt: r.created_at, events: [],
      }
    }
    if (byId.size) {
      try {
        const { data: clicks } = await db.from('link_clicks')
          .select('link_id, created_at, device, os, browser, city, region, country')
          .in('link_id', Array.from(byId.keys())).order('created_at', { ascending: false }).limit(400)
        for (const c of clicks || []) {
          const code = byId.get(c.link_id)
          if (!code) continue
          const l = links[code]
          if (l.events.length < 12) l.events.push({ at: c.created_at, device: c.device, os: c.os, browser: c.browser, city: c.city, region: c.region, country: c.country })
        }
        // Counter can lag the event table (or vice-versa for old links) — show the larger.
        for (const code of Object.keys(links)) links[code].clicks = Math.max(links[code].clicks, links[code].events.length)
      } catch {}
    }
    return NextResponse.json({ links }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
