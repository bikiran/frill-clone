import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { requireCompanyAccess } from '@/lib/company-access'
import { KNOWLEDGE_DEFAULTS, rebuildKnowledge } from '@/lib/ai-knowledge'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const admin = () => createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const SOURCES = ['fact', 'help', 'file', 'website', 'announcement', 'roadmap', 'idea', 'chat'] as const

// GET ?companyId= → everything the Knowledge page shows.
export async function GET(req: NextRequest) {
  try {
    const db = admin()
    const companyId = req.nextUrl.searchParams.get('companyId') || ''
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    const [{ data: co }, facts, files, web, ...perSource] = await Promise.all([
      db.from('companies').select('name, ai_settings, website, website_domains, ai_knowledge_synced_at').eq('id', companyId).maybeSingle(),
      db.from('ai_facts').select('id, question, answer, updated_at').eq('company_id', companyId).order('updated_at', { ascending: false }).limit(500),
      db.from('ai_knowledge_files').select('id, name, size_bytes, pages, chunks, created_at').eq('company_id', companyId).order('created_at', { ascending: false }).limit(200),
      db.from('ai_knowledge').select('url, title').eq('company_id', companyId).eq('source', 'website').limit(1000),
      ...SOURCES.map(s => db.from('ai_knowledge').select('indexed_at', { count: 'exact' }).eq('company_id', companyId).eq('source', s).order('indexed_at', { ascending: false }).limit(1)),
    ])
    const sources: Record<string, { count: number; latest: string | null }> = {}
    SOURCES.forEach((s, i) => { const r: any = perSource[i]; sources[s] = { count: r.count || 0, latest: r.data?.[0]?.indexed_at || null } })

    const pages = new Map<string, string>()
    for (const r of (web.data || []) as any[]) if (r.url && !pages.has(r.url)) pages.set(r.url, r.title || r.url)
    // facts/files tables missing → the V326 migration hasn't been run yet.
    const needsMigration = !!(facts.error || files.error)

    return NextResponse.json({
      needsMigration,
      settings: { ...KNOWLEDGE_DEFAULTS, ...(co?.ai_settings?.knowledge || {}) },
      aiEnabled: !!co?.ai_settings?.enabled,
      syncedAt: co?.ai_knowledge_synced_at || null,
      domains: Array.from(new Set([...(Array.isArray(co?.website_domains) ? co.website_domains : []), co?.website].filter(Boolean))),
      sources,
      total: Object.values(sources).reduce((n, s) => n + s.count, 0),
      facts: facts.data || [],
      files: files.data || [],
      websitePages: Array.from(pages, ([url, title]) => ({ url, title })),
    })
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'Failed' }, { status: 500 })
  }
}

// POST { companyId, knowledge? } → save which sources are on (if given), then re-sync the library.
export async function POST(req: NextRequest) {
  try {
    const db = admin()
    const b = await req.json().catch(() => ({}))
    const companyId = String(b.companyId || '')
    if (!(await requireCompanyAccess(req, db, companyId)).ok) return NextResponse.json({ error: 'Not authorized' }, { status: 403 })

    if (b.knowledge && typeof b.knowledge === 'object') {
      const { data: co } = await db.from('companies').select('ai_settings').eq('id', companyId).maybeSingle()
      const clean: Record<string, boolean> = {}
      for (const k of Object.keys(KNOWLEDGE_DEFAULTS)) if (k in b.knowledge) clean[k] = !!b.knowledge[k]
      const ai = co?.ai_settings || {}
      await db.from('companies').update({ ai_settings: { ...ai, knowledge: { ...(ai.knowledge || {}), ...clean } } }).eq('id', companyId)
    }
    const r = await rebuildKnowledge(db, companyId)
    return NextResponse.json({ ok: true, ...r })
  } catch (e: any) {
    const msg = String(e?.message || '')
    if (/ON CONFLICT|unique or exclusion|indexed_at|ai_knowledge_synced_at/i.test(msg)) return NextResponse.json({ error: 'Run the COLVY_V326 database update in Supabase first.' }, { status: 409 })
    return NextResponse.json({ error: msg || 'Failed' }, { status: 500 })
  }
}
