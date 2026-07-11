import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function admin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function cors(res: NextResponse) {
  res.headers.set('Access-Control-Allow-Origin', '*')
  res.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type, X-Colvy-Key')
  return res
}

export async function OPTIONS() { return cors(NextResponse.json({ ok: true })) }

// Authenticate by company id (query/body) + api key (header or body).
async function authCompany(db: any, companyId: string | null, key: string | null) {
  if (!companyId || !key) return null
  const { data } = await db.from('companies').select('*').eq('id', companyId).maybeSingle()
  if (!data || data.api_key !== key) return null
  return data
}

// GET: current settings + a few useful live stats for the plugin dashboard.
export async function GET(req: NextRequest) {
  const db = admin()
  const companyId = req.nextUrl.searchParams.get('company_id')
  const key = req.headers.get('x-colvy-key') || req.nextUrl.searchParams.get('key')
  const co = await authCompany(db, companyId, key)
  if (!co) return cors(NextResponse.json({ error: 'Invalid company id or API key' }, { status: 401 }))

  // Merge site_settings JSONB (logo/favicon/homepage) with company row.
  let settings: any = {}
  try {
    const { data: rows } = await db.from('site_settings').select('value').eq('key', 'general').eq('company_id', co.id).order('updated_at', { ascending: false }).limit(1)
    settings = rows?.[0]?.value || {}
  } catch {}

  // Useful stats.
  const [ideas, convs, arts] = await Promise.all([
    db.from('ideas').select('*', { count: 'exact', head: true }).eq('company_id', co.id),
    db.from('conversations').select('*', { count: 'exact', head: true }).eq('company_id', co.id),
    db.from('help_articles').select('*', { count: 'exact', head: true }).eq('company_id', co.id),
  ])
  const { count: openChats } = await db.from('conversations').select('*', { count: 'exact', head: true }).eq('company_id', co.id).eq('status', 'open')

  return cors(NextResponse.json({
    company: {
      id: co.id, name: co.name, slug: co.slug,
      board_url: `https://${co.slug}.colvy.com`,
      logo_url: co.logo_url || settings.logoUrl || '',
      favicon_url: settings.faviconUrl || '',
      accent_color: co.accent_color || '#ff7a6b',
      default_homepage: settings.defaultHomepage || 'ideas',
      plan: co.plan || 'free',
    },
    stats: {
      ideas: ideas.count || 0,
      conversations: convs.count || 0,
      open_chats: openChats || 0,
      help_articles: arts.count || 0,
    },
  }))
}

// POST: update the safe subset (name, logo, favicon, accent, homepage).
export async function POST(req: NextRequest) {
  const db = admin()
  const body = await req.json().catch(() => ({}))
  const key = req.headers.get('x-colvy-key') || body.key
  const co = await authCompany(db, body.company_id, key)
  if (!co) return cors(NextResponse.json({ error: 'Invalid company id or API key' }, { status: 401 }))

  // companies row: name, logo, accent.
  const coPatch: any = {}
  if (typeof body.name === 'string' && body.name.trim()) coPatch.name = body.name.trim()
  if (typeof body.logo_url === 'string') coPatch.logo_url = body.logo_url
  if (typeof body.accent_color === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.accent_color)) coPatch.accent_color = body.accent_color
  if (Object.keys(coPatch).length) await db.from('companies').update(coPatch).eq('id', co.id)

  // site_settings JSONB: favicon, logo, homepage.
  try {
    const { data: rows } = await db.from('site_settings').select('value').eq('key', 'general').eq('company_id', co.id).order('updated_at', { ascending: false }).limit(1)
    const current = rows?.[0]?.value || {}
    const next = { ...current }
    if (typeof body.logo_url === 'string') next.logoUrl = body.logo_url
    if (typeof body.favicon_url === 'string') next.faviconUrl = body.favicon_url
    if (typeof body.default_homepage === 'string' && ['ideas', 'roadmap', 'announcements', 'help'].includes(body.default_homepage)) next.defaultHomepage = body.default_homepage
    if (typeof body.name === 'string' && body.name.trim()) next.companyName = body.name.trim()
    if (typeof body.accent_color === 'string') next.accentColor = body.accent_color
    next.companyId = co.id
    await db.from('site_settings').upsert({ key: 'general', company_id: co.id, value: next, updated_at: new Date().toISOString() }, { onConflict: 'key,company_id' })
  } catch {}

  return cors(NextResponse.json({ ok: true }))
}
