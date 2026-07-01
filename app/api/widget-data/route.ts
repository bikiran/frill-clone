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
    console.log('[WIDGET API] Fetching data for slug:', slug)
    
    const { data: company, error: companyError } = await (supabase as any)
      .from('companies').select('id,name,slug,logo_url,accent_color,is_private')
      .eq('slug', slug).single()

    if (companyError || !company) {
      console.log('[WIDGET API] Company not found:', { slug, error: companyError?.message })
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    console.log('[WIDGET API] Found company:', { id: company.id, slug: company.slug })

    const [ideasRes, annRes, formsRes, pollsRes, surveysRes, helpRes] = await Promise.all([
      (supabase as any).from('ideas').select('id,title,votes,status,created_at,description,is_private').eq('company_id', company.id)
        .neq('is_private', true).order('votes', { ascending: false }).limit(20),
      (supabase as any).from('announcements').select('id,title,description,tag,status,created_at,boost_enabled,boost_type,boost_button_label,boost_title,boost_blurb,boost_image,views,impressions')
        .eq('company_id', company.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false }).limit(8),
      (supabase as any).from('forms').select('id,title,description').eq('company_id', company.id)
        .eq('is_public', true).order('created_at', { ascending: false }).limit(5),
      (supabase as any).from('polls').select('id,title,options').eq('company_id', company.id)
        .order('created_at', { ascending: false }).limit(5),
      (supabase as any).from('surveys').select('id,title,questions').eq('company_id', company.id)
        .order('created_at', { ascending: false }).limit(5),
      (supabase as any).from('help_articles').select('id,title,content,category,status,created_at').eq('company_id', company.id)
        .eq('status', 'published')
        .order('created_at', { ascending: false }).limit(10),
    ])
    
    console.log('[WIDGET API] Query results:', {
      company_id: company.id,
      ideas: { count: ideasRes.data?.length || 0, error: ideasRes.error?.message },
      announcements: { count: annRes.data?.length || 0, error: annRes.error?.message, data: annRes.data },
      forms: { count: formsRes.data?.length || 0, error: formsRes.error?.message },
      polls: { count: pollsRes.data?.length || 0, error: pollsRes.error?.message },
      surveys: { count: surveysRes.data?.length || 0, error: surveysRes.error?.message },
      helpArticles: { count: helpRes.data?.length || 0, error: helpRes.error?.message, fullData: helpRes.data },
    })

    // Debug: Log raw query for help articles
    if (helpRes.error) {
      console.error('[WIDGET API] Help articles query error:', helpRes.error)
    } else {
      console.log('[WIDGET API] Help articles raw response:', {
        count: helpRes.data?.length,
        data: helpRes.data?.map(a => ({ id: a.id, title: a.title, status: a.status, company_id: a.company_id }))
      })
    }

    const responseData = {
      company,
      ideas: ideasRes.data || [],
      announcements: annRes.data || [],
      forms: formsRes.data || [],
      polls: pollsRes.data || [],
      surveys: surveysRes.data || [],
      helpArticles: helpRes.data || [],
    }

    console.log('[WIDGET API] Returning response:', {
      announcements_count: responseData.announcements.length,
      help_articles_count: responseData.helpArticles.length,
    })

    return NextResponse.json(responseData, {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Cache-Control': 'no-store',
      }
    })
  } catch (e: any) {
    console.error('[WIDGET API] Error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = getDb()
    const { slug, title, attachments } = await req.json()
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
      attachments: attachments || [],
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
