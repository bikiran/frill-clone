import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { shortenUrl } from '@/lib/short-link'

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

    // Older messages kept the long URL in the inbox copy, although the customer
    // was sent a tracked short link. Find that link: same conversation, same
    // destination, made closest to when the message was sent.
    const resolved: Record<string, string> = {}
    const conversationId = sp.get('conversationId')
    let urls: string[] = []
    try { urls = JSON.parse(sp.get('urls') || '[]') } catch {}
    urls = (Array.isArray(urls) ? urls : []).filter(u => typeof u === 'string' && /^https?:\/\//.test(u)).slice(0, 20)
    if (urls.length && conversationId) {
      const at = Date.parse(sp.get('at') || '') || Date.now()
      const { data: cands } = await db.from('short_links').select('code, target_url, created_at')
        .eq('company_id', companyId).eq('conversation_id', conversationId).in('target_url', urls).limit(200)
      for (const u of urls) {
        const best = (cands || []).filter((c: any) => c.target_url === u)
          .sort((x: any, y: any) => Math.abs(Date.parse(x.created_at) - at) - Math.abs(Date.parse(y.created_at) - at))[0]
        if (best && Math.abs(Date.parse(best.created_at) - at) < 6 * 3600_000) { resolved[u] = best.code; if (!codes.includes(best.code)) codes.push(best.code) }
      }
      // Upload links (/u/<token>) sent before they were tracked: the token is
      // unique, so give the link a tracked twin now — the upload page counts
      // opens against it from here on.
      for (const u of urls) {
        const token = !resolved[u] && u.match(/\/u\/([A-Za-z0-9_-]{8,})\/?$/)?.[1]
        if (!token) continue
        const { data: mr } = await db.from('media_requests').select('id, contact_id, conversation_id')
          .eq('token', token).eq('company_id', companyId).maybeSingle()
        if (!mr || (mr.conversation_id && mr.conversation_id !== conversationId)) continue
        const { data: have } = await db.from('short_links').select('code').eq('company_id', companyId).like('target_url', `%/u/${token}`).limit(1)
        let code = have?.[0]?.code as string | undefined
        if (!code) {
          const short = await shortenUrl(u, { companyId: companyId!, conversationId, kind: 'upload' })
          code = short.split('/l/')[1]
          if (code) await db.from('short_links').update({ link_type: 'upload', contact_id: mr.contact_id || null }).eq('code', code)
        }
        if (code) { resolved[u] = code; if (!codes.includes(code)) codes.push(code) }
      }
    }
    if (!codes.length) return NextResponse.json({ links: {}, resolved })

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
          .select('link_id, clicked_at, device, os, browser, city, region, country')
          .in('link_id', Array.from(byId.keys())).order('clicked_at', { ascending: false }).limit(400)
        for (const c of clicks || []) {
          const code = byId.get(c.link_id)
          if (!code) continue
          const l = links[code]
          if (l.events.length < 12) l.events.push({ at: c.clicked_at, device: c.device, os: c.os, browser: c.browser, city: c.city, region: c.region, country: c.country })
        }
        // Counter can lag the event table (or vice-versa for old links) — show the larger.
        for (const code of Object.keys(links)) links[code].clicks = Math.max(links[code].clicks, links[code].events.length)
      } catch {}
    }
    // Upload links: how many files have come in.
    try {
      const tokens = new Map<string, string>()
      for (const [code, l] of Object.entries(links)) { const t = String(l.target || '').match(/\/u\/([A-Za-z0-9_-]{8,})\/?$/)?.[1]; if (t) tokens.set(t, code) }
      if (tokens.size) {
        const { data: reqs } = await db.from('media_requests').select('id, token').eq('company_id', companyId).in('token', [...tokens.keys()])
        for (const r of reqs || []) {
          const { count } = await db.from('media_request_files').select('id', { count: 'exact', head: true }).eq('request_id', r.id)
          links[tokens.get(r.token)!].uploaded = count || 0
        }
      }
    } catch {}
    return NextResponse.json({ links, resolved }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}
