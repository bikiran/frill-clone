import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/drafts
 * Save draft to database
 */
export async function POST(req: NextRequest) {
  try {
    const { type, companyId, contentId, data } = await req.json()

    if (!type || !companyId || !data) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    let result

    switch (type) {
      case 'idea':
        result = await supabase
          .from('ideas')
          .upsert(
            {
              id: contentId,
              company_id: companyId,
              title: data.title || 'Untitled',
              description: data.description || '',
              status: 'draft',
              updated_at: new Date().toISOString()
            },
            { onConflict: contentId ? 'id' : undefined }
          )
          .select()
          .single()
        break

      case 'announcement':
        result = await supabase
          .from('announcements')
          .upsert(
            {
              id: contentId,
              company_id: companyId,
              title: data.title || 'Untitled',
              content: data.content || '',
              status: 'draft',
              updated_at: new Date().toISOString()
            },
            { onConflict: contentId ? 'id' : undefined }
          )
          .select()
          .single()
        break

      case 'help':
        result = await supabase
          .from('help_articles')
          .upsert(
            {
              id: contentId,
              company_id: companyId,
              title: data.title || 'Untitled',
              content: data.content || '',
              category: data.category || '',
              status: 'draft',
              updated_at: new Date().toISOString()
            },
            { onConflict: contentId ? 'id' : undefined }
          )
          .select()
          .single()
        break

      case 'form':
        result = await supabase
          .from('forms')
          .upsert(
            {
              id: contentId,
              company_id: companyId,
              title: data.title || 'Untitled Form',
              description: data.description || '',
              fields: data.fields || [],
              status: 'draft',
              updated_at: new Date().toISOString()
            },
            { onConflict: contentId ? 'id' : undefined }
          )
          .select()
          .single()
        break

      case 'survey':
        result = await supabase
          .from('surveys')
          .upsert(
            {
              id: contentId,
              company_id: companyId,
              title: data.title || 'Untitled Survey',
              description: data.description || '',
              questions: data.questions || [],
              status: 'draft',
              updated_at: new Date().toISOString()
            },
            { onConflict: contentId ? 'id' : undefined }
          )
          .select()
          .single()
        break

      case 'poll':
        result = await supabase
          .from('polls')
          .upsert(
            {
              id: contentId,
              company_id: companyId,
              title: data.title || 'Untitled Poll',
              options: data.options || [],
              status: 'draft',
              updated_at: new Date().toISOString()
            },
            { onConflict: contentId ? 'id' : undefined }
          )
          .select()
          .single()
        break

      default:
        return NextResponse.json(
          { error: 'Invalid content type' },
          { status: 400 }
        )
    }

    if (result.error) {
      throw result.error
    }

    return NextResponse.json({
      success: true,
      message: 'Draft saved successfully',
      data: result.data
    })
  } catch (error: any) {
    console.error('[Draft Save] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to save draft' },
      { status: 500 }
    )
  }
}

/**
 * GET /api/drafts
 * Load draft from database
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const type = searchParams.get('type')
    const companyId = searchParams.get('companyId')
    const contentId = searchParams.get('contentId')

    if (!type || !companyId) {
      return NextResponse.json(
        { error: 'Missing required parameters' },
        { status: 400 }
      )
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    let tableName = type === 'help' ? 'help_articles' : `${type}s`

    let query = supabase
      .from(tableName)
      .select('*')
      .eq('company_id', companyId)
      .eq('status', 'draft')

    if (contentId) {
      query = query.eq('id', contentId)
    }

    const { data, error } = await query.single()

    if (error && error.code !== 'PGRST116') {
      throw error
    }

    return NextResponse.json({
      success: true,
      data: data || null
    })
  } catch (error: any) {
    console.error('[Draft Load] Error:', error)
    return NextResponse.json(
      { error: error.message || 'Failed to load draft' },
      { status: 500 }
    )
  }
}
