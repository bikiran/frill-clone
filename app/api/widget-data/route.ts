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
      .from('companies').select('id,name,slug,logo_url,accent_color,is_private,widget_config')
      .eq('slug', slug).single()

    if (companyError || !company) {
      console.log('[WIDGET API] Company not found:', { slug, error: companyError?.message })
      return NextResponse.json({ error: 'Company not found' }, { status: 404 })
    }

    console.log('[WIDGET API] Found company:', { id: company.id, slug: company.slug })

    const [ideasRes, annRes, formsRes, pollsRes, surveysRes, helpRes] = await Promise.all([
      (supabase as any).from('ideas').select('id,title,votes,status,created_at,description,is_private,attachments,created_by_name,location_ids').eq('company_id', company.id)
        .neq('is_private', true).order('votes', { ascending: false }).limit(20),
      (supabase as any).from('announcements').select('id,title,description,tag,status,created_at,is_pinned,boost_enabled,boost_type,boost_button_label,boost_title,boost_blurb,boost_image,views,impressions,location_ids')
        .eq('company_id', company.id)
        .eq('status', 'published')
        .order('is_pinned', { ascending: false }).order('created_at', { ascending: false }).limit(20),
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

    // Widget tab visibility + order (saved in site_settings 'general').
    let widgetTabs: any = null
    try {
      const { data: ss } = await (supabase as any).from('site_settings').select('value').eq('key', 'general').eq('company_id', company.id).order('updated_at', { ascending: false }).limit(1)
      const v = ss?.[0]?.value || {}
      widgetTabs = {
        feedback: v.widgetFeedback !== false,
        roadmap: v.widgetRoadmap !== false,
        updates: v.widgetUpdates !== false,
        help: v.widgetKnowledgeBase !== false,
        chat: v.widgetChat !== false,
        order: v.widgetOrder || null,
      }
    } catch {}

    // Location-aware content: if the widget is loaded for a specific outlet
    // (?location=<id>), show company-wide items (no location_ids) PLUS items
    // targeted to that outlet. With no location context, show only company-wide
    // items so location-specific content never leaks to the wrong audience.
    const viewerLocation = req.nextUrl.searchParams.get('location')
    const visibleAt = (row: any) => {
      const ids: string[] | null = row.location_ids
      if (!ids || ids.length === 0) return true            // company-wide
      if (!viewerLocation) return false                     // targeted, no context
      return ids.includes(viewerLocation)
    }

    const responseData = {
      company,
      widgetTabs,
      ideas: (ideasRes.data || []).filter(visibleAt),
      announcements: (annRes.data || []).filter(visibleAt),
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
    const { slug, title, attachments, user_name } = await req.json()
    if (!slug || !title) return NextResponse.json({ error: 'slug and title required' }, { status: 400 })

    const { data: company } = await (supabase as any)
      .from('companies').select('id').eq('slug', slug).single()

    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 })

    console.log('[WIDGET API POST] Creating idea:', { slug, title, attachmentCount: attachments?.length || 0 })

    // Process attachments - upload to Supabase Storage
    let attachmentUrls: string[] = []
    if (attachments && attachments.length > 0) {
      for (const attachment of attachments) {
        try {
          // attachment is base64 data URL: "data:image/png;base64,iVBORw0KGgo..."
          const base64Parts = attachment.split(',')
          const base64Data = base64Parts[1]
          const mimeType = base64Parts[0].match(/data:([^;]+)/)?.[1] || 'image/png'
          
          // Convert base64 to buffer
          const buffer = Buffer.from(base64Data, 'base64')
          const fileExtension = mimeType.split('/')[1] || 'png'
          const fileName = `${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExtension}`
          const filePath = `ideas/${company.id}/${fileName}`

          console.log('[WIDGET API POST] Uploading attachment:', { fileName, size: buffer.length })

          // Upload to Supabase Storage
          const { data: uploadData, error: uploadError } = await (supabase as any)
            .storage
            .from('feedback-attachments')
            .upload(filePath, buffer, { 
              contentType: mimeType,
              upsert: false 
            })

          if (uploadError) {
            console.error('[WIDGET API POST] Upload error:', uploadError)
            throw uploadError
          }

          // Get public URL
          const { data: { publicUrl } } = await (supabase as any)
            .storage
            .from('feedback-attachments')
            .getPublicUrl(filePath)

          attachmentUrls.push(publicUrl)
          console.log('[WIDGET API POST] Upload successful:', { publicUrl })
        } catch (err) {
          console.error('[WIDGET API POST] Error processing attachment:', err)
        }
      }
    }

    console.log('[WIDGET API POST] Processed attachments:', { count: attachmentUrls.length, urls: attachmentUrls })

    const { data: idea, error: insertError } = await (supabase as any).from('ideas').insert({
      company_id: company.id,
      title: title.trim(),
      votes: 0,
      status: 'new',
      created_by_name: user_name || 'Anonymous',
      attachments: attachmentUrls,
      created_at: new Date().toISOString(),
    }).select()

    if (insertError) {
      console.error('[WIDGET API POST] Insert error:', insertError)
      throw insertError
    }

    console.log('[WIDGET API POST] Idea created successfully:', { ideaId: idea?.[0]?.id, attachmentCount: attachmentUrls.length })

    return NextResponse.json({ ok: true, idea: idea?.[0] }, {
      headers: { 'Access-Control-Allow-Origin': '*' }
    })
  } catch (e: any) {
    console.error('[WIDGET API POST] Error:', e.message)
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
