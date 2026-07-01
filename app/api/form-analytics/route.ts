import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    )

    const { searchParams } = new URL(req.url)
    const formId = searchParams.get('formId')
    const companyId = searchParams.get('companyId')
    const timeRange = searchParams.get('timeRange') || '30' // days

    if (!formId || !companyId) {
      return NextResponse.json({ error: 'Missing formId or companyId' }, { status: 400 })
    }

    // Get form
    const { data: form } = await (supabase as any)
      .from('forms')
      .select('*')
      .eq('id', formId)
      .single()

    if (!form) {
      return NextResponse.json({ error: 'Form not found' }, { status: 404 })
    }

    // Get responses in time range
    const startDate = new Date()
    startDate.setDate(startDate.getDate() - parseInt(timeRange))

    const { data: responses } = await (supabase as any)
      .from('form_responses')
      .select('*')
      .eq('form_id', formId)
      .gte('created_at', startDate.toISOString())

    // Calculate analytics
    const totalResponses = responses?.length || 0
    const completionRate = totalResponses > 0 ? 100 : 0
    
    // Get responses per day
    const responsesByDay: Record<string, number> = {}
    responses?.forEach((r: any) => {
      const day = new Date(r.created_at).toISOString().split('T')[0]
      responsesByDay[day] = (responsesByDay[day] || 0) + 1
    })

    // Get field analytics
    const fieldAnalytics: Record<string, any> = {}
    form.questions?.forEach((q: any) => {
      fieldAnalytics[q.id] = {
        id: q.id,
        title: q.title,
        type: q.type,
        responses: 0,
        avgTime: 0,
      }
    })

    // Count responses per field
    responses?.forEach((r: any) => {
      Object.entries(r.answers || {}).forEach(([fieldId, value]: any) => {
        if (fieldAnalytics[fieldId]) {
          fieldAnalytics[fieldId].responses++
        }
      })
    })

    return NextResponse.json({
      form: {
        id: form.id,
        title: form.title,
        description: form.description,
      },
      analytics: {
        totalResponses,
        completionRate,
        avgResponsesPerDay: totalResponses > 0 ? (totalResponses / parseInt(timeRange)).toFixed(1) : 0,
        responsesByDay,
        fieldAnalytics: Object.values(fieldAnalytics),
      },
      timeRange: parseInt(timeRange),
    })
  } catch (error: any) {
    console.error('Form analytics error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
