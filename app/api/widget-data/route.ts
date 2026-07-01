import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

function getDb() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  if (!url || !key) throw new Error('Supabase env vars missing')
  return createClient(url, key)
}

export async function GET(req: NextRequest) {
  const slug = req.nextUrl.searchParams.get('slug')
  if (!slug) return NextResponse.json({ error: 'slug required' }, { status: 400 })

  try {
    const supabase = getDb()
    const { data: company } = await (supabase as any)
      .from('companies').select('id,name,slug,logo_url,accent_color,is_private')
      .eq('slug', slug).single()

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    const [ideasRes, annRes] = await Promise.all([
      (supabase as any).from('ideas').select('id,title,votes,status').eq('company_id', company.id)
        .neq('is_private', true).order('votes', { ascending: false }).limit(20),
      (supabase as any).from('announcements').select('id,title,content,tag,date,created_at')
        .eq('company_id', company.id).order('created_at', { ascending: false }).limit(8),
    ])

    return NextResponse.json({
      company,
      ideas: ideasRes.data || [],
      announcements: annRes.data || [],
    }, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Cache-Control': 'no-store',
      }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getDb()
    const { slug, title } = await req.json()
    if (!slug || !title) return NextResponse.json({ error: 'slug and title required' }, { status: 400 })

    const { data: company } = await (supabase as any)
      .from('companies').select('id').eq('slug', slug).single()

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    await (supabase as any).from('ideas').insert({
      company_id: company.id,
      title: title.trim(),
      votes: 0,
      status: 'new',
      created_by_name: 'Widget User',
    })

    return NextResponse.json({ ok: true }, {
      headers: { 'Access-Control-Allow-Origin': '*' }
    })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    }
  })
}
